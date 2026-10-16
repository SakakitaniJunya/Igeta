// この機能が使う管理 API の呼び出しと応答の型。この機能の中からだけ使う (別の機能から import しない)。
// 型は API 仕様 (docs/ai/specs/<まとまり>/api/) の応答の形をそのまま写す。パスの文字列はこのファイルにだけ書く。

import type { Api, ApiResult } from '../../common/lib/api';

export interface __Feature__Item {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface __Feature__Input {
  readonly name: string;
  readonly active: boolean;
}

export function list__Feature__(api: Api): Promise<ApiResult<{ readonly items: ReadonlyArray<__Feature__Item> }>> {
  return api.get('/admin/api/__feature__');
}

export function update__Feature__(api: Api, id: string, input: __Feature__Input): Promise<ApiResult<__Feature__Item>> {
  return api.put(`/admin/api/__feature__/${encodeURIComponent(id)}`, input);
}
