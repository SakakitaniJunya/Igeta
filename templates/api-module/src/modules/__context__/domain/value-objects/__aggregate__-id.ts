import { DomainError, Result, err, ok } from '@/shared/kernel/result';

/** 識別子は文字列を裸で持ち回らない。生成と検証をここに閉じる。 */
export class __Aggregate__Id {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<__Aggregate__Id> {
    if (!/^[0-9a-z][0-9a-z-]{7,63}$/.test(raw)) {
      return err(new DomainError('__AGGREGATE___ID_INVALID', '__Aggregate__Id の形式が不正', { raw }));
    }
    return ok(new __Aggregate__Id(raw));
  }

  equals(other: __Aggregate__Id): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
