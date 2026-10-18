import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApiResult } from '@/shared/domain/api';
import { useResource } from '@/shared/application/use-resource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useResource', () => {
  it('読み込み中から、読めたら ready', async () => {
    const { result } = renderHook(() => useResource(async (): Promise<ApiResult<number>> => ({ ok: true, status: 200, body: 7 }), []));
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ state: 'ready', data: 7 }));
  });

  it('失敗は error と状態の番号', async () => {
    const { result } = renderHook(() => useResource(async (): Promise<ApiResult<number>> => ({ ok: false, status: 500, error: null }), []));
    await waitFor(() => expect(result.current).toMatchObject({ state: 'error', status: 500 }));
  });

  it('reload で読み込み中に戻して読み直す', async () => {
    let count = 0;
    const { result } = renderHook(() => useResource(async (): Promise<ApiResult<number>> => ({ ok: true, status: 200, body: (count += 1) }), []));
    await waitFor(() => expect(result.current).toMatchObject({ state: 'ready', data: 1 }));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current).toMatchObject({ state: 'ready', data: 2 }));
  });

  it('重なったら最後の要求の結果だけを使う (前の結果が後から届いても捨てる)', async () => {
    const first = deferred<ApiResult<string>>();
    const second = deferred<ApiResult<string>>();
    const pending = [first, second];
    const { result } = renderHook(() => useResource(() => pending.shift()!.promise, []));
    act(() => result.current.reload());
    await act(async () => second.resolve({ ok: true, status: 200, body: 'new' }));
    await act(async () => first.resolve({ ok: true, status: 200, body: 'old' }));
    expect(result.current).toMatchObject({ state: 'ready', data: 'new' });
  });
});
