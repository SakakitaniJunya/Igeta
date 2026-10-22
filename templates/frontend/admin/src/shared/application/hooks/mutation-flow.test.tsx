// 書き込みの流れのテスト: 確認なしは送って通知と再取得・確認でやめると送らない・確認の最中の 2 回目は busy・失敗は failure に残り再取得しない・成功で前の失敗が消える・dismiss。

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMutationFlow, type FlowStep } from '@/shared/application/hooks/mutation-flow';
import type { ApiResult } from '@/shared/domain/api';

const OK: ApiResult<unknown> = { ok: true, status: 200, body: {} };
const NG: ApiResult<unknown> = { ok: false, status: 409, error: { code: 'CONFLICT', message: 'x' } };
const CONFIRM = { heading: '確認', message: 'm', confirmLabel: '実行' };

function setup() {
  const onChanged = vi.fn();
  const hook = renderHook(() => useMutationFlow(onChanged));
  return { ...hook, onChanged };
}

const step = (result: ApiResult<unknown>, extra: Partial<FlowStep> = {}) => ({ send: vi.fn(async () => result), success: '済み', ...extra });

describe('useMutationFlow', () => {
  it('確認なしなら送って通知し、再取得を 1 回呼ぶ', async () => {
    const { result, onChanged } = setup();
    const s = step(OK);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.run(s);
    });
    expect(outcome).toBe('done');
    expect(s.send).toHaveBeenCalledOnce();
    expect(result.current.notice).toBe('済み');
    expect(result.current.saving).toBe(false);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('確認でやめると送らない', async () => {
    const { result, onChanged } = setup();
    const s = step(OK, { confirm: CONFIRM });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(s);
    });
    await waitFor(() => expect(result.current.confirmation).toEqual(CONFIRM));
    act(() => result.current.answer(false));
    expect(await pending).toBe('cancelled');
    expect(s.send).not.toHaveBeenCalled();
    expect(result.current.confirmation).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('確認の最中の 2 回目は送らず busy。確定すると 1 回だけ送る', async () => {
    const { result } = setup();
    const s = step(OK, { confirm: CONFIRM });
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.run(s);
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());
    let second: unknown;
    await act(async () => {
      second = await result.current.run(step(OK));
    });
    expect(second).toBe('busy');
    await act(async () => {
      result.current.answer(true);
      expect(await first).toBe('done');
    });
    expect(s.send).toHaveBeenCalledOnce();
  });

  it('失敗は failure に残し、通知も再取得もしない。次の成功で failure が消える', async () => {
    const { result, onChanged } = setup();
    await act(async () => {
      expect(await result.current.run(step(NG))).toBe('failed');
    });
    expect(result.current.failure).toEqual({ error: { code: 'CONFLICT', message: 'x' } });
    expect(result.current.notice).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.run(step(OK));
    });
    expect(result.current.failure).toBeNull();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('dismiss で通知と失敗が消える', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.run(step(OK));
    });
    expect(result.current.notice).toBe('済み');
    act(() => result.current.dismiss());
    expect(result.current.notice).toBeNull();
  });
});
