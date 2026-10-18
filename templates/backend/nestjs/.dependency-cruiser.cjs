/**
 * backend (NestJS) の層の向きとコンテキスト境界の決まり。この 19 本が規則の正本 (README の一覧は要約。食い違ったらこのファイルが正)。
 *   backend のフォルダで: depcruise --config .dependency-cruiser.cjs src
 * Hono 版 (../hono/.dependency-cruiser.cjs) と同じ意味で、違いは 3 点だけ。
 *   - フレームワークの閉じ込め先が Hono ではなく NestJS (@nestjs/*・express・rxjs・reflect-metadata)。
 *     Nest のデコレータを書いてよいのは entries/・src/main.ts・src/app.module.ts だけ。module の 4 層は素の TypeScript。
 *   - 起動の入口が src/index.ts ではなく src/main.ts と src/app.module.ts。
 *   - class-validator・class-transformer は使わない (形の検証は module の presentation の zod)。
 * path は backend のフォルダからの相対 (`^src/...`)。from.path の丸括弧キャプチャは to.path / to.pathNot で $1 として参照できる。
 * npm のパッケージの規則は (^|/)node_modules/ から書く。テスト (*.spec.ts) は層の隣に置くので、domain の 2 本からは spec を外す。
 */
const LAYER = (layer) => `^src/modules/([^/]+)/${layer}/`;
const NPM = (pattern) => `(^|/)node_modules/${pattern}`;
const SPEC = '\\.spec\\.ts$';
/** 起動の入口。entries/ と合わせて、フレームワークを使ってよい場所。 */
const ROOT = ['^src/main\\.ts$', '^src/app\\.module\\.ts$', '^src/app\\.module\\.spec\\.ts$'];
/** express の型は @types/express に解決される (node_modules/express にならない) ので、両方を並べる。 */
const NEST = '(@nestjs/|express|@types/express|rxjs|reflect-metadata)';

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
      comment: 'application は素の TypeScript。外部の SDK と HTTP フレームワークは使わない (@Injectable も付けない)。配線は module の index.ts と entries の Nest module で行う。',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: NPM(`(@google-cloud/|${NEST.slice(1)}`), dependencyTypes: ['npm'] },
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
        '@google-cloud/firestore は modules/*/infrastructure/ と shared/infrastructure/ の外に出さない。例外は組み立ての場所 (modules/<x>/index.ts が受け取る Firestore の型)。entries の Nest module は shared/infrastructure の生成関数を通して使う。',
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
        'shared/infrastructure (Firestore の生成・環境変数の読み取り) は module の infrastructure・entries・main.ts・app.module.ts・テストからだけ使う。module の presentation・application・domain は使わない。',
      from: {
        path: '^src/',
        pathNot: ['^src/shared/infrastructure/', '^src/modules/[^/]+/infrastructure/', '^src/entries/', ...ROOT, SPEC, '/test-support/'],
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
      comment: '入口 (src/entries/・main.ts・app.module.ts) から module の中へは modules/<x>/index.ts だけ。層のファイルを直接 import しない。',
      from: { path: ['^src/entries/', ...ROOT] },
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
      name: 'nest-only-in-entries',
      severity: 'error',
      comment:
        'NestJS (と express・rxjs・reflect-metadata) は入口 (src/entries/・src/main.ts・src/app.module.ts) だけ。module の controller は HttpResponse を返す素のクラスか関数にする。controller・guard・pipe・filter・Nest の module は entries に置く。',
      from: { pathNot: ['^src/entries/', ...ROOT] },
      // @nestjs/testing (devDependencies)・型だけの @types/express・package.json に無い express も落とすため、npm 以外の種類も並べる。
      to: { path: NPM(NEST), dependencyTypes: ['npm', 'npm-dev', 'npm-no-pkg'] },
    },
    {
      name: 'zod-only-in-module-presentation',
      severity: 'error',
      comment: 'zod は modules/*/presentation/ だけ (形の検証。*.schemas.ts を controller と並べる)。入口では使わない。意味の検証は domain の値オブジェクト。',
      from: { pathNot: '^src/modules/[^/]+/presentation/' },
      to: { path: NPM('zod(/|$)'), dependencyTypes: ['npm'] },
    },
    {
      name: 'no-decorator-validation',
      severity: 'error',
      comment: 'class-validator・class-transformer・Nest の ValidationPipe に頼る検証は使わない。形の検証は module の presentation の zod に 1 本化する。',
      from: {},
      to: { path: NPM('(class-validator|class-transformer)(/|$)'), dependencyTypes: ['npm'] },
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
      from: { orphan: true, pathNot: [SPEC, '\\.d\\.ts$', '(^|/)index\\.ts$', '^src/main\\.ts$'] },
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
