// 埋め込み管理画面のビルド。HTML は backend (presentation/admin/shell.ts) が返すので作らない。
// 成果物は dist/app.js と dist/app.css の決まった名前 (backend は起動時に決まった名前の表で読み、/admin/assets/<名前> で配る)。

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
    setupFiles: ['src/test-support/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
