import { ExitCode } from './ExitCode.js';

/**
 * violation   = 対象が規約に違反している (修正すれば直る)
 * cannot-check = 検査そのものが成立しない (テンプレが無い等。対象の是非は不明)
 */
export type Severity = 'violation' | 'cannot-check';

export interface Violation {
  readonly severity: Severity;
  readonly message: string;
  /** リポジトリルートからの相対パス */
  readonly file?: string;
  readonly line?: number;
}

/** 検査結果の集約。出力整形と終了コード決定をここに一本化する。 */
export class Report {
  readonly #violations: Violation[] = [];

  add(violation: Violation): void {
    this.#violations.push(violation);
  }

  addAll(violations: readonly Violation[]): void {
    for (const violation of violations) this.#violations.push(violation);
  }

  get violations(): readonly Violation[] {
    return this.#violations;
  }

  get isEmpty(): boolean {
    return this.#violations.length === 0;
  }

  /** cannot-check が 1 件でもあれば 2。violation のみなら 1。空なら 0。 */
  get exitCode(): ExitCode {
    if (this.#violations.some((v) => v.severity === 'cannot-check')) return ExitCode.CannotCheck;
    return this.#violations.length > 0 ? ExitCode.Violation : ExitCode.Ok;
  }

  format(): string {
    return this.#violations
      .map((v) => {
        const label = v.severity === 'cannot-check' ? 'CANNOT-CHECK' : 'VIOLATION';
        const where = v.file === undefined ? '' : ` ${v.file}${v.line === undefined ? '' : `:${v.line}`}`;
        return `${label}${where} ${v.message}`;
      })
      .join('\n');
  }
}
