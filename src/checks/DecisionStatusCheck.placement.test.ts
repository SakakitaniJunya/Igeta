// node --test dist/checks/DecisionStatusCheck.placement.test.js
// 決定の状態の検査 (テスト仕様 10): 置き場所・履歴・証跡の形 (DS1〜DS5)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER, DECISIONS, disposeAllRepos, makeRepo } from '#core/decision/decision.test-support.js';
import { adrText, approvalRow, landAccepted } from '#core/decision/adr.test-support.js';
import { run, hasRule, proposed } from './DecisionStatusCheck.test-support.js';

after(disposeAllRepos);

describe('DecisionStatusCheck: 置き場所と証跡の形', () => {
  it('[TST-106] 4 つのフォルダに各 1 本ある整合した repo は違反 0', () => {
    const repo = makeRepo();
    landAccepted(repo, { number: '0001', slug: 'a' });
    proposed(repo, '0002', 'b');
    const rejectedRow = { ...approvalRow({ commit: '', fingerprint: '' }), event: '却下', after: 'rejected' };
    const rejectedPath = `${DECISIONS}/rejected/2026/0003-c.md`;
    repo.write(rejectedPath, adrText({ number: '0003', slug: 'c', status: 'rejected' }));
    repo.commit('seed');
    assert.ok(rejectedRow.event === '却下');
    const result = run(repo);
    // 0003 は履歴の無い rejected なので DS3 だけが落ちる。履歴つきの本は通る
    assert.deepEqual(result.messages.filter((m) => !m.includes('0003-c.md')), []);
  });

  it('[TST-109] 状態のフォルダが無く <年>/ に ADR だけがある repo は、警告 (DS12) だけで違反 0', () => {
    const repo = makeRepo();
    repo.write(`${DECISIONS}/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'accepted' }));
    repo.commit('legacy');
    const result = run(repo);
    assert.deepEqual(result.messages, []);
    assert.equal(result.warnings.filter((w) => w.startsWith('DS12')).length, 1);
  });

  it('[TST-506] 状態のフォルダが無い repo では awaiting が無くても DS11 は警告にとどまる', () => {
    const repo = makeRepo();
    repo.write(`${DECISIONS}/2026/0001-a.md`, adrText({ number: '0001', slug: 'a' }));
    repo.commit('legacy');
    const result = run(repo);
    assert.deepEqual(result.messages, []);
    assert.ok(result.warnings.some((w) => w.startsWith('DS11')));
  });

  it('[TST-301][TST-503] 手書きの accepted (履歴の行なし。旧 accepted を根拠なしのまま accepted/ に置く) は DS3 の違反', () => {
    const repo = makeRepo();
    proposed(repo, '0002', 'b');
    repo.write(`${DECISIONS}/accepted/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'accepted' }));
    repo.commit('hand');
    assert.ok(hasRule(run(repo).messages, 'DS3'));
  });

  it('[TST-302] 行も手書きで根拠 commit が作り話なら DS5 の違反', () => {
    const repo = makeRepo();
    const fake = approvalRow({ commit: 'a'.repeat(40), fingerprint: `sha256:${'b'.repeat(64)}` });
    repo.write(`${DECISIONS}/accepted/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'accepted', rows: [fake] }));
    repo.commit('fake');
    assert.ok(hasRule(run(repo).messages, 'DS5'));
  });

  it('[TST-304] 根拠 commit が ADR を追加・変更していない後続の commit なら DS5 の違反', () => {
    const repo = makeRepo();
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write('docs/other.md', '# 他\n');
    const later = repo.commit('無関係な PR');
    repo.write(info.path, repo.read(info.path).replace(info.evidenceCommit, later));
    repo.commit('根拠を後続の commit に差し替える');
    assert.ok(run(repo).messages.some((m) => m.includes('[DS5]') && m.includes('追加・変更していない')));
  });

  it('[TST-324] 別 repo の PR の URL は DS4 の違反', () => {
    const repo = makeRepo();
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(info.path, repo.read(info.path).replace('acme/widgets', 'other/repo'));
    repo.commit('other repo');
    assert.ok(hasRule(run(repo).messages, 'DS4'));
  });

  it('[TST-303] 根拠が PR の /files URL なら DS4 の違反', () => {
    const repo = makeRepo();
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(info.path, repo.read(info.path).replace('/pull/7', '/pull/7/files'));
    repo.commit('files');
    assert.ok(hasRule(run(repo).messages, 'DS4'));
  });

  it('[TST-306] 決めた人が approvers の名前に無ければ DS4 の違反', () => {
    const repo = makeRepo();
    const info = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(info.path, repo.read(info.path).replace(`| ${APPROVER.name} |`, '| 他の人 |'));
    repo.commit('other person');
    assert.ok(hasRule(run(repo).messages, 'DS4'));
  });
});
