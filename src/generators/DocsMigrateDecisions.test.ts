// node --test dist/generators/DocsMigrateDecisions.test.js
// docs-migrate の決定の段 (テスト仕様 12 の MG1〜MG4・TST-401〜405・501〜505)。git は一時フォルダの本物の repo、GitHub は fixture。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory, readLedger } from '#decision/core';
import { fixturePort, unavailablePort } from '../cli/commands/decision/port.test-support.js';
import type { GitHubPort } from '../cli/commands/decision/port.js';
import { DecisionStatusCheck } from '../checks/DecisionStatusCheck.js';
import { APPROVER, DECISIONS, DECISIONS_README, adrText, disposeAllRepos, makeRepo, pullUrl } from '../core/decision/decision.test-support.js';
import type { TestRepo } from '../core/decision/decision.test-support.js';
import { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { migrateDecisions } from './DocsMigrateDecisions.js';
import type { EvidenceRow } from './DocsMigrateDecisions.js';

after(disposeAllRepos);

const TODAY = '2026-10-22';
const legacyPath = (number: string, slug: string): string => `${DECISIONS}/2026/${number}-${slug}.md`;

/** ADR を旧配置 (<年>/) に置く。frontmatter の accepted は 2026-10-03 */
function legacyAdr(repo: TestRepo, number: string, slug: string, status: string): void {
  repo.write(legacyPath(number, slug), adrText({ number, slug, status, extra: { accepted: '2026-10-03' } }));
}

function legacyRepo(): TestRepo {
  const repo = makeRepo();
  repo.write(`${DECISIONS}/README.md`, DECISIONS_README);
  return repo;
}

function run(repo: TestRepo, port: GitHubPort, evidenceRows: readonly EvidenceRow[] = [], isDryRun = false): ReturnType<typeof migrateDecisions> {
  return migrateDecisions({ root: repo.root, igetaRoot: IGETA_ROOT, evidenceRows, port, today: TODAY, isDryRun });
}

function checkOf(repo: TestRepo, base?: string): DecisionStatusCheck & { messages(): string[] } {
  const check = new DecisionStatusCheck({ base, now: () => new Date(`${TODAY}T00:00:00Z`) });
  return Object.assign(check, { messages: () => check.run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT }).map((v) => `${v.file ?? ''} ${v.message}`) });
}

describe('docs-migrate の決定の段: ADR', () => {
  it('[TST-401] 旧配置の 5 本: 根拠のある accepted は accepted/<年>/、旧 rejected は proposed/ で 差戻し、旧 proposed は proposed/、旧 superseded・deprecated は 移行前 の 1 行で retired/。違反 0', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'acc', 'accepted');
    legacyAdr(repo, '0002', 'rej', 'rejected');
    legacyAdr(repo, '0003', 'pro', 'proposed');
    legacyAdr(repo, '0004', 'sup', 'superseded');
    legacyAdr(repo, '0005', 'dep', 'deprecated');
    const sha = repo.commit('旧配置 (#7)');
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha, mergedAt: '2026-10-05' } }, commits: { 7: [sha] } });
    const outcome = await run(repo, port, [{ id: 'adr-0001-acc', by: APPROVER.name, evidence: pullUrl(7) }]);
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    assert.equal(existsSync(join(repo.root, legacyPath('0001', 'acc'))), false);
    const rows = (path: string) => parseHistory(repo.read(path).split('\n')).rows;
    assert.equal(rows(`${DECISIONS}/accepted/2026/0001-acc.md`)[0]?.event, '承認');
    const sentBack = rows(`${DECISIONS}/proposed/0002-rej.md`)[0];
    assert.deepEqual([sentBack?.event, sentBack?.after], ['差戻し', 'proposed']);
    assert.match(sentBack?.memo ?? '', /旧い状態 rejected/);
    assert.match(repo.read(`${DECISIONS}/proposed/0002-rej.md`), new RegExp(`^awaiting: ${APPROVER.name}$`, 'm'));
    assert.match(repo.read(`${DECISIONS}/proposed/0003-pro.md`), new RegExp(`^awaiting: ${APPROVER.name}$`, 'm'));
    for (const name of ['0004-sup', '0005-dep']) {
      const row = rows(`${DECISIONS}/retired/2026/${name}.md`);
      assert.deepEqual([row.length, row[0]?.event, row[0]?.evidence], [1, '移行前', '移行前 (未記入)']);
    }
    assert.deepEqual(checkOf(repo).messages(), []);
  });

  it('[TST-403] 移行済みの repo に 2 回目は何も変えない', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0002', 'rej', 'rejected');
    repo.commit('旧配置');
    assert.equal((await run(repo, unavailablePort)).exitCode, ExitCode.Ok);
    repo.commit('移行');
    const second = await run(repo, unavailablePort);
    assert.equal(second.exitCode, ExitCode.Ok);
    assert.equal(repo.git('status', '--porcelain'), '');
  });

  it('[ADR-0014] 別 branch の ADR-0014 のように <年>/ にある proposed (awaiting 無し・履歴無し) も、両方 merge された後の docs-migrate で proposed/ へ動く', async () => {
    const repo = legacyRepo();
    repo.write(legacyPath('0014', 'templates-tree'), adrText({ number: '0014', slug: 'templates-tree' }));
    repo.commit('ADR-0014 を取り込む');
    const outcome = await run(repo, unavailablePort);
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    assert.match(repo.read(`${DECISIONS}/proposed/0014-templates-tree.md`), new RegExp(`^awaiting: ${APPROVER.name}$`, 'm'));
    assert.deepEqual(checkOf(repo).messages(), []);
  });

  it('[TST-502] 根拠の表の URL がその ADR を含まない PR なら、全部書かずに拒否 (1)', async () => {
    const repo = legacyRepo();
    repo.write('docs/other.md', '# 他\n');
    const early = repo.commit('他の PR (#5)');
    legacyAdr(repo, '0001', 'acc', 'accepted');
    legacyAdr(repo, '0002', 'rej', 'rejected');
    repo.commit('旧配置');
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: early } }, commits: { 7: [early] } });
    const outcome = await run(repo, port, [{ id: 'adr-0001-acc', by: APPROVER.name, evidence: pullUrl(7) }]);
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.equal(existsSync(join(repo.root, legacyPath('0002', 'rej'))), true, '他の ADR も動いていない');
    assert.equal(repo.git('status', '--porcelain'), '');
  });

  it('[TST-504] 根拠の表の名前が approvers に無ければ拒否 (1)', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'acc', 'accepted');
    const sha = repo.commit('旧配置 (#7)');
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha } }, commits: { 7: [sha] } });
    const outcome = await run(repo, port, [{ id: 'adr-0001-acc', by: '知らない人', evidence: pullUrl(7) }]);
    assert.equal(outcome.exitCode, ExitCode.Violation);
  });

  it('[TST-505] 根拠の PR の後に本文が変わった ADR は拒否 (1)。後の PR を根拠にすれば通る', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'acc', 'accepted');
    const first = repo.commit('旧配置 (#7)');
    repo.write(legacyPath('0001', 'acc'), adrText({ number: '0001', slug: 'acc', status: 'accepted', body: '後で変えた本文。', extra: { accepted: '2026-10-03' } }));
    const later = repo.commit('本文を直す (#8)');
    const merged = (mergeCommit: string) => ({ state: 'merged' as const, author: 'ai', mergedBy: APPROVER.github, mergeCommit });
    const port = fixturePort({ pulls: { 7: merged(first), 8: merged(later) }, commits: { 7: [first], 8: [later] } });
    assert.equal((await run(repo, port, [{ id: 'adr-0001-acc', by: APPROVER.name, evidence: pullUrl(7) }])).exitCode, ExitCode.Violation);
    assert.equal((await run(repo, port, [{ id: 'adr-0001-acc', by: APPROVER.name, evidence: pullUrl(8) }])).exitCode, ExitCode.Ok);
  });

  it('approvers が空の repo では、何も変えず NOTICE だけを出す (既存の repo を黙って動かさない)', async () => {
    const repo = makeRepo({ approvers: false });
    repo.write(`${DECISIONS}/README.md`, DECISIONS_README);
    legacyAdr(repo, '0001', 'acc', 'accepted');
    repo.commit('旧配置');
    const outcome = await run(repo, unavailablePort);
    assert.equal(outcome.exitCode, ExitCode.Ok);
    assert.match(outcome.lines.join('\n'), /^NOTICE/);
    assert.equal(existsSync(join(repo.root, legacyPath('0001', 'acc'))), true);
  });

  it('--dry-run は計画の行だけを出し、何も書かない', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0002', 'rej', 'rejected');
    repo.commit('旧配置');
    const outcome = await run(repo, unavailablePort, [], true);
    assert.ok(outcome.lines.some((line) => line.startsWith('MOVE ')));
    assert.equal(repo.git('status', '--porcelain'), '');
  });
});

describe('Igeta 自身の 12 本 (MG1)', () => {
  it('[TST-404] #19 (0001〜0010)・#20 (0011)・#26 (0012) の fixture で 12 本が accepted/2026/ に入り、0013 が proposed/ に残り、<年>/ 直下に ADR は残らない。違反 0', async () => {
    const repo = legacyRepo();
    const numbers = Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(4, '0'));
    const slugOf = (number: string): string => `adr${number}`;
    const prFor = (number: string): number => (Number(number) <= 10 ? 19 : number === '0011' ? 20 : 26);
    const landed = new Map<number, string>();
    for (const number of [...numbers.slice(0, 10), '0011', '0012']) {
      repo.write(legacyPath(number, slugOf(number)), adrText({ number, slug: slugOf(number), body: `${number} の決定。`.repeat(8) }));
      landed.set(prFor(number), repo.commit(`ADR-${number} (#${prFor(number)})`));
    }
    repo.write(legacyPath('0013', slugOf('0013')), adrText({ number: '0013', slug: slugOf('0013'), extra: { awaiting: APPROVER.name }, body: '0013 は承認待ち。'.repeat(8) }));
    repo.commit('ADR-0013 を提案');
    const merged = (sha: string) => ({ state: 'merged' as const, author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha });
    const port = fixturePort({
      pulls: Object.fromEntries([...landed].map(([pr, sha]) => [pr, merged(sha)])),
      commits: Object.fromEntries([...landed].map(([pr, sha]) => [pr, [sha]])),
    });
    const rows = numbers.slice(0, 12).map((number) => ({ id: `adr-${number}-${slugOf(number)}`, by: APPROVER.name, evidence: pullUrl(prFor(number)) }));
    const outcome = await run(repo, port, rows);
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    for (const number of numbers.slice(0, 12)) assert.equal(existsSync(join(repo.root, `${DECISIONS}/accepted/2026/${number}-${slugOf(number)}.md`)), true, number);
    assert.equal(existsSync(join(repo.root, `${DECISIONS}/proposed/0013-${slugOf('0013')}.md`)), true);
    assert.equal(existsSync(join(repo.root, `${DECISIONS}/2026`)), false, '<年>/ 直下に ADR が残らない');
    assert.deepEqual(checkOf(repo).messages(), []);
  });
});

const decRow = (n: number): string => `| DEC-${String(n).padStart(3, '0')} | 2026-10-01 | 榊谷 | 「やる」 | 決めた ${n} | A |`;
const openRow = (n: number): string => `| OPEN-${String(n).padStart(3, '0')} | 論点 ${n} | 案 | ${n === 1 ? '30 日' : ''} | A |`;
const OLD_LEDGER = [
  '---', 'id: decisions', 'title: 決定台帳', 'type: decision-log', 'kind: decision-log', 'status: active', 'owners: [eng]', '---', '',
  '# 決定台帳', '',
  '| ID | 日付 | 決めた人 | 原文 | 決定 | 影響する文書 |', '|---|---|---|---|---|---|',
  ...Array.from({ length: 15 }, (_, i) => decRow(i + 1)),
  '',
  '| ID | 論点 | 推奨案 | 仮置き値 | 影響する文書 |', '|---|---|---|---|---|',
  ...Array.from({ length: 17 }, (_, i) => openRow(i + 1)),
  '',
  '## 仮置き一覧 (自動生成)',
  '',
  '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
  '<!-- AUTOGEN:tentative-index:end -->',
  '',
].join('\n');

describe('docs-migrate の決定の段: 台帳 (MG3・MG4)', () => {
  const ledgerPath = `${DECISIONS}/01-decisions.md`;

  it('[TST-402][TST-405] DEC 15 行・OPEN 17 行に列が足り、移行の印の行は警告として数えられ、違反 0。暫定値のある OPEN は 暫定、空は 未決', async () => {
    const repo = legacyRepo();
    repo.write(ledgerPath, OLD_LEDGER);
    repo.commit('旧い台帳');
    const outcome = await run(repo, unavailablePort);
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const ledger = readLedger(repo.read(ledgerPath));
    assert.equal(ledger.rows.length, 32);
    assert.equal(ledger.rows.find((row) => row.id === 'DEC-001')?.cells['根拠'], '移行前 (未記入)');
    const open = ledger.rows.filter((row) => row.id.startsWith('OPEN'));
    assert.deepEqual([open[0]?.cells['状態'], open[1]?.cells['状態']], ['⏳ 暫定', '⏳ 未決']);
    assert.deepEqual([open[1]?.cells['持ち主'], open[1]?.cells['期限'], open[0]?.cells['暫定値']], [APPROVER.name, '未定', '30 日']);
    const check = checkOf(repo);
    assert.deepEqual(check.messages(), []);
    assert.equal(check.warnings.filter((w) => w.startsWith('DS13')).length, 32);
    assert.equal((await run(repo, unavailablePort)).lines.length, 1, '2 回目は何も変えない');
  });

  it('[TST-501] 移行後に base に無い新しい DEC 行へ 移行前 (未記入) を書くと DS13 の違反。移行前からある行は警告のまま', async () => {
    const repo = legacyRepo();
    repo.write(ledgerPath, OLD_LEDGER);
    repo.commit('旧い台帳');
    await run(repo, unavailablePort);
    repo.commit('移行');
    repo.git('branch', 'base');
    const lines = repo.read(ledgerPath).split('\n');
    const last = lines.findLastIndex((line) => line.startsWith('| DEC-015 |'));
    lines.splice(last + 1, 0, '| DEC-099 | ✅ 決定 | 2026-10-22 | 榊谷 | 原文 | 移行前 (未記入) | 新しい | A | |');
    repo.write(ledgerPath, lines.join('\n'));
    repo.commit('新しい行');
    const found = checkOf(repo, 'base').messages().filter((m) => m.includes('[DS13]'));
    assert.equal(found.length, 1);
    assert.match(found[0] ?? '', /DEC-099/);
  });
});
