import { describe, expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import { translatePostgresError } from './errors';

const CONNECTION_CODES = [
  '08006', '08001', '57P01', '57P03',
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ETIMEDOUT',
];

describe('postgres/errors', () => {
  it.each(CONNECTION_CODES)('TST-504 code %s の Error のとき unavailable の AppError に変わる', (code) => {
    const connectionFailure = Object.assign(new Error('connection failure'), { code });

    const translated = translatePostgresError(connectionFailure);

    expect(translated).toBeInstanceOf(AppError);
    expect(translated).toMatchObject({ kind: 'unavailable' });
  });

  it('TST-504 code を持たない pg の Connection terminated unexpectedly のとき unavailable になる', () => {
    const terminated = new Error('Connection terminated unexpectedly');

    const translated = translatePostgresError(terminated);

    expect(translated).toMatchObject({ kind: 'unavailable' });
  });

  it('TST-505 SQLSTATE 23505 の Error のとき同じ Error が返る', () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

    const translated = translatePostgresError(uniqueViolation);

    expect(translated).toBe(uniqueViolation);
  });
});
