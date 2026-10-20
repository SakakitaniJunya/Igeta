/** emulator や DB が要る suite の、走らせる・飛ばす・落とす の判定。CI では飛ばして緑にしない。 */
import { describe, it } from 'vitest';

/** 環境変数の読み取り元。 */
export type Environment = Readonly<Record<string, string | undefined>>;

/** suite の扱い。 */
export type SuiteMode = 'run' | 'skip' | 'fail';

/** 環境が整っているか、整っていないときに落とす指定があるか。 */
export interface SuiteEnvironment {
  readonly isAvailable: boolean;
  readonly isRequired: boolean;
}

/** suite を作る指定。reason は環境が無いときの説明。 */
export interface IntegrationSuiteOptions extends SuiteEnvironment {
  readonly name: string;
  readonly reason: string;
  readonly body: () => void;
}

/** 環境があれば run。無ければ、落とす指定があるとき fail、無いとき skip。 */
export function chooseSuiteMode(environment: SuiteEnvironment): SuiteMode {
  if (environment.isAvailable) return 'run';
  if (environment.isRequired) return 'fail';

  return 'skip';
}

/** 環境に応じて describe を登録する。fail のときは、理由を題名に出して落ちる it を 1 つ登録する。 */
export function describeIntegrationSuite(options: IntegrationSuiteOptions): void {
  const mode = chooseSuiteMode(options);
  if (mode === 'run') {
    describe(options.name, options.body);
    return;
  }
  if (mode === 'skip') {
    describe.skip(`${options.name} [skip: ${options.reason}]`, options.body);
    return;
  }

  describe(options.name, () => {
    it(`${options.reason} (REQUIRE_* が指定されているので飛ばさず落とす)`, () => {
      throw new Error(options.reason);
    });
  });
}
