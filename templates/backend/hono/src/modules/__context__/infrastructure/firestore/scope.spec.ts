import type { Transaction } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { toScope, toTransaction } from './scope.js';

describe('firestore/scope', () => {
  it('Transaction → scope → Transaction で同じ物に戻る', () => {
    const tx = {} as Transaction;
    expect(toTransaction(toScope(tx))).toBe(tx);
  });
});
