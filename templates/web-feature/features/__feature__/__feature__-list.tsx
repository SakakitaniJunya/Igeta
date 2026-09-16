import type { components } from '@app/api-contract';

// 表示用コンポーネント。型は api-contract の生成物のみを使い、手書きの型を置かない。
type __Feature__Item = components['schemas']['__Feature__Item'];

export function __Feature__List({
  items,
}: {
  items: readonly __Feature__Item[];
}): React.ReactElement {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border p-4 shadow-sm">
          {item.name}
        </li>
      ))}
    </ul>
  );
}
