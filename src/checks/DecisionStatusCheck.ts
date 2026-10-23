// 決定 (ADR) の状態・履歴・フォルダ・台帳の検査 (テスト仕様 10 の DS1〜DS14)。docs-check から呼ばれる。
// 規則の中身は #decision/core にあり、ここは ADR を集めて規則を当て、違反と警告に分けるだけ。
// 状態のフォルダが 1 つも無い repo (DS12) は、DS1・3・5・6・11 を警告にとどめ、DS13 は台帳に状態の列がある repo だけで効く。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionDoc, DocumentEnvironment, Finding, Ledger } from '#decision/core';
import {
  DECISIONS_DIR,
  STATE_DIRS,
  checkAppendOnly,
  checkDocument,
  checkIndexMarks,
  checkLedgerRows,
  checkNoRowRemoved,
  checkReopens,
  checkSupersession,
  checkUnique,
  createGitCommitReader,
  loadDecisions,
  originSlug,
  parseDecision,
  readLedger,
} from '#decision/core';
import type { Check, CheckContext } from '#core/Check.js';
import { isDirectory } from '#core/DocFiles.js';
import { GitError, listFilesAtRef, mergeBase, readFileAtRef } from '#core/GitRef.js';
import { loadIgetaConfig } from '#core/IgetaConfig.js';
import type { Violation } from '#core/Report.js';

export interface DecisionStatusOptions {
  /** 変更を入れる先の ref。履歴が追記のみ (DS7) と台帳の行が消えない (DS13) を、この ref との枝分かれの点と比べる */
  readonly base?: string;
  readonly now?: () => Date;
}

const LEDGER_FILE = '01-decisions.md';

interface BaseSnapshot {
  readonly docs: readonly DecisionDoc[];
  readonly ledger: Ledger;
}

const toViolation = (path: string, finding: Finding): Violation => ({
  severity: 'violation',
  file: finding.path ?? path,
  line: finding.line,
  message: `[${finding.rule}] ${finding.message}`,
});

export class DecisionStatusCheck implements Check {
  readonly name = 'decision-status';
  readonly #base: string | undefined;
  readonly #now: () => Date;
  #warnings: string[] = [];

  constructor(options: DecisionStatusOptions = {}) {
    this.#base = options.base;
    this.#now = options.now ?? (() => new Date());
  }

  get warnings(): readonly string[] {
    return this.#warnings;
  }

  run(ctx: CheckContext): readonly Violation[] {
    this.#warnings = [];
    const decisionsDir = join(ctx.targetRoot, DECISIONS_DIR);
    if (!isDirectory(decisionsDir)) return [];
    const loaded = loadIgetaConfig(ctx.targetRoot);
    if ('violation' in loaded) return [loaded.violation];

    const docs = loadDecisions(ctx.targetRoot);
    const isStrict = STATE_DIRS.some((dir) => isDirectory(join(decisionsDir, dir)));
    if (!isStrict && docs.length > 0) {
      this.#warnings.push(`DS12 状態のフォルダ (${STATE_DIRS.join('・')}) が無く、<年>/ に ADR が ${docs.length} 本ある。igeta docs-migrate で状態のフォルダへ移す`);
    }
    const base = this.#readBase(ctx.targetRoot);
    const today = this.#now().toISOString().slice(0, 10);
    const reader = createGitCommitReader(ctx.targetRoot);
    const { approvers, staleDays } = loaded.config.decisions;
    const env: DocumentEnvironment = { root: ctx.targetRoot, isStrict, today, approverNames: approvers.map((a) => a.name), staleDays, slug: originSlug(ctx.targetRoot), reader };
    try {
      const perDoc = docs.flatMap((doc) => this.#checkDocument(doc, env));
      const crossDoc = [...checkUnique(docs), ...checkSupersession(docs), ...checkReopens(docs)].map((finding) => toViolation(finding.path ?? '', finding));
      const violations = [...perDoc, ...crossDoc, ...this.#compareWithBase(base, docs), ...this.#checkLedger(ctx.targetRoot, decisionsDir, today, base), ...this.#checkIndex(decisionsDir)];
      return violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    } finally {
      reader.dispose();
    }
  }

  #checkDocument(doc: DecisionDoc, env: DocumentEnvironment): Violation[] {
    const result = checkDocument(doc, env);
    this.#warnings.push(...result.warnings);
    const unverifiable = result.unverifiable.map((finding): Violation => ({ ...toViolation(doc.path, finding), severity: 'cannot-check' }));
    return [...unverifiable, ...result.findings.map((finding) => toViolation(doc.path, finding))];
  }

  /** DS7・DS13 の「消えない」: 対象 branch との枝分かれの点と比べる。読めなければ警告 */
  #compareWithBase(base: BaseSnapshot | undefined, docs: readonly DecisionDoc[]): Violation[] {
    if (base === undefined) return [];
    const byId = new Map(base.docs.map((doc) => [doc.id, doc]));
    return docs.flatMap((doc) => {
      const before = byId.get(doc.id);
      return before === undefined ? [] : checkAppendOnly(before, doc).map((finding) => toViolation(doc.path, finding));
    });
  }

  #readBase(root: string): BaseSnapshot | undefined {
    if (this.#base === undefined) return undefined;
    try {
      const point = mergeBase(root, this.#base, 'HEAD');
      const paths = listFilesAtRef(root, point, DECISIONS_DIR).filter((path) => path.endsWith('.md'));
      const docs = paths.flatMap((path) => {
        const parsed = parseDecision(path, readFileAtRef(root, point, path));
        return 'doc' in parsed ? [parsed.doc] : [];
      });
      const ledgerPath = `${DECISIONS_DIR}/${LEDGER_FILE}`;
      return { docs, ledger: readLedger(paths.includes(ledgerPath) ? readFileAtRef(root, point, ledgerPath) : '') };
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      this.#warnings.push(`DS7 --base ${this.#base} を読めない (${error.message.slice(0, 120)})。履歴の追記のみ・台帳の行が消えないは確かめていない`);
      return undefined;
    }
  }

  #checkLedger(root: string, decisionsDir: string, today: string, base: BaseSnapshot | undefined): Violation[] {
    const path = join(decisionsDir, LEDGER_FILE);
    const file = `${DECISIONS_DIR}/${LEDGER_FILE}`;
    const ledger = existsSync(path) ? readLedger(readFileSync(path, 'utf8')) : undefined;
    if (ledger === undefined) return [];
    if (!ledger.hasStateColumn) {
      return base?.ledger.hasStateColumn === true ? [toViolation(file, { rule: 'DS13', line: 1, message: '対象 branch にあった状態の列が消えている' })] : [];
    }
    const baseIds = base === undefined ? undefined : base.ledger.hasStateColumn ? new Set(base.ledger.rows.map((row) => row.id)) : new Set(ledger.rows.map((row) => row.id));
    const checked = checkLedgerRows(ledger, { today, baseIds, pathExists: (target) => existsSync(join(root, target)) || existsSync(join(decisionsDir, target)) });
    this.#warnings.push(...checked.warnings);
    return [...checked.findings, ...(baseIds === undefined ? [] : checkNoRowRemoved(ledger, baseIds))].map((finding) => toViolation(file, finding));
  }

  #checkIndex(decisionsDir: string): Violation[] {
    const path = join(decisionsDir, 'README.md');
    if (!existsSync(path)) return [];
    const file = `${DECISIONS_DIR}/README.md`;
    return checkIndexMarks(readFileSync(path, 'utf8').split('\n')).map((finding) => toViolation(file, finding));
  }
}
