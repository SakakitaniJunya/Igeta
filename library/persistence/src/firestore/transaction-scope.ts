/** Firestore の Transaction を scope に結びつける対応表。runner と repository が同じものを使う。 */
import type { Transaction } from '@google-cloud/firestore';
import { createScopeHandles } from '../core/scope-handle';

/** Firestore の scope を作る・読む。他の実装の scope を渡すと普通の Error になる。 */
export const firestoreScopes = createScopeHandles<Transaction>();
