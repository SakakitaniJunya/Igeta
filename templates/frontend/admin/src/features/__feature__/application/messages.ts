// この feature だけの文言。API の失敗の code → 文、操作の結果の知らせ、閉じるの確認の文、状態の印。
// 複数の feature で使う文言の置き場は作らない (共通の文は、使う側で書く)。
// code の一覧は API 仕様に合わせる。ここに無い code は保存失敗の文になる。

import type { __Feature__Status } from '@/features/__feature__/domain/model';
import type { ApiError } from '@/shared/domain/api';

export const ERROR_CODES = ['NOT_FOUND', 'CONFLICT'] as const;
export type __Feature__ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Readonly<Record<__Feature__ErrorCode, string>> = {
  NOT_FOUND: '対象が見つかりません。一覧を読み直してください。',
  CONFLICT: 'すでに終了しています。一覧を読み直してください。',
};

export const SAVE_FAILED_MESSAGE = '保存できませんでした。もう一度お試しください。';

function isFeatureCode(code: string): code is __Feature__ErrorCode {
  return Object.hasOwn(ERROR_MESSAGES, code);
}

/** 失敗の画面に出す文。この feature の code ならその文。それ以外と通信の失敗 (error が null) は保存失敗の文。 */
export function failureText(error: ApiError | null): string {
  return error !== null && isFeatureCode(error.code) ? ERROR_MESSAGES[error.code] : SAVE_FAILED_MESSAGE;
}

export const NOTICE = {
  created: (name: string) => `${name} を登録しました`,
  closed: (name: string) => `${name} を終了しました`,
} as const;

/** 確認ダイアログの文。presentation の ConfirmRequest と同じ形 (application は presentation を知らないので、型は構造で合わせる)。 */
export interface CloseConfirmText {
  readonly heading: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly tone: 'critical';
}

/** 閉じるの確認。閉じると操作できなくなるので、確かめてから送る。 */
export function closeConfirmText(name: string): CloseConfirmText {
  return {
    heading: `${name} を終了しますか`,
    message: '終了すると、この項目は操作できなくなります。',
    confirmLabel: '終了する',
    tone: 'critical',
  };
}

/** 状態 → 印の語と色。未知の状態は規則が closed にしてから来る。 */
export const STATUS_BADGE: Readonly<Record<__Feature__Status, { readonly label: string; readonly tone?: 'success' }>> = {
  open: { label: '開いている', tone: 'success' },
  closed: { label: '終了' },
};
