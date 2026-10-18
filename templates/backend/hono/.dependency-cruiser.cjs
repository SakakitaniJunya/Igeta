/**
 * backend (Hono) の層の向きとコンテキスト境界の決まり。この 18 本が規則の正本 (README の一覧は要約。食い違ったらこのファイルが正)。
 *   backend のフォルダで: depcruise --config .dependency-cruiser.cjs src
 * path は backend のフォルダからの相対 (`^src/...`)。from.path の丸括弧キャプチャは to.path / to.pathNot で $1 として参照できる。
 * npm のパッケージは node_modules/<名前>/... に解決されるので、パッケージの規則は (^|/)node_modules/ から書く
 * (`^hono` のように書くと一致せず、規則が効かない)。
 * テスト (*.spec.ts) は層の隣に置くので、テストが vitest などを import する規則 (domain の 2 本) からは spec を外す。
 */
const LAYER = (layer) => `^src/modules/([^/]+)/${layer}/`;
const NPM = (pattern) => `(^|/)node_modules/${pattern}`;
const SPEC = '\\.spec\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-depends-on-shared-domain-only',
      severity: 'error',
      comment: 'domain は自分の module の domain と shared/domain 以外に依存しない。ここが崩れると全部崩れる。',
      from: { path: LAYER('domain'), pathNot: SPEC },
      to: { pathNot: ['^src/modules/$1/domain/', '^src/shared/domain/'] },
    },
    {
      name: 'domain-is-framework-free',
      severity: 'error',
      comment: 'domain と shared/domain に npm パッケージも node の組み込みも入れない (型だけでも不可)。',
      from: { path: ['^src/modules/[^/]+/domain/', '^src/shared/domain/'], pathNot: SPEC },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'core'] },
    },
    {
      name: 'application-does-not-look-outward',
      severity: 'error',
      comment:
        'application は domain と shared/domain だけを見る。infrastructure・presentation と、応答の形 (shared/presentation) を知らない。usecase は domain の結果 (Result) を返し、HttpResponse は module の controller が組む。',
      from: { path: LAYER('application') },
      to: { path: ['^src/modules/$1/infrastructure/', '^src/modules/$1/presentation/', '^src/shared/presentation/'] },
    },
    {
      name: 'application-is-framework-free',
      severity: 'error',
      comment: 'application は素の TypeScript。外部の SDK と HTTP フレームワークは使わない。配線は infrastructure と module の index.ts で行う。',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: NPM('(@google-cloud/|hono|@hono/)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'presentation-goes-through-application',
      severity: 'error',
      comment: 'module の presentation は application だけを通る。自分の module の domain と infrastructure を直接触らない。',
      from: { path: LAYER('presentation') },
      to: { path: ['^src/modules/$1/domain/', '^src/modules/$1/infrastructure/'] },
    },
    {
      name: 'infrastructure-is-not-presentation',
      severity: 'error',
      comment: 'infrastructure は presentation を知らない。',
      from: { path: LAYER('infrastructure') },
      to: { path: '^src/modules/$1/presentation/' },
    },
    {
      name: 'firestore-only-in-infrastructure',
      severity: 'error',
      comment:
        '@google-cloud/firestore は modules/*/infrastructure/ と shared/infrastructure/ の外に出さない。例外は組み立ての場所 (modules/<x>/index.ts が受け取る Firestore の型)。',
      from: { pathNot: ['^src/shared/infrastructure/', '^src/modules/[^/]+/infrastructure/', '^src/modules/[^/]+/index\\.ts$'] },
      to: { path: NPM('@google-cloud/firestore'), dependencyTypes: ['npm'] },
    },
    {
      name: 'ai-sdk-only-in-infrastructure',
      severity: 'error',
      comment: 'LLM の SDK (ai・@ai-sdk/*) は modules/*/infrastructure/ の外に出さない。使わない backend では何にも一致しない。',
      from: { pathNot: '^src/modules/[^/]+/infrastructure/' },
      to: { path: NPM('(ai(/|$)|@ai-sdk/)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'production-does-not-import-test-support',
      severity: 'error',
      comment: 'テスト用の部品 (test-support) を本番のコードから import しない。',
      from: { path: '^src/', pathNot: [SPEC, '/test-support/'] },
      to: { path: '/test-support/' },
    },
    {
      name: 'shared-infrastructure-only-from-infrastructure-and-entries',
      severity: 'error',
      comment:
        'shared/infrastructure (Firestore の生成・環境変数の読み取り) は module の infrastructure・entries・src/index.ts・テストからだけ使う。module の presentation・application・domain は使わない。',
      from: {
        path: '^src/',
        pathNot: ['^src/shared/infrastructure/', '^src/modules/[^/]+/infrastructure/', '^src/entries/', '^src/index\\.ts$', SPEC, '/test-support/'],
      },
      to: { path: '^src/shared/infrastructure/' },
    },
    {
      name: 'cross-module-through-index-only',
      severity: 'error',
      comment: '他の module へは modules/<x>/index.ts の公開面だけ。entity・repository を直接 import しない。',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/.+', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'entries-go-through-module-index',
      severity: 'error',
      comment: '入口 (src/entries/ と src/index.ts) から module の中へは modules/<x>/index.ts だけ。層のファイルを直接 import しない。',
      from: { path: ['^src/entries/', '^src/index\\.ts$'] },
      to: { path: '^src/modules/[^/]+/.+', pathNot: '^src/modules/[^/]+/index\\.ts$' },
    },
    {
      name: 'shared-is-a-leaf',
      severity: 'error',
      comment: 'shared は modules も entries も知らない (逆流すると module を切り出せなくなる)。',
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|entries)/' },
    },
    {
      name: 'hono-only-in-entries',
      severity: 'error',
      comment: 'Hono は入口 (src/entries/ と src/index.ts) だけ。module の controller は HttpResponse を返す素の関数にする。',
      from: { pathNot: ['^src/entries/', '^src/index\\.ts$'] },
      to: { path: NPM('(hono|@hono/)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'zod-only-in-module-presentation',
      severity: 'error',
      comment:
        'zod は modules/*/presentation/ だけ (形の検証。*.schemas.ts を controller と並べる)。入口では使わず、@hono/zod-validator は使わない。意味の検証は domain の値オブジェクト。',
      from: { pathNot: '^src/modules/[^/]+/presentation/' },
      to: { path: NPM('(zod|@hono/zod-validator)(/|$)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'module-does-not-import-entries',
      severity: 'error',
      comment: 'modules/ から入口 (src/entries/) を import しない。応答の形は shared/presentation を通す。',
      from: { path: '^src/modules/' },
      to: { path: '^src/entries/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環は「依存の向きが守られている」という主張を無効にする。',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphan-file',
      severity: 'warn',
      comment: 'どこからも使われないファイルは、図と実装のどちらかが古い兆候。',
      from: { orphan: true, pathNot: [SPEC, '\\.d\\.ts$', '(^|/)index\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    reporterOptions: { dot: { collapsePattern: '^src/modules/[^/]+/[^/]+' } },
  },
};
