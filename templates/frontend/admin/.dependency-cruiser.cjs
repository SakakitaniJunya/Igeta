/**
 * 管理画面 (frontend/admin) の依存の決まり。この 12 本が規則の正本 (README の一覧は要約。食い違ったらこのファイルが正)。
 *   frontend/admin のフォルダで: depcruise --config .dependency-cruiser.cjs src
 * path は frontend/admin のフォルダからの相対 (`^src/...`)。from.path の丸括弧キャプチャは to.path / to.pathNot で $1 として参照できる。
 * npm のパッケージは node_modules/<名前>/... に解決されるので、パッケージの規則は (^|/)node_modules/ から書く。
 *
 * 形: features/<x>/ と shared/ は同じ 4 層 (presentation・application・domain・infrastructure) で切る。向きは層の名前で決め、
 * ①〜⑤ は feature と shared に一括で掛ける。backend と違い application → infrastructure と presentation → domain は許す
 * (差し替えの継ぎ目は Api 1 つで、domain は型と純関数だから)。
 * テスト (*.test.ts(x)) は層の隣に置く。テストが vitest などを import する規則 (①⑤) と shared/test-support を使う規則 (⑦) からは、テストを外す。
 */
const LAYERS = '^src/(features/[^/]+|shared)';
const layer = (name) => `${LAYERS}/${name}/`;
const TEST = '\\.test\\.tsx?$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-stays-inside-domain',
      severity: 'error',
      comment: '① domain は domain の外 (application・presentation・infrastructure) の自分たちのコードへ出ない。npm は ⑤ が見る。',
      from: { path: layer('domain'), pathNot: TEST },
      to: { path: '^src/', pathNot: layer('domain') },
    },
    {
      name: 'infrastructure-does-not-look-up',
      severity: 'error',
      comment: '② infrastructure (endpoint・dto・mapper・createApi など) は application・presentation を見ない。',
      from: { path: layer('infrastructure') },
      to: { path: [layer('application'), layer('presentation')] },
    },
    {
      name: 'application-does-not-look-at-presentation',
      severity: 'error',
      comment: '③ application (hook・messages) は presentation を見ない。',
      from: { path: layer('application') },
      to: { path: layer('presentation') },
    },
    {
      name: 'presentation-does-not-look-at-infrastructure',
      severity: 'error',
      comment: '④ presentation は infrastructure を見ない。通信は application の hook を通す。',
      from: { path: layer('presentation') },
      to: { path: layer('infrastructure') },
    },
    {
      name: 'domain-is-framework-free',
      severity: 'error',
      comment: '⑤ domain は React も npm も shared/infrastructure も使わない (型だけでも不可)。',
      from: { path: layer('domain'), pathNot: TEST },
      to: { path: ['(^|/)node_modules/', '^src/shared/infrastructure/'] },
    },
    {
      name: 'components-do-not-import-screen',
      severity: 'error',
      comment: '⑥ components は screen を見ない。状態は screen から props で受け、操作は props で返す。',
      from: { path: '^src/features/[^/]+/presentation/components/' },
      to: { path: '^src/features/[^/]+/presentation/screen/' },
    },
    {
      name: 'shared-ui-depends-on-domain-and-ui-only',
      severity: 'error',
      comment: '⑦ shared/presentation/ui は意味を知らない部品。使ってよい自分たちのコードは shared/domain と shared/presentation (ui と bind-field) だけ。application・infrastructure は見ない。',
      from: { path: '^src/shared/presentation/ui/', pathNot: TEST },
      to: { path: '^src/', pathNot: ['^src/shared/domain/', '^src/shared/presentation/'] },
    },
    {
      name: 'other-features-through-index-only',
      severity: 'error',
      comment: '⑧ 他の feature へは features/<x>/index.ts (公開面) だけ。app も同じ。循環と深い import を止める。',
      from: { path: '^src/(features/[^/]+|app)/' },
      to: { path: '^src/features/[^/]+/.+', pathNot: ['^src/$1/', '^src/features/[^/]+/index\\.ts$'] },
    },
    {
      name: 'shared-is-a-leaf',
      severity: 'error',
      comment: '⑨ shared は feature も app も知らない (逆流すると feature を切り離せなくなる)。',
      from: { path: '^src/shared/' },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'app-is-read-by-main-only',
      severity: 'error',
      comment: '⑩ app/ を読むのは main.tsx だけ。feature も shared も app を知らない。',
      from: { path: '^src/', pathNot: ['^src/main\\.tsx$', '^src/app/'] },
      to: { path: '^src/app/' },
    },
    {
      name: 'production-does-not-import-test-support',
      severity: 'error',
      comment: '⑪ 本番のコードは shared/test-support を使わない。',
      from: { path: '^src/', pathNot: [TEST, '^src/shared/test-support/'] },
      to: { path: '^src/shared/test-support/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: '⑫ 循環なし。',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
