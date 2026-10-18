// 文言のテスト: 全 code に空でない文がある・失敗の文は code → 保存失敗の順・知らせと確認の文・状態の印の表。

import { describe, expect, it } from 'vitest';
import { closeConfirmText, ERROR_CODES, ERROR_MESSAGES, failureText, NOTICE, SAVE_FAILED_MESSAGE, STATUS_BADGE } from '@/features/__feature__/application/messages';

describe('__feature__ messages', () => {
  it('表の code と一覧が一致し、全部に空でない文がある', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) expect(failureText({ code, message: 'x' }).length).toBeGreaterThan(0);
  });

  it('この feature の code はその文、知らない code と通信の失敗は保存失敗の文', () => {
    expect(failureText({ code: 'CONFLICT', message: 'x' })).toBe(ERROR_MESSAGES.CONFLICT);
    expect(failureText({ code: 'UNKNOWN', message: 'internal detail' })).toBe(SAVE_FAILED_MESSAGE);
    expect(failureText(null)).toBe(SAVE_FAILED_MESSAGE);
  });

  it('内部の message は画面の文に出さない', () => {
    expect(failureText({ code: 'UNKNOWN', message: 'stack trace' })).not.toContain('stack trace');
  });

  it('知らせの文に対象の名前が入る', () => {
    expect(NOTICE.created('茅野')).toBe('茅野 を登録しました');
    expect(NOTICE.closed('茅野')).toBe('茅野 を終了しました');
  });

  it('閉じるの確認は対象の名前を見出しに入れ、重大な操作として出す', () => {
    expect(closeConfirmText('茅野')).toMatchObject({ heading: '茅野 を終了しますか', confirmLabel: '終了する', tone: 'critical' });
  });

  it('状態ごとに語と色の表がある (開いているだけ成功の色)', () => {
    expect(STATUS_BADGE).toEqual({ open: { label: '開いている', tone: 'success' }, closed: { label: '終了' } });
  });
});
