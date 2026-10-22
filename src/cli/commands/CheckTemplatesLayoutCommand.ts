import type { Check } from '../../core/Check.js';
import { TemplatesLayoutCheck } from '../../checks/TemplatesLayoutCheck.js';
import { ArgParseError } from '../Args.js';
import type { ParsedArgs } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';

export class CheckTemplatesLayoutCommand extends CheckCommand {
  readonly name = 'check-templates-layout';
  readonly summary = 'templates/ の第 1・第 2 階層が登録どおりか (登録外・実体なし・9 個目・matrix との食い違い) を検査する';
  override readonly usage = [
    '  入力は Igeta の templates/ で、--root は使わない。Igeta 自身の repo だけで走らせる。',
    '  雛形の中の置き場は igeta-check-layout (npm run check:templates-layout が変種ごとに呼ぶ)。',
    '  exit 0 = 登録どおり / 1 = 違反',
  ];

  protected createCheck(args: ParsedArgs): Check {
    if (args.has('root')) throw new ArgParseError('--root は使わない (入力は Igeta の templates/)');
    return new TemplatesLayoutCheck();
  }
}
