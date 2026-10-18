// 一覧の取得のテスト: 読み込み中 → 読めた (dto が model に変わって届く) / エラー、再取得は読み込み中に戻り GET が増える、失敗の後の再取得で読める。

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { use__Feature__ } from '@/features/__feature__/application/use-__feature__';
import { ApiProvider } from '@/shared/application/use-api';
import { fakeApi, type FakeApi, type FakeResponse } from '@/shared/test-support/fake-api';

const GET = 'GET /admin/api/__feature__';
const LIST = { items: [{ id: 'a-1', name: '茅野', status: 'open' }], truncated: false };

function setup(api: FakeApi) {
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => use__Feature__(), { wrapper });
}

const gets = (api: FakeApi) => api.calls.filter((c) => c.method === 'GET').length;

describe('use__Feature__', () => {
  it('読み込み中から、読めた状態になり、応答は画面の値になる', async () => {
    const api = fakeApi({ [GET]: { status: 200, body: { ...LIST, items: [...LIST.items, { id: 'b-2', name: '伊那', status: 'unknown' }] } } });
    const { result } = setup(api);
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current).toMatchObject({
      data: {
        items: [
          { id: 'a-1', name: '茅野', status: 'open' },
          { id: 'b-2', name: '伊那', status: 'closed' },
        ],
        truncated: false,
      },
    });
    expect(gets(api)).toBe(1);
  });

  it('失敗したら error と状態の番号になる', async () => {
    const { result } = setup(fakeApi({ [GET]: { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } } }));
    await waitFor(() => expect(result.current).toMatchObject({ state: 'error', status: 500 }));
  });

  it('再取得は読み込み中に戻り、GET が 1 回増えて、読み直した結果になる', async () => {
    const responses: Record<string, FakeResponse> = { [GET]: { status: 200, body: LIST } };
    const api = fakeApi(responses);
    const { result } = setup(api);
    await waitFor(() => expect(result.current.state).toBe('ready'));

    responses[GET] = { status: 200, body: { items: [], truncated: false } };
    act(() => result.current.reload());
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ state: 'ready', data: { items: [] } }));
    expect(gets(api)).toBe(2);
  });

  it('失敗の後の再取得も、読み込み中に戻り GET が増え、読めれば ready になる', async () => {
    const responses: Record<string, FakeResponse> = { [GET]: { status: 500, body: null } };
    const api = fakeApi(responses);
    const { result } = setup(api);
    await waitFor(() => expect(result.current.state).toBe('error'));

    responses[GET] = { status: 200, body: LIST };
    act(() => result.current.reload());
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(gets(api)).toBe(2);
  });
});
