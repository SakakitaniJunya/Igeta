// 機能の画面。1 つの機能 = 1 つの縦割り (features/<機能>/)。画面の ID (例: SCR-014。ID は画面設計書のもの) をここに書く。
// この機能のものはこのフォルダの中だけで完結させる: 見た目 (ここ)・状態と操作 (use-__feature__)・API (__feature__.api)・部品 (components/)。
// 見た目は Polaris の web components (`s-*`) だけで組む (Shopify の CDN から読む。import しない)。
// 状態は 3 つを必ず出す: 読み込み中・エラー (やり直しのボタン付き)・空。値は文字として出す (HTML として差し込まない)。

import { EmptyState } from '../../common/ui/EmptyState';
import { ErrorView } from '../../common/ui/ErrorView';
import { LoadingView } from '../../common/ui/LoadingView';
import { __Feature__Row } from './components/__Feature__Row';
import { use__Feature__ } from './use-__feature__';

export function __Feature__Page() {
  const { resource, notice, failure, toggleActive } = use__Feature__();

  if (resource.state === 'loading') return <LoadingView subject="__Feature__ を" />;
  if (resource.state === 'error') {
    return <ErrorView heading="__Feature__ を取得できません" message="通信に失敗しました。もう一度読み込んでください。" onRetry={resource.reload} />;
  }

  const items = resource.data.items;
  return (
    <s-page heading="__Feature__" inlineSize="large">
      <s-stack gap="base">
        {notice !== null && <s-banner tone="success" heading={notice} />}
        {failure !== null && <s-banner tone="critical" heading={failure} />}
        {items.length === 0 ? (
          <EmptyState heading="まだ登録されていません" message="<登録すると何が起きるかを 1 文で>" />
        ) : (
          <s-section padding="none" accessibilityLabel="__Feature__ の一覧">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">名称</s-table-header>
                <s-table-header>状態</s-table-header>
                <s-table-header>操作</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {items.map((item) => (
                  <__Feature__Row key={item.id} item={item} onToggle={(target) => void toggleActive(target)} />
                ))}
              </s-table-body>
            </s-table>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}
