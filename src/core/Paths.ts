import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Igeta パッケージ自身のルート。templates/ と lint 設定の供給元。 */
export const IGETA_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
