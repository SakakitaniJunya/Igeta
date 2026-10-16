// 画面をまたいで使う部品の雛形。置き場所: frontend/admin/src/common/ui/。2 つ以上の機能で使うものだけをここに出す
// (1 つの機能でしか使わない部品は、その機能の components/ に置く)。API を呼ばない。受け取った値を出し、操作は呼び出し元へ返す。

export interface __Component__Props {
  readonly heading: string;
  readonly message: string;
  /** 省くとボタンを出さない。 */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function __Component__({ heading, message, actionLabel, onAction }: __Component__Props) {
  return (
    <s-section>
      <s-stack gap="base">
        <s-heading>{heading}</s-heading>
        <s-paragraph>{message}</s-paragraph>
        {actionLabel !== undefined && onAction !== undefined && <s-button onClick={onAction}>{actionLabel}</s-button>}
      </s-stack>
    </s-section>
  );
}
