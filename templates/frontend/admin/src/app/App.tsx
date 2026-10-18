// 経路を描く。URL (今の path) → matchRoute → 画面。どの経路にも一致しなければ見つかりません画面。
// Provider (API と App Bridge) を積むのもここ。経路の表は props で受ける (既定は routes.ts の表)。

import { useSyncExternalStore } from 'react';
import { NotFound } from '@/app/not-found';
import { Providers } from '@/app/providers';
import { matchRoute, routes as defaultRoutes, type RouteEntry } from '@/app/routes';
import { currentPath, subscribe } from '@/shared/infrastructure/navigate';

export interface AppProps {
  readonly routes?: ReadonlyArray<RouteEntry>;
}

export function App({ routes = defaultRoutes }: AppProps) {
  const pathname = useSyncExternalStore(subscribe, currentPath);
  const found = matchRoute(routes, pathname);
  return <Providers>{found === null ? <NotFound /> : <found.screen />}</Providers>;
}
