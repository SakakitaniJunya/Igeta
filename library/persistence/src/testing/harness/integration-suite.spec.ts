import { describe, expect, it } from 'vitest';
import { emulatorEnvironment } from './emulator';
import { chooseSuiteMode } from './integration-suite';
import { postgresEnvironment } from './postgres';

describe('integration-suite', () => {
  it('TST-701 emulator が無く REQUIRE_EMULATOR=1 のとき suite は fail になる', () => {
    const mode = chooseSuiteMode(emulatorEnvironment({ REQUIRE_EMULATOR: '1' }));

    expect(mode).toBe('fail');
  });

  it('TST-702 PG_URL が無く REQUIRE_POSTGRES=1 のとき suite は fail になる', () => {
    const mode = chooseSuiteMode(postgresEnvironment({ REQUIRE_POSTGRES: '1' }));

    expect(mode).toBe('fail');
  });

  it('TST-701 環境が無く REQUIRE が無いとき suite は skip になる (手元だけ)', () => {
    const mode = chooseSuiteMode(emulatorEnvironment({}));

    expect(mode).toBe('skip');
  });

  it('TST-701 環境があるとき suite は run になる', () => {
    const mode = chooseSuiteMode(postgresEnvironment({ PG_URL: 'postgres://example', REQUIRE_POSTGRES: '1' }));

    expect(mode).toBe('run');
  });
});
