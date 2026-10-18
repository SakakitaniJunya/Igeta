import { resolve } from 'node:path';
import type { Check } from '../../core/Check.js';
import { SpawnRunner } from '../../checks/CommandRunner.js';
import { ALL_VARIANTS, TemplatesCheck } from '../../checks/TemplatesCheck.js';
import type { TemplateVariant } from '../../generators/TemplateExpandModule.js';
import type { ParsedArgs } from '../Args.js';
import { ArgParseError } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';
import type { CommandContext } from '../Command.js';

const DEFAULT_STEP_TIMEOUT_MINUTES = 20;

const isVariant = (value: string): value is TemplateVariant => (ALL_VARIANTS as readonly string[]).includes(value);

export class CheckTemplatesCommand extends CheckCommand {
  readonly name = 'check-templates';
  readonly summary = '雛形 (backend の 3 変種・frontend) を一時 dir で展開し、型・テスト・層の規則・build を通す';
  override readonly usage = [
    '  --variant <hono|nestjs|rust|frontend>  1 変種だけ検査する (既定: 全部)',
    '  --require-emulator                     Firestore emulator で走らせ、skip が 1 件でもあれば落とす',
    '  --step-timeout <分>                    1 手順あたりの上限 (既定: 20)。超えたら止めて違反にする',
    '  --work <dir>                           作業 dir (既定: OS の一時 dir。成功したら消す。指定した dir は消さない)',
    '  入力は Igeta の templates/ で、--root は使わない。',
    '  exit 0 = 全部通った / 1 = 違反 / 2 = 検査不能 (Java・cargo・Docker など前提の道具が無い)',
    '  実際に npm ci・cargo build を走らせるので時間とネットワークを使う。',
  ];

  protected override readonly argSpec = { valueOptions: ['variant', 'work', 'step-timeout'], boolOptions: ['require-emulator'] };

  protected createCheck(args: ParsedArgs, ctx: CommandContext): Check {
    if (args.has('root')) throw new ArgParseError('--root は使わない (入力は Igeta の templates/)');
    const variant = args.get('variant');
    const minutes = Number(args.get('step-timeout') ?? DEFAULT_STEP_TIMEOUT_MINUTES);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new ArgParseError('--step-timeout は 0 より大きい分数');
    if (variant !== undefined && !isVariant(variant)) {
      throw new ArgParseError(`--variant は ${ALL_VARIANTS.join('|')} のどれか: ${variant}`);
    }
    const work = args.get('work');
    return new TemplatesCheck({
      variants: variant === undefined ? ALL_VARIANTS : [variant],
      requireEmulator: args.has('require-emulator'),
      workDir: work === undefined ? undefined : resolve(ctx.cwd, work),
      stepTimeoutMs: minutes * 60_000,
      runner: new SpawnRunner(),
      log: ctx.stdout,
    });
  }
}
