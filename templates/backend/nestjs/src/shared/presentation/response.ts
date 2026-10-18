// HTTP 応答の形。フレームワークを知らないプレーンオブジェクト。module の controller が返し、entries が実際の応答にする。

export interface HttpResponse {
  readonly status: number;
  /** undefined なら本文なし (204 など)。 */
  readonly body: unknown;
  /** 追加のヘッダ (例: 429 の retry-after)。省くと content-type だけ。 */
  readonly headers?: Readonly<Record<string, string>>;
}
