// Provider のテスト: 子から useApi で Api が取れる。その要求は App Bridge のトークンを Bearer に付ける。

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useApi } from '@/shared/application/use-api';
import type { Api } from '@/shared/domain/api';
import { fakeAppBridge } from '@/shared/test-support/fake-app-bridge';

describe('Providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('子から useApi で取れ、その要求は App Bridge のトークンを Bearer に付ける', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const seen: { api?: Api } = {};
    function Probe() {
      seen.api = useApi();
      return null;
    }

    render(
      <Providers bridge={fakeAppBridge({ token: 'tok-1' })}>
        <Probe />
      </Providers>,
    );
    await seen.api?.get('/admin/api/ping');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ authorization: 'Bearer tok-1' });
  });
});
