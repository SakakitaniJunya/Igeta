/** runner が scope に結びつけた Transaction の実体を、キャスト無しで取り出す対応表。 */
import type { TransactionScope } from './transaction';

/** scope を作る関数と、scope から実体を取り出す関数の組。 */
export interface ScopeHandles<Handle> {
  createScope(handle: Handle): TransactionScope;
  handleOf(scope: TransactionScope): Handle;
}

/** runner ごとに 1 つ作る。別の runner が作った scope は取り出せない。 */
export function createScopeHandles<Handle>(): ScopeHandles<Handle> {
  const handles = new WeakMap<TransactionScope, Handle>();

  return {
    createScope(handle) {
      const scope: TransactionScope = { kind: 'transaction-scope' };
      handles.set(scope, handle);

      return scope;
    },
    handleOf(scope) {
      const handle = handles.get(scope);
      if (handle === undefined) throw new Error('この runner が作っていない scope です');

      return handle;
    },
  };
}
