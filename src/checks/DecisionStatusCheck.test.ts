// node --test dist/checks/DecisionStatusCheck.test.js
// 決定の状態の検査 (テスト仕様 10 の DS1〜DS14)。一時フォルダの本物の git repo に ADR を置き、docs-check 相当の検査を当てる。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import { APPROVER, DECISIONS, adrText, approvalRow, cloneShallow, disposeAllRepos, landAccepted, makeRepo } from '../core/decision/decision.test-support.js';
import type { TestRepo } from '../core/decision/decision.test-support.js';
import { DecisionStatusCheck } from './DecisionStatusCheck.js';

after(disposeAllRepos);

const NOW = (): Date => new Date('2026-10-22T00:00:00Z');

function run(repo: TestRepo, base?: string): { messages: string[]; severities: string[]; warnings: readonly string[] } {
  const check = new DecisionStatusCheck({ now: NOW, base });
  const violations = check.run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT });
  return { messages: violations.map((v) => `${v.file ?? ''}:${v.line ?? 0} ${v.message}`), severities: violations.map((v) => v.severity), warnings: check.warnings };
}

const hasRule = (messages: readonly string[], rule: string): boolean => messages.some((m) => m.includes(`[${rule}]`));

function proposed(repo: TestRepo, number: string, slug: string, extra: Record<string, string> = { awaiting: APPROVER.name }): void {
  repo.write(`${DECISIONS}/proposed/${number}-${slug}.md`, adrText({ number, slug, extra }));
}

describe('DecisionStatusCheck', () => {
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

  it('[TST-301] 手書きの accepted (履歴の行なし) は DS3 の違反', () => {
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
    assert.deepEqual(ledger(DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | 榊谷 | 原文 | [PR](https://github.com/acme/widgets/pull/1) | 決めた | A |')).messages, []);
    const open = ledger(OPEN_TABLE('| OPEN-001 | ⏳ 未決 | 論点 | 案 |  | 榊谷 | 2026-10-01 |  | A |'));
    assert.deepEqual(open.messages, []);
    assert.ok(open.warnings.some((w) => w.includes('OPEN-001')));
  });

  it('[TST-318] 台帳に「✅ 未決」は DS13 の違反', () => {
    assert.ok(hasRule(ledger(OPEN_TABLE('| OPEN-001 | ✅ 未決 | 論点 | 案 |  | 榊谷 | 2026-12-01 |  | A |')).messages, 'DS13'));
  });

  it('[TST-319] DEC の根拠が空・OPEN に持ち主か期限が無いと DS13 の違反', () => {
    assert.ok(hasRule(ledger(DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | 榊谷 | 原文 |  | 決めた | A |')).messages, 'DS13'));
    assert.ok(hasRule(ledger(OPEN_TABLE('| OPEN-001 | ⏳ 未決 | 論点 | 案 |  |  | 2026-12-01 |  | A |')).messages, 'DS13'));
    assert.ok(hasRule(ledger(OPEN_TABLE('| OPEN-001 | ⏳ 未決 | 論点 | 案 |  | 榊谷 |  |  | A |')).messages, 'DS13'));
  });

  it('[TST-501] 移行の印は base が無ければ許して警告に数え、base に無い新しい行へ書くと違反', () => {
    const repo = makeRepo();
    const path = `${DECISIONS}/01-decisions.md`;
    repo.write(path, DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | 榊谷 | 原文 | 移行前 (未記入) | 決めた | A |'));
    repo.commit('migrated');
    assert.deepEqual(run(repo).messages, []);
    assert.ok(run(repo).warnings.some((w) => w.includes('DEC-001')));
    repo.git('branch', 'base');
    repo.write(path, `${repo.read(path)}| DEC-002 | ✅ 決定 | 2026-10-02 | 榊谷 | 原文 | 移行前 (未記入) | 決めた | A |\n`);
    repo.commit('new row with mark');
    const messages = run(repo, 'base').messages;
    assert.equal(messages.filter((m) => m.includes('DEC-002') && m.includes('[DS13]')).length, 1);
    assert.equal(messages.some((m) => m.includes('DEC-001')), false);
  });

  it('[TST-507] 状態の列が無い台帳は対象外。base にあった列を消すと違反', () => {
    const repo = makeRepo();
    const path = `${DECISIONS}/01-decisions.md`;
    repo.write(path, DEC_TABLE('| DEC-001 | ✅ 決定 | 2026-10-01 | 榊谷 | 原文 | https://x.example/1 | 決めた | A |'));
    repo.commit('with column');
    repo.git('branch', 'base');
    repo.write(path, `${LEDGER_HEAD}| ID | 日付 |\n|---|---|\n| DEC-001 | 2026-10-01 |\n`);
    repo.commit('drop column');
    assert.deepEqual(run(repo).messages, []);
    assert.ok(hasRule(run(repo, 'base').messages, 'DS13'));
  });
});
