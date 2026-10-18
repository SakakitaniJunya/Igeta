// 画面側の型。dto は知らない (dto → model の変換は infrastructure の mapper)。画面が使う形と、model だけで決まる純関数を置く。

/** 状態。サーバの値は規則 (normalizeStatus) で読み替えてから来る。 */
export type __Feature__Status = 'open' | 'closed';

export interface __Feature__Model {
  readonly id: string;
  readonly name: string;
  readonly status: __Feature__Status;
}

export interface __Feature__ListModel {
  readonly items: ReadonlyArray<__Feature__Model>;
  /** サーバが上限で打ち切ったとき true。 */
  readonly truncated: boolean;
}

/** 入力欄から検証を通った値 (作る元)。 */
export interface __Feature__Draft {
  readonly name: string;
}

/** 一覧の上限。backend の一覧の上限 (100) と同じ値にする。 */
export const LIST_LIMIT = 100;

/** 名称に文字が含まれるものだけ。前後の空白は無視し、空なら全部。 */
export function filterByName(items: ReadonlyArray<__Feature__Model>, query: string): ReadonlyArray<__Feature__Model> {
  const needle = query.trim();
  return needle === '' ? items : items.filter((item) => item.name.includes(needle));
}
