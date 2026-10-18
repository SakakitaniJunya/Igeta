import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandRunner, RunOptions, RunResult } from './CommandRunner.js';

export interface Call {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
  readonly env: Readonly<Record<string, string>> | undefined;
  readonly timeoutMs: number | undefined;
}

export type Handler = (call: Call) => Partial<RunResult> | undefined;

const OK: RunResult = { status: 0, output: '', missing: false };

/** 実際には何も走らせず、呼ばれた順を記録し、handler が返した結果を返す CommandRunner。 */
export class FakeRunner implements CommandRunner {
  readonly calls: Call[] = [];
  readonly #handler: Handler;

  constructor(handler: Handler = () => undefined) {
    this.#handler = handler;
  }

  run(command: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    const call: Call = { command, args, cwd: options.cwd, env: options.env, timeoutMs: options.timeoutMs };
    this.calls.push(call);
    return Promise.resolve({ ...OK, ...this.#handler(call) });
  }

  /** `command args…` の形で並べた呼び出し */
  get lines(): string[] {
    return this.calls.map((c) => [c.command, ...c.args].join(' '));
  }
}

export const isVitest = (call: Call): boolean => call.args.some((a) => a.includes('--outputFile=vitest-result.json'));

/** vitest の結果ファイルを cwd に書く */
export function writeVitestResult(call: Call, assertions: Array<{ file: string; status: string; title?: string }>): void {
  const byFile = new Map<string, Array<{ status: string; title: string }>>();
  for (const a of assertions) byFile.set(a.file, [...(byFile.get(a.file) ?? []), { status: a.status, title: a.title ?? 't' }]);
  const testResults = [...byFile].map(([name, assertionResults]) => ({ name, status: 'passed', assertionResults }));
  writeFileSync(join(call.cwd ?? '.', 'vitest-result.json'), JSON.stringify({ testResults }));
}
