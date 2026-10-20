/** 契約テストと mapper のテストが使う、memo 1 種類の entity・record・Mapper。 */
import { err, ok, unprocessable } from '../index';
import type { FieldFilter, Mapper, Result } from '../index';
import type { ContractState } from './contract-types';

const MAX_TITLE_LENGTH = 40;

/** memo の状態。 */
export type MemoState = 'draft' | 'published';

/** memo の entity。 */
export interface Memo {
  readonly id: string;
  readonly title: string;
  readonly state: MemoState;
}

/** memo の保存の形。 */
export interface MemoRecord {
  readonly title: string;
  readonly state: string;
}

/** memo の絞り込み。state を省くと絞らない。 */
export interface MemoFilter {
  readonly state?: MemoState;
}

function readMemo(id: string, record: MemoRecord): Result<Memo> {
  const { title, state } = record;
  if (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH) return err(unprocessable('memo の title が不正'));
  if (state !== 'draft' && state !== 'published') return err(unprocessable('memo の state が不正'));

  return ok({ id, title, state });
}

/** memo の変換。保存データが不正なら fromRecord は err を返す。 */
export const memoMapper: Mapper<Memo, MemoRecord> = {
  toRecord: ({ title, state }) => ({ title, state }),
  fromRecord: readMemo,
};

/** MemoFilter を保存の項目へ写す。 */
export function memoFilterFields(filter: MemoFilter): FieldFilter {
  return { state: filter.state };
}

/** 契約の状態に対応する memo を作る。 */
export function createMemo(id: string, state: ContractState): Memo {
  if (state === 'draft') return { id, title: '下書き', state: 'draft' };

  return { id, title: '公開', state: 'published' };
}

/** 契約の状態に対応する絞り込みを作る。 */
export function createMemoFilter(state: ContractState): MemoFilter {
  return { state };
}

/** 2 つの memo の title と state が同じなら true。id は比べない。 */
export function isSameMemoContent(left: Memo, right: Memo): boolean {
  return left.title === right.title && left.state === right.state;
}

// 保存先から来た「型に合わない生の値」を再現する。JSON.parse は any を返すので、型付きの関数に閉じ込める
function parseRecord(json: string): MemoRecord {
  return JSON.parse(json);
}

/** 長さの上限を 1 字超える title。 */
export const TITLE_TOO_LONG = 'あ'.repeat(MAX_TITLE_LENGTH + 1);

/** 契約 C9 が使う、不変条件を外した保存データ。キーが malformedKinds になる。 */
export const MALFORMED_MEMO_RECORDS: Readonly<Record<string, MemoRecord>> = {
  'title-too-long': { title: TITLE_TOO_LONG, state: 'draft' },
  'title-not-string': parseRecord('{"title":42,"state":"draft"}'),
  'state-invalid': { title: '下書き', state: 'archived' },
};
