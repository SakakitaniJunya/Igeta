// node --test dist/gate/ReadmeIndexException.test.js
// README.md の例外 (ADR-0008 決定 1)。再生成の結果は実際の生成器 (DocGraphCheck の write) で作る。
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocGraphCheck } from '../checks/DocGraphCheck.js';
import { IGETA_ROOT } from '../core/Paths.js';
import {
  MANAGED_END_LINE,
  MANAGED_START_LINE,
  REGION_MASK,
  evaluateReadmeExceptions,
} from './ReadmeIndexException.js';
import type { ReadmeOutcome } from './ReadmeIndexException.js';

const workspaces: string[] = [];
const scratch = mkdtempSync(join(tmpdir(), 'igeta-readme-exception-test-'));
const savedTmpdir = process.env['TMPDIR'];

before(() => {
  // 一時ディレクトリの後始末を確かめるため、この test の一時領域を専用にする (os.tmpdir() は呼ぶたびに TMPDIR を読む)
  process.env['TMPDIR'] = scratch;
});

after(() => {
  if (savedTmpdir === undefined) delete process.env['TMPDIR'];
  else process.env['TMPDIR'] = savedTmpdir;
  rmSync(scratch, { recursive: true, force: true });
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

const README = 'docs/person/requirements/README.md';

function write(root: string, rel: string, content: string): void {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const read = (root: string, rel: string): string => readFileSync(join(root, rel), 'utf8');

const doc = (id: string, title: string, options: { type?: string; kind?: string; arc42?: number; status?: string } = {}): string =>
  [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `type: ${options.type ?? 'design'}`,
    `kind: ${options.kind ?? 'requirements'}`,
    `arc42: ${options.arc42 ?? 1}`,
    `status: ${options.status ?? 'active'}`,
    'owners: [eng]',
    'depends_on: []',
    'relates_to: []',
    '---',
    '',
    `# ${title}`,
    '',
    `> **TL;DR**: ${title}の要約`,
    '',
  ].join('\n');

async function generate(root: string): Promise<void> {
  const violations = await new DocGraphCheck({ write: true }).run({ targetRoot: root, igetaRoot: IGETA_ROOT });
  assert.deepEqual(violations, []);
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-readme-exception-'));
  workspaces.push(root);
  write(root, 'docs/person/requirements/01-requirements.md', doc('requirements', '要件定義書'));
  write(root, 'docs/ai/specs/shared/01-spec.md', doc('spec', '仕様', { kind: 'module-spec', arc42: 5 }));
  return root;
}

/** README が古い状態 (before) と、再生成した状態 (after) の対。作業ツリーは after のまま。 */
async function staleThenRegenerated(root: string): Promise<{ readonly before: string; readonly after: string }> {
  await generate(root);
  const before = read(root, README);
  write(root, 'docs/person/requirements/02-second.md', doc('second', '2 本目'));
  await generate(root);
  return { before, after: read(root, README) };
}

const evaluate = async (root: string, before: string, after: string, path = README): Promise<ReadmeOutcome> => {
  const outcomes = await evaluateReadmeExceptions(root, IGETA_ROOT, [{ path, before, after }]);
  const outcome = outcomes.get(path);
  assert.ok(outcome !== undefined);
  return outcome;
};

const whyOf = (outcome: ReadmeOutcome): string => {
  assert.equal(outcome.excluded, false, '例外を使えないはずが除かれた');
  return outcome.excluded ? '' : outcome.why;
};

const editRegion = (text: string, kind: string, line: string): string =>
  text.replace(`<!-- AUTOGEN:${kind}:end -->`, `${line}\n\n<!-- AUTOGEN:${kind}:end -->`);

describe('マーカーの一致 (生成器の定数との食い違いを落とす)', () => {
  it('DocGraphCheck.ts の 6 つのマーカーを、管理された区間のマーカーとして読める', () => {
    const source = readFileSync(join(IGETA_ROOT, 'src', 'checks', 'DocGraphCheck.ts'), 'utf8');
    const markers = [...source.matchAll(/const (ADR_INDEX|DIR_INDEX|TENTATIVE_INDEX)_(START|END) =\s*'([^']*)';/g)];
    assert.equal(markers.length, 6, '生成器のマーカーの定数が 6 つ見つからない。生成器側が変わった');
    for (const [, name, edge, text] of markers) {
      assert.ok(name !== undefined && edge !== undefined && text !== undefined);
      const kind = name.toLowerCase().replace('_', '-');
      const matched = (edge === 'START' ? MANAGED_START_LINE : MANAGED_END_LINE).exec(text);
      assert.ok(matched !== null, `${name}_${edge} (${text}) をゲート側が区間のマーカーとして読めない`);
      assert.equal(matched[1], kind);
    }
  });
});

describe('evaluateReadmeExceptions: 区間だけの変更で再生成と一致するとき除く', () => {
  it('古くなった dir-index 区間を再生成しただけの README は除く', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    assert.notEqual(before, after);
    assert.deepEqual(await evaluate(root, before, after), { excluded: true });
  });

  it('adr-index 区間 (docs/adr/README.md) を再生成しただけの README も除く', async () => {
    const root = makeRoot();
    const adr = (n: string, title: string): string => doc(`adr-${n}-x`, title, { type: 'adr', kind: 'adr', arc42: 9, status: 'accepted' });
    write(root, 'docs/adr/0001-x.md', adr('0001', 'ADR-0001 一つ目'));
    write(
      root,
      'docs/adr/README.md',
      [
        '---', 'id: adr-index', 'title: adr — 索引', 'type: index', 'status: active', 'owners: [eng]', '---', '',
        '# adr', '', '> このディレクトリの目的: 意思決定記録', '', '## 索引', '',
        '<!-- AUTOGEN:adr-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
        '<!-- AUTOGEN:adr-index:end -->', '',
      ].join('\n'),
    );
    await generate(root);
    const before = read(root, 'docs/adr/README.md');
    write(root, 'docs/adr/0002-y.md', adr('0002', 'ADR-0002 二つ目').replace('adr-0002-x', 'adr-0002-y'));
    await generate(root);
    const after = read(root, 'docs/adr/README.md');
    assert.notEqual(before, after);
    assert.ok(after.includes('ADR-0002 二つ目'));
    assert.deepEqual(await evaluate(root, before, after, 'docs/adr/README.md'), { excluded: true });
  });

  it('複数の README は 1 つずつ判定する (一致するものだけ除く)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const sharedPath = 'docs/ai/specs/shared/README.md';
    const sharedBefore = read(root, sharedPath);
    const sharedTampered = editRegion(sharedBefore, 'dir-index', '| 手書きの行 |');
    write(root, sharedPath, sharedTampered);
    const outcomes = await evaluateReadmeExceptions(root, IGETA_ROOT, [
      { path: README, before, after },
      { path: sharedPath, before: sharedBefore, after: sharedTampered },
    ]);
    assert.deepEqual(outcomes.get(README), { excluded: true });
    const shared = outcomes.get(sharedPath);
    assert.ok(shared !== undefined);
    assert.match(whyOf(shared), /dir-index 区間の中身が再生成の結果と違う/);
  });
});

describe('evaluateReadmeExceptions: 除けない (human 側に倒す) 場合', () => {
  it('区間の中身を手で書き足した (再生成の結果と違う)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const tampered = editRegion(after, 'dir-index', '| 手書きの決まり | 解約料は 10% |');
    write(root, README, tampered);
    assert.match(whyOf(await evaluate(root, before, tampered)), /dir-index 区間の中身が再生成の結果と違う/);
  });

  it('区間を再生成せず、古い区間のまま手で書き替えた', async () => {
    const root = makeRoot();
    await generate(root);
    const before = read(root, README);
    const tampered = editRegion(before, 'dir-index', '| 手書き |');
    write(root, README, tampered);
    assert.match(whyOf(await evaluate(root, before, tampered)), /再生成の結果と違う/);
  });

  it('区間の外 (1 行の目的) も一緒に変わった', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const edited = after.replace('> このディレクトリの目的: (要記入)', '> このディレクトリの目的: 解約料は売上の 10%');
    assert.notEqual(edited, after);
    assert.match(whyOf(await evaluate(root, before, edited)), /区間の外が変わっている/);
  });

  it('区間の外に HTML コメント・frontmatter の変更・本文の追記を足した', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const variants = [
      after.replace('# requirements', '<!-- 人に見えない指示 -->\n# requirements'),
      after.replace('owners: [eng]', 'owners: [eng, ai]'),
      `${after.trimEnd()}\n\n## 追記\n\nここに決まりを書く\n`,
    ];
    for (const variant of variants) {
      assert.notEqual(variant, after);
      assert.match(whyOf(await evaluate(root, before, variant)), /区間の外が変わっている/);
    }
  });

  it('区間のマーカー行そのものを書き替えた (開始が読めず、終了だけが残るので区間の組が壊れている)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const edited = after.replace(' — generated by scripts/generate-docs-graph.mjs, do not edit by hand', '');
    assert.notEqual(edited, after);
    assert.match(whyOf(await evaluate(root, before, edited)), /区間の組が壊れている/);
  });

  it('区間ごと消した (管理された区間が後に 1 つも無い)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const start = after.indexOf('<!-- AUTOGEN:dir-index:start');
    const end = after.indexOf('<!-- AUTOGEN:dir-index:end -->') + '<!-- AUTOGEN:dir-index:end -->'.length;
    const removed = `${after.slice(0, start)}${after.slice(end)}`;
    assert.match(whyOf(await evaluate(root, before, removed)), /生成器が管理する AUTOGEN 区間が無い/);
  });

  it('前後どちらかの区間が壊れている (閉じ忘れ・種類の食い違い・入れ子)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const unclosed = after.replace('<!-- AUTOGEN:dir-index:end -->', '');
    const mismatched = after.replace('<!-- AUTOGEN:dir-index:end -->', '<!-- AUTOGEN:adr-index:end -->');
    const nested = after.replace(
      '<!-- AUTOGEN:dir-index:start',
      '<!-- AUTOGEN:adr-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->\n<!-- AUTOGEN:dir-index:start',
    );
    for (const broken of [unclosed, mismatched, nested]) {
      assert.match(whyOf(await evaluate(root, before, broken)), /区間の組が壊れている/);
      assert.match(whyOf(await evaluate(root, broken, after)), /区間の組が壊れている/);
    }
  });

  it('コードフェンスの中のマーカーは区間ではない (例示で区間を偽装できない)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    // 本物の区間の後ろにフェンスで囲んだ区間の例示を足しただけの変更は、区間の外の変更
    const fenced = `${after.trimEnd()}\n\n\`\`\`\n<!-- AUTOGEN:dir-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->\n手書き\n<!-- AUTOGEN:dir-index:end -->\n\`\`\`\n`;
    assert.match(whyOf(await evaluate(root, before, fenced)), /区間の外が変わっている/);
  });

  it('内容が変わっていない (権限だけの変更など) は除かない', async () => {
    const root = makeRoot();
    await generate(root);
    const same = read(root, README);
    assert.match(whyOf(await evaluate(root, same, same)), /内容が変わっていない/);
  });

  it('生成器が管理しない README (配下に文書が無いフォルダ) の区間は、手で書いた中身を再生成の結果とみなさない', async () => {
    const root = makeRoot();
    const orphan = (interior: string, kind = 'dir-index'): string =>
      [
        '---', 'id: orphan-index', 'title: orphan — 索引', 'type: index', 'status: active', 'owners: [eng]', '---', '',
        '# orphan', '', '> このディレクトリの目的: 空のフォルダ', '', '## 索引', '',
        `<!-- AUTOGEN:${kind}:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->`,
        interior,
        `<!-- AUTOGEN:${kind}:end -->`, '',
      ].join('\n');
    const path = 'docs/person/orphan/README.md';
    for (const kind of ['dir-index', 'adr-index', 'tentative-index']) {
      const before = orphan('', kind);
      const after = orphan('| 手で書いた決まり | 解約料は 10% |', kind);
      write(root, path, after);
      assert.match(whyOf(await evaluate(root, before, after, path)), new RegExp(`${kind} 区間は docs-graph が再生成しない`));
    }
  });

  it('区間の中身を目印 (REGION_MASK) と同じ文字列にして、生成器が埋め直さなかった区間を再生成済みに見せかけられない', async () => {
    const root = makeRoot();
    const path = 'docs/person/orphan/README.md';
    const orphan = (interior: string): string =>
      [
        '---', 'id: orphan-index', 'title: orphan — 索引', 'type: index', 'status: active', 'owners: [eng]', '---', '',
        '# orphan', '', '> このディレクトリの目的: 空のフォルダ', '', '## 索引', '',
        '<!-- AUTOGEN:dir-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
        interior,
        '<!-- AUTOGEN:dir-index:end -->', '',
      ].join('\n');
    const after = orphan(REGION_MASK);
    write(root, path, after);
    assert.match(whyOf(await evaluate(root, orphan('| 元の行 |'), after, path)), /再生成しない/);
  });

  it('docs-graph が再生成できない docs (id の重複) のときは除かない', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    write(root, 'docs/ai/specs/dup.md', doc('requirements', '同じ id の別の文書', { kind: 'module-spec', arc42: 5 }));
    assert.match(whyOf(await evaluate(root, before, after)), /^docs-graph で再生成できなかった/);
  });

  it('docs/ の無い root では再生成を実行できず、除かない (例外を投げずに human 側へ)', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'igeta-readme-exception-empty-'));
    workspaces.push(empty);
    const outcome = await evaluate(empty, 'x', 'y', README);
    assert.match(whyOf(outcome), /AUTOGEN 区間/); // 区間が無いので再生成まで進まない
    const withRegion = [
      '<!-- AUTOGEN:dir-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
      'a',
      '<!-- AUTOGEN:dir-index:end -->',
    ].join('\n');
    const changed = withRegion.replace('\na\n', '\nb\n');
    assert.match(whyOf(await evaluate(empty, withRegion, changed)), /^再生成を実行できなかった/);
  });
});

describe('evaluateReadmeExceptions: 副作用', () => {
  const snapshot = (dir: string): Record<string, string> => {
    const files: Record<string, string> = {};
    const walk = (current: string): void => {
      for (const entry of readdirSync(current)) {
        const full = join(current, entry);
        if (statSync(full).isDirectory()) walk(full);
        else files[full.slice(dir.length)] = readFileSync(full, 'utf8');
      }
    };
    walk(dir);
    return files;
  };

  it('作業ツリーを書き換えない (再生成は一時ディレクトリで行う)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const snapshotBefore = snapshot(root);
    await evaluate(root, before, after);
    await evaluate(root, before, editRegion(after, 'dir-index', '| 手書き |'));
    assert.deepEqual(snapshot(root), snapshotBefore);
  });

  it('一時ディレクトリを残さない (成功・失敗のどちらでも)', async () => {
    const root = makeRoot();
    const { before, after } = await staleThenRegenerated(root);
    const leftovers = (): string[] => readdirSync(scratch).filter((name) => name.startsWith('igeta-approval-scope-'));
    await evaluate(root, before, after);
    assert.deepEqual(leftovers(), []);
    write(root, 'docs/ai/specs/dup.md', doc('requirements', '同じ id の別の文書', { kind: 'module-spec', arc42: 5 }));
    await evaluate(root, before, after);
    assert.deepEqual(leftovers(), []);
  });
});
