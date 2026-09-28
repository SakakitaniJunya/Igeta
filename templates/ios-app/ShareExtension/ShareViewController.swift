import UIKit
import UniformTypeIdentifiers

/// 共有シートから URL / Web ページを受け取り、App Group の UserDefaults へ書き込んで本体アプリへ渡す最小実装。
/// 本体アプリ側は同じグループ ID・キーで `UserDefaults(suiteName:)` から読み出す。
/// TODO: 受け取った値の保存先 (SwiftData 等)・完了時の UI は設計書に合わせて実装する。
final class ShareViewController: UIViewController {
    private let appGroupID = "group.__BUNDLE_PREFIX__.app"
    private let sharedURLKey = "sharedURL"

    override func viewDidLoad() {
        super.viewDidLoad()
        handleSharedContent()
    }

    private func handleSharedContent() {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        guard let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
        }) else {
            complete()
            return
        }
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
            if let url = item as? URL {
                self?.save(url)
            } else if let string = item as? String, let url = URL(string: string) {
                self?.save(url)
            }
            self?.complete()
        }
    }

    private func save(_ url: URL) {
        UserDefaults(suiteName: appGroupID)?.set(url.absoluteString, forKey: sharedURLKey)
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
