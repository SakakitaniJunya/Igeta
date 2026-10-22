// 管理 API の薄い層。パスの文字列はこのファイルにだけ書く。検証も変換も持たない (検証は domain、変換は mapper)。
// この feature の中からだけ使う。失敗は投げず ApiResult で返る。

import type { Api, ApiResult } from '@/shared/domain/api';
import type { __Feature__CreateDto, __Feature__ItemDto, __Feature__ListDto } from '@/features/__feature__/infrastructure/dto';

const BASE = '/admin/api/__feature__';

export function list__Feature__(api: Api): Promise<ApiResult<__Feature__ListDto>> {
  return api.get<__Feature__ListDto>(BASE);
}

export function create__Feature__(api: Api, body: __Feature__CreateDto): Promise<ApiResult<__Feature__ItemDto>> {
  return api.post<__Feature__ItemDto>(BASE, body);
}

/** 閉じる。id は URL に入れるため符号化する。 */
export function close__Feature__(api: Api, id: string): Promise<ApiResult<__Feature__ItemDto>> {
  return api.post<__Feature__ItemDto>(`${BASE}/${encodeURIComponent(id)}/close`);
}
