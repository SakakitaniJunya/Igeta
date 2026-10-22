// node --test dist/core/decision/fingerprint.test.js
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, adrText, approvalRow, disposeAllRepos, makeRepo } from './decision.test-support.js';
import { checkBodyUnchanged, decisionBody, decisionFingerprint } from './fingerprint.js';

after(disposeAllRepos);

describe('本文指紋', () => {
  it('frontmatter と履歴の節は本文に入らない', () => {
    const text = adrText({ number: '0001', slug: 'a', rows: [approvalRow({ commit: 'a'.repeat(40), fingerprint: 'x' })] });
    assert.ok(!decisionBody(text).includes('承認の履歴'));
    assert.ok(!decisionBody(text).includes('status:'));
    assert.ok(decisionBody(text).includes('決定の本文。'));
  });

  it('[TST-323] proposed/ から accepted/2026/ へ移して相対リンクの深さが変わっても、指紋は変わらない', () => {
    const repo = makeRepo();
    repo.write('docs/person/design/shared/05-glossary.md', '---\nid: glossary\nkind: glossary\n---\n\n# 用語\n');
    repo.write('docs/img/a.png', 'x');
    repo.write('src/a.ts', 'export {};\n');
    repo.write('README.md', '# readme\n');
    const at = (_dir: string, links: string): string => adrText({ number: '0001', slug: 'a', body: links });
    const proposedLinks = `[用語](../../design/shared/05-glossary.md) ![図](../../../img/a.png) [コード](../../../../src/a.ts) [README](../../../../README.md)`;
    const acceptedLinks = `[用語](../../../design/shared/05-glossary.md) ![図](../../../../img/a.png) [コード](../../../../../src/a.ts) [README](../../../../../README.md)`;
    const before = decisionFingerprint(repo.root, `${DECISIONS}/proposed/0001-a.md`, at('proposed', proposedLinks));
    const after2 = decisionFingerprint(repo.root, `${DECISIONS}/accepted/2026/0001-a.md`, at('accepted', acceptedLinks));
    assert.equal(before, after2);
  });

  it('DS6: 本文の指紋が最後の承認の行と違えば違反。却下の行も同じ', () => {
    const rows = [{ line: 5, date: 'd', event: '承認', before: 'proposed', after: 'accepted', by: '', evidence: '', commit: '', fingerprint: 'sha256:1', memo: '' }];
    assert.equal(checkBodyUnchanged({ status: 'accepted', rows, fingerprint: 'sha256:2' }).length, 1);
    assert.deepEqual(checkBodyUnchanged({ status: 'accepted', rows, fingerprint: 'sha256:1' }), []);
    assert.deepEqual(checkBodyUnchanged({ status: 'proposed', rows: [], fingerprint: 'sha256:2' }), []);
  });
});
