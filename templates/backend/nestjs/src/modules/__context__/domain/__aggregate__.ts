// 集約。domain は自分の module の domain と shared/domain 以外を知らない。

import { __Aggregate__AlreadyClosedError } from '@/modules/__context__/domain/errors/__aggregate__-already-closed.error.js';
import type { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';

export type __Aggregate__Status = 'open' | 'closed';

/** 名前を持ち、開いている間だけ閉じられる集約。 */
export class __Aggregate__ {
  readonly id: string;
  readonly name: __Aggregate__Name;
  readonly status: __Aggregate__Status;

  constructor(params: { id: string; name: __Aggregate__Name; status: __Aggregate__Status }) {
    this.id = params.id;
    this.name = params.name;
    this.status = params.status;
  }

  /** 状態を変える操作は、新しいインスタンスを返す (自分は変えない)。閉じ済みを閉じるとドメインエラー。 */
  close(): __Aggregate__ {
    if (this.status === 'closed') {
      throw new __Aggregate__AlreadyClosedError(this.id);
    }
    return new __Aggregate__({ id: this.id, name: this.name, status: 'closed' });
  }
}
