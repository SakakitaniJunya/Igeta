// dto ⇄ model の変換 (ACL)。純関数。domain は dto を知らないので、dto の形が変わったらここだけを直す。

import type { __Feature__Draft, __Feature__ListModel, __Feature__Model } from '@/features/__feature__/domain/model';
import { normalizeStatus } from '@/features/__feature__/domain/rules';
import type { __Feature__CreateDto, __Feature__Dto, __Feature__ListDto } from '@/features/__feature__/infrastructure/dto';

/** 応答の 1 件を画面の値にする。未知の状態は規則で closed になる。 */
export function toModel(dto: __Feature__Dto): __Feature__Model {
  return { id: dto.id, name: dto.name, status: normalizeStatus(dto.status) };
}

export function toListModel(dto: __Feature__ListDto): __Feature__ListModel {
  return { items: dto.items.map((item) => toModel(item)), truncated: dto.truncated };
}

/** 作るの本文。検証を通った値だけが来る。 */
export function toCreateRequest(draft: __Feature__Draft): __Feature__CreateDto {
  return { name: draft.name };
}
