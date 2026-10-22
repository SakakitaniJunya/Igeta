/** Postgres が要る suite。REQUIRE_POSTGRES=1 のとき PG_URL が無ければ飛ばさず落とす。 */
import { describeIntegrationSuite } from './integration-suite';
import type { Environment, SuiteEnvironment } from './integration-suite';

/** 環境変数から、PG_URL があるか・落とす指定があるかを読む。 */
export function postgresEnvironment(env: Environment): SuiteEnvironment {
  return { isAvailable: Boolean(env['PG_URL']), isRequired: env['REQUIRE_POSTGRES'] === '1' };
}

/** PG_URL があるときだけ body を走らせる。 */
export function describePostgres(name: string, body: () => void): void {
  describeIntegrationSuite({
    ...postgresEnvironment(process.env),
    name,
    body,
    reason: 'PG_URL が無い (Postgres 16 を立てて PG_URL を渡す)',
  });
}
