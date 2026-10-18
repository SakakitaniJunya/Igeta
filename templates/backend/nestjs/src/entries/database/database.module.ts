// Firestore を provider として出す。生成は shared/infrastructure の createFirestore を通す
// (entries は @google-cloud/firestore を直接 import しない)。@Global なので、入口の Nest module は import せずに FIRESTORE を注入できる。

import { Global, Module } from '@nestjs/common';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { requireEnv } from '@/shared/infrastructure/env.js';

export const FIRESTORE = Symbol('FIRESTORE');

@Global()
@Module({
  providers: [{ provide: FIRESTORE, useFactory: () => createFirestore(requireEnv('GCP_PROJECT')) }],
  exports: [FIRESTORE],
})
export class DatabaseModule {}
