// 管理画面のビルドと試験の設定。成果物は dist/app.js と dist/app.css の決まった名前 (配る側は起動時に決まった名前の表で読む)。
// `@/` は src/ の絶対パス (tsconfig の paths と同じ)。

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/shared/test-support/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
