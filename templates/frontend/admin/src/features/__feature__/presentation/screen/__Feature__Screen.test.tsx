// 一覧の画面のテスト: 3 つの状態 (読み込み中・エラー・空) / 一覧の表示 / 絞り込み / 登録 (入力の誤り・成功) / 閉じる (確認・成功・失敗・閉じ済み)。
// API は偽物 (fakeApi) を渡し、通信しない。バナーの見出しは属性なので findBanner で探す。

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { __Feature__Screen } from '@/features/__feature__/presentation/screen/__Feature__Screen';
import { dtoFixture } from '@/features/__feature__/test-support/__feature__.fixtures';
import { ApiProvider } from '@/shared/application/hooks/api';
import { fakeApi, type FakeApi, type FakeResponse } from '@/shared/test-support/fake-api';
import { findBanner } from '@/shared/test-support/polaris';

const GET = 'GET /admin/api/__feature__';
const OPEN = dtoFixture();
const OTHER = dtoFixture({ id: 'b-2', name: '見本B' });
const CLOSED = dtoFixture({ id: 'c-3', name: '見本C', status: 'closed' });

function renderScreen(responses: Record<string, FakeResponse>): FakeApi {
  const api = fakeApi(responses);
  render(
    <ApiProvider api={api}>
      <__Feature__Screen />
    </ApiProvider>,
  );
  return api;
}

const gets = (api: FakeApi) => api.calls.filter((c) => c.method === 'GET').length;

describe('__Feature__Screen', () => {
  it('読み込み中を出してから一覧を出す', async () => {
    renderScreen({ [GET]: { status: 200, body: { items: [OPEN], truncated: false } } });
    expect(screen.getByRole('status').textContent).toContain('読み込んでいます');
    expect(await screen.findByText('見本')).toBeTruthy();
  });

  it('サーバが打ち切ったときは上限の件数と打ち切りの知らせを出す', async () => {
    renderScreen({ [GET]: { status: 200, body: { items: [OPEN], truncated: true } } });
    expect(await findBanner('先頭の 100 件だけを表示しています。絞り込みで探してください。')).toBeTruthy();
  });

  it('ちょうど 100 件で打ち切りなしなら「100 件」、打ち切りありなら「100+ 件」', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}`, name: `名${i}`, status: 'open' }));
    const exact = renderScreen({ [GET]: { status: 200, body: { items, truncated: false } } });
    expect(await screen.findByText('100 件')).toBeTruthy();
    expect(screen.queryByText('100+ 件')).toBeNull();
    expect(gets(exact)).toBe(1);
    cleanup();
    renderScreen({ [GET]: { status: 200, body: { items, truncated: true } } });
    expect(await screen.findByText('100+ 件')).toBeTruthy();
  });

  it('打ち切られていなければ知らせを出さない', async () => {
    renderScreen({ [GET]: { status: 200, body: { items: [OPEN], truncated: false } } });
    await screen.findByText('見本');
    expect(document.querySelector('s-banner[tone="warning"]')).toBeNull();
  });

  it('空なら空の案内を出す', async () => {
    renderScreen({ [GET]: { status: 200, body: { items: [], truncated: false } } });
    expect(await screen.findByText('まだ登録されていません')).toBeTruthy();
  });

  it('取得に失敗したらエラーとやり直しを出し、押すと読み直す', async () => {
    const api = renderScreen({ [GET]: { status: 500, body: { error: { code: 'INTERNAL', message: 'x' } } } });
    const banner = await findBanner('一覧を取得できません');
    await userEvent.click(screen.getByText('再読み込み'));
    expect(banner).toBeTruthy();
    expect(gets(api)).toBe(2);
  });

  it('名称で絞り込むと、合う行だけを出す', async () => {
    const { container } = await renderAndWait([OPEN, OTHER]);
    const field = container.querySelector('s-text-field[label="絞り込み"]') as HTMLElement & { value: string };
    field.value = '伊';
    field.dispatchEvent(new Event('input'));
    expect(await screen.findByText('見本B')).toBeTruthy();
    expect(screen.queryByText('見本')).toBeNull();
  });

  it('閉じるは確認を出し、確定すると閉じて通知し、一覧を読み直す', async () => {
    const api = renderScreen({
      [GET]: { status: 200, body: { items: [OPEN], truncated: false } },
      'POST /admin/api/__feature__/a-1/close': { status: 200, body: { ok: true, item: { ...OPEN, status: 'closed' } } },
    });
    await userEvent.click(await screen.findByText('終了', { selector: 's-button' }));
    await waitFor(() => expect(document.querySelector('s-modal[heading="見本 を終了しますか"]')).not.toBeNull());
    await userEvent.click(screen.getByText('終了する'));
    expect(await findBanner('見本 を終了しました')).toBeTruthy();
    expect(api.calls).toContainEqual({ method: 'POST', path: '/admin/api/__feature__/a-1/close', body: undefined });
    expect(gets(api)).toBe(2);
  });

  it('閉じ済みの行は終了を押せない', async () => {
    renderScreen({ [GET]: { status: 200, body: { items: [CLOSED], truncated: false } } });
    expect((await screen.findByText('終了', { selector: 's-button' })).hasAttribute('disabled')).toBe(true);
  });

  it('閉じるの失敗は、その code の文を保存できなかった知らせに出す', async () => {
    renderScreen({
      [GET]: { status: 200, body: { items: [OPEN], truncated: false } },
      'POST /admin/api/__feature__/a-1/close': { status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'x' } } },
    });
    await userEvent.click(await screen.findByText('終了', { selector: 's-button' }));
    await userEvent.click(await screen.findByText('終了する'));
    expect(await findBanner('保存できませんでした')).toBeTruthy();
    expect(screen.getByText('すでに終了しています。一覧を読み直してください。')).toBeTruthy();
  });

  it('登録は、空の名称では送らず、正しければ送って一覧に戻り、通知を出す', async () => {
    const api = renderScreen({
      [GET]: { status: 200, body: { items: [OPEN], truncated: false } },
      'POST /admin/api/__feature__': { status: 201, body: { ok: true, item: OTHER } },
    });
    await userEvent.click(await screen.findByText('追加', { selector: 's-button' }));
    await userEvent.click(screen.getByText('登録', { selector: 's-button' }));
    expect(await findBanner('入力に誤りがあります。保存していません')).toBeTruthy();
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    const field = document.querySelector('s-text-field[label="名称"]') as HTMLElement & { value: string };
    field.value = '見本B';
    field.dispatchEvent(new Event('input'));
    await userEvent.click(screen.getByText('登録', { selector: 's-button' }));
    expect(await findBanner('見本B を登録しました')).toBeTruthy();
    expect(api.calls).toContainEqual({ method: 'POST', path: '/admin/api/__feature__', body: { name: '見本B' } });
  });
});

async function renderAndWait(items: ReadonlyArray<ReturnType<typeof dtoFixture>>) {
  const api = fakeApi({ [GET]: { status: 200, body: { items, truncated: false } } });
  const view = render(
    <ApiProvider api={api}>
      <__Feature__Screen />
    </ApiProvider>,
  );
  await screen.findByText(items[0]?.name ?? '');
  return view;
}
