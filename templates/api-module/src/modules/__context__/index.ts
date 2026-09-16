// __context__ コンテキストの公開面。他 module はこのファイル経由でのみ触れる。
// (modules/__context__/** への直接 import は dependency-cruiser が落とす)

export { __Context__Module } from '@/modules/__context__/__context__.module';
export { Create__Aggregate__UseCase } from '@/modules/__context__/application/use-cases/create-__aggregate__.use-case';
export type {
  Create__Aggregate__Input,
  Create__Aggregate__Output,
} from '@/modules/__context__/application/dto/create-__aggregate__.dto';
export { __Aggregate__CreatedEvent } from '@/modules/__context__/domain/events/__aggregate__-created.event';
