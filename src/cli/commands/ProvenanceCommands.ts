import { relative, resolve } from 'node:path';
import { join } from 'node:path';
import { ProvenanceCheck } from '../../checks/ProvenanceCheck.js';
import { ProvenanceCoverageCheck } from '../../checks/ProvenanceCoverageCheck.js';
import { SourceCoverageCheck } from '../../checks/SourceCoverageCheck.js';
import type { Check } from '../../core/Check.js';
import { ExitCode } from '../../core/ExitCode.js';
import { sidecarPathFor } from '../../core/ProvenanceSidecar.js';
import { Report } from '../../core/Report.js';
import { buildSourceIndex } from '../../core/SourceResolver.js';
import type { AcceptTarget } from '../../generators/ProvenanceAcceptModule.js';
import { accept } from '../../generators/ProvenanceAcceptModule.js';
import type { CaptureSource } from '../../generators/ProvenanceCaptureModule.js';
import { capture } from '../../generators/ProvenanceCaptureModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { ParsedArgs } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class ProvenanceCaptureCommand extends Command {
  readonly name = 'provenance-capture';
  readonly summary = '由来を作る・上書きする';
  override readonly usage = [
    '  igeta provenance-capture <chapter> --anchor "<anchor>" (--from <doc-id>/PREFIX-nnn | --no-source --reason "<reason>") --by <name>',
    '',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   正本の検索対象 (既定: <root>/docs)。--no-source でも、章の本文のリンク先の文書 id を引くのに使う',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs', 'anchor', 'from', 'reason', 'by'], boolOptions: ['no-source'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length !== 1) throw new ArgParseError('対象の章を 1 件指定する: igeta provenance-capture <chapter>');
    const anchor = args.get('anchor');
    if (anchor === undefined) throw new ArgParseError('--anchor が必要');
    const by = args.get('by');
    if (by === undefined) throw new ArgParseError('--by が必要');
    const fromId = args.get('from');
    const noSource = args.has('no-source');
    const reason = args.get('reason');
    if (fromId !== undefined && noSource) throw new ArgParseError('--from と --no-source は同時に指定できない');
    if (fromId === undefined && !noSource) throw new ArgParseError('--from か --no-source のどちらかが必要');
    if (noSource && reason === undefined) throw new ArgParseError('--no-source のときは --reason が必要');

    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const chapterAbsPath = resolve(ctx.cwd, args.positional[0] ?? '');
    const docsDir = args.get('docs') ?? join(targetRoot, 'docs');
    const source: CaptureSource = fromId !== undefined ? { kind: 'from', id: fromId } : { kind: 'no-source', reason: reason ?? '' };
    // --no-source でも索引を作る: 章の塊の指紋 (v3) は、リンクの行き先を文書 id で数える。provenance-check が
    // 同じ索引で計算し直すので、capture だけ索引なしで計算すると、リンクを含む塊が直後に orphan-content になる
    const sourceIndex = buildSourceIndex(targetRoot, docsDir);

    const result = capture({ chapterAbsPath, targetRoot, anchor, source, by, sourceIndex });
    if (result.kind === 'error') {
      ctx.stderr(`CANNOT-CHECK ${result.violation.message}`);
      return ExitCode.CannotCheck;
    }
    ctx.stdout(`WRITE ${relative(targetRoot, sidecarPathFor(chapterAbsPath))}`);
    return ExitCode.Ok;
  }
}

export class ProvenanceAcceptCommand extends Command {
  readonly name = 'provenance-accept';
  readonly summary = '別の主体が由来を承認する';
  override readonly usage = [
    '  igeta provenance-accept <chapter> (--anchor "<anchor>" | --all) --by <name>',
    '',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   正本の検索対象 (既定: <root>/docs)',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs', 'anchor', 'by'], boolOptions: ['all'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length !== 1) throw new ArgParseError('対象の章を 1 件指定する: igeta provenance-accept <chapter>');
    const by = args.get('by');
    if (by === undefined) throw new ArgParseError('--by が必要');
    const anchor = args.get('anchor');
    const all = args.has('all');
    if (anchor !== undefined && all) throw new ArgParseError('--anchor と --all は同時に指定できない');
    if (anchor === undefined && !all) throw new ArgParseError('--anchor か --all のどちらかが必要');
    const target: AcceptTarget = all ? { kind: 'all' } : { kind: 'anchor', anchor: anchor ?? '' };

    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const chapterAbsPath = resolve(ctx.cwd, args.positional[0] ?? '');
    const chapterRelPath = relative(targetRoot, chapterAbsPath);
    const docsDir = args.get('docs') ?? join(targetRoot, 'docs');
    const sourceIndex = buildSourceIndex(targetRoot, docsDir);

    const result = accept({ targetRoot, chapterAbsPath, chapterRelPath, target, by, sourceIndex });
    for (const acceptedAnchor of result.accepted) ctx.stdout(`ACCEPTED ${acceptedAnchor}`);

    const report = new Report();
    report.addAll(result.violations);
    if (report.isEmpty) ctx.stdout(`OK ${this.name}`);
    else ctx.stderr(report.format());
    return report.exitCode;
  }
}

export class ProvenanceCheckCommand extends Command {
  readonly name = 'provenance-check';
  readonly summary = '由来の鮮度を検査する (既定 OFF)';
  override readonly usage = [
    '  igeta provenance-check [<chapter> ...] [--root <dir>] [--docs <dir>] [--strict-normalization]',
    '',
    '  --root <dir>              対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>              検査対象 (既定: <root>/docs)',
    '  --strict-normalization    needs-recompute を警告でなく違反にする',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs'], boolOptions: ['strict-normalization'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const chapters = args.positional.length > 0 ? args.positional.map((p) => resolve(ctx.cwd, p)) : undefined;

    const check = new ProvenanceCheck({
      targetRoot,
      docsDir: args.get('docs'),
      chapters,
      strictNormalization: args.has('strict-normalization'),
    });
    const { violations } = check.analyze();
    for (const warning of check.warnings) ctx.stderr(`WARN ${warning}`);

    const report = new Report();
    report.addAll(violations);
    if (report.isEmpty) ctx.stdout(`OK ${this.name}`);
    else ctx.stderr(report.format());
    return report.exitCode;
  }
}

export class ProvenanceCoverageCommand extends Command {
  readonly name = 'provenance-coverage';
  readonly summary = '章の全塊に由来があるかを検査する (順方向、既定 OFF)';
  override readonly usage = [
    '  igeta provenance-coverage [<chapter> ...] [--root <dir>] [--docs <dir>]',
    '',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   検査対象 (既定: <root>/docs)',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const chapters = args.positional.length > 0 ? args.positional.map((p) => resolve(ctx.cwd, p)) : undefined;

    const check = new ProvenanceCoverageCheck({ targetRoot, docsDir: args.get('docs'), chapters });
    const { violations } = check.analyze();

    const report = new Report();
    report.addAll(violations);
    if (report.isEmpty) ctx.stdout(`OK ${this.name}`);
    else ctx.stderr(report.format());
    return report.exitCode;
  }
}

export class SourceCoverageCommand extends CheckCommand {
  readonly name = 'source-coverage';
  readonly summary = '正本の行が章の由来にも現れているかを検査する (逆方向、既定 OFF)';
  override readonly usage = [
    '  --root <dir>     対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>     検査対象 (既定: <root>/docs)',
    '  --config <path>  .igeta.json の場所 (既定: <root>/.igeta.json)',
  ];

  protected override readonly argSpec = { valueOptions: ['docs', 'config'] };

  protected createCheck(args: ParsedArgs): Check {
    return new SourceCoverageCheck({ docsDir: args.get('docs'), configPath: args.get('config') });
  }
}
