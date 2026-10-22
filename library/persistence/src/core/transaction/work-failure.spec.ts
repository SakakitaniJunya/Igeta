import { describe, expect, it } from 'vitest';
import { captureThrown } from '#testing/harness/capture-thrown';
import { markWorkFailure, translateDatabaseFailure } from './work-failure';

const translateToText = (thrown: unknown): unknown => `translated: ${String(thrown)}`;

describe('work-failure', () => {
  it('TST-119 work が ECONNRESET 付きの Error を投げたとき翻訳せずそのまま届く', async () => {
    const fromWork = Object.assign(new Error('work の失敗'), { code: 'ECONNRESET' });
    const run = () => markWorkFailure(async () => Promise.reject(fromWork));

    const thrown = await captureThrown(() => translateDatabaseFailure(run, translateToText));

    expect(thrown).toBe(fromWork);
  });

  it('TST-119 work の外 (DB 側) の失敗のとき translate を通して投げる', async () => {
    const run = async (): Promise<void> => Promise.reject(new Error('connection lost'));

    const thrown = await captureThrown(() => translateDatabaseFailure(run, translateToText));

    expect(thrown).toBe('translated: Error: connection lost');
  });
});
