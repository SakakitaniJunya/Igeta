// node --test dist/checks/DecisionStatusCheck.history.test.js
// 決定の状態の検査 (テスト仕様 10): 承認後の本文・一意・遷移・置換・再提案 (DS2・DS6〜DS10)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER, DECISIONS, disposeAllRepos, makeRepo } from '#core/decision/decision.test-support.js';
import { adrText, approvalRow, landAccepted } from '#core/decision/adr.test-support.js';
import { run, hasRule, proposed } from './DecisionStatusCheck.test-support.js';

after(disposeAllRepos);

describe('DecisionStatusCheck: 履歴と関係', () => {
  it('[TST-307] 承認後に本文の 1 語を変えると DS6 の違反', () => {
    const repo = makeRepo();
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(info.path, repo.read(info.path).replace('決定の本文。', '決定の本文を変えた。'));
    repo.commit('edit body');
    assert.ok(hasRule(run(repo).messages, 'DS6'));
  });

  it('DS6 は事象 移行前 の行を対象外にする (移行前の行だけの ADR は本文が何でも DS4〜DS6 に当たらない)', () => {
    const repo = makeRepo();
    const row = { date: '2025-01-01', event: '移行前', before: '未記入', after: 'superseded', by: '', evidence: '移行前 (未記入)', commit: '', fingerprint: '', memo: '' };
    repo.write(`${DECISIONS}/retired/2025/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'superseded', rows: [row], extra: { superseded_by: 'adr-0002-b' } }));
    repo.write(`${DECISIONS}/proposed/0002-b.md`, adrText({ number: '0002', slug: 'b', extra: { awaiting: APPROVER.name, supersedes: '[adr-0001-a]' } }));
    repo.commit('pre-migration');
    const messages = run(repo).messages;
    for (const rule of ['DS4', 'DS5', 'DS6']) assert.equal(hasRule(messages, rule), false, rule);
  });

  it('[TST-310][TST-311] 同じ id か番号が 2 フォルダにあれば DS2 の違反', () => {
    const repo = makeRepo();
    landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(`${DECISIONS}/proposed/0001-a.md`, adrText({ number: '0001', slug: 'a', extra: { awaiting: APPROVER.name } }));
    repo.write(`${DECISIONS}/proposed/0001-z.md`, adrText({ number: '0001', slug: 'z', extra: { awaiting: APPROVER.name } }));
    repo.commit('dup');
    assert.ok(hasRule(run(repo).messages, 'DS2'));
  });

  it('[TST-312] 年のフォルダの年が違うと DS1 の違反', () => {
    const repo = makeRepo();
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(`${DECISIONS}/accepted/2025/0001-a.md`, repo.read(info.path));
    repo.git('rm', '-q', info.path);
    repo.commit('wrong year');
    assert.ok(hasRule(run(repo).messages, 'DS1'));
  });

  it('[TST-309][TST-308] base が proposed の ADR を行を足さずに rejected にすると DS3・DS7、過去の行の根拠を差し替えると DS7', () => {
    const repo = makeRepo();
    proposed(repo, '0005', 'e');
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.git('branch', 'base');
    repo.git('checkout', '-q', '-b', 'work');
    const moved = `${DECISIONS}/rejected/2026/0005-e.md`;
    repo.write(moved, repo.read(`${DECISIONS}/proposed/0005-e.md`).replace('status: proposed', 'status: rejected'));
    repo.git('rm', '-q', `${DECISIONS}/proposed/0005-e.md`);
    repo.write(info.path, repo.read(info.path).replace('/pull/7', '/pull/8'));
    repo.commit('tamper');
    const messages = run(repo, 'base').messages;
    assert.ok(hasRule(messages, 'DS3'));
    assert.ok(messages.some((m) => m.includes('0005-e.md') && m.includes('[DS7]')));
    assert.ok(messages.some((m) => m.includes('0001-a.md') && m.includes('[DS7]')));
  });

  it('[TST-315] 遷移の違反: 前の状態が rejected の承認の行は DS9', () => {
    const repo = makeRepo();
    const row = { ...approvalRow({ commit: 'c'.repeat(40), fingerprint: `sha256:${'d'.repeat(64)}` }), before: 'rejected' };
    repo.write(`${DECISIONS}/accepted/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'accepted', rows: [row] }));
    repo.commit('bad transition');
    assert.ok(hasRule(run(repo).messages, 'DS9'));
  });

  it('[TST-316] reopens は rejected だけを指す。accepted を指すと DS10', () => {
    const repo = makeRepo();
    landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(`${DECISIONS}/rejected/2026/0002-b.md`, adrText({ number: '0002', slug: 'b', status: 'rejected' }));
    repo.write(`${DECISIONS}/proposed/0003-c.md`, adrText({ number: '0003', slug: 'c', extra: { awaiting: APPROVER.name, reopens: 'adr-0002-b' } }));
    repo.write(`${DECISIONS}/proposed/0004-d.md`, adrText({ number: '0004', slug: 'd', extra: { awaiting: APPROVER.name, reopens: 'adr-0001-a' } }));
    repo.commit('reopens');
    const found = run(repo).messages.filter((m) => m.includes('[DS10]'));
    assert.equal(found.length, 1);
    assert.ok(found[0]?.includes('0004-d.md'));
  });

  it('[TST-317] 置換の片側だけは DS8 の違反', () => {
    const repo = makeRepo();
    proposed(repo, '0001', 'a');
    repo.write(`${DECISIONS}/proposed/0002-b.md`, adrText({ number: '0002', slug: 'b', extra: { awaiting: APPROVER.name, supersedes: '[adr-0001-a]' } }));
    repo.commit('one side');
    assert.ok(hasRule(run(repo).messages, 'DS8'));
  });
});
