import { describe, expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import { translatePostgresError } from './errors';

describe('postgres/errors', () => {
  it('TST-504 SQLSTATE 08006 の Error のとき unavailable の AppError に変わる', () => {
    const connectionFailure = Object.assign(new Error('connection failure'), { code: '08006' });

    const translated = translatePostgresError(connectionFailure);

    expect(translated).toBeInstanceOf(AppError);
    expect(translated).toMatchObject({ kind: 'unavailable' });
  });

  it('TST-504 接続先に届かない Node の code (ECONNREFUSED) のときも unavailable になる', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

    const translated = translatePostgresError(refused);

    expect(translated).toMatchObject({ kind: 'unavailable' });
  });

  it('TST-505 SQLSTATE 23505 の Error のとき同じ Error が返る', () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

    const translated = translatePostgresError(uniqueViolation);

    expect(translated).toBe(uniqueViolation);
  });
});
