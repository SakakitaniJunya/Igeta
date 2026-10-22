// 一覧の取得と状態 (読み込み中・エラー・読めた)。応答 (dto) は mapper で画面の値 (model) にしてから返す。画面は dto を見ない。
// 再取得 (reload) は読み込み中に戻してから読み直す (useResource)。書き込みは use-__feature__-mutation.ts。
// 他の feature が一覧を読むときは index.ts 経由でこの hook を使う (相手の中を import しない)。

import { useApi } from '@/shared/application/hooks/api';
import { useResource, type Resource } from '@/shared/application/hooks/resource';
import type { ApiResult } from '@/shared/domain/api';
import type { __Feature__ListModel } from '@/features/__feature__/domain/model';
import { list__Feature__ } from '@/features/__feature__/infrastructure/endpoint';
import { toListModel } from '@/features/__feature__/infrastructure/mapper';

export function use__Feature__(): Resource<__Feature__ListModel> {
  const api = useApi();
  return useResource(async (): Promise<ApiResult<__Feature__ListModel>> => {
    const result = await list__Feature__(api);
    return result.ok ? { ok: true, status: result.status, body: toListModel(result.body) } : result;
  }, [api]);
}
