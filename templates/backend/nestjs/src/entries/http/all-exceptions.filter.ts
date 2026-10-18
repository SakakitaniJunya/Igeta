// 想定外の例外と、Nest・body-parser が出す 4xx を、API の失敗の形 ({ok:false,error}) にする。
// 想定外 (5xx の HttpException を含む) は 500 で、内側の name・message・stack は本文に出さずログにだけ残す。経路なしは 404。
// 入口が持つ HTTP の設定 (本文の上限・CORS・この filter の登録) も、main.ts と spec が同じ形で使えるようここに置く。

import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ErrorRequestHandler, Response } from 'express';
import { apiError } from '@/shared/presentation/api-response.js';
import type { HttpResponse } from '@/shared/presentation/response.js';
import { sendResponse } from '@/entries/http/send-response.js';

/** 応答をそのまま返したい失敗 (guard の 401 など) を投げるための例外。filter が response を返す。 */
export class ApiResponseException extends HttpException {
  readonly apiResponse: HttpResponse;

  constructor(response: HttpResponse) {
    super(response.body as Record<string, unknown>, response.status);
    this.apiResponse = response;
  }
}

/** body-parser は status を持つ素のオブジェクトを投げる (http-errors。本文が上限を超えたときの 413 など)。 */
function clientStatusOf(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status } = exception as { status?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/** body-parser の JSON 構文エラー (type: entity.parse.failed) だけを 400 MALFORMED_REQUEST の例外に変える Express エラーミドルウェア。 */
export const jsonSyntaxErrorBridge: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  const type = typeof error === 'object' && error !== null ? (error as { type?: unknown }).type : undefined;
  next(type === 'entity.parse.failed' ? new ApiResponseException(apiError(400, 'MALFORMED_REQUEST', 'request body is malformed JSON')) : error);
};

export function toErrorResponse(exception: unknown): HttpResponse | undefined {
  if (exception instanceof ApiResponseException) return exception.apiResponse;
  const status = exception instanceof HttpException ? exception.getStatus() : clientStatusOf(exception);
  // 5xx の HttpException と想定外の例外は undefined (= 想定外)。filter が記録して 500 INTERNAL_ERROR にする。REQUEST_REJECTED は 4xx だけ。
  if (status === undefined || status >= 500) return undefined;
  if (status === 404) return apiError(404, 'NOT_FOUND', 'route not found');
  if (status === 413) return apiError(413, 'PAYLOAD_TOO_LARGE', 'request body is too large');
  // 400 は他の 4xx と同じ REQUEST_REJECTED (後から足した guard/pipe の BadRequestException、壊れた % の URL など)。
  // 本文の JSON 構文エラーだけ MALFORMED_REQUEST だが、Nest は body-parser の SyntaxError を素の BadRequestException に包んで種類を失う。
  // そのため configureHttp の jsonSyntaxErrorBridge が包まれる前に ApiResponseException へ変える。
  return apiError(status, 'REQUEST_REJECTED', 'request rejected');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const known = toErrorResponse(exception);
    if (known === undefined) {
      this.logger.error(
        exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    sendResponse(host.switchToHttp().getResponse<Response>(), known ?? apiError(500, 'INTERNAL_ERROR', 'internal server error'));
  }
}

export interface HttpOptions {
  /** JSON の本文の上限 (バイト)。超えると 413。 */
  readonly bodyLimit: number;
  /** CORS で許す origin。省くと CORS は有効にしない。 */
  readonly corsOrigins?: ReadonlyArray<string> | undefined;
}

/** 入口が持つ HTTP の設定。本文の上限・失敗の形・CORS。検証は持たない (形の検証は module の presentation)。 */
export function configureHttp(app: NestExpressApplication, options: HttpOptions): void {
  app.useBodyParser('json', { limit: options.bodyLimit });
  app.use(jsonSyntaxErrorBridge);
  app.useGlobalFilters(new AllExceptionsFilter());
  if (options.corsOrigins !== undefined) app.enableCors({ origin: [...options.corsOrigins] });
}
