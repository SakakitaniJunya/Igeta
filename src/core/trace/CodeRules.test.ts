// node --test dist/core/trace/CodeRules.test.js
// テスト仕様 13 の T7・T8・T10(コード)・T11 と CodeTags、テスト仕様 14 の帯 (TST-944〜948)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanTags } from './CodeTags.js';
import { byRule, findAll, indexOf, makeDoc, makeWorld } from './testing/Fixtures.test-support.js';

const withCode = { code: ['src/**'] };
const tables = makeDoc({ path: 'docs/tbl.md', columns: ['上流 FN:up'], headers: ['ID', '上流 FN'], rows: [['TBL-001', 'FN-010']] });
const tests = makeDoc({ path: 'docs/tst.md', columns: ['対象 TBL:up'], headers: ['ID', '対象 TBL'], rows: [['TST-007', 'TBL-001']] });
const tagOf = (path: string, line: string) => scanTags([{ path, lines: [line] }]);

describe('scanTags', () => {
  it('[TST-918] 先頭行の @trace の後ろの ID を空白区切りで読む', () => {
    assert.deepEqual(tagOf('src/a.ts', '// 在庫の単位を表す部品。 @trace SCR-101 FN-010')[0], { path: 'src/a.ts', tokens: ['SCR-101', 'FN-010'], state: 'tagged' });
  });

  it('[TST-919] @trace が 2 行目にあれば無視し、先頭行に無いファイルは absent', () => {
    const [tag] = scanTags([{ path: 'src/a.ts', lines: ['// 概要', '// @trace FN-010'] }]);
    assert.equal(tag?.state, 'absent');
  });

  it('[TST-920] @trace だけで ID が無い先頭行は empty', () => {
    assert.equal(tagOf('src/a.ts', '// 概要 @trace')[0]?.state, 'empty');
  });

  it('[N3] コードの文字列 "FN-010" は数えない', () => {
    assert.equal(tagOf('src/a.ts', 'const id = "FN-010";')[0]?.state, 'absent');
  });
});

describe('TraceCheck: コードの規則', () => {
  it('[TST-916] T7: TBL を TST の欄から参照するだけで、コードの @trace が無ければ警告 (満たさない)', () => {
    const found = byRule(findAll([...makeWorld(), tables, tests], { settings: withCode, tags: tagOf('src/t.test.ts', '// @trace TST-007') }), 'T7');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['warning', 'TBL-001']]);
  });

  it('[TST-916] T7: tblRule が error なら違反になり、コードの @trace があれば満たす', () => {
    const docs = [...makeWorld(), tables, tests];
    const strict = { code: ['src/**'], tblRule: 'error' } as const;
    assert.equal(byRule(findAll(docs, { settings: strict, tags: [] }), 'T7')[0]?.level, 'violation');
    assert.deepEqual(byRule(findAll(docs, { settings: strict, tags: tagOf('src/t.ts', '// @trace TBL-001') }), 'T7'), []);
  });

  it('[TST-917] T8: テスト文書の TST-007 が、テストのコードの @trace に無ければ違反', () => {
    const docs = [...makeWorld(), tables, tests];
    assert.deepEqual(byRule(findAll(docs, { settings: withCode, tags: tagOf('src/t.ts', '// @trace TST-007') }), 'T8').map((f) => f.id), ['TST-007']);
    assert.deepEqual(byRule(findAll(docs, { settings: withCode, tags: tagOf('src/t.test.ts', '// @trace TST-007') }), 'T8'), []);
  });

  it('[TST-918] @trace の ID は T10 の対象: 定義があれば通り、無ければ違反', () => {
    const ok = findAll(makeWorld(), { settings: withCode, tags: tagOf('src/a.ts', '// @trace SCR-101 FN-010') });
    assert.deepEqual(byRule(ok, 'T10'), []);
    const bad = findAll(makeWorld(), { settings: withCode, tags: tagOf('src/a.ts', '// @trace FN-999') });
    assert.deepEqual(byRule(bad, 'T10').map((f) => [f.level, f.id, f.path]), [['violation', 'FN-999', 'src/a.ts']]);
  });

  it('[TST-919] T10: glob に入るのに先頭行に @trace が無いファイルは違反', () => {
    const found = byRule(findAll(makeWorld(), { settings: withCode, tags: scanTags([{ path: 'src/a.ts', lines: ['// 概要', '// @trace FN-010'] }]) }), 'T10');
    assert.deepEqual(found.map((f) => [f.level, f.path]), [['violation', 'src/a.ts']]);
  });

  it('[TST-920] T10: @trace だけの先頭行は警告', () => {
    const found = byRule(findAll(makeWorld(), { settings: withCode, tags: tagOf('src/a.ts', '// @trace') }), 'T10');
    assert.deepEqual(found.map((f) => f.level), ['warning']);
  });

  it('trace.code が空なら、コードの規則 (T7・T8・先頭行) は見ない', () => {
    const found = findAll([...makeWorld(), tables, tests], { tags: tagOf('src/a.ts', 'なし') });
    assert.deepEqual([...byRule(found, 'T7'), ...byRule(found, 'T8'), ...byRule(found, 'T10')], []);
  });
});

describe('TraceCheck: 番号の帯 (T11)', () => {
  const band = (rows: string[][], settings = {}, bands: string[] | null = ['機能要件:1']) =>
    findAll([makeDoc({ path: 'docs/req.md', columns: ['上流 DEC:up'], bands: bands ?? undefined, heading: '1. 機能要件', headers: ['ID', '上流 DEC'], rows })], { settings });

  it('[TST-944] 機能要件の節に 4 百番台の行があれば違反', () => {
    assert.deepEqual(byRule(band([['REQ-101', ''], ['REQ-401', '']]), 'T11').map((f) => [f.level, f.id]), [['violation', 'REQ-401']]);
  });

  it('[TST-945] 帯の宣言が無い文書は、どの番号でも違反 0', () => {
    assert.deepEqual(byRule(band([['REQ-401', '']], {}, null), 'T11'), []);
  });

  it('[TST-946] .igeta.json の trace.bands で帯を上書きできる', () => {
    assert.deepEqual(byRule(band([['REQ-401', '']], { bands: ['機能要件:4'] }), 'T11'), []);
    assert.equal(byRule(band([['REQ-101', '']], { bands: ['機能要件:4'] }), 'T11').length, 1);
  });

  it('[TST-947] 見出しと一致しない帯の宣言は無効で、警告になる', () => {
    assert.deepEqual(byRule(band([['REQ-401', '']], {}, ['存在しない節:1']), 'T11').map((f) => f.level), ['warning']);
  });

  it('[N6] 帯の宣言が節名でなく番号だけなら読めず、索引の notices に残る', () => {
    const doc = makeDoc({ path: 'docs/r.md', columns: ['上流 DEC:up'], bands: ['1'], headers: ['ID', '上流 DEC'], rows: [['REQ-101', '']] });
    assert.equal(indexOf([doc]).notices.length, 1);
  });

  it('[TST-948] trace.columns の上書き: 上書きの向きで辺を数える', () => {
    const scr = makeDoc({ path: 'docs/scr.md', columns: ['上流 FN:up'], headers: ['ID', '上流 FN'], rows: [['SCR-101', 'FN-010']] });
    const fn = makeDoc({ path: 'docs/fn.md', columns: ['上流 REQ:up'], headers: ['ID', '上流 REQ'], rows: [['FN-010', '']] });
    const edgeOf = (settings = {}) => indexOf([scr, fn], settings).edges.map((edge) => [edge.up, edge.down]);
    assert.deepEqual(edgeOf(), [['shared:FN-010', 'shared:SCR-101']]);
    assert.deepEqual(edgeOf({ columns: ['上流 FN:down'] }), [['shared:SCR-101', 'shared:FN-010']]);
  });
});
