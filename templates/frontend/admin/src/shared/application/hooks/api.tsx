// 管理 API の文脈。App の Providers が ApiProvider で 1 つ渡し、hook は useApi で受ける (差し替えの継ぎ目はこの Api 1 つだけ)。

import { createContext, useContext, type ReactNode } from 'react';
import type { Api } from '@/shared/domain/api';

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { readonly api: Api; readonly children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (api === null) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
