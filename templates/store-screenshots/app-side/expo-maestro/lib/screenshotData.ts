// 撮影シナリオ。起動引数 screenshot=<name> で注入する画面状態。
// defaults.mjs の SLIDES[].capture と同じ名前にする。
//
// route は撮りたい画面への直行パス（UI 遷移を辿らない）、
// anchor は撮影前に Maestro が表示を待つ文字列。

export interface ScreenshotScenario {
  route: string;
  anchor: string;
}

export const SCREENSHOT_SCENARIOS: Record<string, ScreenshotScenario> = {
  // TODO: 自分のルート構成・画面文言に合わせる
  home: { route: '/(tabs)/home', anchor: 'ホーム' },
  // 'feature-a': { route: '/feature/a', anchor: 'アンカー文字列' },
};

// モック応答。'GET /api/path' → 返す JSON。URL の * は 1 セグメントのワイルドカード。
// シナリオ中にアプリが叩く GET を全部モックしておけば、未登録は GET=[]/他={} に落ちる。
export const SCREENSHOT_MOCKS: Record<string, unknown> = {
  // TODO: 自分の API 形に合わせる
  'GET /api/auth/me': { id: 1, name: '山田 太郎' },
  // 'GET /api/items': [{ id: 1, title: '...' }],
  // 'GET /api/items/*': { id: 1, title: '...' },
};
