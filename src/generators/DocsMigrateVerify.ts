// docs-migrate の前後の測定と完了条件 (テスト仕様 07 の M16・M17・M19)。
// 前の状態 (移す前) と後の状態 (移した後・索引を作り直した後) を同じ見方で測り、C1〜C5 を比べる。
// 何も書かない。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';
import { DocGraphCheck } from '../checks/DocGraphCheck.js';
import { DocTemplateCheck } from '../checks/DocTemplateCheck.js';
import { FolderSizeCheck } from '../checks/FolderSizeCheck.js';
import { ProvenanceCheck } from '../checks/ProvenanceCheck.js';
import { AgreementCheck } from '../checks/AgreementCheck.js';
import { RoleBoundaryCheck, UNDECIDED_HEADING_MESSAGE } from '../checks/RoleBoundaryCheck.js';
import { readRepoDoc, filesUnder, isDirPath, isIndexPath, nonDocMatcher, trackedFiles } from './DocsMigrateRepo.js';
import { applyLinkEdits, bodyShapeForCompare, localTarget, scanLinkHits } from './DocsMigrateLinks.js';
import type { Plan } from './DocsMigratePlan.js';
import { loadIgetaConfig, DEFAULT_IGETA_CONFIG } from '../core/IgetaConfig.js';

/** 1 本のリンク (文書の中の順番つき)。broken は行き先のファイルが無いこと */
export interface MeasuredLink {
  readonly file: string;
  readonly ordinal: number;
  readonly dest: string;
  readonly target: string;
  readonly broken: boolean;
}

export interface MeasuredState {
  readonly links: readonly MeasuredLink[];
  /** 文書 (索引を除く、docs/ の中で移す対象) の id */
  readonly ids: readonly { readonly file: string; readonly id: string }[];
  /** 文書の本文 (frontmatter の後ろ、リンクの行き先を除く前) */
  readonly bodies: ReadonlyMap<string, string>;
  readonly nondocFiles: readonly string[];
  /** 由来・合意の検査の、違反の (ファイル, 文) */
  readonly provenance: readonly { readonly file: string; readonly key: string }[];
  readonly agreement: readonly { readonly file: string; readonly key: string }[];
}



/** 違反の文から、状態を表す鍵 (「anchor: state」) を取る。詳細 (括弧の中) は除く */
const stateKey = (message: string): string => {
  const matched = /^(.+?: [a-z-]+)(?: \(|$)/.exec(message);
  return matched?.[1] ?? message;
};

/** 移す前後で同じ見方で測る。docs/ の中のファイルと、repo の .md の全部のリンク */
export async function measure(root: string, igetaRoot: string): Promise<MeasuredState> {
  const loaded = loadIgetaConfig(root);
  const config = 'config' in loaded ? loaded.config : DEFAULT_IGETA_CONFIG;
  const isNonDoc = nonDocMatcher(config.nonDocPaths);
  const docsAbs = join(root, 'docs');
  const underDocs = isDirPath(docsAbs) ? filesUnder(root, 'docs') : [];
  const movable = underDocs.filter((path) => !isNonDoc(path));

  const links: MeasuredLink[] = [];
  const tracked = trackedFiles(root) ?? [];
  for (const file of tracked.filter((path) => path.endsWith('.md'))) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    scanLinkHits(readFileSync(abs, 'utf8')).forEach((hit, ordinal) => {
      const target = localTarget(file, hit.dest);
      if (target === null) return;
      links.push({ file, ordinal, dest: hit.dest, target: target.path, broken: !existsSync(join(root, target.path)) });
    });
  }

  const ids: { file: string; id: string }[] = [];
  const bodies = new Map<string, string>();
  for (const file of movable.filter((path) => path.endsWith('.md') && !isIndexPath(path))) {
    const doc = readRepoDoc(root, file);
    if (doc.id !== null) ids.push({ file, id: doc.id });
    bodies.set(file, doc.bodyLines.join('\n'));
  }

  // 由来: 違反と、needs-recompute の警告。警告のうち、保存した版で一致するもの (fingerprint-rebase で載せ替わる) は
  // 「#rebased」の鍵にする。実装の無い版 (載せ替えられない) は needs-recompute のまま残る
  const provenance: { file: string; key: string }[] = [];
  const provenanceCheck = new ProvenanceCheck({ targetRoot: root, docsDir: docsAbs });
  for (const violation of provenanceCheck.analyze().violations) {
    if (violation.file !== undefined) provenance.push({ file: violation.file, key: stateKey(violation.message) });
  }
  for (const warning of provenanceCheck.warnings) {
    const space = warning.indexOf(' ');
    if (space === -1) continue;
    const file = warning.slice(0, space);
    const message = warning.slice(space + 1);
    const key = stateKey(message);
    provenance.push({ file, key: message.includes('で一致') ? `${key}#rebased` : key });
  }
  const agreement: { file: string; key: string }[] = [];
  const agreementCheck = new AgreementCheck({ docsDir: docsAbs });
  for (const violation of agreementCheck.run({ targetRoot: root, igetaRoot })) {
    agreement.push({ file: violation.file ?? '', key: stateKey(violation.message) });
  }

  return {
    links,
    ids,
    bodies,
    nondocFiles: movable.filter((path) => !path.endsWith('.md')),
    provenance,
    agreement,
  };
}

/** 完了条件の 1 件の不合格 (C1〜C5) */
export interface CompletionProblem {
  readonly code: 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  readonly text: string;
}

/** 作業の列 (M17): 完了条件を満たした後に残る違反を、種類ごとに出す */
export interface WorkItem {
  readonly kind: string;
  readonly violations: readonly Violation[];
}

const runCheck = async (check: Check, ctx: CheckContext): Promise<readonly Violation[]> => check.run(ctx);

/** 移した後の状態を測って、C1〜C5 を比べる。before は移す前 (measure の結果) */
export async function completion(args: {
  readonly root: string;
  readonly igetaRoot: string;
  readonly before: MeasuredState;
  readonly plan: Plan;
}): Promise<{ readonly problems: readonly CompletionProblem[]; readonly work: readonly WorkItem[] }> {
  const { root, igetaRoot, before, plan } = args;
  const ctx: CheckContext = { targetRoot: root, igetaRoot };
  const after = await measure(root, igetaRoot);
  const problems: CompletionProblem[] = [];

  // 移した後の場所から、移す前の場所を引く
  const oldOf = new Map<string, string>();
  for (const [from, to] of plan.moves) oldOf.set(to, from);
  const beforeOf = (newPath: string): string => oldOf.get(newPath) ?? newPath;
  const removed = plan.removedHandbooks;

  // C1: 移す前に壊れていなかったリンクが、壊れていない (前から壊れていたものは一覧で知らせる)
  const afterByKey = new Map<string, MeasuredLink>();
  for (const link of after.links) afterByKey.set(`${link.file}\u0000${link.ordinal}`, link);
  const beforeKeyed = new Map<string, MeasuredLink>();
  const countByFile = new Map<string, number>();
  for (const link of before.links) {
    if (removed.has(link.file) || removed.has(link.target)) continue;
    const ordinal = countByFile.get(link.file) ?? 0;
    countByFile.set(link.file, ordinal + 1);
    beforeKeyed.set(`${link.file}\u0000${ordinal}`, link);
  }
  for (const [key, link] of beforeKeyed) {
    if (link.broken) continue;
    const [file = '', ordinalText = '0'] = key.split('\u0000');
    const newFile = plan.newPathOf(file);
    if (plan.deletes.has(file)) continue;
    const current = afterByKey.get(`${newFile}\u0000${ordinalText}`);
    if (current !== undefined && current.broken) {
      problems.push({ code: 'C1', text: `リンクが壊れた: ${newFile} -> ${current.dest} (移す前は ${file} -> ${link.dest})` });
    }
  }

  // C2: 置き場所の違反が 0 件・docs/common/ が無い (未決の節は作業の列へ回す)
  const placement = new RoleBoundaryCheck().run(ctx).filter((v) => !v.message.startsWith(UNDECIDED_HEADING_MESSAGE));
  for (const violation of placement) problems.push({ code: 'C2', text: `置き場所: ${violation.file ?? ''} ${violation.message}` });

  // C3: 索引のずれが 0 件
  const drift = (await runCheck(new DocGraphCheck(), ctx)).filter(isDrift);
  for (const violation of drift) problems.push({ code: 'C3', text: `索引: ${violation.message}` });

  // C4: 由来と合意の 1 件ずつの状態が同じ (needs-recompute は載せ替わって ok になるので、移す前の一覧から外す)
  // 移す前の「#rebased」は、載せ替えで ok になるので、移した後の一覧に残ってはいけない (残れば載せ替わっていない)
  const compareStates = (
    prior: readonly { readonly file: string; readonly key: string }[],
    current: readonly { readonly file: string; readonly key: string }[],
    label: string,
  ): void => {
    const toKey = (file: string, key: string): string => `${file}|${key}`;
    const priorSet = new Set(prior.filter((item) => !item.key.endsWith('#rebased')).map((item) => toKey(item.file, item.key)));
    const currentSet = new Set(current.map((item) => toKey(beforeOf(item.file), item.key)));
    for (const key of priorSet) if (!currentSet.has(key)) problems.push({ code: 'C4', text: `${label} の状態が変わった (移す前): ${key}` });
    for (const key of currentSet) if (!priorSet.has(key)) problems.push({ code: 'C4', text: `${label} の状態が変わった (移した後): ${key}` });
  };
  compareStates(before.provenance, after.provenance, '由来');
  compareStates(before.agreement, after.agreement, '合意');

  // C5: 文書の id の集合 (消した写しを除く) と本文 (リンクの行き先を除く) と、文書でないファイルの数
  const idsBefore = before.ids.filter((item) => !removed.has(item.file) && !plan.deletes.has(item.file)).map((item) => item.id).sort();
  const idsAfter = after.ids.map((item) => item.id).sort();
  if (JSON.stringify(idsBefore) !== JSON.stringify(idsAfter)) {
    problems.push({ code: 'C5', text: `文書の id の集合が変わった (移す前 ${idsBefore.length} 件・移した後 ${idsAfter.length} 件)` });
  }
  const afterBodies = new Map(after.bodies);
  for (const [file, body] of before.bodies) {
    if (removed.has(file) || plan.deletes.has(file)) continue;
    const newFile = plan.newPathOf(file);
    const current = afterBodies.get(newFile);
    if (current === undefined) {
      problems.push({ code: 'C5', text: `文書が無い: ${newFile}` });
      continue;
    }
    const expected = bodyShapeForCompare(applyHandbookRemovals(body, file, removed));
    if (expected !== bodyShapeForCompare(current)) problems.push({ code: 'C5', text: `本文が変わった: ${newFile}` });
  }
  if (before.nondocFiles.filter((file) => !plan.deletes.has(file)).length !== after.nondocFiles.length) {
    problems.push({ code: 'C5', text: '文書でないファイルの数が変わった' });
  }

  // 作業の列 (M17): 完了条件の後に残る違反
  const work: WorkItem[] = [];
  const templateViolations = await runCheck(new DocTemplateCheck({ requireKind: true }), ctx);
  const personForm = templateViolations.filter((v) => (v.file ?? '').startsWith('docs/person/'));
  const otherTemplate = templateViolations.filter((v) => !(v.file ?? '').startsWith('docs/person/'));
  work.push({ kind: '人の文書の型と量 (PersonFormCheck・書き直す段)', violations: personForm });
  work.push({ kind: '文書の型 (雛形との突き合わせ・それ以外)', violations: otherTemplate });
  work.push({ kind: '索引と参照 (依存の向き・届かない AI の文書・引かれていない ADR)', violations: (await runCheck(new DocGraphCheck(), ctx)).filter((v) => !isDrift(v)) });
  work.push({ kind: '1 フォルダの 15 本の超過', violations: new FolderSizeCheck().run(ctx) });
  work.push({
    kind: 'AI の文書の未決の節',
    violations: new RoleBoundaryCheck().run(ctx).filter((v) => v.message.startsWith(UNDECIDED_HEADING_MESSAGE)),
  });
  return { problems, work };
}

/** 索引のずれ (docs-graph --write で直るもの) か */
export const isDrift = (violation: Violation): boolean =>
  violation.message.includes('out of date') || violation.message.includes('索引が無い');

/** 比べる前に、消した写しのリンクを一覧と同じ形 (`文字 \`手引きのパス\``) にする */
function applyHandbookRemovals(body: string, file: string, removed: ReadonlyMap<string, string>): string {
  if (removed.size === 0) return body;
  return applyLinkEdits(body, (hit) => {
    const target = localTarget(file, hit.dest);
    const handbook = target === null ? undefined : removed.get(target.path);
    if (handbook === undefined) return null;
    return `${hit.text === '' ? '' : `${hit.text} `}\`${handbook}\``;
  }).text;
}
