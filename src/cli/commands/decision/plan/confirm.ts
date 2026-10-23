// 根拠の確かめ (ADR-0013 決定 3): merge 済みの PR・閉じた PR/Issue の記録が approvers の GitHub 名と合うこと、
// PR の commit のどれかに今の本文の ADR があること。gh は GitHubPort 越しにだけ読む。

import type { DecisionDoc } from '#decision/core';
import { checkIntroducedBy, sameGithubName, createGitCommitReader, decisionFingerprint, parseEvidenceUrl } from '#decision/core';
import type { Context, Step } from './types.js';
import { cannotCheck, proceed, refuse } from './types.js';

/** --by が approvers の名前にあり、その github を返す */
export function approverGithub(context: Context, by: string | undefined): Step<string> {
  const approver = context.config.approvers.find((candidate) => candidate.name === by);
  return approver === undefined ? refuse(`--by "${by ?? ''}" が .igeta.json の decisions.approvers の名前に無い`) : proceed(approver.github);
}

export interface Confirmed {
  readonly commit: string;
  readonly date: string;
  readonly fingerprint: string;
  readonly url: string;
}

/** merge 済みの PR の、merge した人と、PR の commit のどれかに今の本文があること */
export async function confirmMergedPull(context: Context, doc: DecisionDoc, by: string | undefined, evidence: string): Promise<Step<Confirmed>> {
  const url = parseEvidenceUrl(evidence);
  if (!url.ok) return refuse(url.reason);
  if (url.value.kind !== 'pull') return refuse(`根拠は merge 済みの PR の URL (${evidence})`);
  if (!sameGithubName(url.value.slug, context.slug)) return refuse(`根拠 ${evidence} は origin (${context.slug}) の repo ではない`);
  const github = approverGithub(context, by);
  if (!github.ok) return github;
  const number = Number(url.value.ref);
  const pull = await context.request.port.pull(context.slug, number);
  if (!pull.ok) return cannotCheck(pull.reason);
  if (pull.value.state !== 'merged') return refuse(`PR #${number} は merge されていない (${pull.value.state})`);
  if (!sameGithubName(pull.value.mergedBy ?? '', github.value)) return refuse(`PR #${number} を merge した人 (${pull.value.mergedBy ?? '不明'}) が --by "${by ?? ''}" の github (${github.value}) と違う`);
  const commits = await context.request.port.pullCommits(context.slug, number);
  if (!commits.ok) return cannotCheck(commits.reason);
  const candidates = [...new Set([pull.value.mergeCommit ?? '', ...[...commits.value].reverse()].filter((sha) => sha !== ''))];
  const found = findCommitWithBody(context, doc, candidates);
  if (!found.ok) return found;
  return proceed({ ...found.value, date: pull.value.mergedAt ?? context.request.today, url: evidence });
}

function findCommitWithBody(context: Context, doc: DecisionDoc, candidates: readonly string[]): Step<{ commit: string; fingerprint: string }> {
  const fingerprint = decisionFingerprint(context.request.root, doc.path, doc.text);
  const reader = createGitCommitReader(context.request.root);
  try {
    const reasons: string[] = [];
    for (const commit of candidates) {
      const found = reader.fingerprintAt(commit, doc.id);
      if (found.status === 'found' && found.fingerprint === fingerprint) {
        const introduced = checkIntroducedBy(reader, commit, doc.id, fingerprint);
        if (introduced.status === 'introduced') return proceed({ commit, fingerprint });
        if (introduced.status === 'unverifiable') return cannotCheck(introduced.reason);
        reasons.push(introduced.reason);
        continue;
      }
      reasons.push(found.status === 'found' ? `${commit.slice(0, 12)}: 本文の指紋が今の本文と違う` : found.reason);
      if (found.status === 'unverifiable') return cannotCheck(found.reason);
    }
    return refuse(`PR の commit が今の本文の ${doc.id} を追加・変更していない (${reasons.join(' / ')})`);
  } finally {
    reader.dispose();
  }
}

interface Closure {
  readonly isOpen: boolean;
  readonly who?: string;
  readonly date?: string;
}

async function closureOf(context: Context, url: { readonly kind: string; readonly ref: string }): Promise<Step<Closure>> {
  const number = Number(url.ref);
  const { port } = context.request;
  if (url.kind === 'pull') {
    const pull = await port.pull(context.slug, number);
    if (!pull.ok) return cannotCheck(pull.reason);
    const { state, mergedBy, closedBy, mergedAt, closedAt } = pull.value;
    return proceed({ isOpen: state === 'open', who: state === 'merged' ? mergedBy : closedBy, date: state === 'merged' ? mergedAt : closedAt });
  }
  const issue = await port.issue(context.slug, number);
  return issue.ok ? proceed({ isOpen: issue.value.state === 'open', who: issue.value.closedBy, date: issue.value.closedAt }) : cannotCheck(issue.reason);
}

export async function confirmRejection(context: Context): Promise<Step<{ url: string; date: string }>> {
  const { by, evidence = '' } = context.request;
  const github = approverGithub(context, by);
  if (!github.ok) return github;
  const url = parseEvidenceUrl(evidence);
  if (!url.ok) return refuse(url.reason);
  if (!sameGithubName(url.value.slug, context.slug) || url.value.kind === 'commit') return refuse(`却下の根拠は origin (${context.slug}) の PR か Issue の URL (${evidence})`);
  const closure = await closureOf(context, url.value);
  if (!closure.ok) return closure;
  if (closure.value.isOpen) return refuse(`${evidence} はまだ閉じていない`);
  if (!sameGithubName(closure.value.who ?? '', github.value)) return refuse(`${evidence} を閉じた・merge した人 (${closure.value.who ?? '不明'}) が --by の github (${github.value}) と違う`);
  return proceed({ url: evidence, date: closure.value.date ?? context.request.today });
}
