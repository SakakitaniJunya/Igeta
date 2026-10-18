// この feature の書き込み。流れは 確認 (閉じるのときだけ) → 送信中 → 二重送信の防止 → 通知 → 一覧の再取得。楽観の更新はしない。
// 送信中・確認中の操作は受け付けない (2 回目は送らず 'busy')。閉じ済みは送らず 'blocked'。
// 失敗は failure に残す。入力欄の文字は画面 (Form) が持つので、ここでは消さない。

import { useCallback, useRef, useState } from 'react';
import { closeConfirmText, NOTICE, type CloseConfirmText } from '@/features/__feature__/application/messages';
import type { __Feature__Draft, __Feature__Model } from '@/features/__feature__/domain/__feature__.model';
import { canClose } from '@/features/__feature__/domain/__feature__.rules';
import { close__Feature__, create__Feature__ } from '@/features/__feature__/infrastructure/__feature__.endpoint';
import { toCreateRequest } from '@/features/__feature__/infrastructure/__feature__.mapper';
import { useApi } from '@/shared/application/use-api';
import type { ApiError, ApiResult } from '@/shared/domain/api';

/** done = 送って受け付けられた / failed = 送ったが失敗 / cancelled = 確認でやめた / busy = 送信中か確認中なので何もしなかった / blocked = 規則で操作できない (送らない) */
export type MutationOutcome = 'done' | 'failed' | 'cancelled' | 'busy' | 'blocked';

export interface MutationFailure {
  readonly error: ApiError | null;
}

interface Step {
  readonly confirm?: CloseConfirmText;
  readonly send: () => Promise<ApiResult<unknown>>;
  readonly success: string;
}

/** onChanged は成功のあとに 1 回呼ぶ (一覧の再取得を渡す)。 */
export function use__Feature__Mutation(onChanged: () => void) {
  const api = useApi();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [confirmation, setConfirmation] = useState<CloseConfirmText | null>(null);
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

  const run = useCallback(async (step: Step): Promise<MutationOutcome> => {
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

  const create = useCallback(
    (draft: __Feature__Draft): Promise<MutationOutcome> => {
      const body = toCreateRequest(draft);
      return run({ send: () => create__Feature__(api, body), success: NOTICE.created(draft.name) });
    },
    [api, run],
  );

  /** 閉じる。開いているものだけ、確認のあとに送る。 */
  const close = useCallback(
    (item: __Feature__Model): Promise<MutationOutcome> => {
      if (!canClose(item.status)) return Promise.resolve('blocked');
      return run({ confirm: closeConfirmText(item.name), send: () => close__Feature__(api, item.id), success: NOTICE.closed(item.name) });
    },
    [api, run],
  );

  const dismiss = useCallback(() => {
    setNotice(null);
    setFailure(null);
  }, []);

  return { saving, notice, failure, confirmation, answer, create, close, dismiss };
}
