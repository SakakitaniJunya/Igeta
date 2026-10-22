// 承認の証跡 (テスト仕様 10 の DS4・DS5): 根拠 URL の形、根拠 commit に今の本文があること、初めて現れた日。
// git が使えない・浅い clone で辿れないときは「検査不能」を返し、一致とも不一致とも言わない。

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSourceIndex } from '../SourceResolver.js';
import { decisionFingerprint } from './fingerprint.js';
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
  else if (url.value.slug !== context.slug) problems.push(`根拠 ${row.evidence} は origin (${context.slug}) の repo ではない`);
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

/** commit の時点の ADR の本文指紋。found / missing (commit に無い・HEAD の履歴に無い) / unverifiable (git が辿れない) */
export type CommitLookup =
  | { readonly status: 'found'; readonly fingerprint: string }
  | { readonly status: 'missing' | 'unverifiable'; readonly reason: string };

export interface CommitReader {
  fingerprintAt(commit: string, id: string): CommitLookup;
  /** 取り出した一時フォルダを消す */
  dispose(): void;
}

function git(root: string, args: readonly string[]): Result<string> {
  try {
    return succeed(execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }));
  } catch (error) {
    return fail(error instanceof Error ? error.message.trim() : String(error));
  }
}

/** HEAD の履歴にある commit か。浅い clone で辿れないときは unverifiable */
function reachability(root: string, commit: string): 'reachable' | 'missing' | 'unverifiable' {
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']);
  if (!shallow.ok) return 'unverifiable';
  const isShallow = shallow.value.trim() === 'true';
  const known = git(root, ['cat-file', '-e', `${commit}^{commit}`]);
  if (!known.ok) return isShallow ? 'unverifiable' : 'missing';
  return git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']).ok ? 'reachable' : isShallow ? 'unverifiable' : 'missing';
}

function extractTree(root: string, commit: string, into: string): Result<string> {
  try {
    const archive = execFileSync('git', ['-C', root, 'archive', '--format=tar', commit], { maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const untar = spawnSync('tar', ['-x', '-C', into], { input: archive });
    return untar.status === 0 ? succeed(into) : fail(`tar で取り出せない: ${String(untar.stderr)}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** 本物の git を読む CommitReader。commit ごとに一時フォルダへ取り出して指紋を計算し、同じ commit は 1 回だけ取り出す */
export function createGitCommitReader(root: string): CommitReader {
  const trees = new Map<string, Result<string>>();
  const treeAt = (commit: string): Result<string> => {
    const cached = trees.get(commit) ?? extractTree(root, commit, mkdtempSync(join(tmpdir(), 'igeta-decision-')));
    trees.set(commit, cached);
    return cached;
  };
  return {
    fingerprintAt(commit, id) {
      const reach = reachability(root, commit);
      if (reach !== 'reachable') return { status: reach, reason: `根拠 commit ${commit.slice(0, 12)} を HEAD の履歴から辿れない` };
      const tree = treeAt(commit);
      if (!tree.ok) return { status: 'unverifiable', reason: tree.reason };
      const doc = buildSourceIndex(tree.value, join(tree.value, 'docs'))?.byId.get(id);
      if (doc === undefined) return { status: 'missing', reason: `根拠 commit ${commit.slice(0, 12)} に ${id} が無い` };
      return { status: 'found', fingerprint: decisionFingerprint(tree.value, doc.relPath, readFileSync(doc.file, 'utf8')) };
    },
    dispose() {
      for (const tree of trees.values()) if (tree.ok) rmSync(tree.value, { recursive: true, force: true });
    },
  };
}

/** `origin` の `owner/repo` */
export function originSlug(root: string): Result<string> {
  const url = git(root, ['remote', 'get-url', 'origin']);
  if (!url.ok) return fail('origin の URL を読めない');
  const matched = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\s*$/.exec(url.value);
  return matched === null ? fail(`origin が GitHub の URL ではない: ${url.value.trim()}`) : succeed(matched[1] ?? '');
}

export interface FirstSeen {
  /** `YYYY-MM-DD` */
  readonly date: string;
  /** 初めて現れた commit の件名 (PR 番号 `(#12)` を含みうる) */
  readonly subject: string;
}

/** ADR のファイルが初めて現れた commit (名前の変更を辿る)。浅い clone では辿れないので失敗にする */
export function firstSeen(root: string, path: string): Result<FirstSeen> {
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']);
  if (!shallow.ok || shallow.value.trim() === 'true') return fail('浅い clone か git が無いので、初めて現れた日を辿れない');
  const log = git(root, ['log', '--follow', '--diff-filter=A', '--format=%cs%x09%s', '--', path]);
  const earliest = log.ok ? log.value.trim().split('\n').at(-1) : undefined;
  const [date = '', subject = ''] = (earliest ?? '').split('\t');
  return date === '' ? fail(`${path} が git の履歴に無い (commit 前)`) : succeed({ date, subject });
}
