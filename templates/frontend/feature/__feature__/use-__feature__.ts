// この機能の状態と操作をまとめるフック。読み込み・保存・やり直しはここに書き、見た目 (__Feature__Page.tsx) には書かない。

import { useCallback, useState } from 'react';
import { useApi } from '../../common/lib/api';
import { useResource } from '../../common/lib/use-resource';
import { list__Feature__, update__Feature__, type __Feature__Item } from './__feature__.api';

export function use__Feature__() {
  const api = useApi();
  // 読み込みが重なったときは、最後の要求の結果だけを使う (useResource が面倒を見る)。
  const resource = useResource(() => list__Feature__(api), [api]);
  const { reload } = resource; // reload は変わらない関数。resource そのものは毎回作り直されるので依存に入れない。
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const toggleActive = useCallback(
    async (item: __Feature__Item) => {
      const result = await update__Feature__(api, item.id, { name: item.name, active: !item.active });
      if (!result.ok) {
        setNotice(null);
        setFailure('保存できませんでした。もう一度お試しください');
        return;
      }
      setFailure(null);
      setNotice(item.active ? `${item.name} を停止しました` : `${item.name} を再開しました`);
      reload();
    },
    [api, reload],
  );

  return { resource, notice, failure, toggleActive };
}
