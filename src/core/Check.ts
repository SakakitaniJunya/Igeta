import type { Violation } from './Report.js';

export interface CheckContext {
  /** 検査対象リポジトリのルート */
  readonly targetRoot: string;
  /** Igeta パッケージ自身のルート (templates/ の供給元) */
  readonly igetaRoot: string;
}

/**
 * 検査 1 種。自身では exit も print もせず、違反の配列だけを返す。
 * 終了コードと出力整形は Report が一手に引き受ける。
 */
export interface Check {
  readonly name: string;
  run(ctx: CheckContext): Promise<readonly Violation[]> | readonly Violation[];
}
