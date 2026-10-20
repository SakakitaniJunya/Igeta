/** 読んだ entity が期待した内容かを確かめる、契約テストの共通の確認。 */
import { expect } from 'vitest';

/** found が見つかり、fixture の isSameContent で expected と同じ内容ならよい。違えば失敗する。 */
export function expectSameContent<Entity>(
  found: Entity | undefined,
  expected: Entity,
  isSameContent: (left: Entity, right: Entity) => boolean,
): void {
  if (found === undefined) throw new Error('保存した entity が読めなかった');

  expect(isSameContent(found, expected), '読んだ内容が期待した内容と違う').toBe(true);
}
