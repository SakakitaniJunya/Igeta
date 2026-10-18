// Firestore の doc ID (の一部) に埋め込む前に必ず通す allow-list 検証。
// `/` を含む値を許すと `.doc()` が意図しない祖先パスへ書き込む (パス注入)。
// 対象は、外部入力の id と、連結して doc ID を組み立てる全ての値。
// 英数字・`_`・`-` の 1〜64 文字だけを通すので、`.` や `..` (Firestore が doc ID に使えない値) も落ちる。

const DOC_ID_SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidDocIdSegment(value: string): boolean {
  return DOC_ID_SEGMENT_RE.test(value);
}

export class InvalidDocIdSegment extends Error {
  constructor() {
    // 生値をメッセージ・ログに残さない (値そのものが攻撃対象や PII の一部を含みうるため)。
    super('invalid doc id segment');
    this.name = 'InvalidDocIdSegment';
  }
}

/** 不正なら投げる (呼び出し側は 400/422 へ変換する)。 */
export function assertValidDocIdSegment(value: string): void {
  if (!isValidDocIdSegment(value)) {
    throw new InvalidDocIdSegment();
  }
}
