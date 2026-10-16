// 機能の画面のテスト (Vitest + Testing Library + jsdom)。API は偽物 (fakeApi) を渡し、通信しない。
// Polaris の部品はテストでは読み込まれない (ただの要素になる)。文字と属性で確かめる (バナーの見出しは属性なので findBanner)。
// 確かめること: 3 つの状態 (読み込み中・エラー・空) / 一覧の表示 / 操作で正しい API が呼ばれ、結果が出ること。

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../common/lib/api';
import { fakeApi } from '../../test-support/fake-api';
import { findBanner } from '../../test-support/polaris';
import { __Feature__Page } from './__Feature__Page';

function renderPage(api = fakeApi()) {
  render(
    <ApiProvider api={api}>
      <__Feature__Page />
    </ApiProvider>,
  );
  return api;
}

const ITEM = { id: 'a-1', name: 'サンプル', active: true };

describe('__Feature__Page', () => {
  it('読み込み中を出してから一覧を出す', async () => {
    renderPage(fakeApi({ 'GET /admin/api/__feature__': { status: 200, body: { items: [ITEM] } } }));
    expect(screen.getByRole('status').textContent).toContain('読み込んでいます');
    expect(await screen.findByText('サンプル')).toBeTruthy();
  });

  it('空なら空の案内を出す', async () => {
    renderPage(fakeApi({ 'GET /admin/api/__feature__': { status: 200, body: { items: [] } } }));
    expect(await screen.findByText('まだ登録されていません')).toBeTruthy();
  });

  it('取得に失敗したらエラーとやり直しのボタンを出し、押すと読み直す', async () => {
    const api = renderPage(fakeApi({ 'GET /admin/api/__feature__': { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } } }));
    const banner = await findBanner('__Feature__ を取得できません');
    await userEvent.click(screen.getByText('再読み込み'));
    expect(banner).toBeTruthy();
    expect(api.calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('停止を押すと PUT を送り、結果を知らせる', async () => {
    const api = renderPage(
      fakeApi({
        'GET /admin/api/__feature__': { status: 200, body: { items: [ITEM] } },
        'PUT /admin/api/__feature__/a-1': { status: 200, body: { ...ITEM, active: false } },
      }),
    );
    await userEvent.click(await screen.findByText('停止', { selector: 's-button' }));
    expect(api.calls).toContainEqual({ method: 'PUT', path: '/admin/api/__feature__/a-1', body: { name: 'サンプル', active: false } });
    expect(await findBanner('サンプル を停止しました')).toBeTruthy();
  });
});
