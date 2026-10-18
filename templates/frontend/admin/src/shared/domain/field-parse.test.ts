// 入力の道具のテスト(表形式): 整数 (空欄・小数・範囲の端・符号・全角)、文字 (空白除去・文字数の端・形)、誤りは項目の順に全部。

import { describe, expect, it } from 'vitest';
import { collectFields, parseIntegerInput, parseTextInput } from '@/shared/domain/field-parse';

const DAYS = { label: '点検日数', min: 0, max: 14 };

describe('parseIntegerInput', () => {
  it.each([
    ['0 (下限)', '0', true],
    ['14 (上限)', '14', true],
    ['前後の空白は除く', ' 3 ', true],
    ['15 は範囲外', '15', false],
    ['-1 は範囲外', '-1', false],
    ['空欄は誤り (0 にしない)', '', false],
    ['小数は誤り', '1.5', false],
    ['指数は誤り', '1e2', false],
    ['文字は誤り', 'abc', false],
    ['全角は誤り', '３', false],
  ])('%s', (_name, raw, ok) => {
    expect(parseIntegerInput(raw, DAYS).ok).toBe(ok);
  });

  it('通れば数、誤りは項目名と範囲を含む文', () => {
    expect(parseIntegerInput(' 3 ', DAYS)).toEqual({ ok: true, value: 3 });
    expect(parseIntegerInput('', DAYS)).toEqual({ ok: false, error: '点検日数は 0〜14 の整数で入れてください' });
  });
});

describe('parseTextInput', () => {
  const NAME = { label: '名称', min: 1, max: 5 };

  it.each([
    ['下限 1 文字', 'a', true],
    ['上限 5 文字', 'abcde', true],
    ['6 文字は誤り', 'abcdef', false],
    ['空白だけは空として誤り', '   ', false],
  ])('%s', (_name, raw, ok) => {
    expect(parseTextInput(raw, NAME).ok).toBe(ok);
  });

  it('前後の空白を除いた値を返す', () => {
    expect(parseTextInput('  茅野  ', NAME)).toEqual({ ok: true, value: '茅野' });
  });

  it('形 (pattern) が違えば、その文を返す', () => {
    const rule = { ...NAME, pattern: { test: (text: string) => /^[a-z]+$/.test(text), message: '英小文字だけで入れてください' } };
    expect(parseTextInput('ab1', rule)).toEqual({ ok: false, error: '英小文字だけで入れてください' });
  });
});

describe('collectFields', () => {
  it('全部通れば、項目名ごとの値の組', () => {
    const result = collectFields({ name: parseTextInput('茅野', { label: '名称', min: 1, max: 5 }), days: parseIntegerInput('2', DAYS) });
    expect(result).toEqual({ ok: true, value: { name: '茅野', days: 2 } });
  });

  it('誤りは項目の並びの順に全部返す', () => {
    const result = collectFields({ name: parseTextInput('', { label: '名称', min: 1, max: 5 }), days: parseIntegerInput('x', DAYS) });
    expect(result).toEqual({ ok: false, errors: ['名称は 1〜5 文字で入れてください', '点検日数は 0〜14 の整数で入れてください'] });
  });
});
