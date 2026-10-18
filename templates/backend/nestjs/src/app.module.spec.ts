import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '@/app.module.js';
import { configureHttp } from '@/entries/http/all-exceptions.filter.js';

describe('AppModule', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    vi.stubEnv('GCP_PROJECT', 'demo-igeta');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureHttp(app, { bodyLimit: 1024 });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('compile でき、GET /healthz は 200', async () => {
    const response = await request(app.getHttpServer()).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('経路なしは API の形の 404', async () => {
    const response = await request(app.getHttpServer()).get('/nothing');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
