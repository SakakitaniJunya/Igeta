// 管理 API の型 (型だけ)。呼び出しの実装は shared/infrastructure/create-api.ts。

/** 管理 API の失敗の本文 `{ ok: false, error: { code, message, details? } }` の error。 */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: ReadonlyArray<unknown>;
}

/** status 0 は、通信できなかった・トークンが取れなかった。error は応答の `error` (無ければ null)。 */
export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly body: T }
  | { readonly ok: false; readonly status: number; readonly error: ApiError | null };

export type Query = Readonly<Record<string, string | number | null | undefined>>;

export interface Api {
  get<T>(path: string, query?: Query): Promise<ApiResult<T>>;
  post<T>(path: string, body?: unknown): Promise<ApiResult<T>>;
}
