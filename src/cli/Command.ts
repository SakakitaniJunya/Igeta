import type { ExitCode } from '../core/ExitCode.js';

export interface CommandContext {
  /** コマンドを実行したディレクトリ。既定の検査対象リポジトリ */
  readonly cwd: string;
  /** Igeta パッケージ自身のルート */
  readonly igetaRoot: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export abstract class Command {
  abstract readonly name: string;
  abstract readonly summary: string;
  /** `igeta <name> --help` で出す 1 行以上の使い方。省略時は summary のみ */
  readonly usage: readonly string[] = [];

  abstract run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode>;
}
