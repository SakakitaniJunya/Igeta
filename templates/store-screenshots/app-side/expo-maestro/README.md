# app-side/expo-maestro — Expo / React Native 用の撮影アダプタ

Expo managed（`ios/` 非コミット）など XCUITest が回せない構成向け。
起動引数 `screenshot=<name>` を `react-native-launch-arguments` で読み、axios のアダプタ層でモック応答を注入する。アプリの画面コードは変更不要。

## 導入

1. アプリに依存を足す:

   ```sh
   npm i react-native-launch-arguments
   ```

2. このフォルダの中身をアプリ側へコピー:

   | コピー元 | コピー先 |
   | --- | --- |
   | `lib/screenshots.ts` | `<app>/lib/screenshots.ts` |
   | `lib/screenshotData.ts` | `<app>/lib/screenshotData.ts` |
   | `.maestro/screenshot.yaml` | `<app>/.maestro/screenshot.yaml` |

3. ルートレイアウト（expo-router なら `app/_layout.tsx`）に2点足す:

   - **先頭の import**（副作用でモックアダプタを装着するので、Provider より先に評価させる）:

     ```ts
     import '@/lib/screenshots';
     ```

   - **シナリオ遷移コンポーネント**を認証コンテキストの内側に置く:

     ```tsx
     import { SCREENSHOT_SCENARIO } from '@/lib/screenshots';
     import { SCREENSHOT_SCENARIOS } from '@/lib/screenshotData';

     function ScreenshotNavigator() {
       const router = useRouter();
       const { isAuthenticated, isLoading } = useAuth(); // 自分の認証フック
       useEffect(() => {
         if (!SCREENSHOT_SCENARIO || isLoading || !isAuthenticated) return;
         const scenario = SCREENSHOT_SCENARIOS[SCREENSHOT_SCENARIO];
         if (scenario) router.replace(scenario.route as never);
       }, [isLoading, isAuthenticated]);
       return null;
     }
     ```

4. `screenshotData.ts` の `SCREENSHOT_SCENARIOS`/`SCREENSHOT_MOCKS` を自分の画面・API に合わせる。
   `screenshots.ts` の `import { api } from '@/lib/api'` も自分の axios インスタンスへ向ける。

5. リポジトリルートの `scripts/locales.mjs` で `CAPTURE_TARGETS.*.appId` を自分の bundle id / applicationId に変え、
   `scripts/screenshots-capture-{ios,android}.sh` の `APP_DIR` をアプリのパスに変える（または環境変数で渡す）。

## 仕組み

- `screenshots.ts` は `__DEV__` ビルドかつ `screenshot` 引数があるときだけ `api.defaults.adapter` を差し替える（記事の `#if DEBUG` 相当）。
- web での確認は `expo start --web` + `http://localhost:8081/?screenshot=<name>`（ネイティブモジュールが無い環境のフォールバック）。
- Maestro フローはアンカー文字列が見えるまで待ってから撮る。状態が壊れて白画面でも撮り逃さない。
