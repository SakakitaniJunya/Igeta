import { getTranslations } from 'next-intl/server';
import { EmptyState, ErrorState } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { __Feature__List } from '@/features/__feature__/__feature__-list';

// Server Component。api-contract の生成クライアント経由でのみ API を叩く。
// 文言は messages/ja/__feature__.json 経由 (JSX への日本語リテラルは CI で落とす)。
export default async function __Feature__Page(): Promise<React.ReactElement> {
  const t = await getTranslations('__feature__');
  const response = await apiClient.GET('/v1/__feature__/items', {});

  if (response.error) {
    return <ErrorState title={t('error.title')} description={t('error.description')} />;
  }
  if (response.data.items.length === 0) {
    return <EmptyState title={t('empty.title')} description={t('empty.description')} icon="Tent" />;
  }
  return <__Feature__List items={response.data.items} />;
}
