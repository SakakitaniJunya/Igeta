// 入口の経路の表。ここでやるのは 3 つだけ: Guard で認証する / HTTP から値を取り出す / module の公開面を呼んで HttpResponse を返す。
// 値は検証せず unknown のまま渡す (形の検証は module の presentation の zod)。業務の判断はここに書かない。

import { Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { __Context__Module } from '@/modules/__context__/index.js';
import { sendResponse } from '@/entries/http/send-response.js';
import { __Entry__Guard } from '@/entries/__entry__/guard.js';

/** module の公開面を差し込むトークン。provider は __Entry__EntryModule が作る。 */
export const __Context__ModuleToken = Symbol('__Context__Module');

@Controller('__aggregates__')
@UseGuards(__Entry__Guard)
export class __Entry__Controller {
  constructor(@Inject(__Context__ModuleToken) private readonly __contextVar__: __Context__Module) {}

  @Get()
  async list(@Query() query: unknown, @Res() res: Response): Promise<void> {
    sendResponse(res, await this.__contextVar__.list__Aggregate__Items(query));
  }

  @Post()
  async create(@Body() body: unknown, @Res() res: Response): Promise<void> {
    sendResponse(res, await this.__contextVar__.create__Aggregate__(body));
  }

  @Post(':id/close')
  async close(@Param('id') id: unknown, @Res() res: Response): Promise<void> {
    sendResponse(res, await this.__contextVar__.close__Aggregate__(id));
  }
}
