// node --test dist/checks/DecisionStatusCheck.waiting.test.js
// 決定の状態の検査 (テスト仕様 10): 待ち・浅い clone・索引の印 (DS5・DS11・DS14)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVER, DECISIONS, cloneShallow, disposeAllRepos, makeRepo } from '#core/decision/decision.test-support.js';
import { adrText, landAccepted } from '#core/decision/adr.test-support.js';
import { run, hasRule, proposed } from './DecisionStatusCheck.test-support.js';

after(disposeAllRepos);

describe('DecisionStatusCheck: 待ちと索引', () => {
  it('[TST-320] 期限の当日は警告にならず、翌日から警告 (違反にならない)', () => {
    const repo = makeRepo();
    proposed(repo, '0001', 'a', { awaiting: APPROVER.name, due: '2026-10-22' });
    proposed(repo, '0002', 'b', { awaiting: APPROVER.name, due: '2026-10-21' });
    repo.commit('due');
    const result = run(repo);
    assert.deepEqual(result.messages.filter((m) => m.includes('[DS')), []);
    assert.equal(result.warnings.some((w) => w.includes('ADR-0001')), false);
    assert.equal(result.warnings.some((w) => w.includes('ADR-0002')), true);
  });

  it('[TST-508] awaiting が approvers に無い名前なら DS11 の違反', () => {
    const repo = makeRepo();
    proposed(repo, '0001', 'a', { awaiting: '知らない人' });
    repo.commit('who');
    assert.ok(hasRule(run(repo).messages, 'DS11'));
  });

  it('[TST-321] 浅い clone では DS5 だけが検査不能 (2) で、他の規則は動く', () => {
    const origin = makeRepo();
    landAccepted(origin, { number: '0001', slug: 'a' });
    origin.write(`${DECISIONS}/proposed/0002-b.md`, adrText({ number: '0002', slug: 'b' }));
    origin.commit('no awaiting');
    const result = run(cloneShallow(origin));
    assert.ok(hasRule(result.messages, 'DS11'), '他の規則は動く');
    assert.ok(result.severities.includes('cannot-check'));
  });

  it('[TST-318] 索引の承認待ちの表に ✅ の行があれば DS14 の違反', () => {
    const repo = makeRepo();
    proposed(repo, '0001', 'a');
    repo.write(`${DECISIONS}/README.md`, '# decisions\n\n## ⏳ 承認待ち (1)\n\n| # | タイトル | 状態 |\n|---|---|---|\n| [0001](proposed/0001-a.md) | x | ✅ 承認済 |\n');
    repo.commit('index');
    assert.ok(hasRule(run(repo).messages, 'DS14'));
  });
});
