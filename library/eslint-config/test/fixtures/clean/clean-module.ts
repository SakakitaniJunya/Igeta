/** 規約に沿った本番コードの見本。 */
import type { Linter } from 'eslint';

/** 設定の種類。 */
export type ConfigKind = 'base' | 'tests';

const MAX_RETRIES = 3;
const KINDS = ['base', 'tests'] as const;

/** 再試行できるかを返す。 */
export function isRetryable(retries: number): boolean {
  return retries < MAX_RETRIES;
}

/** 設定の種類を並べて返す。 */
export function listKinds(config: Linter.Config): readonly string[] {
  const names = KINDS.map((kind) => `${kind}:${config.name ?? ''}`);
  return names;
}
