// 画面の判断の規則 (サーバの状態の読み替え・閉じられるか)。UI も通信も知らない純関数。
// 規則を変えるときはここと表のテストだけを直す。画面は結果を受けて描く。

import type { __Feature__Status } from '@/features/__feature__/domain/__feature__.model';

/** サーバの状態を画面の状態にする。知らない値は closed 扱い (安全側: 開いていると見せて操作させない)。 */
export function normalizeStatus(raw: string): __Feature__Status {
  return raw === 'open' ? 'open' : 'closed';
}

/** 閉じられるのは開いているものだけ。閉じる操作の前には必ず確認を出す。 */
export function canClose(status: __Feature__Status): boolean {
  return status === 'open';
}
