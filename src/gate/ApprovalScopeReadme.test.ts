// node --test dist/gate/ApprovalScopeReadme.test.js
// approval-scope: README.md の例外を、本物の git repo の差分と実際の docs-graph の再生成で確かめる (ADR-0008 決定 1)。
import { chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestRepo, doc, generate, judged, local, pathsOf } from './ApprovalScopeFixture.js';

describe('README.md の例外 (docs-graph の再生成と一致する区間だけの変更を除く)', () => {
  const PERSON_README = 'docs/person/requirements/README.md';

  /** main: 2 本目の person 文書があるのに README の索引は 1 本目の時点のまま (古い)。feature: 何も変えずに再生成した。 */
  async function staleBaseRegenerated(): Promise<TestRepo> {
    const repo = TestRepo.create({
      'docs/person/requirements/01-requirements.md': doc('requirements', '要件定義書'),
      'docs/ai/specs/shared/01-spec.md': doc('spec', '仕様', 'module-spec', 5),
    });
    await generate(repo);
    repo.commit('生成した索引');
    repo.write('docs/person/requirements/02-second.md', doc('second', '2 本目'));
    repo.commit('2 本目 (索引は古いまま)');
    repo.branch();
    await generate(repo);
    return repo;
  }

  it('person/ の README の dir-index 区間を再生成しただけの差分は ai。除いた README を出力に残す', async () => {
    const repo = await staleBaseRegenerated();
    repo.commit('docs:graph');
    const result = await judged(repo);
    assert.equal(result.verdict, 'ai');
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(pathsOf(result.excluded), [PERSON_README]);
    assert.ok(result.changedCount >= 2);
    // 変わったのは README と生成物だけ (person/ の文書は 1 本も変わっていない)
    assert.equal(repo.git('diff', '--name-only', 'main').split('\n').filter((p) => p.startsWith('docs/person/') && !p.endsWith('README.md')).length, 0);
  });

  it('区間の中に手で書き足した行があれば human (再生成の結果と一致しない)', async () => {
    const repo = await staleBaseRegenerated();
    const generated = readFileSync(join(repo.root, PERSON_README), 'utf8');
    repo.write(PERSON_README, generated.replace('<!-- AUTOGEN:dir-index:end -->', '| 手書きの決まり | 解約料は 10% |\n\n<!-- AUTOGEN:dir-index:end -->'));
    repo.commit();
    const result = await judged(repo);
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), [PERSON_README]);
    assert.equal(result.reasons[0]?.rule, 'docs/person/ の文書。README の例外は使えない: dir-index 区間の中身が再生成の結果と違う');
    assert.deepEqual(result.excluded, []);
  });

  it('区間の外 (1 行の目的) が変わった README は、置かれたフォルダ (person/) の判定に従って human', async () => {
    const repo = await staleBaseRegenerated();
    const generated = readFileSync(join(repo.root, PERSON_README), 'utf8');
    repo.write(PERSON_README, generated.replace('> このディレクトリの目的: (要記入)', '> このディレクトリの目的: 解約料は売上の 10%'));
    repo.commit();
    const result = await judged(repo);
    assert.equal(result.verdict, 'human');
    assert.match(result.reasons[0]?.rule ?? '', /AUTOGEN 区間の外が変わっている/);
  });

  it('再生成を済ませずに区間だけ手で書き換えた (古いまま) README は human', async () => {
    const repo = await staleBaseRegenerated();
    repo.git('checkout', '-q', '--', '.'); // 再生成を捨てる
    repo.git('clean', '-fdq');
    const stale = readFileSync(join(repo.root, PERSON_README), 'utf8');
    repo.write(PERSON_README, stale.replace('<!-- AUTOGEN:dir-index:end -->', '| 手書き |\n\n<!-- AUTOGEN:dir-index:end -->'));
    repo.commit();
    assert.equal((await judged(repo)).verdict, 'human');
  });

  it('新しい README (追加) は区間だけの変更ではないので human', async () => {
    const repo = TestRepo.create({ 'docs/person/requirements/01-requirements.md': doc('requirements', '要件定義書') });
    repo.branch();
    await generate(repo); // person/requirements/README.md ほかを新規に生成
    repo.commit();
    const result = await judged(repo);
    assert.equal(result.verdict, 'human');
    assert.ok(pathsOf(result.reasons).includes(PERSON_README));
    assert.deepEqual(result.excluded, []);
  });

  it('README の削除は human (区間だけの変更ではない)', async () => {
    const repo = TestRepo.create({ 'docs/person/requirements/01-requirements.md': doc('requirements', '要件定義書') });
    await generate(repo);
    repo.commit('生成した索引');
    repo.branch();
    repo.remove(PERSON_README);
    repo.commit('README を消す');
    const result = await judged(repo);
    assert.equal(result.verdict, 'human');
    assert.deepEqual(result.reasons, [{ path: PERSON_README, rule: 'docs/person/ の文書' }]);
  });

  it('ai/ の README は区間の外が変わっても、置かれたフォルダの判定 (ai) に従う', async () => {
    const repo = await staleBaseRegenerated();
    const aiReadme = 'docs/ai/specs/shared/README.md';
    const generated = readFileSync(join(repo.root, aiReadme), 'utf8');
    repo.write(aiReadme, generated.replace('> このディレクトリの目的: (要記入)', '> このディレクトリの目的: 手書き'));
    repo.commit();
    const result = await judged(repo);
    assert.equal(result.verdict, 'ai');
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(pathsOf(result.excluded), [PERSON_README]); // person/ の README の区間の再生成は除かれる
  });

  it('humanPaths に当たる README (docs/adr/README.md) も、adr-index 区間の再生成だけなら除く', async () => {
    const adr = (n: string, title: string): string =>
      ['---', `id: adr-${n}-x`, `title: ${title}`, 'type: adr', 'kind: adr', 'arc42: 9', 'status: accepted', 'owners: [eng]', 'depends_on: []', 'relates_to: []', '---', '', `# ${title}`, ''].join('\n');
    const readme = ['---', 'id: adr-index', 'title: adr — 索引', 'type: index', 'status: active', 'owners: [eng]', '---', '', '# adr', '', '> このディレクトリの目的: 意思決定記録', '', '## 索引', '', '<!-- AUTOGEN:adr-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->', '<!-- AUTOGEN:adr-index:end -->', ''].join('\n');
    const repo = TestRepo.create({
      '.igeta.json': JSON.stringify({ humanPaths: ['docs/adr/**'] }),
      'docs/person/requirements/01-requirements.md': doc('requirements', '要件定義書'),
      'docs/adr/0001-x.md': adr('0001', 'ADR-0001 一つ目'),
      'docs/adr/README.md': readme,
    });
    await generate(repo);
    repo.commit('生成');
    repo.write('docs/adr/0002-y.md', adr('0002', 'ADR-0002 二つ目').replace('adr-0002-x', 'adr-0002-y'));
    repo.commit('ADR を足した (索引は古いまま)');
    repo.branch();
    await generate(repo);
    repo.commit('docs:graph');
    const result = await judged(repo);
    assert.equal(result.verdict, 'ai');
    assert.deepEqual(pathsOf(result.excluded), ['docs/adr/README.md']);
  });

  it('docs-graph が再生成できない docs (id の重複) のときは、除かずに human (出力に理由を出す)', async () => {
    const repo = await staleBaseRegenerated();
    repo.write('docs/ai/specs/shared/dup.md', doc('requirements', '同じ id', 'module-spec', 5));
    repo.commit();
    const result = await judged(repo);
    assert.equal(result.verdict, 'human');
    assert.match(result.reasons[0]?.rule ?? '', /docs-graph で再生成できなかった/);
  });

  it('README の権限だけの変更 (内容は同じ) は人の承認が要るままにする', async () => {
    const repo = await staleBaseRegenerated();
    repo.commit('docs:graph');
    repo.branch('mode-only');
    chmodSync(join(repo.root, PERSON_README), 0o755);
    repo.commit('chmod');
    const result = await judged(repo, local('feature'));
    assert.equal(result.verdict, 'human');
    assert.match(result.reasons[0]?.rule ?? '', /内容が変わっていない/);
  });
});
