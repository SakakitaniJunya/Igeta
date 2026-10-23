import type { ReactNode } from 'react';

/** 空の状態。見出し・説明・次の行動のボタン (children)。 */
export function EmptyState({ heading, message, children }: { readonly heading: string; readonly message?: string; readonly children?: ReactNode }) {
  return (
    <s-section>
      <s-stack gap="base" alignItems="center">
        <s-heading>{heading}</s-heading>
        {message !== undefined && <s-paragraph>{message}</s-paragraph>}
        {children !== undefined && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            {children}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
