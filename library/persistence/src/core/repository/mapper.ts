/** entity と保存の形 (record) の変換。保存データの検証は fromRecord が持つ。 */
import { unprocessable } from '#core/result/app-error';
import type { Result } from '#core/result/result';

/** 変換の組。保存データが不正なら fromRecord は err を返す。 */
export interface Mapper<Entity, StoredRecord> {
  toRecord(entity: Entity): StoredRecord;
  fromRecord(id: string, record: StoredRecord): Result<Entity>;
}

/** 保存データを entity に直す。不正なら id 付きの unprocessable を投げる。mapper が投げた例外は包まない。 */
export function readStored<Entity, StoredRecord>(
  mapper: Mapper<Entity, StoredRecord>,
  id: string,
  record: StoredRecord,
): Entity {
  const result = mapper.fromRecord(id, record);
  if (result.ok) return result.value;

  throw unprocessable(result.error.message, { id });
}
