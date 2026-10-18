import { Body, Controller, ForbiddenException, Get, BadGatewayException, Inject, Logger, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiResponseException, configureHttp, toErrorResponse } from '@/entries/http/all-exceptions.filter.js';
import { apiError } from '@/shared/presentation/api-response.js';

const SECRET = 'secret-token-abc123';

@Controller('t')
class ThrowingController {
  @Get('boom')
  boom(): never {
    throw new Error(SECRET);
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException(SECRET);
  }

  @Get('bad-gateway')
  badGateway(): never {
    throw new BadGatewayException(SECRET);
  }

  @Get('api')
  api(): never {
    throw new ApiResponseException(apiError(401, 'UNAUTHORIZED', 'nope'));
  }

  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body ?? null;
  }
}

describe('AllExceptionsFilter と configureHttp', () => {
  let app: NestExpressApplication;
  let logged: ReturnType<typeof vi.spyOn>;

  async function start(options: Parameters<typeof configureHttp>[1]) {
    const moduleRef = await Test.createTestingModule({ controllers: [ThrowingController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureHttp(app, options);
    await app.init();
    return request(app.getHttpServer());
  }

  beforeEach(() => {
    logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await app.close();
    logged.mockRestore();
  });

  it('想定外の例外は 500 の定型で、内側の message を本文に出さずログにだけ残す', async () => {
    const response = await (await start({ bodyLimit: 1024 })).get('/t/boom');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'internal server error' } });
    expect(response.text).not.toContain(SECRET);
    expect(logged).toHaveBeenCalledWith(`Error: ${SECRET}`, expect.any(String));
  });

  it('5xx の HttpException も REQUEST_REJECTED にせず、記録して 500 INTERNAL_ERROR にする', async () => {
    const response = await (await start({ bodyLimit: 1024 })).get('/t/bad-gateway');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'internal server error' } });
    expect(response.text).not.toContain(SECRET);
    expect(logged).toHaveBeenCalledWith(`BadGatewayException: ${SECRET}`, expect.any(String));
  });

  it('経路なしは 404', async () => {
    const response = await (await start({ bodyLimit: 1024 })).get('/t/missing');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'route not found' } });
  });

  it('Nest の他の 4xx は status を保ち、元の message を本文に出さない', async () => {
    const response = await (await start({ bodyLimit: 1024 })).get('/t/forbidden');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REQUEST_REJECTED');
    expect(response.text).not.toContain(SECRET);
  });

  it('ApiResponseException は持っている応答をそのまま返す', async () => {
    const response = await (await start({ bodyLimit: 1024 })).get('/t/api');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', message: 'nope' } });
  });

  it('不正な JSON は 400 MALFORMED_REQUEST', async () => {
    const response = await (await start({ bodyLimit: 1024 }))
      .post('/t/echo')
      .set('content-type', 'application/json')
      .send('{"a":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_REQUEST');
  });

  it('本文が上限以下なら通り、超えると 413', async () => {
    const agent = await start({ bodyLimit: 32 });
    const small = await agent.post('/t/echo').send({ a: 'x' });
    expect(small.status).toBe(201);
    const large = await agent.post('/t/echo').send({ a: 'x'.repeat(64) });
    expect(large.status).toBe(413);
    expect(large.body).toEqual({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'request body is too large' } });
  });

  it('corsOrigins を渡した origin にだけ CORS を許し、省くと許さない', async () => {
    const withCors = await start({ bodyLimit: 1024, corsOrigins: ['https://app.example.com'] });
    const allowed = await withCors.get('/t/boom').set('origin', 'https://app.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
    const other = await withCors.get('/t/boom').set('origin', 'https://evil.example.com');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();

    const without = await start({ bodyLimit: 1024 });
    const none = await without.get('/t/boom').set('origin', 'https://app.example.com');
    expect(none.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('toErrorResponse', () => {
  it('4xx でも例外でもない物は undefined (想定外として扱う)', () => {
    expect(toErrorResponse(new Error('x'))).toBeUndefined();
    expect(toErrorResponse('x')).toBeUndefined();
    expect(toErrorResponse({ status: 500 })).toBeUndefined();
    expect(toErrorResponse(new BadGatewayException())).toBeUndefined();
  });
});
