// node --test dist/core/Role.test.js
// kind → 置き場所の表 (Role.ts) の自己整合と、パスの型の照合・構成の検出。
// 要件定義書 02 §7 との突き合わせは TaxonomyGuideSync.test.ts が行う。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ARC42_BY_KIND } from '../checks/DocTemplateCheck.js';
import {
  FOLDER_SIZE_EXEMPT_DIRS,
  PLACEMENTS,
  ROLE_OF_KIND,
  ROLES,
  detectLayout,
  isFolderSizeExempt,
  isGeneratedIndex,
  kindOfPath,
  matchPlacement,
  placementOf,
  roleOfPath,
} from './Role.js';
import type { Role } from './Role.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeDocsDir(...dirs: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-role-'));
  workspaces.push(root);
  const docs = join(root, 'docs');
  mkdirSync(docs, { recursive: true });
  for (const dir of dirs) mkdirSync(join(docs, dir), { recursive: true });
  return docs;
}

const kindsWhere = (predicate: (kind: string) => boolean): string[] =>
  [...ROLE_OF_KIND.keys()].filter(predicate).sort();

describe('ROLE_OF_KIND (要件定義書 02 §7 のコード側の表)', () => {
  it('kind の集合が ARC42_BY_KIND と一致し、重複が無い (ADR-0002 条件 1)', () => {
    assert.equal(new Set(PLACEMENTS.map((placement) => placement.kind)).size, PLACEMENTS.length, 'kind が重複している');
    assert.equal(ROLE_OF_KIND.size, PLACEMENTS.length);
    assert.deepEqual([...ROLE_OF_KIND.keys()].sort(), [...ARC42_BY_KIND.keys()].sort());
  });

  it('確定させる人ごとの数は person 18・ai 27・client 2 の計 47 (ADR-0009 決定 2)', () => {
    const count = (role: Role): number => [...ROLE_OF_KIND.values()].filter((placement) => placement.role === role).length;
    assert.deepEqual(ROLES.map(count), [18, 27, 2]);
    assert.equal(ROLE_OF_KIND.size, 47);
  });

  it('全パターンが自分の確定させる人のフォルダの下にあり、使う記法は * <c> <year> <deliverable> NN だけ', () => {
    for (const placement of ROLE_OF_KIND.values()) {
      for (const pattern of placement.patterns) {
        assert.ok(pattern.startsWith(`${placement.role}/`), `${placement.kind}: ${pattern} が ${placement.role}/ の外にある`);
        assert.ok(pattern.endsWith('.md'), `${placement.kind}: ${pattern} が .md で終わらない`);
        const rest = pattern.replace(/<c>|<year>|<deliverable>|NN/g, '');
        assert.ok(!/[<>{}]/.test(rest), `${placement.kind}: ${pattern} に未対応の記法がある`);
        assert.ok((pattern.match(/<c>/g) ?? []).length <= 1, `${placement.kind}: ${pattern} の <c> が複数ある`);
      }
    }
  });

  it('全パターンが、ワイルドカードを埋めた自分のパスに当たり、<c> のときだけ context を返す', () => {
    for (const placement of ROLE_OF_KIND.values()) {
      for (const pattern of placement.patterns) {
        const sample = pattern
          .replace('<c>', 'ctx')
          .replace('<year>', '2026')
          .replace('<deliverable>', 'deliverable-1')
          .replaceAll('NN', '01')
          .replaceAll('*', 'x');
        const matched = matchPlacement(placement.kind, sample);
        assert.equal(matched.ok, true, `${placement.kind}: ${sample}`);
        if (pattern.includes('<c>')) assert.equal(matched.context, 'ctx', `${placement.kind}: ${sample}`);
      }
    }
  });

  it('図が要る kind は ADR-0002 条件 6 の 6 つ、型の検査が 図 の kind は map と context-map だけ', () => {
    assert.deepEqual(
      kindsWhere((kind) => placementOf(kind)?.needsDiagram === true),
      ['as-is-overview', 'business-flow', 'context-map', 'map', 'screen-spec', 'solution-strategy'],
    );
    assert.deepEqual(
      kindsWhere((kind) => placementOf(kind)?.formCheck === 'diagram'),
      ['context-map', 'map'],
    );
  });

  it('型の検査が ○ の kind は person の 12 種 (人の決まりの行を持つ)、ai と client は全部 —', () => {
    assert.deepEqual(
      kindsWhere((kind) => placementOf(kind)?.formCheck === 'full'),
      [
        'as-is-overview',
        'business-flow',
        'data-management',
        'function-list',
        'migration-plan',
        'nonfunctional',
        'operations',
        'permission-matrix',
        'requirements',
        'risks-tech-debt',
        'screen-spec',
        'solution-strategy',
      ],
    );
    for (const placement of ROLE_OF_KIND.values()) {
      if (placement.role !== 'person') assert.equal(placement.formCheck, 'none', placement.kind);
    }
  });

  it('利用 repo には置かない kind は document-taxonomy・human-review・provenance-workflow の 3 つ', () => {
    assert.deepEqual(
      kindsWhere((kind) => placementOf(kind)?.patterns.length === 0),
      ['document-taxonomy', 'human-review', 'provenance-workflow'],
    );
  });

  it('placementOf: 表に無い kind (予約の tutorial・index) は undefined', () => {
    assert.equal(placementOf('business-flow')?.role, 'person');
    assert.equal(placementOf('api-spec')?.role, 'ai');
    assert.equal(placementOf('proposal')?.role, 'client');
    assert.equal(placementOf('tutorial'), undefined);
    assert.equal(placementOf('index'), undefined);
    assert.equal(placementOf(''), undefined);
  });
});

describe('roleOfPath', () => {
  it('第 1 階層が person・ai・client のときだけ返す', () => {
    assert.equal(roleOfPath('person/design/shared/00-map.md'), 'person');
    assert.equal(roleOfPath('ai/specs/shared/01-crosscutting.md'), 'ai');
    assert.equal(roleOfPath('client/delivery/spec-v1/01-overview.md'), 'client');
  });

  it('docs/ 直下の文書・他のフォルダ・名前が似ているだけのものは null', () => {
    assert.equal(roleOfPath('00-map.md'), null);
    assert.equal(roleOfPath('person'), null);
    assert.equal(roleOfPath('common/01-x.md'), null);
    assert.equal(roleOfPath('persons/01-x.md'), null);
    assert.equal(roleOfPath('design/basic/01-function-list.md'), null);
    assert.equal(roleOfPath(''), null);
  });
});

describe('matchPlacement', () => {
  const cases: ReadonlyArray<readonly [string, string, boolean, string | null]> = [
    // person: 地図 (shared は固定の 1 枚、まとまりは <c> の 1 枚)
    ['map', 'person/design/shared/00-map.md', true, 'shared'],
    ['map', 'person/design/billing/00-map.md', false, null],
    ['context-map', 'person/design/billing/00-map.md', true, 'billing'],
    ['context-map', 'person/design/billing/flows/00-map.md', false, null],
    // person: 要件
    ['requirements', 'person/requirements/01-requirements.md', true, null],
    ['requirements', 'person/requirements/02-billing.md', true, null],
    ['requirements', 'person/requirements/billing/01-requirements.md', false, null],
    ['requirements', 'person/design/shared/01-requirements.md', false, null],
    // person: shared の固定番号の文書と、まとまりの下の NN-<kind>.md
    ['function-list', 'person/design/shared/02-function-list.md', true, 'shared'],
    ['function-list', 'person/design/shared/99-anything.md', true, 'shared'],
    ['function-list', 'person/design/billing/02-function-list.md', true, 'billing'],
    ['function-list', 'person/design/billing/function-list.md', false, null],
    ['function-list', 'person/design/billing/2-function-list.md', false, null],
    ['function-list', 'person/design/billing/02-solution-strategy-function-list.md', false, null],
    ['function-list', 'person/design/billing/02-nonfunctional.md', false, null],
    ['function-list', 'person/design/billing/flows/02-function-list.md', false, null],
    ['function-list', 'person/design/02-function-list.md', false, null],
    ['solution-strategy', 'person/design/shared/02-solution-strategy.md', true, 'shared'],
    // person: まとまりの下位フォルダ
    ['business-flow', 'person/design/reservation/flows/01-booking.md', true, 'reservation'],
    ['business-flow', 'person/design/shared/flows/01-common.md', true, 'shared'],
    // person/design/ の下には固定の tasks フォルダが無いので、tasks というまとまりも置ける
    ['business-flow', 'person/design/tasks/flows/01-booking.md', true, 'tasks'],
    ['business-flow', 'person/design/reservation/screens/01-booking.md', false, null],
    ['business-flow', 'person/design/flows/01-booking.md', false, null],
    ['business-flow', 'person/design/reservation/flows/sub/01-booking.md', false, null],
    ['screen-spec', 'person/design/reservation/screens/01-top.md', true, 'reservation'],
    ['feature-brief', 'person/design/payment/features/01-refund.md', true, 'payment'],
    ['feature-brief', 'person/design/payment/flows/01-refund.md', false, null],
    // person: 用語集は shared の固定の名前だけ
    ['glossary', 'person/design/shared/01-glossary.md', true, 'shared'],
    ['glossary', 'person/design/shared/glossary.md', false, null],
    ['glossary', 'person/design/billing/01-glossary.md', false, null],
    // person: 決定 (年と固定の台帳)
    ['adr', 'person/decisions/2026/0001-use-postgres.md', true, null],
    ['adr', 'person/decisions/26/0001-use-postgres.md', false, null],
    ['adr', 'person/decisions/0001-use-postgres.md', false, null],
    ['decision-log', 'person/decisions/01-decisions.md', true, null],
    ['decision-log', 'person/decisions/2026/01-decisions.md', false, null],
    // ai: shared と、まとまりの契約・下位フォルダ
    ['crosscutting', 'ai/specs/shared/01-crosscutting.md', true, 'shared'],
    ['crosscutting', 'ai/specs/billing/01-crosscutting.md', false, null],
    ['context-contract', 'ai/specs/billing/contract.md', true, 'billing'],
    // 全体共通 (shared) はどのまとまりからも引けるので、約束を持たない。tasks は、まとまりではなく固定のフォルダ
    ['context-contract', 'ai/specs/shared/contract.md', false, null],
    ['context-contract', 'ai/specs/tasks/contract.md', false, null],
    ['context-contract', 'ai/specs/billing/api/contract.md', false, null],
    ['api-spec', 'ai/specs/billing/api/01-charge.md', true, 'billing'],
    ['api-spec', 'ai/specs/shared/api/01-charge.md', true, 'shared'],
    ['api-spec', 'ai/specs/tasks/api/01-charge.md', false, null],
    ['api-spec', 'ai/specs/billing/tables/01-charge.md', false, null],
    ['table-spec', 'ai/specs/billing/tables/01-charge.md', true, 'billing'],
    ['domain-model', 'ai/specs/billing/domain/01-charge.md', true, 'billing'],
    ['sequence-spec', 'ai/specs/billing/sequences/01-charge.md', true, 'billing'],
    ['state-machine', 'ai/specs/billing/state-machines/01-charge.md', true, 'billing'],
    ['module-spec', 'ai/specs/billing/modules/01-charge.md', true, 'billing'],
    ['job', 'ai/specs/billing/jobs/01-nightly.md', true, 'billing'],
    ['test-spec', 'ai/specs/billing/tests/01-charge.md', true, 'billing'],
    // ai: 実装タスクと手引き (15 本を超えたら、まとまりの下位フォルダへ全部移す)
    ['tasks', 'ai/specs/tasks/01-first.md', true, null],
    ['tasks', 'ai/specs/tasks/contract.md', true, null],
    ['tasks', 'ai/specs/tasks/shared/01-first.md', true, 'shared'],
    ['tasks', 'ai/specs/tasks/billing/01-first.md', true, 'billing'],
    ['tasks', 'ai/specs/tasks/billing/deep/01-first.md', false, null],
    ['guide', 'ai/handbook/how-to/01-setup.md', true, null],
    ['guide', 'ai/handbook/how-to/billing/01-setup.md', true, 'billing'],
    ['guide', 'ai/handbook/runbooks/01-setup.md', false, null],
    ['explanation', 'ai/handbook/explanation/01-why.md', true, null],
    ['runbook', 'ai/handbook/runbooks/01-incident.md', true, null],
    ['runbook', 'ai/handbook/runbooks/shared/01-incident.md', true, 'shared'],
    ['implementation-order', 'ai/handbook/how-to/02-implementation-order.md', true, null],
    ['implementation-order', 'ai/handbook/how-to/shared/02-implementation-order.md', true, 'shared'],
    ['implementation-order', 'ai/handbook/how-to/01-implementation-order.md', false, null],
    // 利用 repo には置かない kind は、どこに置いても当たらない
    ['document-taxonomy', 'ai/handbook/how-to/01-document-taxonomy.md', false, null],
    ['human-review', 'ai/handbook/explanation/01-human-review.md', false, null],
    ['provenance-workflow', 'ai/handbook/how-to/01-provenance-workflow.md', false, null],
    // client
    ['delivery-chapter', 'client/delivery/spec-v1/01-overview.md', true, null],
    ['delivery-chapter', 'client/delivery/01-overview.md', false, null],
    ['delivery-chapter', 'client/delivery/spec-v1/sub/01-overview.md', false, null],
    ['proposal', 'client/proposals/2026/01-proposal.md', true, null],
    ['proposal', 'client/proposals/01-proposal.md', false, null],
    // 表に無い kind
    ['tutorial', 'ai/handbook/how-to/01-tutorial.md', false, null],
  ];

  for (const [kind, path, ok, context] of cases) {
    it(`${kind}: ${path} → ${ok ? `ok (context: ${String(context)})` : 'ng'}`, () => {
      assert.deepEqual(matchPlacement(kind, path), { ok, context });
    });
  }
});

describe('kindOfPath (パスの型から kind を引く)', () => {
  it('その場所に置ける kind が 1 つに決まるなら、まとまりの名前が何でも引ける', () => {
    assert.equal(kindOfPath('person/design/reservation/flows/01-booking.md'), 'business-flow');
    assert.equal(kindOfPath('person/design/payment/flows/01-refund.md'), 'business-flow');
    assert.equal(kindOfPath('person/design/payment/screens/01-top.md'), 'screen-spec');
    assert.equal(kindOfPath('person/design/payment/features/01-refund.md'), 'feature-brief');
    assert.equal(kindOfPath('person/design/payment/00-map.md'), 'context-map');
    assert.equal(kindOfPath('ai/specs/billing/api/01-charge.md'), 'api-spec');
    assert.equal(kindOfPath('ai/specs/billing/state-machines/01-charge.md'), 'state-machine');
    assert.equal(kindOfPath('ai/specs/billing/contract.md'), 'context-contract');
    assert.equal(kindOfPath('ai/specs/tasks/01-first.md'), 'tasks');
    assert.equal(kindOfPath('ai/handbook/runbooks/01-incident.md'), 'runbook');
    assert.equal(kindOfPath('person/decisions/2026/0001-use-postgres.md'), 'adr');
    assert.equal(kindOfPath('person/decisions/01-decisions.md'), 'decision-log');
    assert.equal(kindOfPath('person/requirements/01-requirements.md'), 'requirements');
    assert.equal(kindOfPath('client/delivery/spec-v1/01-overview.md'), 'delivery-chapter');
    assert.equal(kindOfPath('client/proposals/2026/01-proposal.md'), 'proposal');
  });

  it('名前まで決まった型は、同じ階層の広い型より優先する', () => {
    assert.equal(kindOfPath('person/design/shared/00-map.md'), 'map');
    assert.equal(kindOfPath('ai/handbook/how-to/02-implementation-order.md'), 'implementation-order');
    assert.equal(kindOfPath('ai/handbook/how-to/01-setup.md'), 'guide');
  });

  it('shared の固定番号の文書は、名前が kind を含むときだけ引ける', () => {
    assert.equal(kindOfPath('person/design/shared/03-nonfunctional.md'), 'nonfunctional');
    assert.equal(kindOfPath('person/design/shared/01-glossary.md'), 'glossary');
    assert.equal(kindOfPath('person/design/shared/09-risks-tech-debt.md'), 'risks-tech-debt');
    assert.equal(kindOfPath('person/design/billing/02-function-list.md'), 'function-list');
  });

  it('名前の末尾が別の kind の名前でも、連番 + kind の名前そのものでなければ引かない', () => {
    assert.equal(kindOfPath('person/design/shared/02-solution-strategy-operations.md'), null);
    assert.equal(kindOfPath('person/design/billing/02-data-operations.md'), null);
    assert.equal(kindOfPath('person/design/billing/operations.md'), null);
  });

  it('パスだけでは決まらないときは null (固定番号の文書で名前に kind が無い・shared の ai の文書)', () => {
    assert.equal(kindOfPath('person/design/shared/07-whatever.md'), null);
    assert.equal(kindOfPath('ai/specs/shared/01-crosscutting.md'), null);
    assert.equal(kindOfPath('ai/specs/shared/05-infra-design.md'), null);
  });

  it('ai/specs/tasks/ の文書は、名前が contract.md でも tasks。ai/specs/shared/ の contract.md は約束ではないので決まらない', () => {
    assert.equal(kindOfPath('ai/specs/tasks/contract.md'), 'tasks');
    assert.equal(kindOfPath('ai/specs/tasks/api/01-charge.md'), 'tasks');
    assert.equal(kindOfPath('ai/specs/tasks/shared/01-first.md'), 'tasks');
    assert.equal(kindOfPath('ai/specs/shared/contract.md'), null);
    assert.equal(kindOfPath('ai/specs/shared/api/01-charge.md'), 'api-spec');
    assert.equal(kindOfPath('ai/specs/billing/contract.md'), 'context-contract');
  });

  it('どの型にも当たらないパスは null', () => {
    assert.equal(kindOfPath('person/unknown/01-x.md'), null);
    assert.equal(kindOfPath('person/design/billing/flows/sub/01-x.md'), null);
    assert.equal(kindOfPath('design/basic/01-function-list.md'), null);
    assert.equal(kindOfPath('00-map.md'), null);
  });
});

describe('まとまりの名前 <c> に当たらない名前', () => {
  /** パターンの <c> を name に、他のワイルドカードを適当な値に埋めたパス */
  const fill = (pattern: string, name: string): string =>
    pattern.replace('<c>', name).replace('<year>', '2026').replace('<deliverable>', 'deliverable-1').replaceAll('NN', '01').replaceAll('*', 'x');

  /** ai/specs/<c>/ の下に置く kind (context-contract と、api-spec・table-spec など 8 種) */
  const perContext = [...ROLE_OF_KIND.values()].filter((placement) => placement.patterns.some((pattern) => pattern.startsWith('ai/specs/<c>/')));

  it('ai/specs/<c>/ の下に置く kind は 9 種 (前提)', () => {
    assert.deepEqual(
      perContext.map((placement) => placement.kind).sort(),
      ['api-spec', 'context-contract', 'domain-model', 'job', 'module-spec', 'sequence-spec', 'state-machine', 'table-spec', 'test-spec'],
    );
  });

  it('同じ階層に固定のフォルダとして置く tasks (ai/specs/tasks/) は、どの kind の <c> にも当たらない', () => {
    for (const placement of perContext) {
      for (const pattern of placement.patterns) {
        assert.deepEqual(matchPlacement(placement.kind, fill(pattern, 'tasks')), { ok: false, context: null }, `${placement.kind}: ${fill(pattern, 'tasks')}`);
      }
    }
  });

  it('shared は、context-contract 以外の <c> に当たる (全体共通のまとまり)。context-contract の <c> は shared も除く', () => {
    for (const placement of perContext) {
      for (const pattern of placement.patterns) {
        const expected = placement.kind === 'context-contract' ? { ok: false, context: null } : { ok: true, context: 'shared' };
        assert.deepEqual(matchPlacement(placement.kind, fill(pattern, 'shared')), expected, `${placement.kind}: ${fill(pattern, 'shared')}`);
      }
    }
  });

  it('それ以外の名前は、どの kind の <c> にも当たる (tasks と shared の名前の前後・似た名前を含む)', () => {
    for (const name of ['billing', 'task', 'tasks-2', 'my-tasks', 'shared-2', 'sharedx']) {
      for (const placement of perContext) {
        for (const pattern of placement.patterns) {
          assert.deepEqual(matchPlacement(placement.kind, fill(pattern, name)), { ok: true, context: name }, `${placement.kind}: ${fill(pattern, name)}`);
        }
      }
    }
  });

  it('固定のフォルダが無い階層 (person/design/・ai/specs/tasks/・ai/handbook/*/) の <c> には、除く名前が無い', () => {
    assert.deepEqual(matchPlacement('context-map', 'person/design/tasks/00-map.md'), { ok: true, context: 'tasks' });
    assert.deepEqual(matchPlacement('feature-brief', 'person/design/tasks/features/01-x.md'), { ok: true, context: 'tasks' });
    assert.deepEqual(matchPlacement('tasks', 'ai/specs/tasks/tasks/01-x.md'), { ok: true, context: 'tasks' });
    assert.deepEqual(matchPlacement('guide', 'ai/handbook/how-to/tasks/01-x.md'), { ok: true, context: 'tasks' });
    assert.deepEqual(matchPlacement('function-list', 'person/design/tasks/02-function-list.md'), { ok: true, context: 'tasks' });
  });
});

describe('detectLayout (構成の検出)', () => {
  it('person・ai・client のどれか 1 つでもあれば v4', () => {
    assert.equal(detectLayout(makeDocsDir('person')), 'v4');
    assert.equal(detectLayout(makeDocsDir('ai')), 'v4');
    assert.equal(detectLayout(makeDocsDir('client')), 'v4');
    assert.equal(detectLayout(makeDocsDir('person', 'ai', 'client')), 'v4');
  });

  it('docs/common/ だけが残っていれば v3、person・ai・client と併存するなら v4 (docs/common/ は違反として別に出る)', () => {
    assert.equal(detectLayout(makeDocsDir('common')), 'v3');
    assert.equal(detectLayout(makeDocsDir('common', 'person', 'ai', 'client')), 'v4');
  });

  it('旧い構成 (kind 別フォルダ・空・docs/ が無い) は legacy', () => {
    assert.equal(detectLayout(makeDocsDir('product', 'design/basic', 'adr')), 'legacy');
    assert.equal(detectLayout(makeDocsDir()), 'legacy');
    assert.equal(detectLayout(join(makeDocsDir(), 'no-such-docs')), 'legacy');
  });

  it('フォルダでなくファイルの person は数えない', () => {
    const docs = makeDocsDir('product');
    writeFileSync(join(docs, 'person'), 'ファイル');
    assert.equal(detectLayout(docs), 'legacy');
  });
});

describe('isGeneratedIndex (生成索引)', () => {
  it('docs/ 直下の README.md・dependencies.md と、各フォルダの README.md', () => {
    assert.equal(isGeneratedIndex('README.md'), true);
    assert.equal(isGeneratedIndex('dependencies.md'), true);
    assert.equal(isGeneratedIndex('person/README.md'), true);
    assert.equal(isGeneratedIndex('person/design/billing/flows/README.md'), true);
  });

  it('それ以外は生成索引ではない (別の場所の dependencies.md・名前が似ているだけのもの)', () => {
    assert.equal(isGeneratedIndex('person/dependencies.md'), false);
    assert.equal(isGeneratedIndex('person/design/shared/NOTREADME.md'), false);
    assert.equal(isGeneratedIndex('readme.md'), false);
    assert.equal(isGeneratedIndex('person/design/shared/00-map.md'), false);
  });
});

describe('isFolderSizeExempt (15 本の対象外)', () => {
  it('日付の記録 (ADR・提案書) と提出物のフォルダは対象外', () => {
    assert.deepEqual(FOLDER_SIZE_EXEMPT_DIRS, [
      'person/decisions/<year>',
      'client/proposals/<year>',
      'client/delivery/<deliverable>',
    ]);
    assert.equal(isFolderSizeExempt('person/decisions/2026'), true);
    assert.equal(isFolderSizeExempt('client/proposals/2026'), true);
    assert.equal(isFolderSizeExempt('client/delivery/spec-v1'), true);
  });

  it('それ以外 (決定の親フォルダ・年でない名前・さらに下の階層・設計と手引き) は対象', () => {
    assert.equal(isFolderSizeExempt('person/decisions'), false);
    assert.equal(isFolderSizeExempt('person/decisions/abcd'), false);
    assert.equal(isFolderSizeExempt('person/decisions/2026/sub'), false);
    assert.equal(isFolderSizeExempt('client/delivery'), false);
    assert.equal(isFolderSizeExempt('client/delivery/spec-v1/sub'), false);
    assert.equal(isFolderSizeExempt('person/design/shared'), false);
    assert.equal(isFolderSizeExempt('ai/specs/tasks'), false);
    assert.equal(isFolderSizeExempt('ai/handbook/how-to'), false);
  });
});
