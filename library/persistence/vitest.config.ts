import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 共有の emulator・DB を使う spec が、お互いの table を消さないよう 1 ファイルずつ走らせる
    fileParallelism: false,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
});
