/** 新しい id を作る部品。テストでは固定の列に差し替える。 */

/** id を 1 つ作る。 */
export interface IdGenerator {
  next(): string;
}

/** UUID v4 で id を作る generator。 */
export function createUuidGenerator(): IdGenerator {
  return { next: () => crypto.randomUUID() };
}
