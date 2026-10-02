import SwiftData
import SwiftUI

/// 画面構成の最小例。
/// TODO: docs/person/design/<まとまり>/screens の画面一覧に合わせてタブ・画面を増やす。
/// 画面が増えたら 1 画面 1 ファイルに分割する。
struct RootView: View {
    @Query private var items: [Item]

    var body: some View {
        TabView {
            NavigationStack {
                List(items) { item in
                    Text(item.title)
                }
                .navigationTitle("アイテム")
            }
            .tabItem {
                Label("アイテム", systemImage: "list.bullet")
            }

            Text("設定")
                .tabItem {
                    Label("設定", systemImage: "gearshape")
                }
        }
    }
}

#Preview {
    RootView()
        .modelContainer(for: Item.self, inMemory: true)
}
