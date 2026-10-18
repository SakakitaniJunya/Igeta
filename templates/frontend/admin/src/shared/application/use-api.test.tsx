// 管理 API の文脈のテスト: Provider の外では投げる・中では渡された Api を返す。

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider, useApi } from '@/shared/application/use-api';
import { fakeApi } from '@/shared/test-support/fake-api';

describe('useApi', () => {
  it('ApiProvider の外では投げる', () => {
    expect(() => renderHook(() => useApi())).toThrow('useApi must be used inside <ApiProvider>');
  });

  it('ApiProvider の中では渡された Api を返す', () => {
    const api = fakeApi();
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useApi(), { wrapper });
    expect(result.current).toBe(api);
  });
});
