// 確認ダイアログ (s-modal)。確定 = true、やめる・外側を押す・閉じる = false を、onResult に 1 回だけ返す。
// 開く・閉じるは request で決める (null = 閉じている)。呼び出し側は結果を受けて request を null に戻す。

import { useCallback, useRef } from 'react';

export interface ConfirmRequest {
  readonly heading: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly tone?: 'critical' | 'auto';
}

export interface ConfirmDialogProps {
  readonly request: ConfirmRequest | null;
  readonly onResult: (confirmed: boolean) => void;
}

export function ConfirmDialog({ request, onResult }: ConfirmDialogProps) {
  return request === null ? null : <OpenModal request={request} onResult={onResult} />;
}

function OpenModal({ request, onResult }: { readonly request: ConfirmRequest; readonly onResult: (confirmed: boolean) => void }) {
  const settled = useRef(false);
  const latest = useRef(onResult);
  latest.current = onResult;

  const settle = useCallback((confirmed: boolean): void => {
    if (settled.current) return;
    settled.current = true;
    latest.current(confirmed);
  }, []);

  // 外側のクリック・Esc・閉じるボタンは、s-modal が hide を出す。
  const attach = useCallback(
    (modal: HTMLElement | null) => {
      if (modal === null) return undefined;
      const onHide = (): void => settle(false);
      modal.addEventListener('hide', onHide);
      (modal as HTMLElement & { showOverlay?: () => void }).showOverlay?.();
      return () => {
        modal.removeEventListener('hide', onHide);
        try {
          (modal as HTMLElement & { hideOverlay?: () => void }).hideOverlay?.();
        } catch {
          // 閉じられない状態でも、要素は外れる
        }
      };
    },
    [settle],
  );

  return (
    <s-modal ref={attach} heading={request.heading}>
      <s-paragraph>{request.message}</s-paragraph>
      <s-button slot="primary-action" variant="primary" tone={request.tone ?? 'auto'} onClick={() => settle(true)}>
        {request.confirmLabel}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => settle(false)}>
        やめる
      </s-button>
    </s-modal>
  );
}
