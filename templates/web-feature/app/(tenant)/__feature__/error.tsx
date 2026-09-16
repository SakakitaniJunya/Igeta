'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui';

// route segment のエラー境界 (原則: 画面は 3 状態)。全 route segment に必須。
export default function __Feature__Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  const t = useTranslations('__feature__');
  return (
    <ErrorState
      title={t('error.title')}
      description={t('error.description')}
      onRetry={reset}
      digest={error.digest}
    />
  );
}
