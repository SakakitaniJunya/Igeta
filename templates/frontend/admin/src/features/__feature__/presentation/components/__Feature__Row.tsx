// 一覧の 1 行。受け取った値を文字として出し (HTML として差し込まない)、閉じるの操作は呼び出し元へ返す。API を呼ばない。
// 閉じ済み (と未知の状態) は操作できないので、ボタンに disabled の印を付ける。

import type { __Feature__Model } from '@/features/__feature__/domain/model';
import { canClose } from '@/features/__feature__/domain/rules';
import { STATUS_BADGE } from '@/features/__feature__/application/messages';
import { StatusBadge } from '@/shared/presentation/ui/label/StatusBadge';

export interface __Feature__RowProps {
  readonly item: __Feature__Model;
  /** 送信中など、操作を受けないとき。 */
  readonly disabled?: boolean;
  readonly onClose: (item: __Feature__Model) => void;
}

export function __Feature__Row({ item, disabled = false, onClose }: __Feature__RowProps) {
  const locked = disabled || !canClose(item.status);
  return (
    <s-table-row>
      <s-table-cell>{item.name}</s-table-cell>
      <s-table-cell>{item.id}</s-table-cell>
      <s-table-cell>
        <StatusBadge {...STATUS_BADGE[item.status]} />
      </s-table-cell>
      <s-table-cell>
        <s-button disabled={locked} tone="critical" onClick={() => onClose(item)}>
          終了
        </s-button>
      </s-table-cell>
    </s-table-row>
  );
}
