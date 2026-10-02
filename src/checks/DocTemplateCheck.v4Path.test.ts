// node --test dist/checks/DocTemplateCheck.v4Path.test.js
// kind の解決 (frontmatter に kind が無い文書の既定) が、新しい構成 (docs/person・ai・client) のパス —
// まとまりの 1 段だけがワイルドカードのパスの型 — からもできること (REQ-304、ADR-0004 決定 3)。
// 旧い構成のパス (テンプレの配置と同じ位置) からの解決は変わらないこと。
// テンプレは Igeta 自身の templates/docs を使い、doc 側だけを一時ディレクトリの fixture にする。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IGETA_ROOT } from '../core/Paths.js';
import type { Violation } from '../core/Report.js';
import { DocTemplateCheck } from './DocTemplateCheck.js';
import type { DocTemplateResult } from './DocTemplateCheck.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** kind を書かない frontmatter の文書 (kind は置き場所から決まる) */
const noKind = (id: string): string => `---\nid: ${id}\n---\n\n# ${id}\n`;
const withKind = (id: string, kind: string): string => `---\nid: ${id}\nkind: ${kind}\n---\n\n# ${id}\n`;

function analyze(docs: Readonly<Record<string, string>>): DocTemplateResult {
  const root = mkdtempSync(join(tmpdir(), 'igeta-v4path-'));
  workspaces.push(root);
  for (const [relPath, content] of Object.entries(docs)) {
    const target = join(root, 'docs', relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return new DocTemplateCheck({ requireKind: true }).analyze({ targetRoot: root, igetaRoot: IGETA_ROOT });
}

/** その文書に出た違反。file は / 区切りに揃える */
const violationsOf = (result: DocTemplateResult, relPath: string): readonly Violation[] =>
  result.violations.filter((violation) => (violation.file ?? '').split('\\').join('/') === `docs/${relPath}`);

const mentions = (violations: readonly Violation[], text: string): boolean =>
  violations.some((violation) => violation.message.includes(text));

describe('DocTemplateCheck: 新しい構成のパスからの kind の解決', () => {
  it('置き場所の型に当たる文書は、まとまりの名前が何でも kind が引け、その kind のテンプレで検査される', () => {
    const result = analyze({
      'person/design/reservation/flows/01-booking.md': noKind('reservation-booking'),
      'person/design/payment/flows/01-refund.md': noKind('payment-refund'),
      'person/design/payment/screens/01-top.md': noKind('payment-top'),
      'ai/specs/billing/api/01-charge.md': noKind('billing-charge'),
      'ai/specs/billing/state-machines/01-charge.md': noKind('billing-state'),
    });
    assert.deepEqual(result.unmanaged, []);
    assert.equal(result.checkedCount, 5);
    // 検査された kind は arc42 の既定の章から分かる (business-flow = 6、screen-spec・api-spec = 5、state-machine = 6)
    assert.ok(mentions(violationsOf(result, 'person/design/reservation/flows/01-booking.md'), 'kind: business-flow の既定は 6'));
    assert.ok(mentions(violationsOf(result, 'person/design/payment/flows/01-refund.md'), 'kind: business-flow の既定は 6'));
    assert.ok(mentions(violationsOf(result, 'person/design/payment/screens/01-top.md'), 'kind: screen-spec の既定は 5'));
    assert.ok(mentions(violationsOf(result, 'ai/specs/billing/api/01-charge.md'), 'kind: api-spec の既定は 5'));
    assert.ok(mentions(violationsOf(result, 'ai/specs/billing/state-machines/01-charge.md'), 'kind: state-machine の既定は 6'));
  });

  it('名前に kind を含む shared の固定番号の文書は、名前から kind が引ける', () => {
    const result = analyze({
      'person/design/shared/03-nonfunctional.md': noKind('nonfunctional'),
      'person/design/billing/02-function-list.md': noKind('billing-function-list'),
    });
    assert.deepEqual(result.unmanaged, []);
    assert.ok(mentions(violationsOf(result, 'person/design/shared/03-nonfunctional.md'), 'kind: nonfunctional の既定は 10'));
    assert.ok(mentions(violationsOf(result, 'person/design/billing/02-function-list.md'), 'kind: function-list の既定は 1'));
  });

  it('パスだけでは kind が決まらない文書 (固定番号の名前に kind が無い・ai の shared) は、kind を決められない', () => {
    const result = analyze({
      'person/design/shared/07-whatever.md': noKind('whatever'),
      'ai/specs/shared/01-crosscutting.md': noKind('crosscutting'),
      'person/unknown/01-x.md': noKind('unknown'),
    });
    assert.deepEqual(
      [...result.unmanaged].map((path) => path.split('\\').join('/')).sort(),
      ['docs/ai/specs/shared/01-crosscutting.md', 'docs/person/design/shared/07-whatever.md', 'docs/person/unknown/01-x.md'],
    );
    assert.equal(result.checkedCount, 0);
    assert.ok(mentions(violationsOf(result, 'person/design/shared/07-whatever.md'), 'kind を決められない'));
  });

  it('frontmatter の kind が置き場所の型と食い違えば違反。置き場所の型で決まらない場所は kind の宣言に従う', () => {
    const result = analyze({
      'person/design/reservation/flows/02-wrong.md': withKind('wrong', 'api-spec'),
      'person/design/shared/07-whatever.md': withKind('whatever', 'nonfunctional'),
      'person/design/shared/03-nonfunctional.md': withKind('named', 'function-list'),
      'ai/specs/billing/api/01-charge.md': withKind('right', 'api-spec'),
    });
    assert.ok(mentions(violationsOf(result, 'person/design/reservation/flows/02-wrong.md'), 'kind と置き場所が食い違う: frontmatter=api-spec / 配置=business-flow'));
    assert.ok(mentions(violationsOf(result, 'person/design/shared/03-nonfunctional.md'), 'kind と置き場所が食い違う: frontmatter=function-list / 配置=nonfunctional'));
    assert.equal(mentions(violationsOf(result, 'person/design/shared/07-whatever.md'), '食い違う'), false);
    assert.ok(mentions(violationsOf(result, 'person/design/shared/07-whatever.md'), 'kind: nonfunctional の既定は 10'));
    assert.equal(mentions(violationsOf(result, 'ai/specs/billing/api/01-charge.md'), '食い違う'), false);
  });
});

describe('DocTemplateCheck: まとまりではない固定のフォルダ (ai/specs/tasks/・ai/specs/shared/) の contract.md', () => {
  it('tasks の文書は contract.md という名前でも tasks。置き場所の型から引く kind と食い違わない', () => {
    const result = analyze({
      'ai/specs/tasks/contract.md': withKind('tasks-contract-note', 'tasks'),
      'ai/specs/tasks/01-first.md': noKind('first-task'),
    });
    assert.equal(mentions(violationsOf(result, 'ai/specs/tasks/contract.md'), '食い違う'), false);
    assert.deepEqual(result.unmanaged, []);
    assert.equal(result.checkedCount, 2);
  });

  it('shared の contract.md は約束ではないので、kind を決められない (まとまりの contract.md は context-contract)', () => {
    const result = analyze({
      'ai/specs/shared/contract.md': noKind('shared-contract'),
      'ai/specs/billing/contract.md': noKind('billing-contract'),
    });
    assert.deepEqual(
      result.unmanaged.map((path) => path.split('\\').join('/')),
      ['docs/ai/specs/shared/contract.md'],
    );
    assert.equal(result.checkedCount, 1);
    assert.ok(mentions(violationsOf(result, 'ai/specs/shared/contract.md'), 'kind を決められない'));
    assert.equal(mentions(violationsOf(result, 'ai/specs/billing/contract.md'), 'kind を決められない'), false);
  });

  it('frontmatter が context-contract でも、tasks のフォルダの contract.md は置き場所と食い違う', () => {
    const result = analyze({ 'ai/specs/tasks/contract.md': withKind('wrong', 'context-contract') });
    assert.ok(mentions(violationsOf(result, 'ai/specs/tasks/contract.md'), 'kind と置き場所が食い違う: frontmatter=context-contract / 配置=tasks'));
  });
});

describe('DocTemplateCheck: 旧い構成のパスからの kind の解決 (変えない)', () => {
  it('テンプレと同じ位置の文書は、これまでどおり位置から kind が引ける', () => {
    const result = analyze({
      'design/basic/flows/01-booking.md': noKind('booking'),
      'design/basic/01-function-list.md': noKind('function-list'),
      'design/basic/api/01-charge.md': noKind('charge'),
    });
    assert.deepEqual(result.unmanaged, []);
    assert.equal(result.checkedCount, 3);
    assert.ok(mentions(violationsOf(result, 'design/basic/flows/01-booking.md'), 'kind: business-flow の既定は 6'));
    assert.ok(mentions(violationsOf(result, 'design/basic/01-function-list.md'), 'kind: function-list の既定は 1'));
    assert.ok(mentions(violationsOf(result, 'design/basic/api/01-charge.md'), 'kind: api-spec の既定は 5'));
  });

  it('テンプレの位置の外の文書は、これまでどおり kind を決められない。位置と宣言の食い違いも変わらない', () => {
    const result = analyze({
      'misc/01-notes.md': noKind('notes'),
      'design/basic/flows/02-wrong.md': withKind('wrong', 'api-spec'),
    });
    assert.deepEqual(
      result.unmanaged.map((path) => path.split('\\').join('/')),
      ['docs/misc/01-notes.md'],
    );
    assert.ok(mentions(violationsOf(result, 'design/basic/flows/02-wrong.md'), 'kind と置き場所が食い違う: frontmatter=api-spec / 配置=business-flow'));
  });

  it('旧い構成と新しい構成が同じ repo に併存しても、それぞれの規則で解決する', () => {
    const result = analyze({
      'design/basic/flows/01-booking.md': noKind('legacy-booking'),
      'person/design/reservation/flows/01-booking.md': noKind('v4-booking'),
    });
    assert.deepEqual(result.unmanaged, []);
    assert.equal(result.checkedCount, 2);
  });
});
