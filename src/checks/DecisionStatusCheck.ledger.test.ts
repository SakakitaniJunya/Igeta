// node --test dist/checks/DecisionStatusCheck.ledger.test.js
// 決定の状態の検査 (テスト仕様 10): 決定台帳 (DS13)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, disposeAllRepos, makeRepo } from '#core/decision/decision.test-support.js';
import { run, hasRule } from './DecisionStatusCheck.test-support.js';

after(disposeAllRepos);

const LEDGER_HEAD = '---\nid: decisions\nkind: decision-log\n---\n\n';
const DEC_TABLE = (row: string): string => `${LEDGER_HEAD}| ID | 状態 | 日付 | 決めた人 | 原文 | 根拠 | 決定 | 影響する文書 |\n|---|---|---|---|---|---|---|---|\n${row}\n`;
const OPEN_TABLE = (row: string): string => `${LEDGER_HEAD}| ID | 状態 | 論点 | 推奨案 | 暫定値 | 持ち主 | 期限 | 根拠 | 影響する文書 |\n|---|---|---|---|---|---|---|---|---|\n${row}\n`;

describe('DecisionStatusCheck: 台帳 (DS13)', () => {
  const ledger = (text: string): ReturnType<typeof run> => {
    const repo = makeRepo();
    repo.write(`${DECISIONS}/01-decisions.md`, text);
    repo.commit('ledger');
    return run(repo);
  };

  it('[TST-108] DEC 決定 (根拠のリンク) と OPEN 未決 (持ち主・期限) は違反 0。期限切れは警告', () => {
    assert.deepEqual(ledger(DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | CEO | 原文 | [PR](https://github.com/acme/widgets/pull/1) | 決めた | A |')).messages, []);
    const open = ledger(OPEN_TABLE('| OPEN-001 | ⏳ 未決 | 論点 | 案 |  | CEO | 2026-10-01 |  | A |'));
    assert.deepEqual(open.messages, []);
    assert.ok(open.warnings.some((w) => w.includes('OPEN-001')));
  });

  it('[TST-318] 台帳に「✅ 未決」は DS13 の違反', () => {
    assert.ok(hasRule(ledger(OPEN_TABLE('| OPEN-001 | ✅ 未決 | 論点 | 案 |  | CEO | 2026-12-01 |  | A |')).messages, 'DS13'));
  });

  it('[TST-319] DEC の根拠が空・OPEN に持ち主か期限が無いと DS13 の違反', () => {
    assert.ok(hasRule(ledger(DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | CEO | 原文 |  | 決めた | A |')).messages, 'DS13'));
    assert.ok(hasRule(ledger(OPEN_TABLE('| OPEN-001 | ⏳ 未決 | 論点 | 案 |  |  | 2026-12-01 |  | A |')).messages, 'DS13'));
    assert.ok(hasRule(ledger(OPEN_TABLE('| OPEN-001 | ⏳ 未決 | 論点 | 案 |  | CEO |  |  | A |')).messages, 'DS13'));
  });

  it('[TST-501] 移行の印は base が無ければ許して警告に数え、base に無い新しい行へ書くと違反', () => {
    const repo = makeRepo();
    const path = `${DECISIONS}/01-decisions.md`;
    repo.write(path, DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | CEO | 原文 | 移行前 (未記入) | 決めた | A |'));
    repo.commit('migrated');
    assert.deepEqual(run(repo).messages, []);
    assert.ok(run(repo).warnings.some((w) => w.includes('DEC-001')));
    repo.git('branch', 'base');
    repo.write(path, `${repo.read(path)}| DEC-002 | ✅ 決定 | 2026-10-02 | CEO | 原文 | 移行前 (未記入) | 決めた | A |\n`);
    repo.commit('new row with mark');
    const messages = run(repo, 'base').messages;
    assert.equal(messages.filter((m) => m.includes('DEC-002') && m.includes('[DS13]')).length, 1);
    assert.equal(messages.some((m) => m.includes('DEC-001')), false);
  });

  it('[TST-507] 状態の列が無い台帳は対象外。base にあった列を消すと違反', () => {
    const repo = makeRepo();
    const path = `${DECISIONS}/01-decisions.md`;
    repo.write(path, DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | CEO | 原文 | https://x.example/1 | 決めた | A |'));
    repo.commit('with column');
    repo.git('branch', 'base');
    repo.write(path, `${LEDGER_HEAD}| ID | 日付 |\n|---|---|\n| DEC-001 | 2026-10-01 |\n`);
    repo.commit('drop column');
    assert.deepEqual(run(repo).messages, []);
    assert.ok(hasRule(run(repo, 'base').messages, 'DS13'));
  });

  it('[TST-108] DEC の根拠は、裸の repo 相対パス (fd.md#2026-10-21) でもよい。実在しなければ違反', () => {
    const repo = makeRepo();
    repo.write('fd.md', '# fd\n');
    repo.write(`${DECISIONS}/01-decisions.md`, DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | CEO | 原文 | fd.md#2026-10-21 | 決めた | A |'));
    repo.commit('bare path');
    assert.deepEqual(run(repo).messages, []);
    repo.write(`${DECISIONS}/01-decisions.md`, DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | CEO | 原文 | missing.md#x | 決めた | A |'));
    repo.commit('missing path');
    assert.ok(hasRule(run(repo).messages, 'DS13'));
  });
});
