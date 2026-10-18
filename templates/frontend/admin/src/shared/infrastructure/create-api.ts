// 管理 API の呼び出し。App Bridge のセッショントークンを Bearer に付ける。
// 401 が返ったらトークンを取り直して 1 回だけ再送する。失敗しても投げず、結果の形で返す。

import type { Api, ApiError, ApiResult, Query } from '@/shared/domain/api';

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
      // 最終回 (attempt 1) は 401 でも結果を返す。ループの最終回が唯一の出口。
      for (let attempt = 0; ; attempt += 1) {
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
  }

  return {
    get: (path, query) => request('GET', withQuery(path, query)),
    post: (path, body) => request('POST', path, body),
  };
}
