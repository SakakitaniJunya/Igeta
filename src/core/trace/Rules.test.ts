// node --test dist/core/trace/Rules.test.js
// テスト仕様 13 の T1〜T6・T9・T10 とその誤検知。名前の TST-9nn がテストケースの ID。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from './Baseline.js';
import { byRule, findAll, indexOf, makeDoc, makeWorld } from './testing/Fixtures.test-support.js';

describe('TraceCheck: 規則 T1〜T6', () => {
  it('[TST-901] 正常: DEC(作る物) → REQ → FN → SCR・API が両方向に揃っていれば指摘 0', () => {
    assert.deepEqual(findAll(makeWorld()), []);
  });

  it('[TST-902] T3: REQ の下流に FN が無ければ違反 (REQ の名前で出る)', () => {
    const found = byRule(findAll(makeWorld({ req: [['REQ-101', 'DEC-001', '']], fn: [['FN-010', '', 'SCR-101', 'API-001']] })), 'T3');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['violation', 'REQ-101']]);
  });

  it('[TST-903] T4: FN の上流が空なら違反', () => {
    const found = byRule(findAll(makeWorld({ req: [['REQ-101', 'DEC-001', '']], fn: [['FN-010', '', 'SCR-101', 'API-001']] })), 'T4');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['violation', 'FN-010']]);
  });

  it('[TST-904] T9: REQ → FN を REQ の行だけが書いていれば警告 (違反にしない)', () => {
    const found = byRule(findAll(makeWorld({ fn: [['FN-010', '', 'SCR-101', 'API-001']] })), 'T9');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['warning', 'REQ-101']]);
  });

  it('[TST-904] T9: strictEdges: true なら同じ片方向が違反になる', () => {
    const found = byRule(findAll(makeWorld({ fn: [['FN-010', '', 'SCR-101', 'API-001']] }), { settings: { strictEdges: true } }), 'T9');
    assert.equal(found[0]?.level, 'violation');
  });

  it('[TST-905] T9 例外: FN が下流に SCR を書き、SCR の上流に FN が無ければ違反', () => {
    const found = byRule(findAll(makeWorld({ scr: [['SCR-101', '']] })), 'T9');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['violation', 'FN-010']]);
  });

  it('[TST-906] 書き間違い: 欄の FN-10 (3 桁でない) は ID として数えない', () => {
    const index = indexOf(makeWorld({ scr: [['SCR-101', 'FN-10']] }));
    assert.equal(index.dangling.length, 0);
    assert.equal(index.edges.some((edge) => edge.down.endsWith('SCR-101') && edge.declaredBy === 'down'), false);
  });

  it('[TST-907] T10: 欄の FN-999 に定義が無ければ違反', () => {
    const found = byRule(findAll(makeWorld({ scr: [['SCR-101', 'FN-010 FN-999']] })), 'T10');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['violation', 'FN-999']]);
  });

  it('[TST-908] T1(a): 同じ文書の表で FN-010 を 2 回採番すれば違反 (2 回目の行で出る)', () => {
    const rows = [['FN-010', 'REQ-101', 'SCR-101', 'API-001'], ['FN-010', 'REQ-101', '', '']];
    const found = byRule(findAll(makeWorld({ fn: rows })), 'T1');
    assert.deepEqual(found.map((f) => [f.level, f.id]), [['violation', 'FN-010']]);
  });

  it('[TST-909] T1(b): 自分の差分で増えた REQ-120 が、origin の別文書の定義と衝突すれば違反', () => {
    const extra = (path: string, context: string) =>
      makeDoc({ path, context, columns: ['上流 DEC:up'], headers: ['ID', '上流 DEC'], rows: [['REQ-120', '']] });
    const found = byRule(findAll([...makeWorld(), extra('docs/new.md', 'shared')], { origin: [...makeWorld(), extra('docs/old.md', 'shared')], mergeBase: makeWorld() }), 'T1');
    assert.deepEqual(found.map((f) => [f.id, f.path]), [['REQ-120', 'docs/new.md']]);
  });

  it('同じファイルの 3 つ目の重複は、2 つ目とは別の指紋になる (基準の 1 件に隠れない)', () => {
    const rows = [['FN-010', 'REQ-101', 'SCR-101', 'API-001'], ['FN-010', '', '', ''], ['FN-010', '', '', '']];
    const prints = byRule(findAll(makeWorld({ fn: rows })), 'T1').map(fingerprint);
    assert.equal(new Set(prints).size, 2);
  });

  it('基準の指紋は文書の動かしに強い: パスが変わっても (id が同じなら) 同じ指紋', () => {
    const fingerprintsAt = (path: string): string[] => {
      const docs = makeWorld().map((doc) => (doc.path === 'docs/fn.md' ? makeDoc({ path, id: 'fn-doc', columns: ['上流 REQ:up'], headers: ['ID', '上流 REQ'], rows: [['FN-010', ''], ['FN-010', '']] }) : doc));
      return findAll(docs).filter((found) => found.level === 'violation').map(fingerprint).sort();
    };
    const before = fingerprintsAt('docs/fn.md');
    assert.ok(before.length > 0);
    assert.deepEqual(fingerprintsAt('docs/moved/fn.md'), before);
  });

  it('[TST-909] T1(b): origin にもある自分の文書の定義 (差分で増えていない) は衝突にしない', () => {
    assert.deepEqual(byRule(findAll(makeWorld(), { origin: makeWorld() }), 'T1'), []);
  });

  it('[TST-910] 誤検知: context A と B に同じ REQ-801 があっても T1 は 0', () => {
    const req = (path: string, context: string) => makeDoc({ path, context, columns: ['上流 DEC:up'], headers: ['ID', '上流 DEC'], rows: [['REQ-801', '']] });
    assert.deepEqual(byRule(findAll([req('docs/a.md', 'a'), req('docs/b.md', 'b')]), 'T1'), []);
  });

  it('[TST-911] 誤検知: trace_columns を宣言していない文書の表は数えない', () => {
    const index = indexOf([makeDoc({ path: 'docs/plain.md', headers: ['ID', '名前'], rows: [['FN-010', 'x'], ['FN-010', 'y']] })]);
    assert.equal(index.definitions.length, 0);
  });

  it('[TST-912] 誤検知: OPEN-001 の表 (trace.kinds に無い接頭辞) は数えない', () => {
    const index = indexOf([makeDoc({ path: 'docs/o.md', columns: ['上流 DEC:up'], headers: ['ID', '上流 DEC'], rows: [['OPEN-001', '']] })]);
    assert.equal(index.definitions.length, 0);
  });

  it('[TST-913] T6: API が上流に SCR を持てば違反 0', () => {
    const world = makeWorld({ fn: [['FN-010', 'REQ-101', 'SCR-101', '']], api: [['API-001', 'SCR-101']], scr: [['SCR-101', 'FN-010']] });
    assert.deepEqual(byRule(findAll(world), 'T6'), []);
  });

  it('[TST-914] T6: API の上流が FN だけで、その FN が SCR にも DEC にも届かなければ違反', () => {
    const world = makeWorld({ dec: [['DEC-001', '方針のみ', '']], req: [['REQ-101', '', 'FN-010']], fn: [['FN-010', 'REQ-101', '', 'API-001']], scr: [['SCR-101', '']] });
    assert.deepEqual(byRule(findAll(world), 'T6').map((f) => f.id), ['API-001']);
  });

  it('[TST-915] T6: API の上流 FN が下流に SCR を持てば違反 0', () => {
    const world = makeWorld({ dec: [['DEC-001', '方針のみ', '']], req: [['REQ-101', '', 'FN-010']] });
    assert.deepEqual(byRule(findAll(world), 'T6'), []);
  });

  it('T2: 作る物の DEC に下流の REQ・FN が無ければ違反。方針のみなら見ない', () => {
    const none = makeWorld({ dec: [['DEC-001', '作る物', '']], req: [['REQ-101', '', 'FN-010']] });
    assert.deepEqual(byRule(findAll(none), 'T2').map((f) => f.id), ['DEC-001']);
    const policy = makeWorld({ dec: [['DEC-001', '方針のみ', '']], req: [['REQ-101', '', 'FN-010']] });
    assert.deepEqual(byRule(findAll(policy), 'T2'), []);
  });

  it('T5: SCR の上流に FN が無ければ違反', () => {
    const world = makeWorld({ fn: [['FN-010', 'REQ-101', '', 'API-001']], scr: [['SCR-101', '']] });
    assert.deepEqual(byRule(findAll(world), 'T5').map((f) => f.id), ['SCR-101']);
  });

  it('[TST-925] 旧い構成: 定義が 0 件の repo では何も検査しない', () => {
    assert.deepEqual(findAll([makeDoc({ path: 'docs/plain.md', headers: ['ID'], rows: [] })]), []);
  });

  it('関わる種類の定義が 0 件の repo では、その種類の規則を見ない (FN が無ければ T3 は見ない)', () => {
    const docs = [makeDoc({ path: 'docs/r.md', columns: ['下流 FN:down'], headers: ['ID', '下流 FN'], rows: [['REQ-101', '']] })];
    assert.deepEqual(byRule(findAll(docs), 'T3'), []);
  });

  it('[N8] 空の欄 (-) と全角の ID は ID の形ではなく、欠落として T3 で落ちる', () => {
    const world = makeWorld({ req: [['REQ-101', 'DEC-001', '-']], fn: [['FN-010', 'ＲＥＱ-101', 'SCR-101', 'API-001']] });
    assert.equal(byRule(findAll(world), 'T3').length, 1);
  });

  it('[N2] 本文の「FN-010 参照」は辺にならない (欄の外は数えない)', () => {
    const req = makeDoc({ path: 'docs/req.md', columns: ['下流 FN:down'], headers: ['ID', '備考', '下流 FN'], rows: [['REQ-101', 'FN-010 参照', '']] });
    const fn = makeDoc({ path: 'docs/fn.md', columns: ['上流 REQ:up'], headers: ['ID', '上流 REQ'], rows: [['FN-010', '']] });
    assert.equal(byRule(findAll([req, fn]), 'T3').length, 1);
  });

  it('[N4] 欄に「FN-010 は対象外」と書いても ID として数える', () => {
    const index = indexOf(makeWorld({ scr: [['SCR-101', 'FN-010 は対象外']] }));
    assert.ok(index.edges.some((edge) => edge.declaredBy === 'down' && edge.down.endsWith('SCR-101')));
  });
});
