// 決定の状態を変える唯一の書き込み口 `recordDecision` (ADR-0013 決定 2)。計画 (plan.ts) の変更を、一時ファイルからの rename で書く。
// 書く前に全部を確かめ済みで、失敗したら docs/ と書き換えた文書を書く前の状態に戻す。同じ repo への同時の記録は、ロックで後の 1 本を断る。

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DECISIONS_DIR } from '#decision/core';
import { DocGraphCheck } from '#checks/DocGraphCheck.js';
import { ExitCode } from '#core/ExitCode.js';
import { restoreTree, snapshotTree } from '#core/TreeSnapshot.js';
import { rewriteLinksForMoves } from '#generators/DocsMigrateLinks.js';
import { gitOrNull, trackedFiles } from '#generators/DocsMigrateRepo.js';
import type { Change, RecordOutcome, RecordRequest, Step } from './plan.js';
import { cannotCheck, plan, prepare, proceed, refuse } from './plan.js';

export type { DecisionVerb, RecordOutcome, RecordRequest } from './plan.js';

const LOCK_NAME = 'igeta-decision.lock';

function describeChanges(changes: readonly Change[], rewritten: ReadonlyMap<string, string>, notices: readonly string[]): string[] {
  const lines: string[] = [];
  for (const change of changes) {
    if (change.newPath !== change.doc.path) lines.push(`MOVE ${change.doc.path} -> ${change.newPath}`);
    if (change.appended !== '') lines.push(`APPEND ${change.newPath} | ${change.appended}`);
    lines.push(`SET ${change.newPath} ${change.settings.join(' ')}`);
  }
  for (const path of rewritten.keys()) lines.push(`REWRITE ${path} (リンク)`);
  return [...lines, `REWRITE ${DECISIONS_DIR}/README.md (索引の再生成)`, ...notices];
}

function writeAtomically(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.igeta-tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, absolute);
}

/** ADR を全部動かして空になった元のフォルダを消す。残るのが生成索引 (dir-index) の README.md だけならそれも消す */
function removeEmptiedFolder(root: string, oldPath: string): void {
  const dir = join(root, dirname(oldPath));
  if (!existsSync(dir)) return;
  const readme = join(dir, 'README.md');
  const isOnlyGeneratedIndex = readdirSync(dir).join() === 'README.md' && readFileSync(readme, 'utf8').includes('AUTOGEN:dir-index:start');
  if (isOnlyGeneratedIndex) rmSync(readme);
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

const brokenLinks = (violations: readonly { readonly message: string }[]): string[] => violations.map((v) => v.message).filter((message) => message.includes('[link]'));

/** 書く: 内容と移動、リンク、索引の再生成。新しいリンク切れが残れば Error */
async function writeAll(request: Pick<RecordRequest, 'root' | 'igetaRoot'>, changes: readonly Change[], rewritten: ReadonlyMap<string, string>): Promise<void> {
  const ctx = { targetRoot: request.root, igetaRoot: request.igetaRoot };
  const baseline = new Set(brokenLinks(await new DocGraphCheck().run(ctx)));
  const changedPaths = new Set(changes.map((change) => change.doc.path));
  for (const [path, text] of rewritten) if (!changedPaths.has(path)) writeAtomically(request.root, path, text);
  for (const change of changes) {
    const body = change.edit(rewritten.get(change.doc.path) ?? change.doc.text);
    if (change.newPath !== change.doc.path) rmSync(join(request.root, change.doc.path));
    writeAtomically(request.root, change.newPath, body);
  }
  for (const change of changes) if (change.newPath !== change.doc.path) removeEmptiedFolder(request.root, change.doc.path);
  const written = await new DocGraphCheck({ write: true }).run(ctx);
  if (written.length > 0) throw new Error(`索引を作り直せない: ${written.map((v) => v.message).join(' / ')}`);
  const fresh = brokenLinks(await new DocGraphCheck().run(ctx)).filter((message) => !baseline.has(message));
  if (fresh.length > 0) throw new Error(`移動のあとに新しいリンク切れが残る: ${fresh.join(' / ')}`);
}

function acquireLock(root: string): Step<string> {
  const gitDir = gitOrNull(root, ['rev-parse', '--absolute-git-dir'])?.trim();
  if (gitDir === undefined || gitDir === '') return cannotCheck('git のディレクトリを読めない');
  const lock = join(gitDir, LOCK_NAME);
  try {
    mkdirSync(lock);
    return proceed(lock);
  } catch {
    return refuse(`別の decision-* が実行中 (${lock} がある。実行中でなければ消す)`);
  }
}

function collectTrackedMarkdown(root: string): Map<string, string> {
  const tracked = (trackedFiles(root) ?? []).filter((path) => path.endsWith('.md'));
  return new Map(tracked.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
}

export interface CommitRequest {
  readonly root: string;
  readonly igetaRoot: string;
  readonly label: string;
  readonly changes: readonly Change[];
  readonly isDryRun: boolean;
  /** 書いたあとの追加の確かめ。問題があれば Error を投げる (書く前の状態に戻す) */
  readonly verify?: () => Promise<void>;
}

/** 変更の束を、計画の行にし、(dry-run でなければ) ロックの下で全部書く。失敗したら書く前の状態に戻す */
export async function commitChanges(request: CommitRequest): Promise<RecordOutcome> {
  const { root, changes } = request;
  const files = collectTrackedMarkdown(root);
  const moves = new Map(changes.filter((change) => change.newPath !== change.doc.path).map((change) => [change.doc.path, change.newPath]));
  const { rewritten, notices } = rewriteLinksForMoves(files, moves);
  const lines = describeChanges(changes, rewritten, notices);
  if (request.isDryRun) return { exitCode: ExitCode.Ok, lines };
  const lock = acquireLock(root);
  if (!lock.ok) return { exitCode: lock.exitCode, lines: [`ERROR ${lock.reason}`] };
  const snapshot = snapshotTree(root, [...files.keys()]);
  try {
    const stale = changes.find((change) => readFileSync(join(root, change.doc.path), 'utf8') !== change.doc.text);
    if (stale !== undefined) throw new Error(`${stale.doc.path} が、確かめている間に変わった (別の記録が先に書いた)`);
    await writeAll(request, changes, rewritten);
    await request.verify?.();
    return { exitCode: ExitCode.Ok, lines: [...lines, `OK ${request.label}: ${changes.map((change) => change.newPath).join(' / ')}`] };
  } catch (error) {
    restoreTree(root, snapshot);
    return { exitCode: ExitCode.Violation, lines: [`ERROR ${error instanceof Error ? error.message : String(error)}`, '書く前の状態に戻した'] };
  } finally {
    rmdirSync(lock.value);
  }
}

/** ADR の状態を 1 つ変える。確かめられなければ何も書かない */
export async function recordDecision(request: RecordRequest): Promise<RecordOutcome> {
  const prepared = prepare(request);
  if (!prepared.ok) return { exitCode: prepared.exitCode, lines: [`ERROR ${prepared.reason}`] };
  const planned = await plan(prepared.value);
  if (!planned.ok) return { exitCode: planned.exitCode, lines: [`ERROR ${planned.reason}`] };
  return commitChanges({ root: request.root, igetaRoot: request.igetaRoot, label: `decision-${request.verb}`, changes: planned.value, isDryRun: request.isDryRun });
}
