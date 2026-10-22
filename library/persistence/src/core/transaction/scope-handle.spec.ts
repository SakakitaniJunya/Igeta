import { describe, expect, it } from 'vitest';
import { AppError } from '#core/result/app-error';
import { createScopeHandles } from './scope-handle';

describe('scope-handle', () => {
  it('TST-111 createScope で作った scope のとき handleOf は同じ実体を返す', () => {
    const { createScope, handleOf } = createScopeHandles<string>();
    const scope = createScope('handle-1');

    const handle = handleOf(scope);

    expect(handle).toBe('handle-1');
  });

  it('TST-112 別の runner が作った scope のとき handleOf は AppError ではない普通の Error を投げる', () => {
    const otherRunnerScope = createScopeHandles<string>().createScope('handle-1');
    const { handleOf } = createScopeHandles<string>();

    const readForeignScope = () => handleOf(otherRunnerScope);

    expect(readForeignScope).toThrow(Error);
    expect(readForeignScope).not.toThrow(AppError);
  });

  it('TST-118 endScope した scope のとき handleOf は普通の Error を投げる', () => {
    const { createScope, handleOf, endScope } = createScopeHandles<string>();
    const scope = createScope('handle-1');
    endScope(scope);

    const readEndedScope = () => handleOf(scope);

    expect(readEndedScope).toThrow(Error);
    expect(readEndedScope).not.toThrow(AppError);
  });
});
