// この feature の書き込み。流れは 確認 (閉じるのときだけ) → 送信中 → 二重送信の防止 → 通知 → 一覧の再取得 (共通部は shared の useMutationFlow)。楽観の更新はしない。
// 送信中・確認中の操作は受け付けない (2 回目は送らず 'busy')。閉じ済みは送らず 'blocked'。
// 失敗は failure に残す。入力欄の文字は画面 (Form) が持つので、ここでは消さない。

import { useCallback } from 'react';
import { closeConfirmText, NOTICE } from '@/features/__feature__/application/messages';
import type { __Feature__Draft, __Feature__Model } from '@/features/__feature__/domain/model';
import { canClose } from '@/features/__feature__/domain/rules';
import { close__Feature__, create__Feature__ } from '@/features/__feature__/infrastructure/endpoint';
import { toCreateRequest } from '@/features/__feature__/infrastructure/mapper';
import { useApi } from '@/shared/application/hooks/api';
import { useMutationFlow, type FlowOutcome } from '@/shared/application/hooks/mutation-flow';

/** 流れの結果 (done・failed・cancelled・busy) に、blocked = 規則で操作できない (送らない) を足す。 */
export type MutationOutcome = FlowOutcome | 'blocked';

/** onChanged は成功のあとに 1 回呼ぶ (一覧の再取得を渡す)。流れは shared の useMutationFlow、ここは作る・閉じるの手順だけ。 */
export function use__Feature__Mutation(onChanged: () => void) {
  const api = useApi();
  const { run, ...flow } = useMutationFlow(onChanged);

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

  return { ...flow, create, close };
}
