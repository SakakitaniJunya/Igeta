import { describe, expect, it } from 'vitest';
import { AppError } from '#core/result/app-error';
import { assertDocumentId, isDocumentId } from './document-id';

describe('document-id', () => {
  it('TST-104 英数字・- ・_・1 文字・64 文字のとき isDocumentId は true を返す', () => {
    const validIds = ['a-1_B', 'a', 'a'.repeat(64)];

    const results = validIds.map(isDocumentId);

    expect(results).toEqual([true, true, true]);
  });

  it('TST-105 `.`・`..`・`a/b`・空文字・65 文字・日本語のとき isDocumentId は false を返す', () => {
    const invalidIds = ['.', '..', 'a/b', '', 'a'.repeat(65), '名前'];

    const results = invalidIds.map(isDocumentId);

    expect(results).toEqual([false, false, false, false, false, false]);
  });

  it('TST-117 `__x__` と `____` のとき isDocumentId は false を返し、`__x`・`x__`・`a__b` は true を返す', () => {
    const reservedIds = ['__x__', '____'];
    const ordinaryIds = ['__x', 'x__', 'a__b'];

    const reservedResults = reservedIds.map(isDocumentId);
    const ordinaryResults = ordinaryIds.map(isDocumentId);

    expect(reservedResults).toEqual([false, false]);
    expect(ordinaryResults).toEqual([true, true, true]);
  });

  it('TST-106 `a/b` のとき assertDocumentId は値を含まない invalid を投げる', () => {
    const assertSlashId = () => assertDocumentId('a/b');

    expect(assertSlashId).toThrow(AppError);
    expect(assertSlashId).not.toThrow('a/b');
  });
});
