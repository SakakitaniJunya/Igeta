// 確定させる人 (person / ai / client) の境界の検査。
// Spec: docs/adr/0002-role-boundary-invariants.md の条件 2・11・15、ADR-0005 決定 1。
//
// 新しい構成 (docs/person・ai・client のどれかがある) の repo では、次を違反にする:
//   - kind から導く置き場所と、実際のパスが食い違う (要件定義書 02 §7 の表のどのパターンにも当たらない)。
//     kind が無い・表に無い kind も、置き場所を判定できないので違反
//   - フォルダ名のまとまりと frontmatter の context が食い違う (context 無記入は shared)
//   - docs/ 直下に、person・ai・client のどれにも属さない文書がある
//   - docs/common/ が残っている (v3 の構成)
//   - ai/ の文書の見出しに、未決を表す語を含む節がある (未決は person の「決めてほしいこと」に集める)
// 旧い構成の repo では違反を出さず、「移行してください」という警告を 1 件だけ出す。Igeta の版が
// LEGACY_LAYOUT_VIOLATION_FROM_MAJOR 以上になったら、同じ指摘を違反にする (検査の強さは構成の実在と Igeta
// の版だけで決まり、利用 repo の設定では変えられない。ADR-0005)。
//
// docs/ 直下の生成索引 (README.md・dependencies.md) と各フォルダの README.md は対象外。
// `.igeta.json` の nonDocPaths (ADR-0003 決定 6) は読まない: IgetaConfig が持たないため、docs/ 直下の
// 3 フォルダに属さない文書は、nonDocPaths が空のものとして全部違反にする。

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { readContext } from '../core/Context.js';
import { isDirectory, listDocFiles } from '../core/DocFiles.js';
import type { Frontmatter } from '../core/Frontmatter.js';
import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';
import type { Violation } from '../core/Report.js';
import { detectLayout, isGeneratedIndex, matchPlacement, placementOf, roleOfPath } from '../core/Role.js';
import type { SemVer } from '../core/Version.js';
import { readIgetaVersion } from '../core/Version.js';

/** 旧い構成を、警告から違反に上げる Igeta のメジャー版 (ADR-0005 決定 1) */
export const LEGACY_LAYOUT_VIOLATION_FROM_MAJOR = 1;

export const LEGACY_LAYOUT_MESSAGE = '旧い構成です。`igeta docs-migrate` を実行してください';

/**
 * ai/ の文書の見出しに置かない語 (ADR-0002 条件 11)。TBD・TODO は、他の英単語の一部 (Mastodon など) と
 * 取り違えないよう、直前が英字でないものだけを取る。
 */
const UNDECIDED_HEADING_RE = /未決|未確定|保留|要確認|宿題|(?<![A-Za-z])(?:tbd|todo)s?(?![A-Za-z])/i;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*?)\s*$/;

export class RoleBoundaryCheck implements Check {
  readonly name = 'role-boundary-check';

  #warnings: string[] = [];

  /** 直近の run() が出した非ブロッキング警告 (旧い構成の移行の促し) */
  get warnings(): readonly string[] {
    return this.#warnings;
  }

  run(ctx: CheckContext): readonly Violation[] {
    this.#warnings = [];
    const docsDir = join(ctx.targetRoot, 'docs');
    if (!isDirectory(docsDir)) {
      return [{ severity: 'cannot-check', message: `docs が無い: ${relative(ctx.targetRoot, docsDir)}` }];
    }
    if (detectLayout(docsDir) === 'legacy') return this.#legacy(ctx);

    const violations: Violation[] = [];
    if (isDirectory(join(docsDir, 'common'))) {
      violations.push({
        severity: 'violation',
        message: 'docs/common/ が残っている (v3 の構成)。文書を person・ai・client のどれかへ移す',
        file: relative(ctx.targetRoot, join(docsDir, 'common')),
      });
    }
    for (const rel of listDocFiles(docsDir)) {
      if (isGeneratedIndex(rel)) continue;
      const abs = join(docsDir, rel);
      const file = relative(ctx.targetRoot, abs);
      const role = roleOfPath(rel);
      if (role === null) {
        // docs/common/ の文書は、フォルダの違反 1 件にまとめる
        if (!rel.startsWith('common/')) {
          violations.push({
            severity: 'violation',
            message: 'docs/ 直下の person・ai・client のどれにも属さない文書 (置き場所の表のパスへ移す)',
            file,
            line: 1,
          });
        }
        continue;
      }
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      const meta = parseFrontmatter(lines);
      violations.push(...checkPlacement(rel, file, meta));
      if (role === 'ai') violations.push(...checkUndecidedHeadings(lines, meta?.bodyStart ?? 0, file));
    }
    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    return violations;
  }

  #legacy(ctx: CheckContext): readonly Violation[] {
    let version: SemVer;
    try {
      version = readIgetaVersion(ctx.igetaRoot);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // 版が読めないと、旧い構成を警告で済ませるか違反にするかを決められない。どちらかに倒さず検査不能にする
      return [{ severity: 'cannot-check', message: `Igeta の版を読めないため、旧い構成の扱いを決められない: ${detail}` }];
    }
    if (version.major >= LEGACY_LAYOUT_VIOLATION_FROM_MAJOR) {
      return [
        {
          severity: 'violation',
          message: `${LEGACY_LAYOUT_MESSAGE} (Igeta ${version.toString()} は、旧い構成を違反にする ${LEGACY_LAYOUT_VIOLATION_FROM_MAJOR}.0.0 以降)`,
        },
      ];
    }
    this.#warnings = [LEGACY_LAYOUT_MESSAGE];
    return [];
  }
}

/** kind から導く置き場所と、フォルダ名のまとまりを検査する (条件 2) */
function checkPlacement(rel: string, file: string, meta: Frontmatter | null): Violation[] {
  const fail = (message: string): Violation[] => [{ severity: 'violation', message, file, line: 1 }];
  const kind = meta === null ? undefined : scalar(meta.data, 'kind');
  if (meta === null || kind === undefined || kind === '') {
    return fail('kind が無く、置き場所を判定できない (frontmatter に kind を書く)');
  }
  const placement = placementOf(kind);
  if (placement === undefined) return fail(`置き場所の表に無い kind: ${kind}`);
  const matched = matchPlacement(kind, rel);
  if (!matched.ok) {
    return fail(
      placement.patterns.length === 0
        ? `kind: ${kind} は利用 repo には置かない (版に固定した Igeta の手引きを AGENTS.md から指す)`
        : `kind: ${kind} の置き場所ではない (置けるのは ${placement.patterns.map((pattern) => `docs/${pattern}`).join(' か ')})`,
    );
  }
  if (matched.context === null) return [];
  const declared = readContext(kind, meta.data);
  if (declared === matched.context) return [];
  return fail(
    `フォルダ名のまとまり (${matched.context}) と frontmatter の context (${declared}) が食い違う (context 無記入は shared)`,
  );
}

/** ai/ の文書の、見出しに未決の語を含む節を検査する (条件 11)。コードフェンス・コメント・生成区間の中は見ない */
function checkUndecidedHeadings(lines: readonly string[], bodyStart: number, file: string): Violation[] {
  const kinds = classifyLines(lines);
  const violations: Violation[] = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (kinds[i] !== 'body') continue;
    const heading = HEADING_RE.exec(lines[i] ?? '')?.[1];
    if (heading === undefined || !UNDECIDED_HEADING_RE.test(heading)) continue;
    violations.push({
      severity: 'violation',
      message: `ai/ の文書に未決の節がある: 「${heading}」 (人の決めが要るものは person の「決めてほしいこと」に書き、ai はその ID を引く)`,
      file,
      line: i + 1,
    });
  }
  return violations;
}
