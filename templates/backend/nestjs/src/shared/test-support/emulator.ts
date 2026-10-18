// Firestore エミュレータを使うテストの共通部品。本番のコードからは import しない。
// emulator が無ければ skip して理由を出す。REQUIRE_EMULATOR=1 のときは skip せず落とす (CI で素通りさせない)。

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/** emulator に繋ぐときの project。npm run test:emulator と同じ値。 */
export const EMULATOR_PROJECT = 'demo-igeta';

const SKIP_REASON = 'FIRESTORE_EMULATOR_HOST が無いので skip (npm run test:emulator で実行)';

export function describeEmulator(name: string, fn: () => void): void {
  if (process.env['FIRESTORE_EMULATOR_HOST']) {
    describe(name, fn);
  } else if (process.env['REQUIRE_EMULATOR'] === '1') {
    describe(name, () => {
      it('Firestore エミュレータが必要 (REQUIRE_EMULATOR=1)', () => {
        expect.fail('FIRESTORE_EMULATOR_HOST が無い。emulator を起動してから実行する');
      });
    });
  } else {
    describe.skip(`${name} [${SKIP_REASON}]`, fn);
  }
}

/** emulator は消さずに共有するので、テストごとにユニークな doc id を使う。 */
export function uniqueId(prefix = 'a'): string {
  return `${prefix}-${randomUUID()}`;
}
