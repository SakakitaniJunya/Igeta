import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocTemplateCheck } from '../checks/DocTemplateCheck.js';

/**
 * 修飾 ID の自動書き換え (non-blocking N3)。DocTemplateCheck の --require-human-review が
 * 出す「他ファイルの ID は修飾 ID で参照する」違反のうち、**定義元が 1 件に一意に決まるもの**
 * だけを書き換える。複数ファイルのローカル採番で曖昧なもの (別のメッセージ文言になる) は対象外 —
 * 一意に解決できないものを機械が推測で書き換えると、本文の意味を取り違えたまま直ってしまうため。
 *
 * 既定は dry-run (plan() を呼ぶだけ)。実際に書き込むのは write() を呼んだときだけ。
 * Spec: templates/docs/guides/03-human-review.md §4
 */

// DocTemplateCheck.ts の checkQualifiedIds が出す、定義元が 1 件に一意なときのメッセージ文言と一致させる
const RESOLVABLE_RE = /^他ファイルの ID は修飾 ID \(<doc-id>\/([A-Z]+-\d{3})\) で参照する: \1 は (\S+) 由来/;

export interface FixIdsPlanEntry {
  readonly file: string;
  readonly line: number;
  readonly before: string;
  readonly after: string;
}

export interface FixIdsOptions {
  readonly targetRoot: string;
  readonly igetaRoot: string;
  readonly docsDir?: string;
  readonly templatesDir?: string;
}

const toDocId = (relPath: string): string => relPath.replace(/^.*\//, '').replace(/\.md$/, '');

export class FixIdsModule {
  readonly #options: FixIdsOptions;

  constructor(options: FixIdsOptions) {
    this.#options = options;
  }

  /** 書き換え計画を作るだけ。ファイルには一切触れない (dry-run の実体)。 */
  plan(): readonly FixIdsPlanEntry[] {
    const result = new DocTemplateCheck({
      docsDir: this.#options.docsDir,
      templatesDir: this.#options.templatesDir,
      requireKind: true,
      requireHumanReview: true,
    }).analyze({ targetRoot: this.#options.targetRoot, igetaRoot: this.#options.igetaRoot });

    const fixesByLine = new Map<string, { file: string; line: number; fixes: Array<{ token: string; homeId: string }> }>();
    for (const violation of result.violations) {
      if (violation.file === undefined || violation.line === undefined) continue;
      const matched = RESOLVABLE_RE.exec(violation.message);
      if (matched === null) continue;
      const token = matched[1] ?? '';
      const homeRelPath = matched[2] ?? '';
      const key = `${violation.file}\u0000${violation.line}`;
      const entry = fixesByLine.get(key) ?? { file: violation.file, line: violation.line, fixes: [] };
      entry.fixes.push({ token, homeId: toDocId(homeRelPath) });
      fixesByLine.set(key, entry);
    }

    const plan: FixIdsPlanEntry[] = [];
    for (const { file, line, fixes } of fixesByLine.values()) {
      const abs = join(this.#options.targetRoot, file);
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      const before = lines[line - 1] ?? '';
      let after = before;
      for (const { token, homeId } of fixes) {
        // すでに <doc-id>/TOKEN の形式で修飾されている箇所は変えない (裸の出現だけを直す)
        after = after.replace(new RegExp(`(?<![A-Za-z0-9-]/)\\b${token}\\b`, 'g'), `${homeId}/${token}`);
      }
      if (after !== before) plan.push({ file, line, before, after });
    }
    return plan.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }

  /** plan() の結果を実際に書き込む。 */
  write(plan: readonly FixIdsPlanEntry[]): void {
    const byFile = new Map<string, FixIdsPlanEntry[]>();
    for (const entry of plan) {
      const list = byFile.get(entry.file) ?? [];
      list.push(entry);
      byFile.set(entry.file, list);
    }
    for (const [file, entries] of byFile) {
      const abs = join(this.#options.targetRoot, file);
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      for (const entry of entries) lines[entry.line - 1] = entry.after;
      writeFileSync(abs, lines.join('\n'));
    }
  }
}
