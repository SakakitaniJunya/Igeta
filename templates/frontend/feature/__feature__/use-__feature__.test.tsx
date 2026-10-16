// フックのテスト (renderHook)。見た目を描かずに、状態の移り変わりと API の呼び方だけを確かめる。

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../common/lib/api';
import { fakeApi, type FakeApi } from '../../test-support/fake-api';
import { use__Feature__ } from './use-__feature__';

const ITEM = { id: 'a-1', name: 'サンプル', active: true };

function setup(api: FakeApi) {
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => use__Feature__(), { wrapper });
}

describe('use__Feature__', () => {
  it('読み込み中から一覧が読めた状態になる', async () => {
    const { result } = setup(fakeApi({ 'GET /admin/api/__feature__': { status: 200, body: { items: [ITEM] } } }));
    expect(result.current.resource.state).toBe('loading');
    await waitFor(() => expect(result.current.resource).toMatchObject({ state: 'ready', data: { items: [ITEM] } }));
  });

  it('切り替えが成功したら知らせを出して読み直す', async () => {
    const api = fakeApi({
      'GET /admin/api/__feature__': { status: 200, body: { items: [ITEM] } },
      'PUT /admin/api/__feature__/a-1': { status: 200, body: { ...ITEM, active: false } },
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.resource.state).toBe('ready'));

    await act(() => result.current.toggleActive(ITEM));

    expect(result.current.notice).toBe('サンプル を停止しました');
    expect(result.current.failure).toBeNull();
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'GET')).toHaveLength(2));
  });

  it('切り替えが失敗したら失敗を出し、読み直さない', async () => {
    const api = fakeApi({ 'GET /admin/api/__feature__': { status: 200, body: { items: [ITEM] } } });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.resource.state).toBe('ready'));

    await act(() => result.current.toggleActive(ITEM));

    expect(result.current.failure).toBe('保存できませんでした。もう一度お試しください');
    expect(result.current.notice).toBeNull();
    expect(api.calls.filter((c) => c.method === 'GET')).toHaveLength(1);
  });
});
