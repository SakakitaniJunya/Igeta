import type { Check } from '../../core/Check.js';
import { TemplatesLayoutCheck } from '../../checks/TemplatesLayoutCheck.js';
import { ArgParseError } from '../Args.js';
import type { ParsedArgs } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';

export class CheckTemplatesLayoutCommand extends CheckCommand {
  readonly name = 'check-templates-layout';
  readonly summary = 'templates/ の第 1・第 2 階層が登録どおりか (登録外・実体なし・9 個目・matrix との食い違い) と、変種ごとの雛形の中の置き場を検査する';
  override readonly usage = [
    '  入力は Igeta の templates/ で、--root は使わない。Igeta 自身の repo だけで走らせる。',
    '  雛形の中の置き場は、変種ごとに igeta-check-layout (rust は --ext rs) を回して全変種を 1 回で報告する。',
    '  exit 0 = 登録どおり / 1 = 違反 / 2 = 検査不能 (templates/ が無い、Igeta 自身の repo ではない)',
  ];

  protected createCheck(args: ParsedArgs): Check {
    if (args.has('root')) throw new ArgParseError('--root は使わない (入力は Igeta の templates/)');
    return new TemplatesLayoutCheck();
  }
}
