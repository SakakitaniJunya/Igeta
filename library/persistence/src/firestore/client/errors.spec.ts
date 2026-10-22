import { describe, expect, it } from 'vitest';
import { AppError } from '#core/result/app-error';
import { translateFirestoreError } from './errors';

describe('firestore/errors', () => {
  it('TST-402 code 14 の Error のとき unavailable の AppError に変わる', () => {
    const grpcUnavailable = Object.assign(new Error('UNAVAILABLE'), { code: 14 });

    const translated = translateFirestoreError(grpcUnavailable);

    expect(translated).toBeInstanceOf(AppError);
    expect(translated).toMatchObject({ kind: 'unavailable' });
  });

  it('TST-403 code 14 以外の Error のとき同じ Error が返る', () => {
    const grpcAborted = Object.assign(new Error('ABORTED'), { code: 10 });

    const translated = translateFirestoreError(grpcAborted);

    expect(translated).toBe(grpcAborted);
  });
});
