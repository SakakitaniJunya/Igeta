// ApiError の読み取りのテスト: validationFields は文字の項目名だけを返し、details が無い・配列でない・error が null なら空。

import { describe, expect, it } from 'vitest';
import { validationFields } from '@/shared/domain/api-error';

describe('validationFields', () => {
  it('文字の項目名だけを返す', () => {
    expect(validationFields({ code: 'VALIDATION_FAILED', message: 'm', details: ['name', 1, { field: 'x' }, 'id'] })).toEqual(['name', 'id']);
  });

  it.each([
    ['details が無い', { code: 'X', message: 'm' }],
    ['details が配列でない', { code: 'X', message: 'm', details: 'name' as unknown as ReadonlyArray<unknown> }],
    ['error が null', null],
  ])('%s なら空', (_name, error) => {
    expect(validationFields(error)).toEqual([]);
  });
});
