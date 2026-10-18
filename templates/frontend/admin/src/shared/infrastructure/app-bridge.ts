// Shopify App Bridge の口。セッショントークンを画面側から差し替えられる形で包む (window.shopify を直に読むのはここだけ)。
// App Bridge は配る側の HTML が script で読む。無い環境 (jsdom) では test-support/fake-app-bridge.ts で差し替える。

export interface AppBridge {
  /** 管理 API の Bearer に付けるセッショントークン。呼ぶたびに取り直す (期限が短い)。 */
  idToken(): Promise<string>;
}

export const appBridge: AppBridge = {
  idToken: () => window.shopify.idToken(),
};

/** gid://shopify/Product/123 の末尾の数字 (API は数字だけの文字列を受ける)。無ければ null。 */
export function numericId(gid: unknown): string | null {
  const match = /(\d+)$/.exec(typeof gid === 'string' ? gid : '');
  return match?.[1] ?? null;
}
