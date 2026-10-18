// テスト用の偽の管理 API。`'メソッド パス'` ごとに応答を決めておき、呼ばれた要求を calls に残す。
// 決めていない要求は 404。パスはクエリを除いて照合し、クエリは calls の query に残す。

import type { Api, ApiResult, Query } from '@/shared/domain/api';

export interface FakeResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly query?: Query;
}

export type FakeApi = Api & { readonly calls: FakeCall[] };

export function fakeApi(responses: Readonly<Record<string, FakeResponse>> = {}): FakeApi {
  const calls: FakeCall[] = [];

  function respond<T>(method: string, path: string): Promise<ApiResult<T>> {
    const found = responses[`${method} ${path}`] ?? { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'no fake' } } };
    if (found.status >= 200 && found.status < 300) {
      return Promise.resolve({ ok: true, status: found.status, body: found.body as T });
    }
    const body = found.body as { error?: { code: string; message: string } } | null;
    return Promise.resolve({ ok: false, status: found.status, error: body?.error ?? null });
  }

  return {
    calls,
    get: (path, query) => {
      calls.push(query === undefined ? { method: 'GET', path } : { method: 'GET', path, query });
      return respond('GET', path);
    },
    post: (path, body) => {
      calls.push({ method: 'POST', path, body });
      return respond('POST', path);
    },
  };
}
