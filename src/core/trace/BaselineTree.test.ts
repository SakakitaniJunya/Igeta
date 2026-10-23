// node --test dist/core/trace/BaselineTree.test.js
// 基準 (applyBaseline・grew・shrinkBaseline) と木 (buildTree・render) の単体。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyBaseline, fingerprint, formatBaseline, grew, parseBaseline, shrinkBaseline } from './Baseline.js';
import type { Finding } from './model/Types.js';
import { buildTree, render } from './Tree.js';
import { findAll, indexOf, makeDoc, makeWorld } from './testing/Fixtures.test-support.js';

const violation: Finding = { rule: 'T3', level: 'violation', id: 'REQ-101', path: 'docs/req.md', line: 9, message: 'x' };
const warning: Finding = { ...violation, rule: 'T9', level: 'warning' };

describe('基準', () => {
  it('[TST-921] 基準に有る違反は baselined に分け、警告は基準の対象外でそのまま残る', () => {
    const { fresh, baselined } = applyBaseline([violation, warning], [fingerprint(violation), fingerprint(warning)]);
    assert.deepEqual(baselined, [violation]);
    assert.deepEqual(fresh, [warning]);
  });

  it('指紋に行番号を入れない (行が動いても同じ違反)', () => {
    assert.equal(fingerprint(violation), fingerprint({ ...violation, line: 99 }));
  });

  it('[TST-922] 現在の基準に origin に無い指紋があれば grew、同じか少なければ grew でない', () => {
    assert.equal(grew(['a', 'b'], ['a']), true);
    assert.equal(grew(['a'], ['a', 'b']), false);
    assert.equal(grew(['a'], ['a']), false);
  });

  it('[TST-923] 違反を直すと shrinkBaseline で指紋が消え、新しい違反は足さない', () => {
    const other: Finding = { ...violation, id: 'REQ-102' };
    assert.deepEqual(shrinkBaseline([fingerprint(violation), 'T3|REQ-999|docs/gone.md'], [other]), []);
    assert.deepEqual(shrinkBaseline([fingerprint(violation)], [violation, other]), [fingerprint(violation)]);
  });

  it('基準ファイルは並べ替えて重複を除き、読み戻せる。形が違えば error', () => {
    assert.deepEqual(parseBaseline(formatBaseline(['b', 'a', 'a'])), { fingerprints: ['a', 'b'] });
    assert.ok('error' in parseBaseline('{'));
    assert.ok('error' in parseBaseline('{"fingerprints": [1]}'));
  });
});

describe('木', () => {
  it('DEC-001 の下流を FN・SCR・API まで ○ で出し、Mermaid は flowchart TB にする', () => {
    const tree = buildTree(indexOf(makeWorld()), 'DEC-001', []);
    const text = render(tree, 'text');
    assert.match(text, /^DEC-001 \(shared\) docs\/dec\.md:/);
    for (const id of ['REQ-101', 'FN-010', 'SCR-101', 'API-001']) assert.match(text, new RegExp(`○ ${id}`));
    assert.doesNotMatch(text, /[△✗]/);
    assert.match(render(tree, 'mermaid'), /^flowchart TB\n/);
  });

  it('片方向の辺は △、抜けは ✗ で出す', () => {
    const docs = makeWorld({ fn: [['FN-010', '', 'SCR-101', 'API-001']] });
    const text = render(buildTree(indexOf(docs), 'REQ-101', findAll(docs)), 'text');
    assert.match(text, /△ FN-010/);
    const orphan = makeWorld({ req: [['REQ-101', 'DEC-001', '']], fn: [['FN-010', '', 'SCR-101', 'API-001']] });
    assert.match(render(buildTree(indexOf(orphan), 'REQ-101', findAll(orphan)), 'text'), /✗ T3:/);
  });

  it('ひし形が 12 段続くグラフでも、行数は節の数に比例する (展開済みの節は「上と同じ」で子を繰り返さない)', () => {
    const id = (layer: number, side: number): string => `FN-${String(layer * 10 + side).padStart(3, '0')}`;
    const rows = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((layer) =>
      [1, 2].map((side) => [id(layer, side), layer === 1 ? '' : `${id(layer - 1, 1)} ${id(layer - 1, 2)}`]));
    const doc = makeDoc({ path: 'docs/fn.md', columns: ['上流 FN:up'], headers: ['ID', '上流 FN'], rows });
    const lines = render(buildTree(indexOf([doc]), id(1, 1), []), 'text').split('\n');
    assert.ok(lines.length < 80, `${lines.length} 行`);
    assert.ok(lines.some((line) => line.endsWith('(上と同じ)')));
  });

  it('Mermaid の節の名前は通し番号: context が a-b と a_b や日本語 2 つでも、節が 1 つにまとまらない', () => {
    const doc = (context: string) => makeDoc({ path: `docs/${context}.md`, context, columns: ['上流 FN:up'], headers: ['ID', '上流 FN'], rows: [['FN-010', '']] });
    const mermaid = (contexts: string[]) => render(buildTree(indexOf(contexts.map(doc)), 'FN-010', []), 'mermaid');
    for (const contexts of [['a-b', 'a_b'], ['顧客', '在庫']]) {
      const declared = mermaid(contexts).split('\n').filter((line) => line.includes('["FN-010"]'));
      assert.equal(new Set(declared.map((line) => line.trim().split('[')[0])).size, 2, contexts.join());
    }
  });

  it('[TST-924] 定義の無い ID は roots が空 (command が終了コード 2 にする)', () => {
    assert.deepEqual(buildTree(indexOf(makeWorld()), 'DEC-901', []).roots, []);
  });
});
