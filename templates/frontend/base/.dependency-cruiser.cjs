/**
 * 管理画面 (frontend/admin) の依存の決まり (Vertical Slice Architecture)。
 *   npm run check:deps (リポジトリのルート。backend の検査と続けて走る)
 *
 * features/<機能>/ が 1 つの縦割り (見た目・状態・API の呼び出し・部品・テスト)。
 * 機能どうしは知らない。機能をまたいで使うものは common/ に出す。app/ は機能を並べて振り分けるだけ。
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'feature-does-not-import-other-features',
      severity: 'error',
      comment: '機能は別の機能を import しない。共通にしたいものは common/ に出す。',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'common-does-not-import-features-or-app',
      severity: 'error',
      comment: 'common/ は機能も app/ も知らない (逆流すると機能を切り離せなくなる)。',
      from: { path: '^src/common/' },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'features-do-not-import-app',
      severity: 'error',
      comment: '機能は app/ (振り分け) を知らない。画面の移動は common/ の道具で行う。',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'production-does-not-import-test-support',
      severity: 'error',
      comment: '本番のコードはテストの道具を使わない。',
      from: { path: '^src/', pathNot: ['\\.test\\.tsx?$', '^src/test-support/'] },
      to: { path: '^src/test-support/' },
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
  },
};
