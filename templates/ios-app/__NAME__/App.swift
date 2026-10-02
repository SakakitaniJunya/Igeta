import SwiftData
import SwiftUI

@main
struct __NAME__App: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        // TODO: 永続化するモデルを設計書 (docs/ai/specs/<まとまり>/tables) に合わせて列挙する。
        .modelContainer(for: Item.self)
    }
}
