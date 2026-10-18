import { spawn } from 'node:child_process';

export interface RunOptions {
  readonly cwd?: string;
  /** 親の環境変数に足す値 */
  readonly env?: Readonly<Record<string, string>>;
}

export interface RunResult {
  /** 終了コード。起動できなかったとき・シグナルで死んだときは null */
  readonly status: number | null;
  /** stdout と stderr を混ぜた出力の末尾 (長すぎる分は捨てる) */
  readonly output: string;
  /** コマンドが見つからない (ENOENT) */
  readonly missing: boolean;
}

/** 外部コマンドを走らせる口。検査の組み立て (手順の順序・判定) を、実際の install や build から切り離す。 */
export interface CommandRunner {
  run(command: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
}

const MAX_OUTPUT_CHARS = 1_000_000;

export class SpawnRunner implements CommandRunner {
  run(command: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      const done = (result: RunResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const collect = (chunk: Buffer): void => {
        output += chunk.toString('utf8');
        if (output.length > MAX_OUTPUT_CHARS) output = output.slice(output.length - MAX_OUTPUT_CHARS);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', (error: NodeJS.ErrnoException) => {
        done({ status: null, output: error.message, missing: error.code === 'ENOENT' });
      });
      child.on('close', (status) => done({ status, output, missing: false }));
    });
  }
}
