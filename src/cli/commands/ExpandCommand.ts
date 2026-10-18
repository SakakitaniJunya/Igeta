import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { isKebab } from '../../core/Naming.js';
import { Report } from '../../core/Report.js';
import type { ExpandNames } from '../../generators/TemplateExpandModule.js';
import { TemplateExpandModule } from '../../generators/TemplateExpandModule.js';
import { nextSteps } from '../../generators/TemplateRegistration.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

const NAME_OPTIONS = ['context', 'aggregate', 'aggregates', 'entry', 'feature', 'features'] as const;

export class ExpandCommand extends Command {
  readonly name = 'expand';
  readonly summary = 'templates/backend・frontend の 1 単位を apps/<app>/ の鏡の path へ展開する';
  override readonly usage = [
    '  igeta expand <雛形の 1 単位の path> --app <name> [名前…] [--dry-run] [--root <dir>]',
    '  <path>                templates/backend/<変種>/src/{entries/__entry__,modules/__context__} か',
    '                        templates/frontend/admin/src/features/__feature__ (印の付いたフォルダ)',
    '  --app <kebab>         展開先 apps/<app>/',
    '  --context <kebab>     雛形が __context__ を使うとき必須',
    '  --aggregate <kebab>   雛形が __aggregate__ を使うとき必須',
    '  --aggregates <kebab>  複数形 (既定: aggregate に s を付ける)',
    '  --entry <kebab>       雛形が __entry__ を使うとき必須',
    '  --feature <kebab>     雛形が __feature__ を使うとき必須',
    '  --features <kebab>    複数形 (既定: feature に s を付ける)',
    '  --root <dir>          展開先リポジトリ (既定: カレントディレクトリ)',
    '  --dry-run             書き込まずに展開先の一覧を出す',
    '  展開先は雛形の path から決まる。既存は上書きせず、1 件でも違反なら 1 ファイルも書かない。',
  ];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'app', ...NAME_OPTIONS], boolOptions: ['dry-run'] });

    const [templatePath, ...extra] = args.positional;
    if (templatePath === undefined) throw new ArgParseError('雛形の path が必要');
    if (extra.length > 0) throw new ArgParseError(`余分な引数: ${extra.join(' ')}`);
    const app = args.get('app');
    if (app === undefined) throw new ArgParseError('--app が必要');
    for (const option of ['app', ...NAME_OPTIONS] as const) {
      const value = args.get(option);
      if (value !== undefined && !isKebab(value)) {
        throw new ArgParseError(`--${option} はケバブケース (小文字・数字・-) で渡す: ${value}`);
      }
    }
    const names: ExpandNames = {
      context: args.get('context'),
      aggregate: args.get('aggregate'),
      aggregates: args.get('aggregates'),
      entry: args.get('entry'),
      feature: args.get('feature'),
      features: args.get('features'),
    };

    const expand = new TemplateExpandModule({ targetRoot: resolve(args.get('root') ?? ctx.cwd), igetaRoot: ctx.igetaRoot });
    const plan = expand.prepare({ templatePath: resolve(ctx.cwd, templatePath), app, names });

    if (plan.missingNames.length > 0) {
      throw new ArgParseError(`この雛形に必要な名前が足りない: ${plan.missingNames.map((k) => `--${k}`).join(' ')}`);
    }
    if (plan.violations.length > 0) {
      const report = new Report();
      report.addAll(plan.violations);
      ctx.stderr(report.format());
      ctx.stderr(`\n${plan.violations.length} 件の違反。1 ファイルも書いていない。`);
      return report.exitCode;
    }

    if (args.has('dry-run')) {
      for (const entry of plan.entries) ctx.stdout(`DRY  ${entry.rel}`);
      return ExitCode.Ok;
    }

    expand.execute(plan);
    for (const entry of plan.entries) ctx.stdout(`WRITE ${entry.rel}`);
    const steps = nextSteps(plan.variant, plan.unit, names);
    if (steps.length > 0) {
      ctx.stdout('');
      for (const step of steps) ctx.stdout(`NEXT  ${step}`);
    }
    return ExitCode.Ok;
  }
}
