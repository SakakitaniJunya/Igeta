// 集約の雛形。domain は他の層も npm も知らない (domain-is-framework-free)。
// クラス図 (docs/ai/specs/__context__/domain/NN-*.md) に `class __Aggregate__` を描く (domain-drift が照合する)。

import { __Aggregate__AlreadyClosedError } from './errors/__aggregate__-already-closed.error.js';
import type { __Aggregate__Name } from './value-objects/__aggregate__-name.js';

export type __Aggregate__Status = 'open' | 'closed';

/** <この集約が何か・どの表に載るかを 1 行で (例: 顧客マスタ (TBL-022)。ID は物理データモデルのもの)>。 */
export class __Aggregate__ {
  readonly id: string;
  readonly name: __Aggregate__Name;
  readonly status: __Aggregate__Status;

  constructor(params: { id: string; name: __Aggregate__Name; status: __Aggregate__Status }) {
    this.id = params.id;
    this.name = params.name;
    this.status = params.status;
  }

  /** 状態を変える操作は、新しいインスタンスを返す (自分は変えない)。不変条件の違反はドメインエラーを投げる。 */
  close(): __Aggregate__ {
    if (this.status === 'closed') {
      throw new __Aggregate__AlreadyClosedError(this.id);
    }
    return new __Aggregate__({ ...this, status: 'closed' });
  }
}
