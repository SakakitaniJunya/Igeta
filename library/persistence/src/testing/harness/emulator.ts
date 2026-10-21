/** Firestore emulator が要る suite。REQUIRE_EMULATOR=1 のとき emulator が無ければ飛ばさず落とす。 */
import { describeIntegrationSuite } from './integration-suite';
import type { Environment, SuiteEnvironment } from './integration-suite';

/** emulator 専用の project 名 (demo- で始まる名前は実 project に繋がらない)。 */
export const EMULATOR_PROJECT = 'demo-igeta';

/** 環境変数から、emulator があるか・落とす指定があるかを読む。 */
export function emulatorEnvironment(env: Environment): SuiteEnvironment {
  return { isAvailable: Boolean(env['FIRESTORE_EMULATOR_HOST']), isRequired: env['REQUIRE_EMULATOR'] === '1' };
}

/** FIRESTORE_EMULATOR_HOST があるときだけ body を走らせる。 */
export function describeEmulator(name: string, body: () => void): void {
  describeIntegrationSuite({
    ...emulatorEnvironment(process.env),
    name,
    body,
    reason: 'FIRESTORE_EMULATOR_HOST が無い (firebase emulators:exec で走らせる)',
  });
}
