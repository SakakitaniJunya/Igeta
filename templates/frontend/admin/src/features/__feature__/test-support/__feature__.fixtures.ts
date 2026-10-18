// この feature の試験用の値 (fixture)。dto = サーバの応答の形、model = 画面の形。上書きしたい項目だけ渡す。
// 試験だけが使う。本番のコードは import しない (規則 ⑪)。他の feature の試験も使わない。

import type { __Feature__Model } from '@/features/__feature__/domain/__feature__.model';
import type { __Feature__Dto } from '@/features/__feature__/infrastructure/__feature__.dto';

export function dtoFixture(overrides: Partial<__Feature__Dto> = {}): __Feature__Dto {
  return { id: 'a-1', name: '見本', status: 'open', ...overrides };
}

export function modelFixture(overrides: Partial<__Feature__Model> = {}): __Feature__Model {
  return { id: 'a-1', name: '見本', status: 'open', ...overrides };
}
