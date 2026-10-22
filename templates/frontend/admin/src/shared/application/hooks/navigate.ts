// 画面の中の移動の hook。実際の履歴の操作は shared/infrastructure/navigate.ts (search の引き継ぎもそこ)。

import { useCallback } from 'react';
import { navigate, type NavigateOptions } from '@/shared/infrastructure/navigate';

export function useNavigate(): (path: string, options?: NavigateOptions) => void {
  return useCallback((path: string, options?: NavigateOptions) => navigate(path, options), []);
}
