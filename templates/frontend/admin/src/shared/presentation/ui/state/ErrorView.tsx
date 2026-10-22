// 失敗の画面。見出しと説明、再読み込みのボタン (onRetry があるとき)。
// 呼び出し元は読めなかった理由を渡さない (通信の詳細は画面に出さない)。

export interface ErrorViewProps {
  readonly heading: string;
  readonly message?: string;
  /** 省くと「再読み込み」。onRetry が無ければボタンを出さない。 */
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
}

export function ErrorView({ heading, message, retryLabel, onRetry }: ErrorViewProps) {
  return (
    <s-page>
      <s-banner tone="critical" heading={heading}>
        {message !== undefined && <s-paragraph>{message}</s-paragraph>}
        {onRetry !== undefined && (
          <s-button slot="secondary-actions" onClick={onRetry}>
            {retryLabel ?? '再読み込み'}
          </s-button>
        )}
      </s-banner>
    </s-page>
  );
}
