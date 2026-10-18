import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseModule, FIRESTORE } from '@/entries/database/database.module.js';

describe('DatabaseModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GCP_PROJECT を渡すと FIRESTORE が解決でき、その project を向く', async () => {
    vi.stubEnv('GCP_PROJECT', 'demo-igeta');
    const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    const db = moduleRef.get<{ projectId: string }>(FIRESTORE);
    expect(db.projectId).toBe('demo-igeta');
  });

  it('GCP_PROJECT が無ければ組み立てで落ちる', async () => {
    vi.stubEnv('GCP_PROJECT', '');
    await expect(Test.createTestingModule({ imports: [DatabaseModule] }).compile()).rejects.toThrow(/GCP_PROJECT/);
  });
});
