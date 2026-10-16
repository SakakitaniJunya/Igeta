// コントローラのテストの雛形。ユースケースは execute だけを持つ偽物にし、状態と本文の対応だけを確かめる。

import { describe, expect, it, vi } from 'vitest';
import { conflict, notFound } from '../../../shared/kernel/app-error.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type { Close__Aggregate__UseCase } from '../application/close-__aggregate__.usecase.js';
import { handleClose__Aggregate__ } from './__aggregate__.controller.js';

function stub(execute: Close__Aggregate__UseCase['execute']): Close__Aggregate__UseCase {
  return { execute } as unknown as Close__Aggregate__UseCase;
}

describe('handleClose__Aggregate__', () => {
  it('成功は 200 と本文', async () => {
    const response = await handleClose__Aggregate__(stub(vi.fn().mockResolvedValue(ok({ id: 'a-1', status: 'closed' }))), 'a-1');
    expect(response).toEqual({ status: 200, body: { id: 'a-1', status: 'closed' } });
  });

  it('not_found は 404', async () => {
    const response = await handleClose__Aggregate__(stub(vi.fn().mockResolvedValue(err(notFound('x')))), 'a-1');
    expect(response.status).toBe(404);
  });

  it('conflict は 409', async () => {
    const response = await handleClose__Aggregate__(stub(vi.fn().mockResolvedValue(err(conflict('x')))), 'a-1');
    expect(response.status).toBe(409);
  });
});
