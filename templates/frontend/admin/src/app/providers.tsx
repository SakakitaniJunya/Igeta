// Provider を積む。管理 API (App Bridge のセッショントークンを Bearer に付ける) の 1 つだけ。
// 試験では App Bridge の偽物を bridge で渡す。

import { useMemo, type ReactNode } from 'react';
import { ApiProvider } from '@/shared/application/use-api';
import { appBridge, type AppBridge } from '@/shared/infrastructure/app-bridge';
import { createApi } from '@/shared/infrastructure/create-api';

export function Providers({ children, bridge = appBridge }: { readonly children: ReactNode; readonly bridge?: AppBridge }) {
  const api = useMemo(() => createApi(() => bridge.idToken()), [bridge]);
  return <ApiProvider api={api}>{children}</ApiProvider>;
}
