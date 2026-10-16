// この機能の中だけで使う部品。2 つ以上の機能で使うようになったら common/ui/ へ出す。
// API を呼ばない。受け取った値を出し、操作は呼び出し元へ返す。

import type { __Feature__Item } from '../__feature__.api';

export function __Feature__Row({ item, onToggle }: { readonly item: __Feature__Item; readonly onToggle: (item: __Feature__Item) => void }) {
  return (
    <s-table-row>
      <s-table-cell>{item.name}</s-table-cell>
      <s-table-cell>{item.active ? <s-badge tone="success">使用中</s-badge> : <s-badge>停止</s-badge>}</s-table-cell>
      <s-table-cell>
        <s-button tone={item.active ? 'critical' : 'auto'} onClick={() => onToggle(item)}>
          {item.active ? '停止' : '再開'}
        </s-button>
      </s-table-cell>
    </s-table-row>
  );
}
