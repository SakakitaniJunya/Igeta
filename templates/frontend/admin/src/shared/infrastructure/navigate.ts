// 画面の中の移動 (history API)。埋め込みの引数 (?host= など) は引き継ぐ。ページの読み込み直しはしない。
// 描き直しは subscribe で購読する (App が使う)。

import { withSearch } from '@/shared/domain/url';

export interface NavigateOptions {
  /** true なら履歴を増やさず今の位置を置き換える。 */
  readonly replace?: boolean;
}

const listeners = new Set<() => void>();

/** path は検索部 (?…) を含めない。今の location.search を付けて移る。 */
export function navigate(path: string, options?: NavigateOptions): void {
  const target = withSearch(path, window.location.search);
  if (options?.replace === true) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  for (const listener of [...listeners]) listener();
}

/** 移動と戻る・進むのとき listener を呼ぶ。返すのは購読を外す関数。 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/** 今の URL の path。 */
export function currentPath(): string {
  return window.location.pathname;
}
