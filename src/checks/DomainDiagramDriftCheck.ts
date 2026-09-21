// docs/design/detail/domain/*.md の mermaid classDiagram と
// <code_root>/domain 配下の TypeScript export を双方向で照合する。
// 契約の正典は docs/adr/0003-modular-monolith-and-diagram-code-contract.md。
//
// 「未実装だから緑」は作らない (原則: サイレント縮退禁止)。実装が無い状態で
// 図だけを検証したい場合は allowMissingCode を明示的に渡す。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';

const MERMAID_OPEN_RE = /^\s*```+\s*mermaid\s*$/;
const FENCE_CLOSE_RE = /^\s*```+\s*$/;
const CLASS_DIAGRAM_RE = /^classDiagram(-v2)?\b/;
// mermaid: class Foo / class Foo~T~ / class Foo["ラベル"] / class Foo:::style / class Foo {
const CLASS_DECL_RE =
  /^\s*class\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:~[^~]*~)?\s*(?:\[[^\]]*\])?\s*(?::::[A-Za-z0-9_-]+)?\s*\{?\s*$/;
// TypeScript: export class / export abstract class / export interface / export type X =
const EXPORT_DECL_RE =
  /^\s*export\s+(?:declare\s+)?(abstract class|class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
const FRONTMATTER_ENTRY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/;

const SKIP_FILE_RE = /(\.spec\.ts|\.test\.ts|\.d\.ts)$/;
const SKIP_DIR = new Set(['node_modules', '__tests__', '__mocks__', 'dist', 'coverage']);

interface ClassDeclaration {
  readonly name: string;
  readonly line: number;
}

interface DiagramScan {
  readonly declarations: readonly ClassDeclaration[];
  readonly blocks: number;
  readonly unterminated: boolean;
}

interface ExportedDeclaration {
  readonly name: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
}

/** 図側で宣言されたクラスの出所 (重複検出とドリフト報告の位置に使う) */
interface DiagramOrigin {
  readonly file: string;
  readonly line: number;
}

export interface DomainDriftOptions {
  /** 図のディレクトリ。未指定なら <targetRoot>/docs/design/detail/domain */
  readonly docsDir?: string;
  /** code_root が未実装のとき、図側のみ検証して違反にしない */
  readonly allowMissingCode?: boolean;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function listMarkdown(dir: string): readonly string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(dir, name));
}

function listTypeScript(dir: string): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(join(current, entry.name));
      } else if (entry.name.endsWith('.ts') && !SKIP_FILE_RE.test(entry.name)) {
        found.push(join(current, entry.name));
      }
    }
  };
  walk(dir);
  return found;
}

function parseFrontmatter(lines: readonly string[]): Map<string, string> | null {
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const data = new Map<string, string>();
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    const matched = FRONTMATTER_ENTRY_RE.exec(line);
    const key = matched?.[1];
    const value = matched?.[2];
    if (key === undefined || value === undefined) continue;
    data.set(key, value.trim().replace(/^["']|["']$/g, ''));
  }
  return data;
}

/** mermaid classDiagram ブロックの class 宣言を 1 始まりの行番号付きで返す。 */
function extractDiagramClasses(lines: readonly string[]): DiagramScan {
  const declarations: ClassDeclaration[] = [];
  let blocks = 0;
  let inFence = false;
  let isClassDiagram = false;
  let sawDirective = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!inFence) {
      if (MERMAID_OPEN_RE.test(line)) {
        inFence = true;
        isClassDiagram = false;
        sawDirective = false;
      }
      continue;
    }
    if (FENCE_CLOSE_RE.test(line)) {
      inFence = false;
      continue;
    }
    const body = line.trim();
    if (body === '' || body.startsWith('%%')) continue;
    if (!sawDirective) {
      sawDirective = true;
      isClassDiagram = CLASS_DIAGRAM_RE.test(body);
      if (isClassDiagram) blocks += 1;
      continue;
    }
    if (!isClassDiagram) continue;
    const name = CLASS_DECL_RE.exec(line)?.[1];
    if (name !== undefined) declarations.push({ name, line: i + 1 });
  }
  return { declarations, blocks, unterminated: inFence };
}

function extractExportedTypes(file: string): readonly ExportedDeclaration[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const found: ExportedDeclaration[] = [];
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      continue;
    }
    const matched = EXPORT_DECL_RE.exec(line);
    const kind = matched?.[1];
    const name = matched?.[2];
    if (kind === undefined || name === undefined) continue;
    found.push({ name, kind, file, line: i + 1 });
  }
  return found;
}

export class DomainDiagramDriftCheck implements Check {
  readonly name = 'domain-drift';

  readonly #docsDir: string | undefined;
  readonly #allowMissingCode: boolean;

  constructor(options: DomainDriftOptions = {}) {
    this.#docsDir = options.docsDir === undefined ? undefined : resolve(options.docsDir);
    this.#allowMissingCode = options.allowMissingCode ?? false;
  }

  run(ctx: CheckContext): readonly Violation[] {
    const root = ctx.targetRoot;
    const docsDir = this.#docsDir ?? join(root, 'docs', 'design', 'detail', 'domain');
    const rel = (path: string): string => relative(root, path) || path;

    if (!isDirectory(docsDir)) {
      return [
        {
          severity: 'cannot-check',
          file: rel(docsDir),
          message:
            '図ディレクトリが存在しない (ドメイン図は図↔実装の契約上必須。未作成なら作成する)',
        },
      ];
    }

    const markdownFiles = listMarkdown(docsDir).filter(
      (file) => !file.endsWith('README.md') && !file.endsWith('index.md'),
    );
    if (markdownFiles.length === 0) {
      return [{ severity: 'cannot-check', file: rel(docsDir), message: '図が 1 枚も無い' }];
    }

    const configErrors: Violation[] = [];
    // code_root ごとに図側の宣言を束ねる (1 コンテキストを複数ファイルに分割してよい)
    const byCodeRoot = new Map<string, Map<string, DiagramOrigin>>();

    for (const file of markdownFiles) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const frontmatter = parseFrontmatter(lines);
      if (frontmatter === null) {
        configErrors.push({
          severity: 'cannot-check',
          file: rel(file),
          line: 1,
          message: 'frontmatter が無い (--- で囲む)',
        });
        continue;
      }
      // 同じディレクトリには総論 (kind: domain-overview) や集約マップも置かれる。
      // kind が別種の文書は照合対象外。kind 未設定の場合は対象として扱い、
      // code_root / classDiagram の欠落を cannot-check で落とす (無言スキップを作らない)。
      const kind = frontmatter.get('kind');
      if (kind !== undefined && kind !== '' && kind !== 'domain-model') continue;

      const codeRoot = frontmatter.get('code_root');
      if (codeRoot === undefined || codeRoot === '') {
        configErrors.push({
          severity: 'cannot-check',
          file: rel(file),
          line: 1,
          message:
            'frontmatter に code_root が無い (例: code_root: apps/api/src/modules/booking)',
        });
        continue;
      }

      const { declarations, blocks, unterminated } = extractDiagramClasses(lines);
      if (unterminated) {
        configErrors.push({
          severity: 'cannot-check',
          file: rel(file),
          message: 'mermaid コードフェンスが閉じていない',
        });
        continue;
      }
      if (blocks === 0) {
        configErrors.push({
          severity: 'cannot-check',
          file: rel(file),
          message: 'mermaid classDiagram ブロックが無い',
        });
        continue;
      }
      if (declarations.length === 0) {
        configErrors.push({
          severity: 'cannot-check',
          file: rel(file),
          message: 'classDiagram に class 宣言が 1 つも無い',
        });
        continue;
      }

      const bucket = byCodeRoot.get(codeRoot) ?? new Map<string, DiagramOrigin>();
      for (const decl of declarations) {
        const existing = bucket.get(decl.name);
        if (existing !== undefined) {
          configErrors.push({
            severity: 'cannot-check',
            file: rel(file),
            line: decl.line,
            message: `クラス名の重複宣言: ${decl.name} (既出 ${rel(existing.file)}:${existing.line})`,
          });
          continue;
        }
        bucket.set(decl.name, { file, line: decl.line });
      }
      byCodeRoot.set(codeRoot, bucket);
    }

    if (configErrors.length > 0) return configErrors;

    const driftErrors: Violation[] = [];
    for (const [codeRoot, diagramClasses] of [...byCodeRoot.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const domainDir = resolve(root, codeRoot, 'domain');
      if (!isDirectory(domainDir)) {
        if (!this.#allowMissingCode) {
          return [
            {
              severity: 'cannot-check',
              file: rel(domainDir),
              message: '実装が無い (実装前に図だけを検証するなら allowMissingCode を渡す)',
            },
          ];
        }
        continue;
      }

      const exported = new Map<string, ExportedDeclaration>();
      for (const file of listTypeScript(domainDir)) {
        for (const decl of extractExportedTypes(file)) {
          if (!exported.has(decl.name)) exported.set(decl.name, decl);
        }
      }

      for (const [name, where] of diagramClasses) {
        if (exported.has(name)) continue;
        driftErrors.push({
          severity: 'violation',
          file: rel(where.file),
          line: where.line,
          message: `図にあるが実装に無い: ${name} (期待: ${rel(domainDir)} に export class|interface|type ${name})`,
        });
      }
      for (const [name, decl] of exported) {
        if (diagramClasses.has(name)) continue;
        driftErrors.push({
          severity: 'violation',
          file: rel(decl.file),
          line: decl.line,
          message: `実装にあるが図に無い: ${name} (${decl.kind}) (期待: code_root: ${codeRoot} の図に class ${name})`,
        });
      }
    }

    return driftErrors.sort((a, b) =>
      `${a.file}:${a.line} ${a.message}`.localeCompare(`${b.file}:${b.line} ${b.message}`),
    );
  }
}
