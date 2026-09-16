/**
 * レイヤ依存とコンテキスト境界の機械的強制 。
 * 正典は本ファイル。食い違ったら本ファイルが正。
 *   npx depcruise --config apps/api/.dependency-cruiser.cjs apps/api/src
 * from.path の丸括弧キャプチャは to.path / to.pathNot で $1 として参照できる。
 */
const LAYER = (layer) => `^apps/api/src/modules/([^/]+)/${layer}/`;

module.exports = {
  forbidden: [
    {
      name: 'domain-depends-on-kernel-only',
      severity: 'error',
      comment: 'domain は自 domain と shared/kernel 以外に依存しない。ここが崩れると全部崩れる。',
      from: { path: LAYER('domain') },
      to: {
        pathNot: ['^apps/api/src/modules/$1/domain/', '^apps/api/src/shared/kernel/'],
      },
    },
    {
      name: 'domain-is-framework-free',
      severity: 'error',
      comment: 'domain / shared/kernel に npm パッケージを入れない (Nest も Prisma も型だけでも不可)。',
      from: { path: ['^apps/api/src/modules/[^/]+/domain/', '^apps/api/src/shared/kernel/'] },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'core'] },
    },
    {
      name: 'application-does-not-look-outward',
      severity: 'error',
      comment: 'application → domain のみ。infrastructure / presentation を知らない。',
      from: { path: LAYER('application') },
      to: { path: ['^apps/api/src/modules/$1/infrastructure/', '^apps/api/src/modules/$1/presentation/'] },
    },
    {
      name: 'application-is-framework-free',
      severity: 'error',
      comment: 'application は素の TypeScript。配線は infrastructure の useFactory が行う。',
      from: { path: '^apps/api/src/modules/[^/]+/application/' },
      to: { path: '^(@nestjs/|@prisma/client|@google-cloud/)', dependencyTypes: ['npm'] },
    },
    {
      name: 'presentation-goes-through-application',
      severity: 'error',
      comment: 'presentation → application のみ。domain / infrastructure を直接触らない。',
      from: { path: LAYER('presentation') },
      to: { path: ['^apps/api/src/modules/$1/domain/', '^apps/api/src/modules/$1/infrastructure/'] },
    },
    {
      name: 'infrastructure-is-not-presentation',
      severity: 'error',
      from: { path: LAYER('infrastructure') },
      to: { path: '^apps/api/src/modules/$1/presentation/' },
    },
    {
      name: 'prisma-only-in-infrastructure',
      severity: 'error',
      comment: '@prisma/client と生成 Prisma 型は infrastructure/ と common/prisma/ の外に出さない。',
      from: { pathNot: ['^apps/api/src/modules/[^/]+/infrastructure/', '^apps/api/src/common/prisma/'] },
      to: { path: '^(@prisma/client|\\.prisma/client)', dependencyTypes: ['npm'] },
    },
    {
      name: 'cross-module-through-index-only',
      severity: 'error',
      comment: '他コンテキストへは modules/<x>/index.ts の公開面のみ。entity / repository の直 import は禁止。',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/.+',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'common-is-a-leaf',
      severity: 'error',
      comment: 'common / shared は modules を知らない (逆流すると module の切り出しができなくなる)。',
      from: { path: '^apps/api/src/(common|shared)/' },
      to: { path: '^apps/api/src/modules/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環は「依存方向が守られている」という主張を無効化する。',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphan-domain-file',
      severity: 'warn',
      comment: 'どこからも使われない domain ファイルは図と実装のどちらかが古い兆候。',
      from: { orphan: true, pathNot: ['\\.spec\\.ts$', '\\.d\\.ts$', '(^|/)index\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'apps/api/tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    reporterOptions: { dot: { collapsePattern: '^apps/api/src/modules/[^/]+/[^/]+' } },
  },
};
