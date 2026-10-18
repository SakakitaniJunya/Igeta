// 稼働確認。認証なし。

import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sendResponse } from '@/entries/http/send-response.js';
import { ok } from '@/shared/presentation/api-response.js';

@Controller()
export class HealthController {
  @Get('healthz')
  check(@Res() res: Response): void {
    sendResponse(res, ok({}));
  }
}
