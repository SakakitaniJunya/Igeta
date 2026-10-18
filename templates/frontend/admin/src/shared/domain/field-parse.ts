// 入力欄の文字を値にする道具と、誤りの集約。React も DOM も知らない純関数。
//   parseIntegerInput / parseTextInput: 1 項目の文字 → 値。誤りは「どの項目をどう直すか」の文にして返す
//   collectFields: 複数項目を 1 度に見て、誤りがあれば全部の文を返す (1 つ直すたびに次の誤りが出る、を避ける)

export type FieldResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface IntegerRule {
  /** 誤りの文に出す項目名。 */
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/** 前後の空白を除いた、符号つきの 10 進の整数だけを受ける。小数・指数・16 進・全角は誤り。空欄も誤り (0 にはしない)。 */
const INTEGER = /^[+-]?\d+$/;

export function parseIntegerInput(raw: unknown, rule: IntegerRule): FieldResult<number> {
  const text = String(raw ?? '').trim();
  const invalid = { ok: false, error: `${rule.label}は ${rule.min}〜${rule.max} の整数で入れてください` } as const;
  if (!INTEGER.test(text)) return invalid;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= rule.min && value <= rule.max ? { ok: true, value } : invalid;
}

export interface TextRule {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly pattern?: { readonly test: (text: string) => boolean; readonly message: string };
}

/** 前後の空白を除いた文字を返す。文字数 (UTF-16 の長さ) が範囲外・形が違えば誤り。 */
export function parseTextInput(raw: unknown, rule: TextRule): FieldResult<string> {
  const text = String(raw ?? '').trim();
  if (text.length < rule.min || text.length > rule.max) {
    return { ok: false, error: `${rule.label}は ${rule.min}〜${rule.max} 文字で入れてください` };
  }
  if (rule.pattern !== undefined && !rule.pattern.test(text)) return { ok: false, error: rule.pattern.message };
  return { ok: true, value: text };
}

export type Collected<S extends Readonly<Record<string, FieldResult<unknown>>>> =
  | { readonly ok: true; readonly value: { readonly [K in keyof S]: S[K] extends FieldResult<infer V> ? V : never } }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> };

/** 全項目が通れば値の組を、1 つでも誤りがあれば (項目の並びの順に) 誤りの文を全部返す。 */
export function collectFields<S extends Readonly<Record<string, FieldResult<unknown>>>>(fields: S): Collected<S> {
  const errors: string[] = [];
  const value: Record<string, unknown> = {};
  for (const [key, result] of Object.entries(fields)) {
    if (result.ok) value[key] = result.value;
    else errors.push(result.error);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: value as Extract<Collected<S>, { ok: true }>['value'] };
}
