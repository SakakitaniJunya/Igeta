// テナント境界の値オブジェクト。全業務テーブルの `tenant_id` と RLS の `app.tenant_id` は
// 必ずこの型を通す。repository は TenantId なしにクエリを組めない。

import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';

const PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export class TenantId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<TenantId> {
    if (!PATTERN.test(raw)) {
      return err(domainError('TENANT_ID_INVALID', { raw }));
    }
    return ok(new TenantId(raw));
  }

  equals(other: TenantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
