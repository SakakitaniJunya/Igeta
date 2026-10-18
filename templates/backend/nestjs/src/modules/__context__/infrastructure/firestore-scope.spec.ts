import type { Transaction } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { toScope, toTransaction } from '@/modules/__context__/infrastructure/firestore-scope.js';

describe('firestore-scope', () => {
  it('往復しても同じ物が返る', () => {
    const tx = {} as Transaction;
    expect(toTransaction(toScope(tx))).toBe(tx);
  });
});
