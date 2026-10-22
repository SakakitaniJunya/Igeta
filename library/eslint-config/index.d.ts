import type { Linter } from 'eslint';

/** 本番コード用の flat config。 */
export declare const base: Linter.Config[];
/** テスト用の flat config。base の後ろに足す。 */
export declare const tests: Linter.Config[];
