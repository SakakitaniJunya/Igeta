// 保存の失敗の知らせ。サーバの details (項目名の配列など) があれば項目を並べる。
// サーバの message や code は画面に出さない。出す文は呼び出し側が message で決める。
// やり直しのボタンは持たない (Idempotency-Key を使わないので、同じ要求の送り直しは雛形では出さない)。

import type { ApiError } from '@/shared/domain/api';

export interface SaveErrorBannerProps {
  readonly error: ApiError | null;
  /** 見出しの下に出す 1 文。 */
  readonly message?: string;
}

/** details の 1 件を文字にする。文字ならそのまま、{ field | path } を持つ形ならその値、それ以外は定型。 */
function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail !== null && typeof detail === 'object') {
    const named = detail as { field?: unknown; path?: unknown };
    if (typeof named.field === 'string') return named.field;
    if (typeof named.path === 'string') return named.path;
  }
  return '入力の誤り';
}

export function SaveErrorBanner({ error, message }: SaveErrorBannerProps) {
  const details = Array.isArray(error?.details) ? error.details.map(detailText) : [];
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
