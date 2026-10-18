// 経路の一致のテスト: 一致・末尾の / の扱い・不一致 (大文字・余分な path)・表が空でも落ちない。

import { describe, expect, it } from 'vitest';
import { matchRoute, routes, type RouteEntry } from '@/app/routes';

const Alpha = () => null;
const Beta = () => null;
const TABLE: ReadonlyArray<RouteEntry> = [
  { path: '/alpha', screen: Alpha },
  { path: '/beta/child', screen: Beta },
];

describe('matchRoute', () => {
  it.each([
    ['一致', '/alpha', Alpha],
    ['末尾の / は無視する', '/alpha/', Alpha],
    ['深い path も一致', '/beta/child', Beta],
  ])('%s', (_name, pathname, screen) => {
    expect(matchRoute(TABLE, pathname)?.screen).toBe(screen);
  });

  it.each([
    ['余分な path', '/alpha/x'],
    ['大文字は別の経路', '/Alpha'],
    ['親だけ', '/beta'],
    ['根', '/'],
    ['空', ''],
  ])('%s は一致しない', (_name, pathname) => {
    expect(matchRoute(TABLE, pathname)).toBeNull();
  });

  it('表が空でも落ちず、どの経路にも一致しない', () => {
    expect(matchRoute([], '/alpha')).toBeNull();
    expect(() => matchRoute(routes, '/')).not.toThrow();
  });
});
