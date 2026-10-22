// 保存の失敗の知らせ。サーバの details (VALIDATION_FAILED の項目名の配列。validationFields が読む) があれば項目を並べる。
// サーバの message や code は画面に出さない。出す文は呼び出し側が message で決める。
// やり直しのボタンは持たない (Idempotency-Key を使わないので、同じ要求の送り直しは雛形では出さない)。

import type { ApiError } from '@/shared/domain/api';
import { validationFields } from '@/shared/domain/api-error';

export interface SaveErrorBannerProps {
  readonly error: ApiError | null;
  /** 見出しの下に出す 1 文。 */
  readonly message?: string;
}

export function SaveErrorBanner({ error, message }: SaveErrorBannerProps) {
  const details = validationFields(error);
  return (
    <s-banner tone="critical" heading="保存できませんでした">
      {message !== undefined && <s-paragraph>{message}</s-paragraph>}
      {details.length > 0 && (
        <s-unordered-list>
          {details.map((text, index) => (
            <s-list-item key={`${index}:${text}`}>{text}</s-list-item>
          ))}
        </s-unordered-list>
      )}
    </s-banner>
  );
}
