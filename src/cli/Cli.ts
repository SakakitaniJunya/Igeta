import { ExitCode } from '../core/ExitCode.js';
import { ArgParseError } from './Args.js';
import type { Command, CommandContext } from './Command.js';

const HELP_FLAGS = new Set(['--help', '-h', 'help']);

export class Cli {
  readonly #commands = new Map<string, Command>();

  register(command: Command): this {
    this.#commands.set(command.name, command);
    return this;
  }

  usage(): string {
    const width = Math.max(...[...this.#commands.keys()].map((name) => name.length));
    return [
      'usage: igeta <command> [options]',
      '',
      ...[...this.#commands.values()].map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
      '',
      '  igeta <command> --help で各コマンドの引数を出す',
    ].join('\n');
  }

  async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const [first, ...rest] = argv;

    if (first === undefined) {
      ctx.stderr(this.usage());
      return ExitCode.CannotCheck;
    }
    if (HELP_FLAGS.has(first)) {
      ctx.stdout(this.usage());
      return ExitCode.Ok;
    }

    const command = this.#commands.get(first);
    if (command === undefined) {
      ctx.stderr(`不明なコマンド: ${first}\n\n${this.usage()}`);
      return ExitCode.CannotCheck;
    }

    if (rest.some((arg) => HELP_FLAGS.has(arg))) {
      ctx.stdout([`igeta ${command.name} — ${command.summary}`, '', ...command.usage].join('\n'));
      return ExitCode.Ok;
    }

    try {
      return await command.run(rest, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.stderr(`ERROR ${message}`);
      if (error instanceof ArgParseError) {
        ctx.stderr(['', `igeta ${command.name} — ${command.summary}`, ...command.usage].join('\n'));
      }
      return ExitCode.CannotCheck;
    }
  }
}
