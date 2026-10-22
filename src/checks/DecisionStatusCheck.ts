// 決定 (ADR) の状態・履歴・フォルダ・台帳の検査 (テスト仕様 10 の DS1〜DS14)。docs-check から呼ばれる。
// 規則の中身は #decision/core にあり、ここは ADR を集めて規則を当て、違反と警告に分けるだけ。
// 状態のフォルダが 1 つも無い repo (DS12) は、DS1・3・5・6・11 を警告にとどめ、DS13 は台帳に状態の列がある repo だけで効く。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionDoc, Finding, Ledger } from '#decision/core';
import {
  DECISIONS_DIR,
  STATE_DIRS,
  checkAppendOnly,
  checkBodyUnchanged,
  checkEvidenceShape,
  checkIndexMarks,
  checkLedgerRows,
  checkNoRowRemoved,
  checkPlacement,
  checkReopens,
  checkStatusMatchesHistory,
  checkSupersession,
  checkTransitions,
  checkUnique,
  checkWaiting,
  createGitCommitReader,
  decisionFingerprint,
  firstSeen,
  loadDecisions,
  originSlug,
  parseDecision,
  readLedger,
} from '#decision/core';
import type { Check, CheckContext } from '../core/Check.js';
import { isDirectory } from '../core/DocFiles.js';
import { GitError, listFilesAtRef, mergeBase, readFileAtRef } from '../core/GitRef.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';

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

/** ADR 1 本の検査が共有する、repo 全体の前提 */
interface DocEnvironment {
  readonly root: string;
  readonly isStrict: boolean;
  readonly today: string;
  readonly config: { readonly approvers: readonly { readonly name: string }[]; readonly staleDays: number };
  readonly slug: ReturnType<typeof originSlug>;
  readonly reader: ReturnType<typeof createGitCommitReader>;
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
    const env: DocEnvironment = { root: ctx.targetRoot, isStrict, today, config: loaded.config.decisions, slug: originSlug(ctx.targetRoot), reader };
    try {
      const perDoc = docs.flatMap((doc) => this.#checkDecision(doc, env));
      const crossDoc = [...checkUnique(docs), ...checkSupersession(docs), ...checkReopens(docs)].map((finding) => toViolation(finding.path ?? '', finding));
      const violations = [...perDoc, ...crossDoc, ...this.#compareWithBase(base, docs), ...this.#checkLedger(ctx.targetRoot, decisionsDir, today, base), ...this.#checkIndex(decisionsDir)];
      return violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    } finally {
      reader.dispose();
    }
  }

  /** ADR 1 本に当てる規則 (DS1・3・4・5・6・9・11) */
  #checkDecision(doc: DecisionDoc, env: DocEnvironment): Violation[] {
    const names = env.config.approvers.map((approver) => approver.name);
    const decided = doc.rows.filter((row) => ['承認', '改訂', '却下'].includes(row.event));
    const findings: Finding[] = [...checkTransitions(doc.rows), ...(env.isStrict ? [...checkPlacement(doc), ...checkStatusMatchesHistory(doc.status, doc.rows)] : [])];
    const violations: Violation[] = [];
    if (decided.length > 0 && !env.slug.ok) {
      violations.push({ severity: 'cannot-check', file: doc.path, message: `[DS4] ${env.slug.reason} (根拠の owner と repo を origin と照合できない)` });
    } else if (env.slug.ok) {
      findings.push(...decided.flatMap((row) => checkEvidenceShape(row, { slug: env.slug.ok ? env.slug.value : '', approverNames: names }).map((message) => ({ rule: 'DS4', line: row.line, message }))));
    }
    if (env.isStrict) {
      findings.push(...checkBodyUnchanged({ status: doc.status, rows: doc.rows, fingerprint: decisionFingerprint(env.root, doc.path, doc.text) }));
      violations.push(...this.#checkEvidenceExists(doc, decided, env, findings));
    }
    const seen = doc.status === 'proposed' ? firstSeen(env.root, doc.path) : undefined;
    const waitingSince = seen?.ok === true ? { date: seen.value.date, isFromGit: true } : { date: doc.created || env.today, isFromGit: false };
    const waiting = checkWaiting(doc, { isStrict: env.isStrict, approverNames: names, staleDays: env.config.staleDays, today: env.today, waitingSince });
    this.#warnings.push(...waiting.warnings);
    return [...violations, ...[...findings, ...waiting.findings].map((finding) => toViolation(doc.path, finding))];
  }

  /** DS5: 承認・改訂の行の根拠 commit が HEAD の履歴にあり、そこにこの ADR と同じ本文指紋がある。浅い clone などで辿れなければ検査不能 */
  #checkEvidenceExists(doc: DecisionDoc, decided: DecisionDoc['rows'], env: DocEnvironment, findings: Finding[]): Violation[] {
    const violations: Violation[] = [];
    for (const row of decided.filter((candidate) => candidate.event !== '却下' && /^[0-9a-f]{40}$/.test(candidate.commit))) {
      const found = env.reader.fingerprintAt(row.commit, doc.id);
      if (found.status === 'found') {
        if (found.fingerprint !== row.fingerprint) findings.push({ rule: 'DS5', line: row.line, message: `根拠 commit の本文指紋が行の指紋と違う (commit ${found.fingerprint.slice(0, 19)}… / 行 ${row.fingerprint.slice(0, 19)}…)` });
      } else if (found.status === 'unverifiable') {
        violations.push({ severity: 'cannot-check', file: doc.path, line: row.line, message: `[DS5] ${found.reason}` });
      } else {
        findings.push({ rule: 'DS5', line: row.line, message: found.reason });
      }
    }
    return violations;
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
