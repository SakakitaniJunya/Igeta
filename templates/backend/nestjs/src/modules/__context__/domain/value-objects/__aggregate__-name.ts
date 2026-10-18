/** 値オブジェクトの雛形。作るときに意味 (長さ 1〜40) を確かめ、作った後は変えない。 */
export class __Aggregate__Name {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * 前後の空白を落として長さを確かめ、外れていれば RangeError。
   * 入力の形 (文字列か、項目が揃っているか) は presentation の zod が先に見る。意味はここで見て、usecase が invalid にする。
   */
  static create(value: string): __Aggregate__Name {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 40) {
      throw new RangeError(`invalid __aggregate__ name length: ${trimmed.length}`);
    }
    return new __Aggregate__Name(trimmed);
  }

  equals(other: __Aggregate__Name): boolean {
    return this.value === other.value;
  }
}
