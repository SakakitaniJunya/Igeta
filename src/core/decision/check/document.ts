// ADR 1 本に当てる規則の組み立て (テスト仕様 10 の DS1・3・4・5・6・9・11)。何も書かず、指摘と警告を返す。
// 状態のフォルダが 1 つも無い repo (DS12) では、DS1・3・5・6 は当てず、DS11 は警告にとどめる。

import type { DecisionDoc } from '../decision.js';
import type { CommitReader } from '../evidence.js';
import { checkEvidenceShape, firstSeen } from '../evidence.js';
import { decisionFingerprint, checkBodyUnchanged } from '../fingerprint.js';
import { checkPlacement } from '../folder.js';
import type { Finding, HistoryRow, Result } from '../history.js';
import { checkStatusMatchesHistory, checkTransitions } from './history-rules.js';
import { checkWaiting } from './waiting.js';

export interface DocumentEnvironment {
  readonly root: string;
  /** 状態のフォルダが 1 つでもある repo か (DS12) */
  readonly isStrict: boolean;
  readonly today: string;
  readonly approverNames: readonly string[];
  readonly staleDays: number;
  /** `origin` の `owner/repo`。読めなければ失敗 */
  readonly slug: Result<string>;
  readonly reader: CommitReader;
}

export interface DocumentResult {
  readonly findings: readonly Finding[];
  /** 確かめられなかったもの (検査不能 2)。他の規則は動く */
  readonly unverifiable: readonly Finding[];
  readonly warnings: readonly string[];
}

const SEALING_EVENTS: readonly string[] = ['承認', '改訂', '却下'];

/** DS5: 承認・改訂の行の根拠 commit が HEAD の履歴にあり、そこに同じ本文指紋の ADR がある */
function checkEvidenceExists(doc: DecisionDoc, reader: CommitReader): { findings: Finding[]; unverifiable: Finding[] } {
  const findings: Finding[] = [];
  const unverifiable: Finding[] = [];
  const rows = doc.rows.filter((row: HistoryRow) => ['承認', '改訂'].includes(row.event) && /^[0-9a-f]{40}$/.test(row.commit));
  for (const row of rows) {
    const found = reader.fingerprintAt(row.commit, doc.id);
    if (found.status === 'found') {
      if (found.fingerprint === row.fingerprint) continue;
      findings.push({ rule: 'DS5', line: row.line, message: `根拠 commit の本文指紋が行の指紋と違う (commit ${found.fingerprint.slice(0, 19)}… / 行 ${row.fingerprint.slice(0, 19)}…)` });
    } else {
      (found.status === 'unverifiable' ? unverifiable : findings).push({ rule: 'DS5', line: row.line, message: found.reason });
    }
  }
  return { findings, unverifiable };
}

function checkEvidenceForm(doc: DecisionDoc, env: DocumentEnvironment): { findings: Finding[]; unverifiable: Finding[] } {
  const decided = doc.rows.filter((row: HistoryRow) => SEALING_EVENTS.includes(row.event));
  if (decided.length === 0) return { findings: [], unverifiable: [] };
  if (!env.slug.ok) return { findings: [], unverifiable: [{ rule: 'DS4', line: 1, message: `${env.slug.reason} (根拠の owner と repo を origin と照合できない)` }] };
  const context = { slug: env.slug.value, approverNames: env.approverNames };
  return { findings: decided.flatMap((row: HistoryRow) => checkEvidenceShape(row, context).map((message) => ({ rule: 'DS4', line: row.line, message }))), unverifiable: [] };
}

/** ADR 1 本の指摘・検査不能・警告 */
export function checkDocument(doc: DecisionDoc, env: DocumentEnvironment): DocumentResult {
  const form = checkEvidenceForm(doc, env);
  const placement = env.isStrict ? [...checkPlacement(doc), ...checkStatusMatchesHistory(doc.status, doc.rows)] : [];
  const body = env.isStrict ? checkBodyUnchanged({ status: doc.status, rows: doc.rows, fingerprint: decisionFingerprint(env.root, doc.path, doc.text) }) : [];
  const exists = env.isStrict ? checkEvidenceExists(doc, env.reader) : { findings: [], unverifiable: [] };
  const seen = doc.status === 'proposed' ? firstSeen(env.root, doc.path) : undefined;
  const waitingSince = seen?.ok === true ? { date: seen.value.date, isFromGit: true } : { date: doc.created || env.today, isFromGit: false };
  const waiting = checkWaiting(doc, { isStrict: env.isStrict, approverNames: env.approverNames, staleDays: env.staleDays, today: env.today, waitingSince });
  return {
    findings: [...checkTransitions(doc.rows), ...placement, ...form.findings, ...body, ...exists.findings, ...waiting.findings],
    unverifiable: [...form.unverifiable, ...exists.unverifiable],
    warnings: waiting.warnings,
  };
}
