/** ドメインエラーの雛形。<どの不変条件の違反か (例: クラス図の不変条件 IV-1)>。クラス図にも描く。 */
export class __Aggregate__AlreadyClosedError extends Error {
  readonly id: string;

  constructor(id: string) {
    super('__aggregate__ already closed');
    this.name = '__Aggregate__AlreadyClosedError';
    this.id = id;
  }
}
