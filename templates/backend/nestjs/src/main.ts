// 起動。Nest を作り、入口が持つ HTTP の設定 (本文の上限・CORS) を足して listen する。spec 無し。
// 環境変数: GCP_PROJECT (必須)・PORT (既定 8080)・CORS_ORIGINS (許す origin をカンマ区切りで。省くと CORS は無効)。

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@/app.module.js';
import { configureHttp } from '@/entries/http/all-exceptions.filter.js';

/** JSON の本文の上限 (バイト)。アプリごとに必要な大きさへ変える。 */
const BODY_LIMIT_BYTES = 1024 * 1024;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const corsOrigins = process.env['CORS_ORIGINS'];
  configureHttp(app, {
    bodyLimit: BODY_LIMIT_BYTES,
    corsOrigins: corsOrigins ? corsOrigins.split(',').map((origin) => origin.trim()) : undefined,
  });
  await app.listen(Number(process.env['PORT'] ?? 8080));
}

void bootstrap();
