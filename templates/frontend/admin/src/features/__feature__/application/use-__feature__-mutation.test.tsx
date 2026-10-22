// 書き込みの流れのテスト: 確認でやめると送らない・確認の最中の 2 回目は送らない (busy)・閉じ済みは送らない (blocked)・
// 成功は通知と再取得・失敗は failure に残り再取得しない・作るは名称だけを送る。

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { use__Feature__Mutation } from '@/features/__feature__/application/use-__feature__-mutation';
import { dtoFixture, modelFixture } from '@/features/__feature__/test-support/__feature__.fixtures';
import { ApiProvider } from '@/shared/application/hooks/api';
import type { Api } from '@/shared/domain/api';
import { fakeApi, type FakeApi } from '@/shared/test-support/fake-api';

const OPEN = modelFixture();
const CLOSED = modelFixture({ id: 'b-2', name: '見本B', status: 'closed' });
const CLOSE = 'POST /admin/api/__feature__/a-1/close';
const CREATE = 'POST /admin/api/__feature__';
const ITEM = dtoFixture();

function setup(api: Api) {
  const onChanged = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(() => use__Feature__Mutation(onChanged), { wrapper });
  return { ...hook, onChanged };
}

const posts = (api: FakeApi) => api.calls.filter((c) => c.method === 'POST');

describe('use__Feature__Mutation', () => {
  it('確認でやめると送らない', async () => {
    const api = fakeApi({ [CLOSE]: { status: 200, body: { ok: true, item: ITEM } } });
    const { result, onChanged } = setup(api);
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.close(OPEN);
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());
    act(() => result.current.answer(false));
    expect(await pending).toBe('cancelled');
    expect(posts(api)).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('確認で確定すると閉じて通知し、一覧を読み直す', async () => {
    const api = fakeApi({ [CLOSE]: { status: 200, body: { ok: true, item: ITEM } } });
    const { result, onChanged } = setup(api);
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.close(OPEN);
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());
    await act(async () => {
      result.current.answer(true);
      expect(await pending).toBe('done');
    });
    expect(posts(api)).toEqual([{ method: 'POST', path: '/admin/api/__feature__/a-1/close', body: undefined }]);
    expect(result.current.notice).toBe('見本 を終了しました');
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('確認の最中の 2 回目は送らず busy を返す', async () => {
    const api = fakeApi({ [CLOSE]: { status: 200, body: { ok: true, item: ITEM } } });
    const { result } = setup(api);
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.close(OPEN);
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());
    let second: unknown;
    await act(async () => {
      second = await result.current.close(OPEN);
    });
    expect(second).toBe('busy');
    await act(async () => {
      result.current.answer(true);
      expect(await first).toBe('done');
    });
    expect(posts(api)).toHaveLength(1);
  });

  it('閉じ済みは確認も送信もせず blocked', async () => {
    const api = fakeApi();
    const { result } = setup(api);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.close(CLOSED);
    });
    expect(outcome).toBe('blocked');
    expect(api.calls).toHaveLength(0);
    expect(result.current.confirmation).toBeNull();
  });

  it('失敗は failure に残し、一覧は読み直さない。閉じ済みの code は文として届く', async () => {
    const api = fakeApi({ [CLOSE]: { status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'x' } } } });
    const { result, onChanged } = setup(api);
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.close(OPEN);
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());
    await act(async () => {
      result.current.answer(true);
      expect(await pending).toBe('failed');
    });
    expect(result.current.failure).toEqual({ error: { code: 'CONFLICT', message: 'x' } });
    expect(result.current.notice).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('作るは名称だけを送り、成功なら通知して読み直す', async () => {
    const api = fakeApi({ [CREATE]: { status: 201, body: { ok: true, item: ITEM } } });
    const { result, onChanged } = setup(api);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.create({ name: '見本' });
    });
    expect(outcome).toBe('done');
    expect(posts(api)).toEqual([{ method: 'POST', path: '/admin/api/__feature__', body: { name: '見本' } }]);
    expect(result.current.notice).toBe('見本 を登録しました');
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('作るが失敗したら failure に残し、読み直さない。dismiss で消える', async () => {
    const api = fakeApi({ [CREATE]: { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } } });
    const { result, onChanged } = setup(api);
    await act(async () => {
      expect(await result.current.create({ name: '見本' })).toBe('failed');
    });
    expect(result.current.failure).toEqual({ error: { code: 'INTERNAL', message: 'x' } });
    expect(onChanged).not.toHaveBeenCalled();
    act(() => result.current.dismiss());
    expect(result.current.failure).toBeNull();
  });
});
