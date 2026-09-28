import Foundation
import SwiftData

/// 永続化モデルの例。
/// TODO: docs/design/basic/tables のテーブル定義に合わせて属性・リレーションを書き換える。
/// モデルが増えたら 1 モデル 1 ファイルに分割する。
@Model
final class Item {
    var title: String
    var createdAt: Date

    init(title: String, createdAt: Date = .now) {
        self.title = title
        self.createdAt = createdAt
    }
}
