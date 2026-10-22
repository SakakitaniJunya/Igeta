// スライド定義。全枚が同じレンダラを通り、違うのはこのデータだけ。
// headline/subtitle の *語* はアクセントマーカー。改行は \n で明示（自動折り返しに任せない）。
// capture/anchor はアプリ側の撮影シナリオ定義（app-side/expo-maestro/lib/screenshotData.ts 等）と対応する。

const shot = (n) => `screenshots/{store}/{device}/{locale}/${n}.png`;

export const SLIDES = [
  {
    id: 'home',
    layout: 'device-bottom', // 見出し上・端末下の固定レイアウト
    frame: true, // 端末に枠線を載せるか
    editorialBg: 'ink', // 背景: 'ink' | 'paper' | 'accent'
    capture: 'home', // TODO: アプリの撮影シナリオ名
    anchor: 'ホーム', // TODO: その画面に必ず出る文字列（撮影待機の目印）
    screenshot: shot('01'),
    headline: {
      ja: 'アプリの価値を\n*一行*で。',
    },
    subtitle: {
      ja: 'サブコピー。\n改行は \\n で明示する。',
    },
  },
  {
    id: 'feature-a',
    layout: 'device-bottom',
    frame: false,
    editorialBg: 'paper',
    capture: 'feature-a',
    anchor: 'アンカー文字列',
    screenshot: shot('02'),
    headline: {
      ja: '*機能*の\nうれしさを伝える。',
    },
    subtitle: {
      ja: '何ができるかを\n1文で。',
    },
  },
  {
    id: 'feature-b',
    layout: 'device-bottom',
    frame: false,
    editorialBg: 'accent',
    capture: 'feature-b',
    anchor: 'アンカー文字列',
    screenshot: shot('03'),
    headline: {
      ja: '導入の*ハードル*を\n下げる文言。',
    },
    subtitle: {
      ja: '安心材料や\n補足情報。',
    },
  },
];
