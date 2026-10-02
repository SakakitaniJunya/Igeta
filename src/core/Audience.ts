// kind → 読み手の対応の正本 (docs/product/01-requirements.md REQ-102)。
// 対応の設計確定版は docs/explanation/03-audience-layers.md §3「kind ごとの読み手」。
// 旧い構成 (person・ai・client が無い repo) の索引の読み手の判定。旧い版の文書体系ガイドにあった「読み手 3 種」の
// 対応表は、この定数の転記だった。新しい構成のガイド (templates/docs/ai/handbook/how-to/01-document-taxonomy.md) は、
// 確定させる人 (要件定義書 02 §7) で説明していて、この対応表を持たない。
//
// 「対象外」(双方が読む解説・手引き) と、表に載らない kind は索引では「共通」と出す
// (要件定義の未確定事項 #2 はこれで確定)。判定入力は frontmatter `kind` のみで、
// `audience` のような専用フィールドは持たない (REQ-201)。

/** 索引に出す読み手の内部表現。表示は AUDIENCE_LABEL を通す。 */
export type Audience = 'customer' | 'developer' | 'ai' | 'shared';

/** Audience の表示語。索引行の `_(読み手: …)_` に出る文字列。 */
export const AUDIENCE_LABEL: Readonly<Record<Audience, string>> = {
  customer: '顧客',
  developer: '開発者',
  ai: 'AI',
  shared: '共通',
};

/**
 * kind → 読み手の対応表 (正本)。確定版の表をそのまま写す。
 * 末尾 `*` は前方一致を表す (`domain-*` は domain-overview / domain-model 等を束ねる)。
 * `shared` 行は確定版の「対象外」の写し —— ここに無い・kind 自体が無い文書も shared に倒す。
 */
export const AUDIENCE_KINDS: Readonly<Record<Audience, readonly string[]>> = {
  ai: [
    'requirements',
    'function-list',
    'solution-strategy',
    'domain-*',
    'aggregate-map', // design/detail/domain/ 配下だが `domain-*` の前方一致では拾えない
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
    'code-definitions',
    'messages',
    'permission-matrix',
    'i18n',
    'data-management',
    'secrets-management',
    'nonfunctional',
    'test-plan',
    'test-spec',
    'risks-tech-debt',
    'glossary',
    'as-is-overview',
    'external-integration',
    'operations',
    'migration-plan',
    'adr',
    'tasks', // 実装タスク分解 (design/tasks/) — AI が実行する作業面
  ],
  developer: ['map', 'context-map', 'context-contract', 'decision-log', 'feature-brief'],
  customer: ['delivery-chapter'],
  shared: ['explanation', 'guide', 'runbook', 'proposal', 'document-taxonomy', 'human-review', 'index'],
};

/** frontmatter `kind` から読み手を機械判定する。kind が無い・表に無い kind は 'shared' (共通)。 */
export function audienceOfKind(kind: string | undefined): Audience {
  if (kind === undefined || kind === '') return 'shared';
  for (const audience of ['ai', 'developer', 'customer', 'shared'] as const) {
    for (const pattern of AUDIENCE_KINDS[audience]) {
      const match = pattern.endsWith('*') ? kind.startsWith(pattern.slice(0, -1)) : kind === pattern;
      if (match) return audience;
    }
  }
  return 'shared';
}

/**
 * 入口の 3 行 (docs/README.md に置く案内。AUTOGEN 索引区間の外)。正本はここ 1 か所 (テスト仕様 06 の I11)。
 * 消費 repo の docs/README.md は 2 経路で生まれる (templates/docs/README.md のコピーと `igeta init` が置く README)。
 * `init` はこの定数から作り、テンプレ側は転記 —— 直すときはここを直してテンプレを写し直す
 * (InitCommand.test.ts の [TST-107] が、3 つの一致を見る)。
 */
export const AUDIENCE_ENTRANCE: readonly string[] = [
  '- **人が決める** — `person/`: 全体の地図 (`person/design/shared/00-map.md`) から読む。決めを待つ行は決定台帳 (`person/decisions/01-decisions.md`)、変わった行は `igeta review-sheet --diff` で読む',
  '- **AI が使う** — `ai/`: 入口は repo 直下の `AGENTS.md`。読む範囲は `igeta context-files <まとまり>` で得る',
  '- **顧客に渡す** — `client/`: 提出物の章を `igeta export` で束ねた PDF を渡す',
];
