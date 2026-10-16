// presentation 層が共通で使う HTTP 応答の形。フレームワーク依存を持たない (プレーンオブジェクト)。

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  /** 追加のヘッダ (例: 429 の retry-after)。省くと content-type だけ。 */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly detail?: unknown };
}

export function errorResponse(status: number, code: string, message: string, detail?: unknown): HttpResponse {
  const error: ErrorBody['error'] = detail === undefined ? { code, message } : { code, message, detail };
  return { status, body: { error } };
}
