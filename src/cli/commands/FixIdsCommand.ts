import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { FixIdsModule } from '../../generators/FixIdsModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

/**
 * 一意に解決できる裸の ID 参照だけを修飾 ID に書き換える (non-blocking N3)。
 * 既定は dry-run (--write を付けない限り 1 バイトも書かない)。複数ファイルのローカル採番で
 * 曖昧なものは対象外 (人が判断する)。
 * Spec: templates/docs/guides/03-human-review.md §4
 */
export class FixIdsCommand extends Command {
  readonly name = 'fix-ids';
  readonly summary = '一意に解決できる裸の ID 参照を修飾 ID に書き換える (既定は dry-run)';
  override readonly usage = [
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --write        実際に書き込む (既定は dry-run で計画だけ表示)',
  ];

  protected readonly argSpec = { valueOptions: ['root'], boolOptions: ['write'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: this.argSpec.valueOptions, boolOptions: this.argSpec.boolOptions });
    if (args.positional.length > 0) {
      throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);
    }
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const module = new FixIdsModule({ targetRoot, igetaRoot: ctx.igetaRoot });
    const plan = module.plan();

    if (plan.length === 0) {
      ctx.stdout('OK fix-ids (一意に解決できる裸の ID 参照は無い)');
      return ExitCode.Ok;
    }

    if (args.has('write')) {
      const result = module.write(plan);
      for (const entry of result.written) ctx.stdout(`WRITE ${entry.file}:${entry.line}`);
      if (result.drifted.length > 0) {
        for (const entry of result.drifted) {
          ctx.stderr(`DRIFT ${entry.file}:${entry.line} (plan() 時点と内容が変わっていたため書かなかった)`);
        }
        return ExitCode.CannotCheck;
      }
      return ExitCode.Ok;
    }

    for (const entry of plan) {
      ctx.stdout(`DRY  ${entry.file}:${entry.line}`);
      ctx.stdout(`  - ${entry.before}`);
      ctx.stdout(`  + ${entry.after}`);
    }
    ctx.stdout('');
    ctx.stdout(`NEXT  ${plan.length} 件を書き換える場合は --write を付けて再実行する`);
    return ExitCode.Ok;
  }
}
