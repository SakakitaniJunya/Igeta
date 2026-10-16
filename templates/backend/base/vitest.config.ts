import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    // エミュレータのテストは同じ Firestore エミュレータを共有し、消さない (id をユニークにして分ける)。
    // ファイルを並べて走らせると、別のファイルの書き込みが件数の確認に紛れ込むので、ファイル間は順に走らせる。
    fileParallelism: false,
    testTimeout: process.env['FIRESTORE_EMULATOR_HOST'] ? 30000 : undefined,
    hookTimeout: process.env['FIRESTORE_EMULATOR_HOST'] ? 30000 : undefined,
  },
});
