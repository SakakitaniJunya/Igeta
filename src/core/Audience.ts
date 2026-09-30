// kind → 読み手の対応の正本 (docs/product/01-requirements.md REQ-102)。
// 対応の設計確定版は docs/explanation/03-audience-layers.md §3「kind ごとの読み手」。
// templates/docs/guides/01-document-taxonomy.md「読み手 3 種」の対応表はこの定数の転記 ——
// kind を足す・読み手を変えるときはここだけを直し、ガイド側を写し直す。
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
 * 読み手別の入口 3 行 (docs/README.md に置く案内。AUTOGEN 索引区間の外、REQ-103)。
 * 消費 repo の docs/README.md は 2 経路で生まれる (templates/docs/README.md のコピーと
 * `igeta init` が置く stub)。どちらにもこの文言を使う —— テンプレ側は転記なので、
 * 直すときはここを直してテンプレを写し直す。
 */
export const AUDIENCE_ENTRANCE: readonly string[] = [
  '- **顧客** (非エンジニア): 提出物の章 (`kind: delivery-chapter` / `delivery/`) を `igeta export` で束ねた PDF だけを読む',
  '- **開発者**: 全体の地図 (`00-map.md`) → まとまりの地図 (`kind: context-map` / `contexts/maps/`) → `igeta review-sheet` で今回の変更のレビューシートを読む',
  '- **AI**: 自分のまとまりの正本と隣のまとまりの約束 (`kind: context-contract` / `contexts/contracts/`) だけを読む。対象の一覧は `igeta context-files` で得る',
];
