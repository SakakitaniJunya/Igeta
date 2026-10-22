// 入口のテスト。verify と module の公開面は偽物にして、Nest の組み立てを supertest で叩く。
// 確かめるのは、認証 (401)・本文の上限 (413)・不正な JSON (400)・値が unknown のまま module へ渡ること。

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unauthorized } from '@/shared/domain/app-error.js';
import { err, ok } from '@/shared/domain/result.js';
import { configureHttp } from '@/entries/http/all-exceptions.filter.js';
import { __Context__ModuleToken, __Entry__Controller } from '@/entries/__entry__/controller.js';
import { VERIFIER, __Entry__Guard } from '@/entries/__entry__/guard.js';

const BODY_LIMIT = 64;

describe('__Entry__Controller', () => {
  let app: NestExpressApplication;
  const verify = vi.fn();
  const sample = {
    list__Aggregate__Items: vi.fn(),
    create__Aggregate__: vi.fn(),
    close__Aggregate__: vi.fn(),
  };

  beforeEach(async () => {
    verify.mockReset().mockResolvedValue(ok({ subject: 's-1' }));
    sample.list__Aggregate__Items.mockReset().mockResolvedValue({ status: 200, body: { ok: true, items: [], truncated: false } });
    sample.create__Aggregate__.mockReset().mockResolvedValue({ status: 201, body: { ok: true, item: {} } });
    sample.close__Aggregate__.mockReset().mockResolvedValue({ status: 200, body: { ok: true, item: {} } });
    const moduleRef = await Test.createTestingModule({
      controllers: [__Entry__Controller],
      providers: [__Entry__Guard, { provide: VERIFIER, useValue: verify }, { provide: __Context__ModuleToken, useValue: sample }],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureHttp(app, { bodyLimit: BODY_LIMIT });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('検証に落ちたら 401 で、module を呼ばない', async () => {
    verify.mockResolvedValue(err(unauthorized('bad token')));
    const response = await request(app.getHttpServer()).post('/__aggregates__').send({ name: 'x' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', message: 'bad token' } });
    expect(sample.create__Aggregate__).not.toHaveBeenCalled();
  });

  it('本文が上限を超えたら 413 で、module を呼ばない', async () => {
    const response = await request(app.getHttpServer()).post('/__aggregates__').send({ name: 'x'.repeat(BODY_LIMIT) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(sample.create__Aggregate__).not.toHaveBeenCalled();
  });

  it('不正な JSON は 400 MALFORMED_REQUEST で、module を呼ばない', async () => {
    const response = await request(app.getHttpServer())
      .post('/__aggregates__')
      .set('content-type', 'application/json')
      .send('{"name":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_REQUEST');
    expect(sample.create__Aggregate__).not.toHaveBeenCalled();
  });

  it('POST /__aggregates__ は本文を検証せず unknown のまま渡し、module の応答をそのまま返す', async () => {
    const response = await request(app.getHttpServer()).post('/__aggregates__').send({ name: 5, extra: true });
    expect(sample.create__Aggregate__).toHaveBeenCalledWith({ name: 5, extra: true });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true, item: {} });
  });

  it('GET /__aggregates__ は query を文字列のまま渡す', async () => {
    const response = await request(app.getHttpServer()).get('/__aggregates__?status=open');
    expect(sample.list__Aggregate__Items).toHaveBeenCalledWith({ status: 'open' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, items: [], truncated: false });
  });

  it('POST /__aggregates__/:id/close は id を渡す', async () => {
    const response = await request(app.getHttpServer()).post('/__aggregates__/a-1/close');
    expect(sample.close__Aggregate__).toHaveBeenCalledWith('a-1');
    expect(response.status).toBe(200);
  });

  it('module が返した失敗の status と本文をそのまま返す', async () => {
    sample.close__Aggregate__.mockResolvedValue({ status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'm' } } });
    const response = await request(app.getHttpServer()).post('/__aggregates__/zzz/close');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('検証にはヘッダと URL を渡す', async () => {
    await request(app.getHttpServer()).get('/__aggregates__').set('authorization', 'Bearer t');
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer t' }),
        url: expect.stringMatching(/\/__aggregates__$/),
      }),
    );
  });
});
