// 入力の検証 (手書きの小関数)。入力欄の文字 → 検証済みの値 (Draft)。Form が呼ぶ。
// サーバの検証 (本文の規則) と同じ範囲にする。範囲を変えるときは両方を同時に直す。

import type { __Feature__Draft } from '@/features/__feature__/domain/model';
import { collectFields, parseTextInput } from '@/shared/domain/field-parse';

export const NAME_MAX = 40;

export type __Feature__Validated =
  | { readonly ok: true; readonly value: __Feature__Draft }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> };

/** 通れば値を、通らなければ誤りの文を全部返す。 */
export function validate__Feature__Form(text: { readonly name: string }): __Feature__Validated {
  return collectFields({ name: parseTextInput(text.name, { label: '名称', min: 1, max: NAME_MAX }) });
}
