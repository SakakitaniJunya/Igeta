// 入力の検証のテスト(境界値の表): 名称の下限・上限・空白だけ・前後の空白の除去。

import { describe, expect, it } from 'vitest';
import { validate__Feature__Form } from '@/features/__feature__/domain/validation';

const NAME_ERROR = '名称は 1〜40 文字で入れてください';

describe('validate__Feature__Form', () => {
  it('通れば、前後の空白を除いた値を返す', () => {
    expect(validate__Feature__Form({ name: ' 見本 ' })).toEqual({ ok: true, value: { name: '見本' } });
  });

  it.each([
    ['1 文字 (下限)', 'a', true],
    ['40 文字 (上限)', '名'.repeat(40), true],
    ['41 文字', '名'.repeat(41), false],
    ['空', '', false],
    ['空白だけ', '   ', false],
  ])('%s', (_name, name, ok) => {
    expect(validate__Feature__Form({ name }).ok).toBe(ok);
  });

  it('誤りは文を返す', () => {
    expect(validate__Feature__Form({ name: '' })).toEqual({ ok: false, errors: [NAME_ERROR] });
  });
});
