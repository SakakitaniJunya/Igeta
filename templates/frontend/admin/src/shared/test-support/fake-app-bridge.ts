// App Bridge の偽物。window.shopify が無い環境 (jsdom) で、トークンを差し替える。呼ばれた回数を数える。

import type { AppBridge } from '@/shared/infrastructure/app-bridge';

export interface FakeAppBridge extends AppBridge {
  /** idToken を呼ばれた回数。 */
  readonly idTokenCalls: () => number;
}

export function fakeAppBridge(options: { readonly token?: string } = {}): FakeAppBridge {
  let calls = 0;
  return {
    idToken: () => {
      calls += 1;
      return Promise.resolve(options.token ?? 'test-token');
    },
    idTokenCalls: () => calls,
  };
}
