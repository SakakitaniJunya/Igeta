/** 契約テストと mapper のテストが使う、memo 1 種類の entity・record・Mapper。 */
import type { FieldFilter } from '#core/query/field-filter';
import { unprocessable } from '#core/result/app-error';
import { err, ok } from '#core/result/result';
import type { Result } from '#core/result/result';
import type { Mapper } from '#core/repository/mapper';
import type { ContractFixtures, ContractOptionalField, ContractState } from '#testing/contract/types';

const MAX_TITLE_LENGTH = 40;

/** memo の状態。 */
export type MemoState = 'draft' | 'published';

/** memo の entity。 */
export interface Memo {
  readonly id: string;
  readonly title: string;
  readonly state: MemoState;
  /** 任意の項目。無いときは項目ごと無い。 */
  readonly note?: string;
}

/** memo の保存の形。 */
export interface MemoRecord {
  readonly title: string;
  readonly state: string;
  /** 書くときは undefined でよい (null で保存される)。読むときは、消した項目が null で入る。 */
  readonly note: string | null | undefined;
}

/** memo の絞り込み。省いた項目は絞らない。note に null を指定すると、note が無い memo だけ取る。 */
export interface MemoFilter {
  readonly state?: MemoState;
  readonly note?: null;
}

function readMemo(id: string, record: MemoRecord): Result<Memo> {
  const { title, state, note } = record;
  if (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH) return err(unprocessable('memo の title が不正'));
  if (state !== 'draft' && state !== 'published') return err(unprocessable('memo の state が不正'));
  if (note === undefined || note === null) return ok({ id, title, state });
  if (typeof note !== 'string') return err(unprocessable('memo の note が不正'));

  return ok({ id, title, state, note });
}

/** memo の変換。保存データが不正なら fromRecord は err を返す。 */
export const memoMapper: Mapper<Memo, MemoRecord> = {
  toRecord: ({ title, state, note }) => ({ title, state, note }),
  fromRecord: readMemo,
};

/** MemoFilter を保存の項目へ写す。 */
export function memoFilterFields(filter: MemoFilter): FieldFilter {
  return { state: filter.state, note: filter.note };
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

/** 2 つの memo の title・state・note が同じなら true。id は比べない。 */
export function isSameMemoContent(left: Memo, right: Memo): boolean {
  return left.title === right.title && left.state === right.state && left.note === right.note;
}

function removeNote(memo: Memo): Memo {
  const { id, title, state } = memo;

  return { id, title, state };
}

/** 契約 C11・C12 に渡す、memo の任意の項目 (note) の扱い。 */
export const memoOptionalField: ContractOptionalField<Memo, MemoFilter> = {
  withValue: (memo) => ({ ...memo, note: 'メモ' }),
  withoutValue: removeNote,
  hasValue: (memo) => memo.note !== undefined,
  filterWithoutValue: () => ({ note: null }),
};

/** 契約に渡す memo の fixture 一式。 */
export const memoContractFixtures: ContractFixtures<Memo, MemoFilter> = {
  createEntity: createMemo,
  filterByState: createMemoFilter,
  isSameContent: isSameMemoContent,
  optional: memoOptionalField,
};

// 保存先から来た「型に合わない生の値」を再現する。JSON.parse は any を返すので、型付きの関数に閉じ込める
function parseRecord(json: string): MemoRecord {
  return JSON.parse(json);
}

/** 長さの上限を 1 字超える title。 */
export const TITLE_TOO_LONG = 'あ'.repeat(MAX_TITLE_LENGTH + 1);

/** 契約 C9 が使う、不変条件を外した保存データ。キーが malformedKinds になる。 */
export const MALFORMED_MEMO_RECORDS: Readonly<Record<string, MemoRecord>> = {
  'title-too-long': { title: TITLE_TOO_LONG, state: 'draft', note: null },
  'title-not-string': parseRecord('{"title":42,"state":"draft","note":null}'),
  'state-invalid': { title: '下書き', state: 'archived', note: null },
};
