// 見つかりません画面。どの経路にも一致しないときに出す。データは出さず、入口への案内だけ。

import { useNavigate } from '@/shared/application/hooks/navigate';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <s-page heading="ページが見つかりません">
      <s-banner tone="warning" heading="ページが見つかりません">
        <s-paragraph>入口から選び直してください。</s-paragraph>
        <s-button slot="secondary-actions" onClick={() => navigate('/')}>
          入口へ戻る
        </s-button>
      </s-banner>
    </s-page>
  );
}
