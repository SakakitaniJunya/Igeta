/** 値オブジェクト。作るときに形を確かめ、作った後は変えない。名前は前後の空白を落として 1〜40 文字。 */
export class __Aggregate__Name {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** 長さが範囲外なら RangeError。application が invalid に変えて返す。 */
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
