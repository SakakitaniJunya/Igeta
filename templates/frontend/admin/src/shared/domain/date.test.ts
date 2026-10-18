// 日付の道具のテスト: 日本時間の今日 (UTC 15:00 の境界)・加減 (月・年・うるう日)・差 (符号)。

import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, todayJst } from '@/shared/domain/date';

describe('todayJst', () => {
  it.each([
    ['UTC 14:59:59 は日本でもまだ同じ日', '2026-10-17T14:59:59Z', '2026-10-17'],
    ['UTC 15:00:00 は日本の翌日', '2026-10-17T15:00:00Z', '2026-10-18'],
    ['年末の UTC 15:00 は日本の元日', '2026-12-31T15:00:00Z', '2027-01-01'],
  ])('%s', (_name, iso, expected) => {
    expect(todayJst(new Date(iso))).toBe(expected);
  });
});

describe('addDays', () => {
  it.each([
    ['同じ月の中', '2026-10-18', 3, '2026-10-21'],
    ['月をまたぐ', '2026-10-30', 3, '2026-11-02'],
    ['年をまたぐ', '2026-12-31', 1, '2027-01-01'],
    ['うるう日', '2028-02-28', 1, '2028-02-29'],
    ['負の日数は戻す', '2026-03-01', -1, '2026-02-28'],
  ])('%s', (_name, date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe('daysBetween', () => {
  it.each([
    ['同じ日は 0', '2026-10-18', '2026-10-18', 0],
    ['後ろの日は正', '2026-10-18', '2026-10-23', 5],
    ['前の日は負', '2026-10-18', '2026-10-15', -3],
    ['月またぎ', '2026-10-30', '2026-11-02', 3],
  ])('%s', (_name, a, b, expected) => {
    expect(daysBetween(a, b)).toBe(expected);
  });
});
