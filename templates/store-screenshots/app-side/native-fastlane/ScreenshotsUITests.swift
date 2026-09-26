import XCTest

// ストアスクリーンショット撮影テスト。
// アプリ側の契約は app-side/native-fastlane/README.md を参照:
//   DEBUG ビルドで起動引数 -screenshot <name> を読み、そのシナリオの画面へ直行し、
//   アンカー文字列（accessibilityIdentifier または表示文字列）を出すこと。

final class ScreenshotsUITests: XCTestCase {

    // シナリオ名 → (出力番号, アンカー文字列)
    // SLIDES（store-screenshots/src/defaults.mjs）と対応させる。
    private static let SCENARIOS: [(name: String, out: String, anchor: String)] = [
        ("home", "01", "ホーム"),          // TODO: 自アプリのシナリオ
        // ("feature-a", "02", "アンカー文字列"),
    ]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureScreenshots() throws {
        let app = XCUIApplication()
        setupSnapshot(app) // fastlane snapshot のおまじない

        for scenario in Self.SCENARIOS {
            app.launchArguments = ["-screenshot", scenario.name]
            app.launch()

            // アンカーが見えるまで待つ（白画面の取り違え防止）
            let anchor = app.staticTexts[scenario.anchor]
            if !anchor.waitForExistence(timeout: 30) {
                // accessibilityIdentifier で出している場合のフォールバック
                XCTAssertTrue(app.otherElements[scenario.anchor].waitForExistence(timeout: 5),
                              "anchor not found: \(scenario.name)")
            }

            // 描画安定待ち
            Thread.sleep(forTimeInterval: 3)
            snapshot("\(scenario.out)-\(scenario.name)")

            app.terminate()
        }
    }
}
