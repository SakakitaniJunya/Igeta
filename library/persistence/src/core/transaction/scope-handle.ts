/** runner が scope に結びつけた Transaction の実体を、キャスト無しで取り出す対応表。 */
import type { TransactionScope } from './transaction';

/** scope を作る関数と、scope から実体を取り出す関数の組。 */
export interface ScopeHandles<Handle> {
  createScope(handle: Handle): TransactionScope;
  handleOf(scope: TransactionScope): Handle;
  /** Transaction の終わりに呼ぶ (commit でも rollback でも)。以後その scope は使えない。 */
  endScope(scope: TransactionScope): void;
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
      if (handle === undefined) throw new Error('この runner が作っていない、または終わった Transaction の scope です');

      return handle;
    },
    endScope(scope) {
      handles.delete(scope);
    },
  };
}
