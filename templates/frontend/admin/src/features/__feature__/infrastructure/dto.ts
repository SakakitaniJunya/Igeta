// 要求と応答の型 (DTO)。管理 API の形をそのまま写す。値を足す・変えるときは API 仕様を先に直す。
// 画面 (presentation) も domain も直接使わない。変換は mapper が担う。型だけなので、テストは無い。

export interface __Feature__Dto {
  readonly id: string;
  readonly name: string;
  /** サーバが新しい値を足すことがあるので string。意味づけは domain の規則 (normalizeStatus) が持つ。 */
  readonly status: string;
}

/** 一覧の応答 `{ ok: true, items, truncated }` の本文。ok は読まない (成功は HTTP の状態で見分ける)。 */
export interface __Feature__ListDto {
  readonly items: ReadonlyArray<__Feature__Dto>;
  /** サーバが上限で打ち切ったとき true。 */
  readonly truncated: boolean;
}

/** 作る・閉じるの応答 `{ ok: true, item }` の本文。 */
export interface __Feature__ItemDto {
  readonly item: __Feature__Dto;
}

/** 作る (POST) の本文。 */
export interface __Feature__CreateDto {
  readonly name: string;
}
