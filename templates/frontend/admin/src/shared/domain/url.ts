// URL の値の道具。search (?k=v) を引き継いで path を組む。上書きは同じ名前を差し替え、null は外す。
// path は検索部 (?…) を含めない。

export function withSearch(path: string, search: string, overrides: Readonly<Record<string, string | null>> = {}): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text === '' ? path : `${path}?${text}`;
}
