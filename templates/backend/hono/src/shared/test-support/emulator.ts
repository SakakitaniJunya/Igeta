// Firestore エミュレータを使うテスト (*.emulator.spec.ts) の共通部品。テストは持たない。
// エミュレータが無い (ふだんの npm test) ときは describe.skip で飛ばし、題名に理由を出す。
// REQUIRE_EMULATOR=1 のときは飛ばさず落とす (CI で「飛ばして緑」にならないように。原則: サイレント縮退禁止)。
// 同じエミュレータを全部のテストが共有し、消さない。id は uniqueId() でユニークにしてテスト同士を分ける。

import { randomUUID } from 'node:crypto';
import { describe, it } from 'vitest';

/** エミュレータ専用の project 名 (demo- で始まる名前は実 project に繋がらない)。package.json の test:emulator と同じ値。 */
export const EMULATOR_PROJECT = 'demo-igeta';

export function describeEmulator(name: string, body: () => void): void {
  if (process.env['FIRESTORE_EMULATOR_HOST']) {
    describe(name, body);
  } else if (process.env['REQUIRE_EMULATOR'] === '1') {
    describe(name, () => {
      it('Firestore エミュレータが必要 (REQUIRE_EMULATOR=1)', () => {
        throw new Error('FIRESTORE_EMULATOR_HOST が無い。npm run test:emulator で走らせる');
      });
    });
  } else {
    describe.skip(`${name} [skip: FIRESTORE_EMULATOR_HOST が無い。npm run test:emulator で走る]`, body);
  }
}

export function uniqueId(prefix = 'a'): string {
  return `${prefix}-${randomUUID()}`;
}
