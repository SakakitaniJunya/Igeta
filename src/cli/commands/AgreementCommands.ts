import { resolve } from 'node:path';
import { AgreementCheck } from '../../checks/AgreementCheck.js';
import { ledgerPathFor } from '../../core/AgreementLedger.js';
import type { Check } from '../../core/Check.js';
import { ExitCode } from '../../core/ExitCode.js';
import { approveAgreement } from '../../generators/AgreementApproveModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { ParsedArgs } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class AgreementApproveCommand extends Command {
  readonly name = 'agreement-approve';
  readonly summary = '提出した版への承認を合意台帳に記録する';
  override readonly usage = [
    '  igeta agreement-approve <提出物のディレクトリ> --version <版> --by <承認者> [--note "<メモ>"]',
    '',
    '  承認できるのは export --record-agreement で記録済みの版だけ。台帳は追記のみ。',
  ];

  protected readonly argSpec = { valueOptions: ['version', 'by', 'note'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length !== 1) throw new ArgParseError('提出物のディレクトリを 1 つ指定する');
    const version = args.get('version');
    if (version === undefined) throw new ArgParseError('--version が必要');
    const by = args.get('by');
    if (by === undefined) throw new ArgParseError('--by が必要');

    const submissionDir = resolve(ctx.cwd, args.positional[0] ?? '');
    const result = approveAgreement({ submissionDir, version, by, note: args.get('note') });
    if (result.kind === 'rejected') {
      const label = result.violation.severity === 'cannot-check' ? 'CANNOT-CHECK' : 'VIOLATION';
      ctx.stderr(`${label} ${result.violation.message}`);
      return result.violation.severity === 'cannot-check' ? ExitCode.CannotCheck : ExitCode.Violation;
    }
    ctx.stdout(`APPROVED ${result.event.targetVersion} by ${result.event.approvedBy}`);
    ctx.stdout(`WRITE ${ledgerPathFor(submissionDir)}`);
    return ExitCode.Ok;
  }
}

export class AgreementCheckCommand extends CheckCommand {
  readonly name = 'agreement-check';
  readonly summary = '承認した版から変わったものを検査する (既定 OFF)';
  override readonly usage = [
    '  --root <dir>     対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>     検査対象 (既定: <root>/docs)',
    '  --dir <dir>      提出物のディレクトリ (既定: docs の中の合意台帳を全部)',
    '  --config <path>  .igeta.json の場所 (既定: <root>/.igeta.json)',
  ];

  protected override readonly argSpec = { valueOptions: ['docs', 'dir', 'config'] };

  protected createCheck(args: ParsedArgs, ctx: CommandContext): Check {
    const dir = args.get('dir');
    return new AgreementCheck({
      docsDir: args.get('docs'),
      submissionDir: dir === undefined ? undefined : resolve(ctx.cwd, dir),
      configPath: args.get('config'),
    });
  }
}
