import { base, tests } from '@igeta/eslint-config';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...base,
  ...tests,
  // ツールの設定ファイルは default export を求められる (TS-03 の例外)
  { files: ['*.config.ts'], rules: { 'import/no-default-export': 'off' } },
];
