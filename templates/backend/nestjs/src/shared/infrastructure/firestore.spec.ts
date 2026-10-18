import { describe, expect, it } from 'vitest';
import { createFirestore, resolveFirestoreSettings } from '@/shared/infrastructure/firestore.js';

describe('resolveFirestoreSettings', () => {
  it('emulator が無ければ REST を優先する', () => {
    expect(resolveFirestoreSettings({}).preferRest).toBe(true);
  });

  it('emulator があれば gRPC に倒す', () => {
    expect(resolveFirestoreSettings({ FIRESTORE_EMULATOR_HOST: 'localhost:8080' }).preferRest).toBe(false);
  });

  it('project は引数、GCP_PROJECT、GCLOUD_PROJECT の順で選ぶ', () => {
    const env = { GCP_PROJECT: 'from-gcp', GCLOUD_PROJECT: 'from-gcloud' };
    expect(resolveFirestoreSettings(env, 'from-arg').projectId).toBe('from-arg');
    expect(resolveFirestoreSettings(env).projectId).toBe('from-gcp');
    expect(resolveFirestoreSettings({ GCLOUD_PROJECT: 'from-gcloud' }).projectId).toBe('from-gcloud');
  });

  it('どれも無ければ projectId を持たない', () => {
    expect(resolveFirestoreSettings({})).toEqual({ preferRest: true });
  });
});

describe('createFirestore', () => {
  it('渡した project の Firestore を作る', () => {
    const db = createFirestore('demo-igeta');
    expect(db.collection('x').path).toBe('x');
  });
});
