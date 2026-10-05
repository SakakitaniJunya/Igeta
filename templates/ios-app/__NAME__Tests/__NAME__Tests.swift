import XCTest
@testable import __NAME__

final class __NAME__Tests: XCTestCase {

    /// 常に通るサンプル。雛形のビルド・テスト配線が正しいかの確認用。
    func testExample() {
        XCTAssertEqual(2 + 2, 4)
    }

    // MARK: - テストの書き方 (抽出系ロジックの例)
    //
    // View や Model からテスト可能な純粋関数・型へロジックを抽出し、
    // 設計書 (docs/person/design/<まとまり>/flows 等) の振る舞い単位でテストを書く。
    //
    // 例: URL 文字列を正規化するロジックを `SharedURLParser` に抽出した場合
    //
    //     func testParse_前後の空白を除去してURLを返す() {
    //         XCTAssertEqual(
    //             SharedURLParser.parse("  https://example.com  "),
    //             URL(string: "https://example.com")
    //         )
    //     }
    //
    //     func testParse_不正な文字列はnilを返す() {
    //         XCTAssertNil(SharedURLParser.parse("not a url"))
    //     }
}
