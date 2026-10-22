import { describe, expect, it } from 'vitest';
import { firestoreSettings } from './client';

describe('firestore/client', () => {
  it('TST-404 FIRESTORE_EMULATOR_HOST があるとき preferRest は false', () => {
    const settings = firestoreSettings(undefined, { FIRESTORE_EMULATOR_HOST: 'localhost:8086' });

    expect(settings.preferRest).toBe(false);
  });

  it('TST-405 環境変数が無いとき preferRest は true', () => {
    const settings = firestoreSettings(undefined, {});

    expect(settings.preferRest).toBe(true);
  });

  it('TST-406 引数・GCP_PROJECT・GCLOUD_PROJECT が全部あるとき projectId は引数の値', () => {
    const env = { GCP_PROJECT: 'from-gcp', GCLOUD_PROJECT: 'from-gcloud' };

    const settings = firestoreSettings('from-argument', env);

    expect(settings.projectId).toBe('from-argument');
  });
});
