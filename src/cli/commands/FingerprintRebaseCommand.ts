import { existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { CURRENT_NORMALIZATION_VERSION } from '../../core/Fingerprint.js';
import { Report } from '../../core/Report.js';
import { rebaseFingerprints } from '../../generators/FingerprintRebaseModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class FingerprintRebaseCommand extends Command {
  readonly name = 'fingerprint-rebase';
  readonly summary = '由来・合意台帳の指紋を今の正規化の版へ載せ替える (保存値の版で今の本文と一致したものだけ)';
  override readonly usage = [
    '  igeta fingerprint-rebase [<dir>] [--root <dir>] [--docs <dir>]',
    '',
    '  <dir>          章の由来 (*.provenance.json) と合意台帳を探す起点 (既定: docs の全部)',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   正本の検索対象 (既定: <root>/docs)',
    '',
    `  保存値の版で今の本文を計算し直し、一致したものだけ、同じ本文から版 ${CURRENT_NORMALIZATION_VERSION} で計算して載せ替える。承認は書き換えない。`,
    '  由来は指紋と版を付け替えて rebasedFrom/rebasedAt/rebasedBy を足し、台帳は過去の行を書き換えず対応表の行を追記する。',
    '  一致しないもの・保存値の版の実装が無いものは触らない (KEEP として出す。stale のまま人の確認に回る)。',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length > 1) throw new ArgParseError('対象のディレクトリは 1 つまで: igeta fingerprint-rebase [<dir>]');
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const docsDir = resolve(ctx.cwd, args.get('docs') ?? join(targetRoot, 'docs'));
    const dir = args.positional[0] === undefined ? docsDir : resolve(ctx.cwd, args.positional[0]);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new ArgParseError(`対象のディレクトリが無い: ${dir}`);

    const result = rebaseFingerprints({ targetRoot, docsDir, dir });
    for (const item of result.rebased) ctx.stdout(`REBASED ${item.file} ${item.target} (${item.detail})`);
    for (const item of result.kept) ctx.stderr(`KEEP ${item.file} ${item.target}: ${item.detail}`);

    const report = new Report();
    report.addAll(result.violations);
    if (!report.isEmpty) ctx.stderr(report.format());
    ctx.stdout(`${report.isEmpty ? 'OK' : 'DONE'} ${this.name}: 載せ替え ${result.rebased.length} 件・触らない ${result.kept.length} 件 (${relative(targetRoot, dir) || '.'})`);
    return report.exitCode;
  }
}
