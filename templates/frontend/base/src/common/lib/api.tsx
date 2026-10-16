// 管理 API の呼び出し。App Bridge のセッショントークンを Bearer に付ける。
// 401 が返ったらトークンを取り直して 1 回だけ再送する。失敗しても投げず、結果の形で返す。

import { createContext, useContext, type ReactNode } from 'react';

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
  put<T>(path: string, body?: unknown): Promise<ApiResult<T>>;
}

function withQuery(path: string, query: Query | undefined): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? path : `${path}?${text}`;
}

function errorOf(data: unknown): ApiError | null {
  if (data === null || typeof data !== 'object' || !('error' in data)) return null;
  const error = (data as { error: unknown }).error;
  return error !== null && typeof error === 'object' ? (error as ApiError) : null;
}

export function createApi(getToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = await getToken();
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        const init: RequestInit = { method, headers };
        if (body !== undefined) {
          headers['content-type'] = 'application/json';
          init.body = JSON.stringify(body);
        }
        const response = await fetchImpl(path, init);
        if (response.status === 401 && attempt === 0) continue;
        let data: unknown = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        return response.ok
          ? { ok: true, status: response.status, body: data as T }
          : { ok: false, status: response.status, error: errorOf(data) };
      }
    } catch {
      return { ok: false, status: 0, error: null };
    }
    return { ok: false, status: 401, error: null };
  }

  return {
    get: (path, query) => request('GET', withQuery(path, query)),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
  };
}

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { readonly api: Api; readonly children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (api === null) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
