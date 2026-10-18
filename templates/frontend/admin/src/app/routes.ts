// 経路の表 (経路の正本)。URL の path → 画面。feature は自分の経路を持たず、ここに 1 行ずつ足す。
// 例: { path: '/samples', screen: SamplesScreen } (SamplesScreen は feature の index.ts から import する)。

import type { ComponentType } from 'react';

export interface RouteEntry {
  readonly path: string;
  readonly screen: ComponentType;
}

export const routes: ReadonlyArray<RouteEntry> = [];

/** path に一致する経路を返す。末尾の / は無視する。一致が無ければ null (見つかりません画面)。 */
export function matchRoute(table: ReadonlyArray<RouteEntry>, pathname: string): RouteEntry | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return table.find((entry) => entry.path === path) ?? null;
}
