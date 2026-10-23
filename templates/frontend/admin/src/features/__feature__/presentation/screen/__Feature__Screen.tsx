// 一覧の画面。3 つの状態 (読み込み中・エラー・空) を必ず出す。取得と書き込みは application の hook、見た目の部品は components。
// 絞り込みの文字と、登録の入力を開いているかは、この画面の中だけで持つ。値は文字として出す (HTML として差し込まない)。

import { useState } from 'react';
import { failureText } from '@/features/__feature__/application/messages';
import { use__Feature__ } from '@/features/__feature__/application/use-__feature__';
import { use__Feature__Mutation } from '@/features/__feature__/application/use-__feature__-mutation';
import { filterByName, LIST_LIMIT } from '@/features/__feature__/domain/model';
import { __Feature__Form } from '@/features/__feature__/presentation/components/__Feature__Form';
import { __Feature__Row } from '@/features/__feature__/presentation/components/__Feature__Row';
import { __Feature__Toolbar } from '@/features/__feature__/presentation/components/__Feature__Toolbar';
import { ConfirmDialog } from '@/shared/presentation/ui/control/ConfirmDialog';
import { CountLabel } from '@/shared/presentation/ui/label/CountLabel';
import { EmptyState } from '@/shared/presentation/ui/state/EmptyState';
import { ErrorView } from '@/shared/presentation/ui/state/ErrorView';
import { LoadingView } from '@/shared/presentation/ui/state/LoadingView';
import { SaveErrorBanner } from '@/shared/presentation/ui/state/SaveErrorBanner';

export function __Feature__Screen() {
  const resource = use__Feature__();
  const mutation = use__Feature__Mutation(resource.reload);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  if (resource.state === 'loading') return <LoadingView subject="一覧を" />;
  if (resource.state === 'error') {
    return <ErrorView heading="一覧を取得できません" message="通信に失敗しました。もう一度読み込んでください。" onRetry={resource.reload} />;
  }

  const { items, truncated } = resource.data;
  const visible = filterByName(items, query);

  return (
    <s-page heading="一覧" inlineSize="large">
      <s-stack gap="base">
        {mutation.notice !== null && <s-banner tone="success" heading={mutation.notice} />}
        {mutation.failure !== null && <SaveErrorBanner error={mutation.failure.error} message={failureText(mutation.failure.error)} />}
        <__Feature__Toolbar
          query={query}
          disabled={mutation.saving}
          onQueryChange={setQuery}
          onAdd={() => setAdding(true)}
        />
        {adding && (
          <__Feature__Form
            saving={mutation.saving}
            onSubmit={(draft) => {
              void mutation.create(draft).then((outcome) => {
                if (outcome === 'done') setAdding(false);
              });
            }}
            onCancel={() => {
              setAdding(false);
              mutation.dismiss();
            }}
          />
        )}
        {items.length === 0 ? (
          <EmptyState heading="まだ登録されていません" message="「追加」から登録できます。" />
        ) : visible.length === 0 ? (
          <s-paragraph>該当する項目はありません。</s-paragraph>
        ) : (
          <s-stack gap="small-200">
            <CountLabel count={items.length} truncated={truncated} />
            {truncated && <s-banner tone="warning" heading={`先頭の ${LIST_LIMIT} 件だけを表示しています。絞り込みで探してください。`} />}
            <s-section padding="none" accessibilityLabel="一覧">
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">名称</s-table-header>
                  <s-table-header>番号</s-table-header>
                  <s-table-header>状態</s-table-header>
                  <s-table-header>操作</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {visible.map((item) => (
                    <__Feature__Row key={item.id} item={item} disabled={mutation.saving} onClose={(target) => void mutation.close(target)} />
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          </s-stack>
        )}
        <ConfirmDialog request={mutation.confirmation} onResult={mutation.answer} />
      </s-stack>
    </s-page>
  );
}
