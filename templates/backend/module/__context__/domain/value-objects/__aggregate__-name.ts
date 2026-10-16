/** 値オブジェクトの雛形。作るときに形を確かめ、作った後は変えない。<決まりの出典 (例: クラス図の不変条件 IV-7)>。 */
export class __Aggregate__Name {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** 形が違えば RangeError。入力の検査 (400 を返す) は application が先に済ませ、ここは最後の砦にする。 */
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
