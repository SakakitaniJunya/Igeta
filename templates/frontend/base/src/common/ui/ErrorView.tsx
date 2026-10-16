export interface ErrorViewProps {
  readonly heading: string;
  readonly message?: string;
  /** 省くと「再読み込み」。onRetry が無ければボタンを出さない。 */
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
}

/** 失敗の画面。重大なエラーのバナーと、再読み込みのボタン。 */
export function ErrorView(props: ErrorViewProps) {
  return (
    <s-page>
      <ErrorBanner {...props} />
    </s-page>
  );
}

export function ErrorBanner({ heading, message, retryLabel, onRetry }: ErrorViewProps) {
  return (
    <s-banner tone="critical" heading={heading}>
      {message !== undefined && <s-paragraph>{message}</s-paragraph>}
      {onRetry !== undefined && (
        <s-button slot="secondary-actions" onClick={onRetry}>
          {retryLabel ?? '再読み込み'}
        </s-button>
      )}
    </s-banner>
  );
}
