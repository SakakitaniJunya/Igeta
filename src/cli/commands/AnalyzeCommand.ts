import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { AnalyzeModule } from '../../generators/AnalyzeModule.js';
import { parseArgs } from '../Args.js';
import { ArgParseError } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

/**
 * 読み取り専用・非破壊の整合レポート (spec-kit /analyze 相当)。網羅 (REQ→FN→タスク)・
 * 未決 OPEN・曖昧語・ローカル採番の重複を 1 枚にする。書き込みは一切しない。
 * critical (タスクが存在しない ID を参照している等のダングリング参照) だけを exit 1 にする。
 * 網羅の穴・曖昧語は warning (advisory)、未決・重複は info — 人が優先順位を判断する材料であって
 * 機械が強制する規約ではないため。
 * Spec: templates/docs/ai/handbook/how-to/03-human-review.md §5
 */
export class AnalyzeCommand extends Command {
  readonly name = 'analyze';
  readonly summary = '網羅・未決・曖昧語・重複の整合レポートを出す (読み取り専用)';
  override readonly usage = [
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   検査対象 (既定: <root>/docs)',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: this.argSpec.valueOptions });
    if (args.positional.length > 0) {
      throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);
    }
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const docsDir = args.get('docs');
    const module = new AnalyzeModule({ targetRoot, docsDir: docsDir === undefined ? undefined : resolve(docsDir) });
    const result = module.analyze();

    ctx.stdout(result.markdown);
    if (result.cannotCheck) return ExitCode.CannotCheck;
    return result.hasCritical ? ExitCode.Violation : ExitCode.Ok;
  }
}
