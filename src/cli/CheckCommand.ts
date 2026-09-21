import { resolve } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import type { ArgSpec, ParsedArgs } from './Args.js';
import { parseArgs } from './Args.js';
import type { CommandContext } from './Command.js';
import { Command } from './Command.js';

/** 非ブロッキング警告を持つ検査 (exit 0 のまま出す指摘)。 */
interface HasWarnings {
  readonly warnings: readonly string[];
}

const hasWarnings = (check: Check): check is Check & HasWarnings =>
  'warnings' in check && Array.isArray((check as Partial<HasWarnings>).warnings);

/**
 * 検査 1 本を走らせて Report に集約するコマンドの共通実装。
 * 終了コードの決定と出力はここだけが行い、Check 側は Violation を返すことに専念する。
 */
export abstract class CheckCommand extends Command {
  protected readonly argSpec: ArgSpec = {};

  protected abstract createCheck(args: ParsedArgs): Check;

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, {
      valueOptions: ['root', ...(this.argSpec.valueOptions ?? [])],
      boolOptions: this.argSpec.boolOptions ?? [],
    });
    const checkCtx: CheckContext = {
      targetRoot: resolve(args.get('root') ?? ctx.cwd),
      igetaRoot: ctx.igetaRoot,
    };

    const check = this.createCheck(args);
    const report = new Report();
    report.addAll(await check.run(checkCtx));

    if (hasWarnings(check)) {
      for (const warning of check.warnings) ctx.stderr(`WARN ${warning}`);
    }
    if (report.isEmpty) ctx.stdout(`OK ${check.name}`);
    else ctx.stderr(report.format());

    return report.exitCode;
  }
}
