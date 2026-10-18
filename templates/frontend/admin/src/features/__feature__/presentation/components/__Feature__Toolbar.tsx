// 一覧の上の操作。名称での絞り込み (欄の label は「絞り込み」) と追加ボタン。API を呼ばない。入力と押下は呼び出し元へ返す。

import { useBindField } from '@/shared/presentation/bind-field';

export interface __Feature__ToolbarProps {
  readonly query: string;
  readonly disabled?: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onAdd: () => void;
}

export function __Feature__Toolbar({ query, disabled = false, onQueryChange, onAdd }: __Feature__ToolbarProps) {
  const queryRef = useBindField(onQueryChange);
  return (
    <s-stack direction="inline" gap="base" alignItems="end">
      <s-text-field label="絞り込み" value={query} ref={queryRef} />
      <s-button variant="primary" disabled={disabled} onClick={onAdd}>
        追加
      </s-button>
    </s-stack>
  );
}
