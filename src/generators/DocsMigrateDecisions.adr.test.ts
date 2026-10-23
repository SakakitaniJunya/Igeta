// node --test dist/generators/DocsMigrateDecisions.adr.test.js
// docs-migrate の決定の段: ADR (テスト仕様 12 の MG1・MG2・TST-401・403・502〜505)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseHistory } from '#decision/core';
import { fixturePort, unavailablePort } from '#cli/commands/decision/port.test-support.js';
import { APPROVER, DECISIONS, makeRepo } from '#core/decision/decision.test-support.js';
import { DECISIONS_README, adrText, pullUrl } from '#core/decision/adr.test-support.js';
import { ExitCode } from '#core/ExitCode.js';
import { disposeAllRepos } from '#core/decision/decision.test-support.js';
import { legacyPath, legacyAdr, legacyRepo, run, checkOf } from './DocsMigrateDecisions.test-support.js';
import { parseEvidenceTable } from './DocsMigrateDecisions.js';

after(disposeAllRepos);

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

describe('docs-migrate の決定の段: 根拠の表の入力', () => {
  it('使われない行 (id の綴り違い・rejected の ADR) が 1 つでもあれば、何も書かずに拒否 (2) して列挙する', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'acc', 'accepted');
    legacyAdr(repo, '0002', 'rej', 'rejected');
    const sha = repo.commit('旧配置 (#7)');
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha } }, commits: { 7: [sha] } });
    const rows = [
      { id: 'adr-0001-acc', by: APPROVER.name, evidence: pullUrl(7) },
      { id: 'adr-0001-acd', by: APPROVER.name, evidence: pullUrl(7) },
      { id: 'adr-0002-rej', by: APPROVER.name, evidence: pullUrl(7) },
    ];
    const outcome = await run(repo, port, rows);
    assert.equal(outcome.exitCode, ExitCode.CannotCheck);
    assert.match(outcome.lines.join('\n'), /adr-0001-acd \/ adr-0002-rej/);
    assert.equal(repo.git('status', '--porcelain'), '');
  });

  it('parseEvidenceTable: 配列でない・JSON でない・by か evidence が欠けた行は 1 行の入力エラー', () => {
    assert.deepEqual(parseEvidenceTable('[{"id":"a","by":"b","evidence":"c"}]'), [{ id: 'a', by: 'b', evidence: 'c' }]);
    for (const bad of ['{}', 'not json', '[{"id":"a","by":"b"}]', '[1]', '[{"id":"a","by":"","evidence":"c"}]']) {
      assert.throws(() => parseEvidenceTable(bad), /--decisions-evidence/, bad);
    }
  });
});
