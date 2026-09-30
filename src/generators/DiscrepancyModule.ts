// discrepancy-add / discrepancy-report: 食い違いの記録と集計。
// Spec: docs/explanation/05-coverage-and-learning.md §3 (記録) / §5 (集計)
//
// CLI 非依存のロジックだけを持つ。違反・検査不能の判定はここ、
// 出力整形と終了コードの決定は cli/commands/DiscrepancyCommands.ts 側。

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DiscrepancyEntry } from '../core/DiscrepancyLog.js';
import {
  DISCREPANCY_CATEGORIES,
  DISCREPANCY_FILENAME,
  appendDiscrepancyLogEntry,
  isDiscrepancyCategory,
  readDiscrepancyLog,
} from '../core/DiscrepancyLog.js';
import type { Violation } from '../core/Report.js';

export interface DiscrepancyAddRequest {
  /** 提出物のディレクトリ (ログを置く場所) */
  readonly submissionDir: string;
  /** `<repo 相対パス>[#<anchor>]`。パス部は targetRoot から見て実在しなければならない */
  readonly location: string;
  /** CLI からの生値。閉集合との照合はここで行う */
  readonly category: string;
  readonly sourceId?: string;
  readonly caughtBy?: string;
  readonly fixedInCommit?: string;
  /** location を解決する起点 (既定は呼び出し側が cwd を渡す) */
  readonly targetRoot: string;
  readonly now?: Date;
}

export type DiscrepancyAddResult =
  | { readonly kind: 'ok'; readonly entry: DiscrepancyEntry; readonly path: string }
  | { readonly kind: 'rejected'; readonly violation: Violation };

export function addDiscrepancy(request: DiscrepancyAddRequest): DiscrepancyAddResult {
  if (!existsSync(request.submissionDir) || !statSync(request.submissionDir).isDirectory()) {
    return {
      kind: 'rejected',
      violation: { severity: 'cannot-check', message: `提出物のディレクトリが無い: ${request.submissionDir}` },
    };
  }
  // 台帳と同じ作法: 壊れた行を含むログへは追記しない (追記できたように見えるのに
  // 集計に載らない記録が増えるのを防ぐ。台帳は AgreementApproveModule で同じ検査をしている)。
  const existing = readDiscrepancyLog(request.submissionDir);
  if (existing.kind === 'invalid') return { kind: 'rejected', violation: existing.violation };
  if (!isDiscrepancyCategory(request.category)) {
    return {
      kind: 'rejected',
      violation: {
        severity: 'violation',
        message: `category が一覧に無い: ${request.category} (有効値: ${DISCREPANCY_CATEGORIES.join(', ')})`,
      },
    };
  }
  const hashIndex = request.location.indexOf('#');
  const pathPart = hashIndex === -1 ? request.location : request.location.slice(0, hashIndex);
  if (pathPart === '') {
    return {
      kind: 'rejected',
      violation: { severity: 'violation', message: `--location のパス部が空: ${request.location}` },
    };
  }
  if (!existsSync(resolve(request.targetRoot, pathPart))) {
    return {
      kind: 'rejected',
      violation: { severity: 'violation', message: `location が指すファイルが無い: ${pathPart}` },
    };
  }

  const entry: DiscrepancyEntry = {
    date: (request.now ?? new Date()).toISOString().slice(0, 10),
    location: request.location,
    sourceId: request.sourceId ?? null,
    category: request.category,
    caughtBy: request.caughtBy ?? null,
    fixedInCommit: request.fixedInCommit ?? null,
  };
  const failure = appendDiscrepancyLogEntry(request.submissionDir, entry);
  if (failure !== null) return { kind: 'rejected', violation: failure };
  return { kind: 'ok', entry, path: join(request.submissionDir, DISCREPANCY_FILENAME) };
}

export interface DiscrepancyReportRequest {
  readonly targetRoot: string;
  /** ログの探索対象 (省略時の既定は呼び出し側が <targetRoot>/docs を渡す) */
  readonly docsDir: string;
  /** 指定時はこの提出物のディレクトリのログだけを見る */
  readonly submissionDir?: string;
}

export interface DiscrepancyReportRow {
  readonly category: string;
  readonly count: number;
  /** caughtBy が非 null の件数 (検査が事前に捕まえた割合の分子) */
  readonly caught: number;
}

export type DiscrepancyReportResult =
  | {
      readonly kind: 'ok';
      /** 読んだログファイルの数。0 なら対象が無い (OK 終了) */
      readonly files: number;
      /** 件数降順 → category 名順 */
      readonly rows: readonly DiscrepancyReportRow[];
      readonly total: { readonly count: number; readonly caught: number };
    }
  | { readonly kind: 'rejected'; readonly violation: Violation };

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage']);

/** AgreementCheck.findLedgerDirs と同じ走査 (対象ファイル名だけが違う)。 */
function findLogDirs(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
        continue;
      }
      if (entry.name === DISCREPANCY_FILENAME) found.push(dirname(full));
    }
  };
  walk(dir);
  return found;
}

export function buildDiscrepancyReport(request: DiscrepancyReportRequest): DiscrepancyReportResult {
  let dirs: readonly string[];
  if (request.submissionDir !== undefined) {
    if (!existsSync(request.submissionDir) || !statSync(request.submissionDir).isDirectory()) {
      return {
        kind: 'rejected',
        violation: { severity: 'cannot-check', message: `提出物のディレクトリが無い: ${request.submissionDir}` },
      };
    }
    dirs = [request.submissionDir];
  } else {
    dirs = existsSync(request.docsDir) && statSync(request.docsDir).isDirectory() ? findLogDirs(request.docsDir) : [];
  }

  const entries: DiscrepancyEntry[] = [];
  let files = 0;
  for (const dir of dirs) {
    const log = readDiscrepancyLog(dir);
    if (log.kind === 'invalid') return { kind: 'rejected', violation: log.violation };
    if (log.kind !== 'ok') continue;
    files += 1;
    entries.push(...log.entries);
  }

  const byCategory = new Map<string, { count: number; caught: number }>();
  let caught = 0;
  for (const entry of entries) {
    const row = byCategory.get(entry.category) ?? { count: 0, caught: 0 };
    row.count += 1;
    if (entry.caughtBy !== null) {
      row.caught += 1;
      caught += 1;
    }
    byCategory.set(entry.category, row);
  }
  const rows = [...byCategory.entries()]
    .map(([category, row]) => ({ category, count: row.count, caught: row.caught }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return { kind: 'ok', files, rows, total: { count: entries.length, caught } };
}
