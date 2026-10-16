/**
 * backend のレイヤ依存とコンテキスト境界の決まり。backend のフォルダで `depcruise --config .dependency-cruiser.cjs src`。
 * from.path の丸括弧キャプチャは to.path / to.pathNot で $1 として参照できる。
 * npm のパッケージは node_modules/<名前>/... に解決されるので、パッケージのルールは (^|/)node_modules/ から書く
 * (`^hono` のように書くと一致せず、ルールが効かない)。
 */
const LAYER = (layer) => `^src/modules/([^/]+)/${layer}/`;
const NPM = (pattern) => `(^|/)node_modules/${pattern}`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-depends-on-kernel-only',
      severity: 'error',
      comment: 'domain は自 domain と shared/kernel 以外に依存しない。',
      from: { path: LAYER('domain') },
      to: { pathNot: ['^src/modules/$1/domain/', '^src/shared/kernel/'] },
    },
    {
      name: 'domain-is-framework-free',
      severity: 'error',
      comment: 'domain / shared/kernel に npm パッケージも node の組み込みも入れない。',
      from: { path: ['^src/modules/[^/]+/domain/', '^src/shared/kernel/'] },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'core'] },
    },
    {
      name: 'application-does-not-look-outward',
      severity: 'error',
      comment: 'application は infrastructure / presentation を知らない。',
      from: { path: LAYER('application') },
      to: { path: ['^src/modules/$1/infrastructure/', '^src/modules/$1/presentation/'] },
    },
    {
      name: 'application-is-framework-free',
      severity: 'error',
      comment: 'application は素の TypeScript。外部の SDK と HTTP フレームワークは使わない。',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: NPM('(@google-cloud/|hono|@hono/)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'presentation-goes-through-application',
      severity: 'error',
      comment: 'モジュールの presentation は application だけを使う。',
      from: { path: LAYER('presentation') },
      to: { path: ['^src/modules/$1/domain/', '^src/modules/$1/infrastructure/'] },
    },
    {
      name: 'infrastructure-is-not-presentation',
      severity: 'error',
      from: { path: LAYER('infrastructure') },
      to: { path: '^src/modules/$1/presentation/' },
    },
    {
      name: 'firestore-only-in-platform-and-infrastructure',
      severity: 'error',
      comment: '@google-cloud/firestore は platform/ と modules/*/infrastructure/ と、組み立ての場所 (modules/<x>/index.ts) の外に出さない。',
      from: { pathNot: ['^src/platform/', '^src/modules/[^/]+/infrastructure/', '^src/modules/[^/]+/index\\.ts$'] },
      to: { path: NPM('@google-cloud/firestore'), dependencyTypes: ['npm'] },
    },
    {
      name: 'hono-only-in-presentation-and-entry',
      severity: 'error',
      comment: 'Hono は入口 (src/presentation/ と src/index.ts) だけ。モジュールのコントローラは HttpResponse を返す素の関数にする。',
      from: { pathNot: ['^src/presentation/', '^src/index\\.ts$'] },
      to: { path: NPM('(hono|@hono/)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'production-does-not-import-test-support',
      severity: 'error',
      comment: 'テスト用の部品 (test-support) を本番のコードから import しない。',
      from: { path: '^src/', pathNot: ['\\.spec\\.ts$', '/test-support/', '/__tests__/'] },
      to: { path: '/test-support/' },
    },
    {
      name: 'platform-only-from-infra-and-entry',
      severity: 'error',
      comment: 'platform (署名・トークンの検証・Firestore の生成) は infrastructure / エントリ / テストからだけ使う。',
      from: { path: '^src/', pathNot: ['^src/modules/[^/]+/(infrastructure|presentation)/', '^src/index\\.ts$', '\\.spec\\.ts$'] },
      to: { path: '^src/platform/' },
    },
    {
      name: 'cross-module-through-index-only',
      severity: 'error',
      comment: '他のコンテキストへは modules/<x>/index.ts の公開面だけ。',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/.+', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'kernel-and-platform-are-leaves',
      severity: 'error',
      comment: 'shared / platform は modules を知らない。',
      from: { path: '^src/(shared|platform)/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
