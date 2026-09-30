// 由来・鮮度の「主体」(capturedBy/acceptedBy/CLI の --by) を比較する前の正規化。
// self-approved (作る主体と裁く主体を分ける) の判定が、書式の違い (前後の空白・大文字小文字・
// 全角/半角) だけで一致しなかった/一致してしまったりしないようにする。
// capture・accept は保存時にもこの正規化をかけた形で書く (04-provenance-and-agreement.md §9)。
//
// 別名 (同じ主体が違う名乗りをする。例: `reviewer@example.com` と `reviewer` を同じ人が使う) は
// 機械で見抜けない — ここで正規化するのは表記の揺れだけで、身元の同一性の判定ではない。

export function normalizeActor(name: string): string {
  return name.trim().toLowerCase().normalize('NFKC');
}
