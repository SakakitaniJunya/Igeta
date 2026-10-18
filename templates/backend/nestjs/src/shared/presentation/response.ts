// presentation 層が共通で使う HTTP 応答の形。フレームワーク依存を持たない (プレーンオブジェクト)。
// 失敗の本文を作るのは api-response.ts だけ。

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  /** 追加のヘッダ (例: 429 の retry-after)。省くと content-type だけ。 */
  readonly headers?: Readonly<Record<string, string>>;
}
