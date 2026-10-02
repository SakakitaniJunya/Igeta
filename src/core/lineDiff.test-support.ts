// テストが共有する、行単位の差分 (テスト本体ではない。`*.test.js` だけが実行される)。

/**
 * 行単位の差分 (git diff と同じ向き): 前にあって後に無い行と、後にあって前に無い行。
 * 並びだけが変わった行も、消えた行と増えた行として出る (項目の並びが動くと差分に出ることを確かめるため)。
 */
export function lineDiff(before: string, after: string): { readonly removed: readonly string[]; readonly added: readonly string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = lcs[i];
      const below = lcs[i + 1];
      if (row === undefined || below === undefined) continue;
      row[j] = a[i] === b[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      removed.push(a[i] ?? '');
      i += 1;
    } else {
      added.push(b[j] ?? '');
      j += 1;
    }
  }
  for (; i < a.length; i += 1) removed.push(a[i] ?? '');
  for (; j < b.length; j += 1) added.push(b[j] ?? '');
  return { removed, added };
}
