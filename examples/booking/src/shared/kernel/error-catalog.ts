// 業務エラーの正典。コード → 文言 → HTTP ステータスの対応をここ 1 か所に持つ。
// 文言をドメインや画面に直書きしない (同じ事象に 2 通りの文言が出る状態を作らない)。
// 設計書 docs/design/basic/06-messages.md の表と TST-215 で機械照合する。

import { DomainError } from '@/shared/kernel/result';

export type ErrorDefinition = {
  /** 利用者に見せる文言。次にすべき行動を含める。 */
  readonly message: string;
  /** application 層が AppError へ変換するときの HTTP ステータス。 */
  readonly statusCode: number;
};

export const ERROR_CATALOG = {
  TENANT_ID_INVALID: {
    message: 'テナント ID の形式が不正です。英小文字・数字・ハイフンで指定してください。',
    statusCode: 400,
  },
  RESERVATION_ID_INVALID: {
    message: '予約 ID の形式が不正です。英小文字・数字・ハイフンの 8〜64 文字で指定してください。',
    statusCode: 400,
  },
  TIME_SLOT_ID_INVALID: {
    message: '予約枠 ID の形式が不正です。英小文字・数字・ハイフンの 8〜64 文字で指定してください。',
    statusCode: 400,
  },
  TIME_SLOT_CAPACITY_INVALID: {
    message: '予約枠の定員は 1 以上の整数で指定してください。',
    statusCode: 400,
  },
  TENANT_MISMATCH: {
    message: '他テナントのデータは操作できません。テナントを切り替えてください。',
    statusCode: 403,
  },
  RESERVATION_NOT_FOUND: {
    message: '予約が見つかりません。予約 ID を確認してください。',
    statusCode: 404,
  },
  TIME_SLOT_NOT_FOUND: {
    message: '予約枠が見つかりません。枠 ID を確認してください。',
    statusCode: 404,
  },
  RESERVATION_TRANSITION_FORBIDDEN: {
    message: '現在の予約状態からは実行できない操作です。予約状態を確認してください。',
    statusCode: 409,
  },
  TIME_SLOT_SOLD_OUT: {
    message: '予約枠が満席です。別の枠を選んでください。',
    statusCode: 409,
  },
  TIME_SLOT_NOT_RESERVED: {
    message: '返却できる予約がない枠です。枠の予約数を確認してください。',
    statusCode: 409,
  },
} as const satisfies Readonly<Record<string, ErrorDefinition>>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** カタログの文言を持つ DomainError を作る。domain 層はこの関数だけを使う。 */
export const domainError = (
  code: ErrorCode,
  details?: Readonly<Record<string, unknown>>,
): DomainError => new DomainError(code, ERROR_CATALOG[code].message, details);

/** 未登録コード (外部 adapter 由来など) は undefined。呼び出し側が既定の扱いを決める。 */
export const lookupError = (code: string): ErrorDefinition | undefined =>
  (ERROR_CATALOG as Readonly<Record<string, ErrorDefinition>>)[code];
