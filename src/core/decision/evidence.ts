// 承認の証跡の形 (テスト仕様 10 の DS4): 根拠 URL の形と、承認・改訂・却下の行の欄が埋まっていること。git を読む部分は git/。

import type { HistoryRow, Result } from './history.js';
import { fail, succeed } from './history.js';

export interface EvidenceUrl {
  /** `owner/repo` */
  readonly slug: string;
  readonly kind: 'pull' | 'issues' | 'commit';
  readonly ref: string;
}

/** `https://github.com/<owner>/<repo>/(pull|issues)/<n>` か `/commit/<sha>` だけを受ける。`/files` などの末尾は受けない */
export function parseEvidenceUrl(url: string): Result<EvidenceUrl> {
  const matched = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues|commit)\/([0-9a-f]+)$/.exec(url);
  if (matched === null) return fail(`根拠の URL が https://github.com/<owner>/<repo>/(pull|issues)/<番号> か commit/<sha> の形ではない: ${url}`);
  return succeed({ slug: matched[1] ?? '', kind: matched[2] as EvidenceUrl['kind'], ref: matched[3] ?? '' });
}

/** GitHub の owner・repo・ユーザー名は大文字小文字を区別しない */
export const sameGithubName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const FULL_SHA = /^[0-9a-f]{40}$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;

export interface ShapeContext {
  /** `origin` と同じ `owner/repo` */
  readonly slug: string;
  readonly approverNames: readonly string[];
}

function shapeProblems(row: HistoryRow, context: ShapeContext): string[] {
  const problems: string[] = [];
  if (!context.approverNames.includes(row.by)) problems.push(`決めた人 "${row.by}" が approvers の名前に無い`);
  const url = parseEvidenceUrl(row.evidence);
  const allowedKinds = row.event === '却下' ? ['pull', 'issues'] : ['pull', 'commit'];
  if (!url.ok) problems.push(url.reason);
  else if (!sameGithubName(url.value.slug, context.slug)) problems.push(`根拠 ${row.evidence} は origin (${context.slug}) の repo ではない`);
  else if (!allowedKinds.includes(url.value.kind)) problems.push(`${row.event}の根拠は ${allowedKinds.join('・')} の URL (${row.evidence})`);
  const isCommitOptional = row.event === '却下' && row.commit === '';
  if (!isCommitOptional && !FULL_SHA.test(row.commit)) problems.push(`根拠 commit "${row.commit}" が 40 桁の 16 進ではない`);
  if (!FINGERPRINT.test(row.fingerprint)) problems.push(`本文指紋 "${row.fingerprint}" が sha256:<64 桁> の形ではない`);
  return problems;
}

/** DS4: 承認・改訂・却下の行の形。置換の行の根拠は置いた ADR の id。差戻し・移行前の行は対象外 */
export function checkEvidenceShape(row: HistoryRow, context: ShapeContext): string[] {
  if (row.event === '置換') return /^adr-\d{4}/.test(row.evidence) ? [] : [`置換の根拠は置いた ADR の id (${row.evidence})`];
  return ['承認', '改訂', '却下'].includes(row.event) ? shapeProblems(row, context) : [];
}
