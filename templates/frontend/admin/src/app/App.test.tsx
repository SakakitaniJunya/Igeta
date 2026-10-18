// 経路の描画のテスト: 経路ごとに対応する画面を出す・一致しなければ見つかりません画面。表は試験用の画面を渡す。

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { type RouteEntry } from '@/app/routes';
import { findBanner } from '@/shared/test-support/polaris';

function Alpha() {
  return <p>アルファの画面</p>;
}

function Beta() {
  return <p>ベータの画面</p>;
}

const TABLE: ReadonlyArray<RouteEntry> = [
  { path: '/alpha', screen: Alpha },
  { path: '/beta', screen: Beta },
];

function go(path: string): void {
  window.history.replaceState(null, '', path);
}

describe('App', () => {
  afterEach(() => go('/'));

  it.each([
    ['/alpha', 'アルファの画面'],
    ['/beta', 'ベータの画面'],
  ])('%s では %s を出す', (path, text) => {
    go(path);
    render(<App routes={TABLE} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('どの経路にも一致しなければ見つかりません画面を出す', async () => {
    go('/gamma');
    render(<App routes={TABLE} />);
    expect(await findBanner('ページが見つかりません')).toBeTruthy();
    expect(screen.queryByText('アルファの画面')).toBeNull();
  });
});
