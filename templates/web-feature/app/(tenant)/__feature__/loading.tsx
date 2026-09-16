import { SkeletonCard } from '@/components/ui';

// route segment のローディング境界 (原則: 画面は 3 状態)。Suspense fallback として Next.js が使う。
export default function Loading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
