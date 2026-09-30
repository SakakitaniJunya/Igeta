import { join, resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { formatForbidHit } from '../../export/ForbidScan.js';
import { runExport } from '../../export/ExportPipeline.js';
import { ManifestError, parseManifest } from '../../export/Manifest.js';
import type { AgreementExportEvent } from '../../core/AgreementLedger.js';
import { ledgerPathFor } from '../../core/AgreementLedger.js';
import { Report } from '../../core/Report.js';
import { appendAgreementRecord, prepareAgreementRecord } from '../../generators/AgreementRecordModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class ExportCommand extends Command {
  readonly name = 'export';
  readonly summary = '章 Markdown から先方提出用の PDF 1 冊を出す';
  override readonly usage = [
    '  <path/to/deliverable.json>  必須。章一覧・forbid・出力先を持つ manifest',
    '  --html-only                 PDF 化せず HTML だけ出す (Chromium 不要)',
    '  --record-agreement          出力が成功したら、提出した版を合意台帳に記録する',
    '                              (由来の検査が通らない章があれば、記録も出力もしない)',
    '  --root <dir>                対象リポジトリ (既定: カレントディレクトリ。--record-agreement のときだけ使う)',
    '  --docs <dir>                正本の検索対象 (既定: <root>/docs。--record-agreement のときだけ使う)',
  ];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'docs'], boolOptions: ['html-only', 'record-agreement'] });
    if (args.positional.length !== 1) {
      throw new ArgParseError('manifest のパスを 1 つだけ指定する');
    }
    const manifestPath = resolve(ctx.cwd, args.positional[0] ?? '');

    // 記録する場合は、出力より前に由来の検査と版の重複を確かめる (通らなければ 1 ファイルも書かない)。
    let agreement: { manifestDir: string; event: AgreementExportEvent; append: () => ReturnType<typeof appendAgreementRecord> } | null = null;
    if (args.has('record-agreement')) {
      let manifest;
      try {
        manifest = parseManifest(manifestPath);
      } catch (error) {
        if (!(error instanceof ManifestError)) throw error;
        for (const message of error.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.CannotCheck;
      }
      const targetRoot = resolve(args.get('root') ?? ctx.cwd);
      const docsDir = args.get('docs') ?? join(targetRoot, 'docs');
      const prepared = prepareAgreementRecord({ manifest, targetRoot, docsDir });
      if (prepared.kind === 'rejected') {
        const report = new Report();
        report.addAll(prepared.violations);
        ctx.stderr(report.format());
        ctx.stderr('合意台帳に記録できないため、出力もしていない。');
        return report.exitCode;
      }
      const resolved = manifest;
      agreement = { manifestDir: resolved.manifestDir, event: prepared.event, append: () => appendAgreementRecord(resolved, prepared.event) };
    }

    const outcome = await runExport({ manifestPath, htmlOnly: args.has('html-only') });

    switch (outcome.kind) {
      case 'manifest-error': {
        for (const message of outcome.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.CannotCheck;
      }
      case 'unclosed-autogen': {
        for (const message of outcome.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.CannotCheck;
      }
      case 'forbid-violation': {
        for (const hit of outcome.hits) ctx.stderr(`FORBID ${formatForbidHit(hit)}`);
        ctx.stderr(`\n${outcome.hits.length} 件、提出物に含められない語が見つかった。1 ファイルも書いていない。`);
        return ExitCode.Violation;
      }
      case 'mermaid-error': {
        for (const message of outcome.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.Violation;
      }
      case 'chromium-not-found': {
        ctx.stderr(`ERROR ${outcome.message}`);
        return ExitCode.CannotCheck;
      }
      case 'ok': {
        for (const warning of outcome.warnings) ctx.stderr(`WARN ${warning}`);
        ctx.stdout(`WRITE ${outcome.htmlPath}`);
        if (outcome.pdfPath !== null) ctx.stdout(`WRITE ${outcome.pdfPath}`);
        if (agreement !== null) {
          const failure = agreement.append();
          if (failure !== null) {
            ctx.stderr(`CANNOT-CHECK ${failure.message}`);
            return ExitCode.CannotCheck;
          }
          ctx.stdout(`RECORD ${agreement.event.version} → ${ledgerPathFor(agreement.manifestDir)}`);
        }
        return ExitCode.Ok;
      }
    }
  }
}
