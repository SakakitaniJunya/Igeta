import { describe, expect, it } from 'vitest';
import { invalid } from './app-error';
import { err, ok } from './result';

describe('Result', () => {
  it('TST-103 ok(1) を作るとき { ok: true, value: 1 } になる', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('TST-103 err(e) を作るとき { ok: false, error: e } になる', () => {
    const error = invalid('m');

    expect(err(error)).toEqual({ ok: false, error });
  });
});
