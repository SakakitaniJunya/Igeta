import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import type { ScaffoldKind, ScaffoldRequest } from '../../generators/ScaffoldModule.js';
import { ScaffoldModule } from '../../generators/ScaffoldModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

const isScaffoldKind = (value: string): value is ScaffoldKind => value === 'api' || value === 'web';

export class ScaffoldCommand extends Command {
  readonly name = 'scaffold';
  readonly summary = 'テンプレートからコード雛形を展開する';
  override readonly usage = [
    '  --root <dir>        展開先リポジトリ (既定: カレントディレクトリ)',
    '  --kind <api|web>    既定: api',
    '  --context <kebab>   kind:api のとき必須',
    '  --aggregate <Pascal> kind:api のとき必須',
    '  --feature <kebab>   kind:web のとき必須',
    '  --include-kernel    初回のみ: 共通部品も展開する',
    '  --dry-run           書き込まずに展開先の一覧を出す',
  ];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, {
      valueOptions: ['root', 'kind', 'context', 'aggregate', 'feature'],
      boolOptions: ['include-kernel', 'dry-run'],
    });

    const kindValue = args.get('kind') ?? 'api';
    if (!isScaffoldKind(kindValue)) throw new ArgParseError('--kind は api か web');

    const request: ScaffoldRequest = {
      kind: kindValue,
      context: args.get('context'),
      aggregate: args.get('aggregate'),
      feature: args.get('feature'),
      includeKernel: args.has('include-kernel'),
    };

    const scaffold = new ScaffoldModule({
      targetRoot: resolve(args.get('root') ?? ctx.cwd),
      igetaRoot: ctx.igetaRoot,
    });

    const invalid = scaffold.validate(request);
    if (invalid.length > 0) {
      const report = new Report();
      report.addAll(invalid);
      ctx.stderr(report.format());
      return report.exitCode;
    }

    if (args.has('dry-run')) {
      for (const entry of scaffold.plan(request)) ctx.stdout(`DRY  ${entry.to}`);
      return ExitCode.Ok;
    }

    const result = scaffold.execute(request);
    if (result.conflicts.length > 0) {
      for (const entry of result.conflicts) ctx.stderr(`CONFLICT ${entry.to} は既に存在する`);
      ctx.stderr(
        `\n${result.conflicts.length} 件が衝突。1 ファイルも書いていない。` +
          '意図的に作り直す場合は既存を削除してから再実行する。',
      );
      return ExitCode.Violation;
    }

    for (const entry of result.written) ctx.stdout(`WRITE ${entry.to}`);
    if (result.nextSteps.length > 0) {
      ctx.stdout('');
      for (const step of result.nextSteps) ctx.stdout(`NEXT  ${step}`);
    }
    return ExitCode.Ok;
  }
}
