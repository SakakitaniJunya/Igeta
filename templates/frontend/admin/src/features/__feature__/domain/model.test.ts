// 画面の型の純関数のテスト: 名称の絞り込み (空・空白だけ・部分一致・前後の空白を無視・該当なし)。

import { describe, expect, it } from 'vitest';
import { filterByName, type __Feature__Model } from '@/features/__feature__/domain/model';
import { modelFixture } from '@/features/__feature__/test-support/__feature__.fixtures';

const ITEMS: ReadonlyArray<__Feature__Model> = [modelFixture(), modelFixture({ id: 'b-2', name: '見本B', status: 'closed' })];

describe('filterByName', () => {
  it.each([
    ['空は全部', '', 2],
    ['空白だけは全部', '  ', 2],
    ['部分一致', '本B', 1],
    ['前後の空白を無視', ' 本B ', 1],
    ['該当なし', '該当なし', 0],
  ])('%s', (_name, query, count) => {
    expect(filterByName(ITEMS, query)).toHaveLength(count);
  });
});
