import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { IGETA_VERSION_FILE, SemVer, isOutdated, readIgetaVersion } from '../../core/Version.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

function readPinned(targetRoot: string): SemVer {
  const path = join(targetRoot, IGETA_VERSION_FILE);
  if (!existsSync(path)) {
    throw new ArgParseError(`${IGETA_VERSION_FILE} が無い。先に igeta init を実行する`);
  }
  const pinned = SemVer.parse(readFileSync(path, 'utf8'));
  if (pinned === null) throw new ArgParseError(`${IGETA_VERSION_FILE} が semver 1 行ではない`);
  return pinned;
}

/** 対象リポジトリが固定している版と、いま動いている Igeta の版の開きを見る。 */
export class VersionCheckCommand extends Command {
  readonly name = 'check';
  readonly summary = '.igeta-version と Igeta 自身の版を比較し、追従遅れを検出する';
  override readonly usage = ['  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)'];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root'] });
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);

    const pinned = readPinned(targetRoot);
    const current = readIgetaVersion(ctx.igetaRoot);

    if (isOutdated(pinned, current)) {
      ctx.stderr(
        `OUTDATED ${IGETA_VERSION_FILE} は ${pinned.toString()}、Igeta は ${current.toString()}。` +
          `\nigeta upgrade --to ${current.toString()} で追従する`,
      );
      return ExitCode.Violation;
    }

    ctx.stdout(`OK ${pinned.toString()} (Igeta ${current.toString()})`);
    return ExitCode.Ok;
  }
}

export class UpgradeCommand extends Command {
  readonly name = 'upgrade';
  readonly summary = '.igeta-version を書き換える';
  override readonly usage = [
    '  --to <semver>  追従先の版 (必須)',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
  ];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'to'] });
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);

    const toValue = args.get('to');
    if (toValue === undefined) throw new ArgParseError('--to は必須');
    const to = SemVer.parse(toValue);
    if (to === null) throw new ArgParseError(`--to が semver ではない: ${toValue}`);

    const pinned = readPinned(targetRoot);
    if (pinned.toString() === to.toString()) {
      ctx.stdout(`SKIP 既に ${to.toString()}`);
      return ExitCode.Ok;
    }

    writeFileSync(join(targetRoot, IGETA_VERSION_FILE), `${to.toString()}\n`);
    ctx.stdout(`UPGRADE ${pinned.toString()} → ${to.toString()}`);
    ctx.stdout(`NEXT  package.json の devDependencies.igeta も #v${to.toString()} に揃える`);
    return ExitCode.Ok;
  }
}
