// ロケールコードはレイヤーごとに別系統。対応表はこのファイルだけが持つ。
//   editor   : defaults.mjs の文言キー / 入力 PNG のディレクトリ名
//   snapshot : 撮影時に OS へ渡すロケール（iOS: -AppleLanguages / Android: persist.sys.locale）
//   asc      : App Store Connect のロケールコード（Google Play は別表に足す）
// 言語を増やすときはこの1行を足して make screenshots を回すだけ。
export const LOCALES = [
  { editor: 'ja', snapshot: 'ja', asc: 'ja' },
  // { editor: 'en', snapshot: 'en-US', asc: 'en-US' },
];

// 出力サイズ（ストア必須サイズ）
export const DEVICES = {
  // App Store: 6.9" iPhone (必須カテゴリ)
  iphone: { width: 1320, height: 2868, store: 'apple' },
  // Google Play: フルHD+ 相当（9:20）
  android: { width: 1080, height: 2400, store: 'google' },
};

// 撮影デバイス（capture スクリプトがシミュレータ/エミュレータを選ぶ表）
export const CAPTURE_TARGETS = {
  ios: {
    device: 'iphone',
    simulator: 'iPhone 16 Pro Max',
    appId: 'com.example.app', // TODO: アプリの bundle id
  },
  android: {
    device: 'android',
    appId: 'com.example.app', // TODO: アプリの applicationId
  },
};
