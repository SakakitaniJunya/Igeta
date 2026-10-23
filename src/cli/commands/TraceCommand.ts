// `igeta trace [ID]`: ID を渡すと上流・下流の木、渡さないと設計書のつながりの検査 (ADR-0015)。

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { summarizeBaselined, TraceCheck } from '../../checks/TraceCheck.js';
import type { TraceResult } from '../../checks/TraceCheck.js';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import { BASELINE_FILE, fingerprint, formatBaseline, shrinkBaseline } from '../../core/trace/Baseline.js';
import { buildTree, render } from '../../core/trace/Tree.js';
import { ArgParseError, parseArgs } from '../Args.js';
import { Command } from '../Command.js';
import type { CommandContext } from '../Command.js';

export class TraceCommand extends Command {
  readonly name = 'trace';
  readonly summary = '設計書のつながり (決定・要件・機能・画面・API・表・テスト・コードの ID) を検査する。ID を渡すと上流・下流の木を出す';
  override readonly usage = [
    '  igeta trace [<ID>] [--root <dir>] [--base <ref>] [--mermaid] [--update-baseline]',
    '  <ID>               木を出す (○ 相互・△ 片方向・✗ 抜けか未定義)。定義が無い ID は終了コード 2',
    '  --mermaid          木を Mermaid の flowchart TB で出す',
    '  --base <ref>       T1(b) と基準の増加を比べる先 (既定: .igeta.json の trace.base、無ければ origin/main)',
    '  --update-baseline  基準ファイルを作る。あるときは、もう出ない違反を消すだけ (新しい違反は足さない)',
  ];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'base'], boolOptions: ['mermaid', 'update-baseline'] });
    if (args.positional.length > 1) throw new ArgParseError(`余分な引数: ${args.positional.slice(1).join(' ')}`);
    const root = resolve(args.get('root') ?? ctx.cwd);
    const base = args.get('base');
    const check = new TraceCheck(base === undefined ? {} : { base });
    const id = args.positional[0];
    if (id !== undefined) return this.#showTree(check.analyze(root), id, args.has('mermaid'), ctx);
    if (args.has('update-baseline')) return this.#updateBaseline(check, root, ctx);

    const report = new Report();
    report.addAll(check.run({ targetRoot: root, igetaRoot: ctx.igetaRoot }));
    for (const warning of check.warnings) ctx.stderr(`WARN ${warning}`);
    if (report.isEmpty) ctx.stdout(`OK ${check.name}`);
    else ctx.stderr(report.format());
    return report.exitCode;
  }

  #showTree(result: TraceResult, id: string, isMermaid: boolean, ctx: CommandContext): ExitCode {
    const tree = buildTree(result.index, id, result.findings);
    if (tree.roots.length === 0) {
      for (const violation of result.fatal) ctx.stderr(violation.message);
      ctx.stderr(`ERROR ${id} の定義が無い (trace_columns を宣言した文書の表の行頭セルにある ID だけを辿る)`);
      return ExitCode.CannotCheck;
    }
    ctx.stdout(render(tree, isMermaid ? 'mermaid' : 'text'));
    return ExitCode.Ok;
  }

  #updateBaseline(check: TraceCheck, root: string, ctx: CommandContext): ExitCode {
    const result = check.analyze(root);
    if (result.fatal.length > 0) {
      for (const violation of result.fatal) ctx.stderr(violation.message);
      return ExitCode.CannotCheck;
    }
    if (result.index.definitions.length === 0) {
      ctx.stderr('定義が 0 件なので基準を更新しない (trace_columns を宣言した文書の表の行頭セルに ID が無い)');
      return ExitCode.Violation;
    }
    const exists = existsSync(join(root, BASELINE_FILE));
    const violations = result.findings.filter((finding) => finding.level === 'violation');
    const next = result.baseline === undefined || !exists ? violations.map(fingerprint) : shrinkBaseline(result.baseline, result.findings);
    writeFileSync(join(root, BASELINE_FILE), formatBaseline(next));
    ctx.stdout(`${next.length} 件を基準に記録した (${BASELINE_FILE}。${exists ? `${result.baseline?.length ?? 0} 件から更新` : '新規作成'})`);
    // 書いた基準で数え直す。記録した直後の違反を、まだ落ちる違反として出さない
    const after = check.analyze(root);
    const fresh = after.fresh.filter((finding) => finding.level === 'violation');
    for (const finding of fresh) ctx.stderr(`VIOLATION [${finding.rule}] ${finding.path}:${finding.line ?? 0} ${finding.id} ${finding.message}`);
    for (const line of summarizeBaselined(after.baselined)) ctx.stdout(line);
    return fresh.length > 0 ? ExitCode.Violation : ExitCode.Ok;
  }
}
