// docs-migrate の計画 (テスト仕様 07 の M2〜M9・M11〜M15・M18、止める条件 S1〜S9)。
// 何も書かない。読んで、止める理由を全部集め、止めないなら移す・消す・書く内容を作る。書くのは DocsMigrateApply.ts。

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ApprovalFilesModule, isOwnerForm } from './ApprovalFilesModule.js';
import type { ApprovalWrite } from './ApprovalFilesModule.js';
import { DEFAULT_IGETA_CONFIG, loadIgetaConfig } from '../core/IgetaConfig.js';
import { MAX_DOCS_PER_FOLDER } from '../checks/FolderSizeCheck.js';
import { listRepoFiles } from '../checks/AgentsEntrypointCheck.js';
import { placementOf } from '../core/Role.js';
import { scalar } from '../core/Frontmatter.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import { findLedgerDirs, readLedger } from '../core/AgreementLedger.js';
import { DISCREPANCY_FILENAME, discrepancyLogPathFor, readDiscrepancyLog } from '../core/DiscrepancyLog.js';
import { readSidecar, sidecarPathFor } from '../core/ProvenanceSidecar.js';
import { HANDBOOK_BODY_HASHES, HANDBOOK_FILES, NEW_ENTRANCE, OLD_ENTRANCE, handbookBodyHash, handbookPathOf } from './DocsMigrateHandbook.js';
import { applyLinkEdits, autogenMask, localTarget, relativeDest, scanLinkHits } from './DocsMigrateLinks.js';
import type { LinkHit } from './DocsMigrateLinks.js';
import { dirtyProblem, filesUnder, gitRepoProblem, isDirPath, isIndexPath, nonDocMatcher, readRepoDoc, trackedFiles } from './DocsMigrateRepo.js';
import type { RepoDoc } from './DocsMigrateRepo.js';
import { isValidContextName, targetOf, yearOf } from './DocsMigrateTargets.js';

export interface MigrateRequest {
  readonly root: string;
  readonly owner: string | undefined;
  readonly igetaRoot: string;
}

export interface Stop {
  readonly code: string;
  readonly path: string;
  readonly reason: string;
}

export type PlanOp = 'MOVE' | 'DELETE' | 'CREATE' | 'APPEND' | 'REWRITE' | 'NOTICE';

export interface PlanLine {
  readonly op: PlanOp;
  /** 並べ替えの鍵 (パス・通知の種類と文) */
  readonly key: string;
  readonly text: string;
}

/** 中身を書き換えるファイル。oldPath は移す前のパス、newPath は書く先 (移さなければ同じ) */
export interface ContentEdit {
  readonly oldPath: string;
  readonly newPath: string;
  /** 書く中身 (計画の時点の内容から作ったもの。表示と比べるため) */
  readonly newText: string;
  /** 書くときに、そのときのファイルの中身へかける変換 (由来は fingerprint-rebase の後に書き換えるため)。無ければ newText を書く */
  readonly transform?: (current: string) => string;
  readonly count: number;
}

export interface Plan {
  readonly stops: readonly Stop[];
  readonly lines: readonly PlanLine[];
  /** 移すファイル (旧 → 新)。提出物のフォルダの中のファイルも 1 つずつ入る */
  readonly moves: ReadonlyMap<string, string>;
  /** 消すファイル (旧パス → 理由) */
  readonly deletes: ReadonlyMap<string, string>;
  readonly edits: readonly ContentEdit[];
  /** 新しく作るファイル (新パス → 中身) */
  readonly creates: ReadonlyMap<string, string>;
  /** AGENTS.md・CODEOWNERS の書き込み (ApprovalFilesModule の結果) */
  readonly approvals: readonly ApprovalWrite[];
  /** 旧パス → 新パス (移さないものは同じパス) */
  readonly newPathOf: (oldPath: string) => string;
  /** 消す手引きの写し (旧パス → 版の手引きのパス)。完了条件 (C1・C5) の比べ方に使う */
  readonly removedHandbooks: ReadonlyMap<string, string>;
  /** 消す文書の id (depends_on・relates_to から外した) */
  readonly removedIds: ReadonlySet<string>;
  /** 計画が書き換える・移す・消す・作る path の全部 (旧と新)。巻き戻しはこの一覧から組み立てる */
  readonly touched: readonly string[];
}

const OP_ORDER: readonly PlanOp[] = ['MOVE', 'DELETE', 'CREATE', 'APPEND', 'REWRITE', 'NOTICE'];
/** 15 本を超えたら、まとまりの下位フォルダへ全部移すフォルダ (M9) */
const OVERFLOW_DIRS: readonly string[] = [
  'docs/ai/specs/tasks',
  'docs/ai/handbook/how-to',
  'docs/ai/handbook/explanation',
  'docs/ai/handbook/runbooks',
];
const PROVENANCE_NAMES: ReadonlySet<string> = new Set(['agreements.ledger.jsonl', DISCREPANCY_FILENAME, 'deliverable.json']);
const isProvenanceArtifact = (path: string): boolean => path.endsWith('.provenance.json') || PROVENANCE_NAMES.has(basename(path));
const isNonIdFile = (path: string): boolean => !path.endsWith('.md');

/** 親のフォルダを、近いものから順に (docs/ は含めない) */
function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  let dir = dirname(path);
  while (dir !== '.' && dir !== '' && dir !== '/' && dir !== 'docs') {
    out.push(dir);
    dir = dirname(dir);
  }
  return out;
}

const relativeToRepo = (root: string, abs: string): string => abs.slice(root.length + 1);

/** 区間の外にある、見出し・空行・frontmatter・HTML コメント・目的の 1 行 以外の文章 (M14) */
export function outsideGeneratedAndHeadings(lines: readonly string[]): string[] {
  const out: string[] = [];
  let inFrontmatter = lines[0]?.trim() === '---';
  let inComment = false;
  const generated = autogenMask(lines);
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (generated[index]) return;
    if (index === 0 && inFrontmatter) return;
    if (inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = false;
      return;
    }
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      return;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) inComment = true;
      return;
    }
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('> このディレクトリの目的')) return;
    out.push(trimmed);
  });
  return out;
}

/** frontmatter の depends_on・relates_to から、消す id を外す。変えた件数を返す */
export function removeIdsFromFrontmatter(text: string, ids: ReadonlySet<string>): { text: string; count: number } {
  if (ids.size === 0) return { text, count: 0 };
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { text, count: 0 };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return { text, count: 0 };
  let count = 0;
  let listKey: string | null = null;
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (index === 0 || index >= end) {
      out.push(line);
      return;
    }
    const inline = /^(depends_on|relates_to):\s*\[(.*)\]\s*$/.exec(line);
    if (inline !== null) {
      const items = (inline[2] ?? '')
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter((item) => item !== '');
      const kept = items.filter((item) => !ids.has(item));
      if (kept.length !== items.length) {
        count += items.length - kept.length;
        out.push(`${inline[1]}: [${kept.join(', ')}]`);
        return;
      }
      listKey = null;
      out.push(line);
      return;
    }
    const block = /^(depends_on|relates_to):\s*$/.exec(line);
    if (block !== null) {
      listKey = block[1] ?? null;
      out.push(line);
      return;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item !== null && listKey !== null) {
      const value = (item[1] ?? '').trim().replace(/^["']|["']$/g, '');
      if (ids.has(value)) {
        count += 1;
        return;
      }
      out.push(line);
      return;
    }
    listKey = null;
    out.push(line);
  });
  return { text: out.join('\n'), count };
}

/**
 * docs/README.md の「読み手別の入口」の 3 行。過去の版の 3 行と 1 字も違わないときだけ、新しい 3 行に替える (M14)。
 */
export function rewriteEntrance(text: string): { kind: 'none' | 'same' | 'rewritten' | 'differs'; text: string } {
  const lines = text.split('\n');
  const head = lines.findIndex((line) => /^##\s+読み手別の入口\s*$/.test(line.replace(/\r$/, '')));
  if (head === -1) return { kind: 'none', text };
  let end = lines.findIndex((line, index) => index > head && /^##\s/.test(line));
  if (end === -1) end = lines.length;
  const bullets: number[] = [];
  for (let i = head + 1; i < end; i += 1) if (/^- /.test(lines[i] ?? '')) bullets.push(i);
  const current = bullets.map((i) => (lines[i] ?? '').replace(/\s+$/, ''));
  const contiguous = bullets.every((line, k) => k === 0 || line === (bullets[k - 1] ?? -2) + 1);
  if (JSON.stringify(current) === JSON.stringify(NEW_ENTRANCE)) return { kind: 'same', text };
  if (!contiguous || JSON.stringify(current) !== JSON.stringify(OLD_ENTRANCE) || bullets.length === 0) {
    return { kind: 'differs', text };
  }
  const first = bullets[0] ?? 0;
  const last = bullets[bullets.length - 1] ?? first;
  return { kind: 'rewritten', text: [...lines.slice(0, first), ...NEW_ENTRANCE, ...lines.slice(last + 1)].join('\n') };
}

/** 旧い path の文字列 (リンクでないもの) が、テキストのどの行にあるか。境界は英数・`_`・`-`・`.`・`/` 以外 */
export function occurrencesOf(text: string, path: string): number[] {
  if (!text.includes(path)) return [];
  const lines: number[] = [];
  const re = new RegExp(`(?<![\\w./-])${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w./-])`);
  text.split('\n').forEach((line, index) => {
    if (re.test(line)) lines.push(index + 1);
  });
  return lines;
}

/** 計画を作る。止める理由が 1 つでもあれば stops が入り、moves などは空 */
export function planMigration(req: MigrateRequest): Plan {
  const { root } = req;
  const stops: Stop[] = [];
  const stop = (code: string, path: string, reason: string): void => {
    stops.push({ code, path, reason });
  };
  const notices: PlanLine[] = [];
  const notice = (kind: string, text: string): void => {
    notices.push({ op: 'NOTICE', key: `${kind}\u0000${text}`, text: `NOTICE ${kind}: ${text}` });
  };

  // S1: git の repo で、作業ツリーが clean
  const repoProblem = gitRepoProblem(root);
  if (repoProblem !== null) stop('S1', '.', repoProblem);
  else {
    const dirty = dirtyProblem(root);
    if (dirty !== null) stop('S1', '.', dirty);
  }
  const tracked = trackedFiles(root) ?? [];

  // S8: 持ち主
  if (req.owner === undefined || !isOwnerForm(req.owner)) {
    stop('S8', '--owner', '持ち主が無いか、形が違う (@user・@org/team・メールアドレス)');
  }

  // S7: .igeta.json (読めない・nonDocPaths が 3 フォルダの中)
  const loaded = loadIgetaConfig(root);
  if ('violation' in loaded) stop('S7', '.igeta.json', loaded.violation.message);
  const config = 'config' in loaded ? loaded.config : DEFAULT_IGETA_CONFIG;
  const isNonDoc = nonDocMatcher(config.nonDocPaths);
  const igetaJson = join(root, '.igeta.json');
  if (existsSync(igetaJson)) {
    try {
      const raw = JSON.parse(readFileSync(igetaJson, 'utf8')) as unknown;
      if (typeof raw === 'object' && raw !== null && 'sharedKinds' in raw) {
        notice('sharedKinds', '.igeta.json の sharedKinds は新しい構成では読まない (まとまりは frontmatter の context で決まる)');
      }
    } catch {
      // 読めないことは loadIgetaConfig が止めている
    }
  }

  // 一覧: docs/ の中のファイル (nonDocPaths は除く)
  const underDocs = isDirPath(join(root, 'docs')) ? filesUnder(root, 'docs') : [];
  const movable = underDocs.filter((path) => !isNonDoc(path));
  const movableSet = new Set(movable);
  const docPaths = movable.filter((path) => path.endsWith('.md') && !isIndexPath(path));
  const indexPaths = movable.filter((path) => path.endsWith('.md') && isIndexPath(path));
  const otherPaths = movable.filter(isNonIdFile);

  // 文書を読む。kind が無い・表に無い kind は止める (S2)。手引きの写しは照合して消す (S3・M11)
  const handbookCopies = new Map<string, string>();
  const chapterDocs: RepoDoc[] = [];
  const placedDocs: { doc: RepoDoc; target: string; defaulted: boolean }[] = [];
  const docs = new Map<string, RepoDoc>();
  for (const path of docPaths) {
    const doc = readRepoDoc(root, path);
    docs.set(path, doc);
    if (doc.kind === null) {
      stop('S2', path, 'kind が無い (frontmatter に kind を書く。推定で置かない)');
      continue;
    }
    if (HANDBOOK_FILES.has(doc.kind)) {
      const hash = handbookBodyHash(doc.text);
      if ((HANDBOOK_BODY_HASHES.get(doc.kind) ?? []).includes(hash)) handbookCopies.set(path, doc.kind);
      else stop('S3', path, `手引きの写し (${doc.kind}) の本文が、どの版の手引きとも一致しない (手を入れたものは消さない)`);
      continue;
    }
    if (doc.kind === 'delivery-chapter') {
      chapterDocs.push(doc);
      continue;
    }
    if (placementOf(doc.kind) === undefined) {
      stop('S2', path, `置き場所の表に無い kind: ${doc.kind}`);
      continue;
    }
    const meta = doc.meta;
    const year = meta === null ? null : yearOf((key) => scalar(meta.data, key));
    const outcome = targetOf({ kind: doc.kind, name: basename(path), context: doc.context, year });
    if (outcome.kind === 'stop') {
      stop(outcome.code, path, outcome.reason);
      continue;
    }
    placedDocs.push({ doc, target: `docs/${outcome.path}`, defaulted: outcome.contextDefaulted });
  }

  // 提出物の章のフォルダ (M7)。章のあるフォルダを丸ごと client/delivery/<提出物名>/ へ移す
  const folderMoves = new Map<string, string>();
  const chapterFolders = new Map<string, { chapters: RepoDoc[]; manifest: Record<string, unknown> | null }>();
  for (const chapter of chapterDocs) {
    const folder = dirname(chapter.path);
    const entry = chapterFolders.get(folder) ?? { chapters: [], manifest: null };
    entry.chapters.push(chapter);
    chapterFolders.set(folder, entry);
  }
  // 提出物のフォルダの中の文書は章だけ。章以外は移す先が決まらないので、黙って引き抜かず止める
  for (const [path, doc] of docs) {
    const folder = [...chapterFolders.keys()].find((f) => f !== 'docs' && path.startsWith(`${f}/`));
    if (folder !== undefined && doc.kind !== 'delivery-chapter') {
      stop('S5', path, `提出物のフォルダ (${folder}) の中に章でない文書がある (kind: ${doc.kind ?? 'なし'})。章だけを置くか、フォルダから出す`);
    }
  }
  for (const [folder, entry] of chapterFolders) {
    if (folder === 'docs') {
      for (const chapter of entry.chapters) stop('S5', chapter.path, '提出物の章が docs/ 直下にある (章のあるフォルダを提出物として移す)');
      continue;
    }
    const manifestPath = join(root, folder, 'deliverable.json');
    if (existsSync(manifestPath)) {
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
        if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) entry.manifest = raw as Record<string, unknown>;
        else stop('S7', `${folder}/deliverable.json`, 'manifest がオブジェクトでない');
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        stop('S7', `${folder}/deliverable.json`, `manifest が JSON として読めない (${detail})`);
      }
    }
    const folderName = basename(folder);
    let name = folderName;
    if (folderName === 'delivery') {
      const output = entry.manifest?.['output'];
      if (typeof output !== 'string' || !output.endsWith('.pdf')) {
        stop('S5', folder, 'フォルダ名が delivery で、manifest の output (.pdf) から提出物名を決められない');
        continue;
      }
      name = basename(output).replace(/\.pdf$/, '');
    }
    if (!isValidContextName(name)) {
      stop('S5', folder, `提出物名 (${name}) がフォルダの名前として使えない`);
      continue;
    }
    const listed = entry.manifest?.['chapters'];
    if (entry.manifest !== null) {
      if (!Array.isArray(listed) || !listed.every((item): item is string => typeof item === 'string')) {
        stop('S7', `${folder}/deliverable.json`, 'manifest の chapters が文字列の配列でない');
      } else {
        for (const chapter of listed) {
          if (chapter.includes('/') || chapter.startsWith('.')) {
            stop('S5', folder, `manifest の章 (${chapter}) が下位のフォルダか、フォルダの外にある`);
          } else if (!existsSync(join(root, folder, chapter))) {
            stop('S8', `${folder}/${chapter}`, 'manifest が指す章が、フォルダに無い');
          }
        }
      }
    }
    const newFolder = `docs/client/delivery/${name}`;
    if (newFolder !== folder) folderMoves.set(folder, newFolder);
  }
  for (const [folder, entry] of chapterFolders) {
    for (const [other, otherEntry] of chapterFolders) {
      if (other !== folder && folder.startsWith(`${other}/`) && otherEntry.manifest !== null) {
        for (const chapter of entry.chapters) stop('S5', chapter.path, `章が下位のフォルダにある (${other} の manifest の外)`);
      }
    }
  }
  const folderOf = (path: string): string | undefined => [...chapterFolders.keys()].find((folder) => path.startsWith(`${folder}/`));

  // 行き先の表 (移す文書の旧 → 新)。提出物のフォルダの中のファイルは、フォルダごと移る
  const fileMap = new Map<string, string>();
  for (const [folder, to] of folderMoves) {
    for (const path of movable.filter((p) => p.startsWith(`${folder}/`))) fileMap.set(path, `${to}${path.slice(folder.length)}`);
  }
  for (const path of otherPaths) {
    if (folderOf(path) === undefined && isProvenanceArtifact(path)) {
      stop('S5', path, '由来・台帳・manifest が提出物のフォルダの外にある (章のフォルダへ入れる)');
    }
  }
  for (const chapter of chapterDocs) {
    if (folderOf(chapter.path) === undefined) stop('S5', chapter.path, '提出物の章がフォルダの中にない');
  }

  // 行き先 (M4〜M6)。決まった文書を入れる
  for (const { doc, target } of placedDocs) fileMap.set(doc.path, target);

  // M9: 15 本を超えるフォルダは、まとまりの下位フォルダへ全部移す
  for (const dir of OVERFLOW_DIRS) {
    const inDir = placedDocs.filter(({ target }) => dirname(target) === dir);
    if (inDir.length <= MAX_DOCS_PER_FOLDER) continue;
    for (const { doc, target } of inDir) fileMap.set(doc.path, `${dir}/${doc.context ?? SHARED_CONTEXT}/${basename(target)}`);
  }

  const newOfDoc = (path: string): string => fileMap.get(path) ?? path;

  // 文書でないファイル (画像など、M8)。使う文書が全部同じフォルダから同じフォルダへ移るときだけ一緒に移す
  const linksOf = new Map<string, LinkHit[]>();
  const refsOf = new Map<string, string[]>();
  const contentOf = new Map<string, string>();
  for (const path of tracked) {
    const abs = join(root, path);
    if (!path.endsWith('.md') || !existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    contentOf.set(path, text);
    const hits = scanLinkHits(text);
    linksOf.set(path, hits);
    for (const hit of hits) {
      const target = localTarget(path, hit.dest);
      if (target === null) continue;
      const list = refsOf.get(target.path) ?? [];
      if (!list.includes(path)) list.push(path);
      refsOf.set(target.path, list);
    }
  }
  for (const path of otherPaths) {
    if (folderOf(path) !== undefined || isProvenanceArtifact(path)) continue;
    const refs = refsOf.get(path) ?? [];
    if (refs.length === 0) {
      stop('S6', path, '使う文書が無く、行き先を決められない (人が移すか nonDocPaths に足す)');
      continue;
    }
    const refDocs = refs.filter((ref) => ref.startsWith('docs/') && !isNonDoc(ref) && !isIndexPath(ref));
    if (refDocs.length !== refs.length) {
      stop('S6', path, '使う文書に、移さない文書 (索引・docs/ の外・nonDocPaths) がある');
      continue;
    }
    const oldDirs = [...new Set(refDocs.map((ref) => dirname(ref)))];
    const newDirs = [...new Set(refDocs.map((ref) => dirname(newOfDoc(ref))))];
    const oldDir = oldDirs[0];
    const newDir = newDirs[0];
    if (oldDirs.length !== 1 || newDirs.length !== 1 || oldDir === undefined || newDir === undefined) {
      stop('S6', path, '使う文書が、違うフォルダへ移る (1 つの画像は 1 つの行き先にしか置けない)');
      continue;
    }
    if (!path.startsWith(`${oldDir}/`)) {
      stop('S6', path, '使う文書のフォルダの外にある (行き先を決められない)');
      continue;
    }
    fileMap.set(path, `${newDir}${path.slice(oldDir.length)}`);
  }

  // 手引きの写し (M11) は消す。写しの id を指す参照は外す (下の内容の書き換え)
  const deletes = new Map<string, string>();
  for (const [path, kind] of handbookCopies) {
    deletes.set(path, `手引きの写し (${kind}) を版の手引きと照合して消す。本文の参照は ${handbookPathOf(kind) ?? ''} へ`);
  }
  const removedIds = new Set<string>();
  for (const path of handbookCopies.keys()) {
    const id = docs.get(path)?.id ?? null;
    if (id !== null) removedIds.add(id);
  }

  // 索引 (M14)。新しい置き場所のフォルダに当たらない README は消す
  const newFolders = new Set<string>(['docs']);
  for (const newPath of fileMap.values()) for (const dir of ancestorsOf(newPath)) newFolders.add(dir);
  for (const to of folderMoves.values()) for (const dir of ancestorsOf(`${to}/x`)) newFolders.add(dir);
  for (const path of indexPaths) {
    if (path === 'docs/README.md' || path === 'docs/dependencies.md') continue;
    if (folderOf(path) !== undefined) continue;
    if (newFolders.has(dirname(path))) continue;
    deletes.set(path, '新しい置き場所に対応しないフォルダの README (索引は docs-graph が作り直す)');
    const text = readFileSync(join(root, path), 'utf8');
    for (const line of outsideGeneratedAndHeadings(text.split('\n'))) {
      notice('README', `${path} の区間の外に文章がある (一覧で確かめる): ${line}`);
    }
  }

  // ADR の年のフォルダがあり、決定台帳の索引 (person/decisions/README.md) が無ければ雛形から置く (M10 ⑧)
  const creates = new Map<string, string>();
  const hasAdr = [...fileMap.values()].some((path) => /^docs\/person\/decisions\/\d{4}\//.test(path));
  const decisionsReadme = 'docs/person/decisions/README.md';
  if (hasAdr && !fileMap.has(decisionsReadme) && !existsSync(join(root, decisionsReadme))) {
    const template = join(req.igetaRoot, 'templates', 'docs', 'person', 'decisions', 'README.md');
    if (existsSync(template)) creates.set(decisionsReadme, readFileSync(template, 'utf8'));
    else stop('S5', decisionsReadme, '雛形 templates/docs/person/decisions/README.md が無い');
  }

  // S4: 行き先が重なる (2 つのファイルが同じ行き先、または移さない既存のファイルと重なる)
  const sources = new Set<string>([...movableSet, ...deletes.keys()]);
  const owners = new Map<string, string>();
  for (const [from, to] of fileMap) {
    const owner = owners.get(to);
    if (owner !== undefined) stop('S4', to, `行き先が重なる (${owner} と ${from})`);
    owners.set(to, from);
    if (to !== from && existsSync(join(root, to)) && !sources.has(to)) {
      stop('S4', to, `行き先に、移さない既存のファイルがある (${from})`);
    }
  }
  for (const path of creates.keys()) {
    if (owners.has(path) || existsSync(join(root, path))) stop('S4', path, '作る先に既にファイルがある');
  }

  const newPathOf = (oldPath: string): string => {
    const direct = fileMap.get(oldPath);
    if (direct !== undefined) return direct;
    // 提出物のフォルダの中でも、nonDocPaths に当たるもの (movableSet に無い) は動かない
    const folder = movableSet.has(oldPath) ? folderOf(oldPath) : undefined;
    if (folder !== undefined) return `${folderMoves.get(folder) ?? folder}${oldPath.slice(folder.length)}`;
    return oldPath;
  };

  // M5 の知らせ: context を書いていないもの (まとまりの下位に置く kind)
  for (const { doc, target, defaulted } of placedDocs) {
    if (defaulted && fileMap.get(doc.path) === target) {
      notice('context', `${doc.path} は context が無いため shared に置く (${target})`);
    }
  }

  // 由来と合意 (M10 ⑥・M3 S7・S9)。sourceDoc と食い違いログの location を新しいパスへ書き換える
  const edits: ContentEdit[] = [];
  const coveredDocs = new Set<string>();
  for (const chapter of chapterDocs) {
    const abs = join(root, chapter.path);
    const sidecarAbs = sidecarPathFor(abs);
    if (!existsSync(sidecarAbs)) continue;
    const result = readSidecar(abs);
    if (result.kind === 'invalid') {
      stop('S7', chapter.path, result.violation.message);
      continue;
    }
    if (result.kind !== 'ok') continue;
    if (result.sidecar.entries.length === 0) continue;
    coveredDocs.add(chapter.path);
    for (const entry of result.sidecar.entries) {
      if (entry.from !== null) {
        const id = entry.from.split('/')[0] ?? '';
        const source = [...docs.values()].find((doc) => doc.id === id);
        if (source !== undefined) coveredDocs.add(source.path);
      }
    }
    const raw = JSON.parse(readFileSync(sidecarAbs, 'utf8')) as Record<string, unknown>;
    const sourceDoc = typeof raw['sourceDoc'] === 'string' ? raw['sourceDoc'] : null;
    const movedSidecar = newPathOf(relativeToRepo(root, sidecarAbs));
    const newSource = sourceDoc === null ? null : newPathOf(sourceDoc);
    if (sourceDoc !== null && newSource !== null && newSource !== sourceDoc) {
      const rewriteSource = (current: string): string =>
        `${JSON.stringify({ ...(JSON.parse(current) as Record<string, unknown>), sourceDoc: newSource }, null, 2)}\n`;
      edits.push({
        oldPath: relativeToRepo(root, sidecarAbs),
        newPath: movedSidecar,
        newText: rewriteSource(readFileSync(sidecarAbs, 'utf8')),
        transform: rewriteSource,
        count: 1,
      });
    }
  }
  for (const ledgerDir of findLedgerDirs(join(root, 'docs'))) {
    const relDir = relativeToRepo(root, ledgerDir);
    const ledger = readLedger(ledgerDir);
    if (ledger.kind === 'invalid') stop('S7', relDir, ledger.violation.message);
    if (ledger.kind === 'ok' && ledger.events.some((event) => event.event === 'approve')) {
      notice('再合意', `${relDir} に承認の記録がある。書き直す段で要件の行 (reagreementRules) を変えると再合意が出る`);
    }
    const discrepancy = readDiscrepancyLog(ledgerDir);
    if (discrepancy.kind === 'invalid') stop('S7', relativeToRepo(root, discrepancyLogPathFor(ledgerDir)), discrepancy.violation.message);
    if (discrepancy.kind === 'ok') {
      const logAbs = discrepancyLogPathFor(ledgerDir);
      const lines = readFileSync(logAbs, 'utf8').split('\n');
      let changed = 0;
      const next = lines.map((line) => {
        if (line.trim() === '') return line;
        const entry = JSON.parse(line) as { location?: unknown };
        if (typeof entry.location !== 'string') return line;
        const hash = entry.location.indexOf('#');
        const pathPart = hash === -1 ? entry.location : entry.location.slice(0, hash);
        const fragment = hash === -1 ? '' : entry.location.slice(hash);
        const to = newPathOf(pathPart);
        if (to === pathPart) return line;
        changed += 1;
        return JSON.stringify({ ...entry, location: `${to}${fragment}` });
      });
      if (changed > 0) {
        edits.push({
          oldPath: relativeToRepo(root, logAbs),
          newPath: newPathOf(relativeToRepo(root, logAbs)),
          newText: next.join('\n'),
          count: changed,
        });
      }
    }
  }

  // 内容の書き換え (M12 リンク・M11 の参照・入口)。tracked の .md 全部
  const folderRedirect = (folder: string): string | undefined => {
    if (fileMap.has(folder)) return undefined;
    const under = [...fileMap.keys()].filter((key) => key.startsWith(`${folder}/`));
    if (under.length === 0 || !under.every((key) => dirname(key) === folder)) return undefined;
    const dirs = [...new Set(under.map((key) => dirname(fileMap.get(key) ?? key)))];
    return dirs.length === 1 ? dirs[0] : undefined;
  };
  // フォルダの中身が移るか (移し先が 1 つに決まらないフォルダへのリンクは止める)
  const movesInside = (folder: string): boolean =>
    !fileMap.has(folder) && [...fileMap].some(([key, to]) => key.startsWith(`${folder}/`) && to !== key);
  const removedDests = new Map<string, string>();
  for (const [path, kind] of handbookCopies) removedDests.set(path, handbookPathOf(kind) ?? '');
  const editedText = new Map<string, string>();
  // 消す README へのリンクは、その フォルダの文書が 1 つの新しいフォルダへ移るなら、そのフォルダの README (docs-graph が作る) へ向ける
  const readmeRedirect = new Map<string, string>();
  for (const path of deletes.keys()) {
    if (basename(path) !== 'README.md') continue;
    const folder = dirname(path);
    const dirs = [...new Set(docPaths.filter((p) => dirname(p) === folder && !handbookCopies.has(p)).map((p) => dirname(newOfDoc(p))))];
    const only = dirs.length === 1 ? dirs[0] : undefined;
    if (only !== undefined) readmeRedirect.set(path, `${only}/README.md`);
  }
  for (const path of tracked) {
    // docs/dependencies.md は docs-graph が作り直す索引。手で直さない
    if (!path.endsWith('.md') || deletes.has(path) || path === 'docs/dependencies.md') continue;
    const oldText = contentOf.get(path);
    if (oldText === undefined) continue;
    const fromNew = newPathOf(path);
    let text = oldText;
    let count = 0;
    if (path.startsWith('docs/') && !isNonDoc(path)) {
      const removed = removeIdsFromFrontmatter(text, removedIds);
      text = removed.text;
      count += removed.count;
    }
    const linked = applyLinkEdits(text, (hit) => {
      const target = localTarget(path, hit.dest);
      if (target === null) return null;
      const handbook = removedDests.get(target.path);
      if (handbook !== undefined) return `${hit.text === '' ? '' : `${hit.text} `}\`${handbook}\``;
      // フォルダへのリンク (フォルダの中の文書が全部 1 つの新しいフォルダへ移るとき) は、その新しいフォルダへ向ける
      const redirected = readmeRedirect.get(target.path) ?? folderRedirect(target.path);
      if (redirected === undefined && deletes.has(target.path)) {
        stop('S5', path, `消す README へのリンク (${target.path}) の移す先が 1 つに決まらない。リンクを外すか、移し先を決めてから実行する`);
        return null;
      }
      if (redirected === undefined && movesInside(target.path)) {
        stop('S5', path, `フォルダへのリンク (${target.path}) の移す先が 1 つに決まらない (中の文書が 1 つの新しいフォルダへ移らない・子フォルダを含む)。リンクを個々の文書へ向け直す`);
        return null;
      }
      const newTarget = redirected ?? newPathOf(target.path);
      if (fromNew === path && newTarget === target.path) return null;
      return `${hit.head}${relativeDest(hit.dest, fromNew, newTarget, target.fragment)}${hit.tail}`;
    });
    text = linked.text;
    count += linked.count;
    if (path === 'docs/README.md') {
      const entrance = rewriteEntrance(text);
      if (entrance.kind === 'rewritten') {
        text = entrance.text;
        count += 1;
      } else if (entrance.kind === 'differs') {
        notice('入口', 'docs/README.md の入口の 3 行が、旧い版の 3 行と 1 字も違わない形ではない。替えず、手で直す');
      }
    }
    if (text !== oldText) {
      editedText.set(path, text);
      edits.push({ oldPath: path, newPath: fromNew, newText: text, count });
    }
  }

  // S9: 由来・合意が指紋に数える本文 (章と、由来が指す正本) が、移すと指紋が変わる参照を持つ (M3)
  for (const path of coveredDocs) {
    for (const hit of linksOf.get(path) ?? []) {
      const target = localTarget(path, hit.dest);
      if (target === null || !existsSync(join(root, target.path))) continue;
      const replacedById = target.path.endsWith('.md') && !isIndexPath(target.path) && (docs.get(target.path)?.id ?? null) !== null;
      const moves = newPathOf(target.path) !== target.path || deletes.has(target.path);
      if (!replacedById && (moves || removedDests.has(target.path))) {
        stop('S9', path, `由来・合意が指紋に数える本文が、移すと指紋が変わる参照を持つ (id の無いファイル・README・消す手引き): ${target.path}。その画像を nonDocPaths に足すか、リンクを外して顧客へ新しい版を出す`);
      }
    }
  }

  // M13: リンクでない旧い path の文字列を一覧にする (書き換えず、知らせる)
  const movedFrom = [...fileMap.entries()].filter(([from, to]) => from !== to && !deletes.has(from)).map(([from]) => from);
  for (const path of tracked) {
    if (deletes.has(path)) continue;
    const text = editedText.get(path) ?? contentOf.get(path) ?? (existsSync(join(root, path)) && !path.endsWith('.md') ? readTextIfText(join(root, path)) : null);
    if (text === null || text === undefined) continue;
    for (const from of movedFrom) {
      for (const line of occurrencesOf(text, from)) {
        notice('旧い path', `${newPathOf(path)}:${line} に ${from} が残る (リンクでないため書き換えない。手で直す)`);
      }
    }
  }

  // 移す前から壊れているリンク (C1 の基準。一覧で知らせる)
  for (const path of tracked) {
    for (const hit of linksOf.get(path) ?? []) {
      const target = localTarget(path, hit.dest);
      if (target !== null && !existsSync(join(root, target.path))) notice('前から壊れたリンク', `${newPathOf(path)} -> ${hit.dest}`);
    }
  }

  // 承認の割り当て (AGENTS.md・CODEOWNERS)。CODEOWNERS の衝突は止める (S4)
  let approvals: ApprovalWrite[] = [];
  if (req.owner !== undefined && isOwnerForm(req.owner)) {
    // humanPaths は移した後の場所で当てる (移すと当たらなくなる glob は、行を要しない)
    const after = listRepoFiles(root).map((file) => newPathOf(file)).filter((file) => !deletes.has(file));
    const planned = new ApprovalFilesModule(root).plan(req.owner, config.humanPaths, after);
    if ('stops' in planned) for (const reason of planned.stops) stop('S4', '.github/CODEOWNERS', reason);
    else approvals = [...planned.writes];
  }

  // 出力
  const lines: PlanLine[] = [];
  for (const [from, to] of fileMap) {
    if (from !== to && !deletes.has(from)) lines.push({ op: 'MOVE', key: from, text: `MOVE ${from} -> ${to}` });
  }
  for (const [path, reason] of deletes) lines.push({ op: 'DELETE', key: path, text: `DELETE ${path} (${reason})` });
  for (const path of creates.keys()) lines.push({ op: 'CREATE', key: path, text: `CREATE ${path}` });
  for (const write of approvals) {
    const op: PlanOp = write.action === 'create' ? 'CREATE' : 'APPEND';
    lines.push({ op, key: write.relPath, text: `${op} ${write.relPath}` });
  }
  for (const edit of edits) lines.push({ op: 'REWRITE', key: edit.newPath, text: `REWRITE ${edit.newPath} (${edit.count} 件)` });
  lines.push(...notices);
  lines.sort((a, b) => OP_ORDER.indexOf(a.op) - OP_ORDER.indexOf(b.op) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  if (stops.length > 0) {
    return {
      stops,
      lines: [],
      moves: new Map(),
      deletes: new Map(),
      edits: [],
      creates: new Map(),
      approvals: [],
      newPathOf,
      removedHandbooks: new Map(),
      removedIds: new Set(),
      touched: [],
    };
  }
  const movedFiles = new Map([...fileMap].filter(([from, to]) => from !== to && !deletes.has(from)));
  const touched = [
    ...new Set([
      ...movedFiles.keys(),
      ...movedFiles.values(),
      ...deletes.keys(),
      ...edits.flatMap((edit) => [edit.oldPath, edit.newPath]),
      ...creates.keys(),
      ...approvals.map((write) => write.relPath),
    ]),
  ].sort();
  return {
    stops: [],
    lines,
    moves: movedFiles,
    deletes,
    edits,
    creates,
    approvals,
    newPathOf,
    removedHandbooks: new Map([...handbookCopies].map(([path, kind]) => [path, handbookPathOf(kind) ?? ''])),
    removedIds,
    touched,
  };
}

/** テキストのファイルの中身 (バイナリは null)。画像などの中身を M13 の走査に使わない */
function readTextIfText(abs: string): string | null {
  const buffer = readFileSync(abs);
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}
