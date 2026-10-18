import { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { createFirestore, firestoreSettings } from './firestore.js';

describe('firestoreSettings', () => {
  it('emulator が無ければ REST を使う', () => {
    expect(firestoreSettings('p', {}).preferRest).toBe(true);
  });

  it('emulator があれば gRPC に倒す', () => {
    expect(firestoreSettings('p', { FIRESTORE_EMULATOR_HOST: 'localhost:8080' }).preferRest).toBe(false);
  });

  it('project は引数 → GCP_PROJECT → GCLOUD_PROJECT の順', () => {
    const env = { GCP_PROJECT: 'from-gcp', GCLOUD_PROJECT: 'from-gcloud' };
    expect(firestoreSettings('arg', env).projectId).toBe('arg');
    expect(firestoreSettings(undefined, env).projectId).toBe('from-gcp');
    expect(firestoreSettings(undefined, { GCLOUD_PROJECT: 'from-gcloud' }).projectId).toBe('from-gcloud');
  });

  it('どれも無ければ projectId を渡さない (SDK の自動検出に任せる)', () => {
    expect('projectId' in firestoreSettings(undefined, {})).toBe(false);
  });
});

describe('createFirestore', () => {
  it('Firestore を作る', () => {
    expect(createFirestore('demo-igeta')).toBeInstanceOf(Firestore);
  });
});
