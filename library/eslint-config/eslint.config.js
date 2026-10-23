import { base, tests } from './index.js';

export default [
  { ignores: ['test/fixtures/violations/**', 'node_modules/**'] },
  ...base,
  ...tests,
  {
    // check-layout.js は JS の CLI で base の対象外。同じ規約 (FN-05・FN-07・MD-01) の数字だけをここで掛ける
    files: ['check-layout.js'],
    rules: { 'max-params': ['error', 3], 'max-lines': ['error', 150], 'max-lines-per-function': ['error', 40], 'max-depth': ['error', 3] },
  },
];
