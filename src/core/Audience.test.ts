// node --test dist/core/Audience.test.js
// kind → 読み手対応の正本 (AUDIENCE_KINDS, REQ-102) と、入口 3 行 (AUDIENCE_ENTRANCE, REQ-103)
// がテンプレへ転記されていることの検査。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AUDIENCE_ENTRANCE, AUDIENCE_KINDS, AUDIENCE_LABEL, audienceOfKind } from './Audience.js';
import type { Audience } from './Audience.js';
import { IGETA_ROOT } from './Paths.js';

describe('audienceOfKind (kind → 読み手の機械判定)', () => {
  it('正本 (AI が読む設計の正典) の kind は ai', () => {
    for (const kind of [
      'requirements',
      'function-list',
      'solution-strategy',
      'module-spec',
      'screen-spec',
      'api-spec',
      'table-spec',
      'business-flow',
      'sequence-spec',
      'state-machine',
      'job',
      'infra-design',
      'crosscutting',
      'nonfunctional',
      'test-plan',
      'test-spec',
      'risks-tech-debt',
      'glossary',
      'as-is-overview',
      'operations',
      'migration-plan',
      'adr',
    ]) {
      assert.equal(audienceOfKind(kind), 'ai', kind);
    }
  });

  it('`domain-*` は前方一致 (domain-overview / domain-model 等を束ねる)', () => {
    assert.equal(audienceOfKind('domain-overview'), 'ai');
    assert.equal(audienceOfKind('domain-model'), 'ai');
    assert.equal(audienceOfKind('domain-future'), 'ai'); // 将来の domain-* kind も AI 側
  });

  it('人間の入口 (地図・まとまり・台帳・機能ブリーフ) は developer', () => {
    for (const kind of ['map', 'context-map', 'context-contract', 'decision-log', 'feature-brief']) {
      assert.equal(audienceOfKind(kind), 'developer', kind);
    }
  });

  it('delivery-chapter は customer', () => {
    assert.equal(audienceOfKind('delivery-chapter'), 'customer');
  });

  it('対象外 (双方が読む解説・手引き) の kind は shared', () => {
    for (const kind of [
      'explanation',
      'guide',
      'runbook',
      'proposal',
      'document-taxonomy',
      'human-review',
      'index',
    ]) {
      assert.equal(audienceOfKind(kind), 'shared', kind);
    }
  });

  it('表に無い kind・kind 無しは shared に倒す (新しい kind は足さない前提)', () => {
    assert.equal(audienceOfKind('tasks'), 'shared');
    assert.equal(audienceOfKind('aggregate-map'), 'shared'); // 確定表の `domain-*` に名前が載らない kind
    assert.equal(audienceOfKind('unknown-future-kind'), 'shared');
    assert.equal(audienceOfKind(''), 'shared');
    assert.equal(audienceOfKind(undefined), 'shared');
  });

  it('全読み手に表示語がある (顧客 / 開発者 / AI / 共通)', () => {
    const labels: readonly Audience[] = ['customer', 'developer', 'ai', 'shared'];
    assert.deepEqual(
      labels.map((audience) => AUDIENCE_LABEL[audience]),
      ['顧客', '開発者', 'AI', '共通'],
    );
  });
});

describe('AUDIENCE_ENTRANCE (読み手別の入口 3 行, REQ-103)', () => {
  it('3 行で、各行が実在する kind とコマンドを指す', () => {
    assert.equal(AUDIENCE_ENTRANCE.length, 3);
    const [customer, developer, ai] = AUDIENCE_ENTRANCE;
    assert.match(customer ?? '', /delivery-chapter.*igeta export/);
    assert.match(developer ?? '', /00-map\.md.*context-map.*igeta review-sheet/);
    assert.match(ai ?? '', /context-contract.*igeta context-files/);
  });

  it('templates/docs/README.md に転記されている (AUTOGEN 区間の外)', () => {
    const readme = readFileSync(join(IGETA_ROOT, 'templates', 'docs', 'README.md'), 'utf8');
    const autogenStart = readme.indexOf('AUTOGEN:dir-index:start');
    for (const line of AUDIENCE_ENTRANCE) {
      const at = readme.indexOf(line);
      assert.ok(at !== -1, `templates/docs/README.md に無い: ${line}`);
      assert.ok(at < autogenStart || autogenStart === -1, `AUTOGEN 区間内にある: ${line}`);
    }
  });
});
