// 画面の読み込みの状態 (読み込み中・エラー・読めた) を持つフック。
// 読み込みが重なったときは、最後の要求の結果だけを使う (前の要求の結果が後から届いても捨てる)。
// reload を呼ぶと、読み込み中に戻してから読み直す。

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import type { ApiError, ApiResult } from '@/shared/domain/api';

export type Resource<T> =
  | { readonly state: 'loading'; readonly reload: () => void }
  | { readonly state: 'error'; readonly status: number; readonly error: ApiError | null; readonly reload: () => void }
  | { readonly state: 'ready'; readonly data: T; readonly reload: () => void };

type Loaded<T> = { state: 'loading' } | { state: 'error'; status: number; error: ApiError | null } | { state: 'ready'; data: T };

export function useResource<T>(load: () => Promise<ApiResult<T>>, deps: DependencyList): Resource<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' });
  const [round, setRound] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setLoaded({ state: 'loading' });
    void load().then((result) => {
      if (mine !== seq.current) return;
      setLoaded(result.ok ? { state: 'ready', data: result.body } : { state: 'error', status: result.status, error: result.error });
    });
    // load は呼び出し側が毎回作り直すので、読み直しの合図は deps と round に任せる。
  }, [...deps, round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { ...loaded, reload };
}
