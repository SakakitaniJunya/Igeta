// 書き込みの流れ (共通)。feature は 1 手順 (step) を渡すだけにする。
//   確認 (やめるなら送らない) → 送信中 (saving) → 二重送信の防止 → 通知 (notice / failure) → 再取得 (onChanged)
//   - 楽観更新はしない。サーバが受けてから通知し、一覧は再取得して直す
//   - 送信中・確認中の操作は 1 つだけ。2 回目は送らず 'busy' を返す
//   - 失敗しても入力は消さない。failure を出してやり直せる

import { useCallback, useRef, useState } from 'react';
import type { ApiError, ApiResult } from '@/shared/domain/api';

/** 確認ダイアログの文。presentation の ConfirmRequest と同じ形 (application は presentation を知らないので、型は構造で合わせる)。 */
export interface FlowConfirm {
  readonly heading: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly tone?: 'critical' | 'auto';
}

export interface FlowStep {
  readonly confirm?: FlowConfirm;
  readonly send: () => Promise<ApiResult<unknown>>;
  /** 成功の通知の文。 */
  readonly success: string;
}

/** done = 送って受け付けられた / failed = 送ったが失敗 / cancelled = 確認でやめた / busy = 送信中か確認中なので何もしなかった */
export type FlowOutcome = 'done' | 'failed' | 'cancelled' | 'busy';

export interface FlowFailure {
  readonly error: ApiError | null;
}

/** onChanged は成功のあとに 1 回呼ぶ (一覧の再取得を渡す)。 */
export function useMutationFlow(onChanged: () => void) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [confirmation, setConfirmation] = useState<FlowConfirm | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const answer = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  }, []);

  const run = useCallback(async (step: FlowStep): Promise<FlowOutcome> => {
    if (inFlight.current) return 'busy';
    inFlight.current = true;
    try {
      const ask = step.confirm;
      if (ask !== undefined) {
        const confirmed = await new Promise<boolean>((resolve) => {
          pending.current = resolve;
          setConfirmation(ask);
        });
        if (!confirmed) return 'cancelled';
      }
      setSaving(true);
      setNotice(null);
      setFailure(null);
      const result = await step.send();
      if (!result.ok) {
        setFailure({ error: result.error });
        return 'failed';
      }
      setNotice(step.success);
      changed.current();
      return 'done';
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  /** 通知と失敗を消す (入力の画面を開く・閉じるとき)。 */
  const dismiss = useCallback(() => {
    setNotice(null);
    setFailure(null);
  }, []);

  return { saving, notice, failure, confirmation, answer, run, dismiss };
}
