// 1 フォルダの文書の本数の検査。
// Spec: docs/adr/0004-folder-internal-structure-and-growth.md 決定 2、ADR-0002 条件 14。
//
// 新しい構成 (docs/person・ai・client のどれかがある) の repo で、1 フォルダの直下の文書 (.md。README.md と
// docs/ 直下の dependencies.md は生成索引なので数えない) が MAX_DOCS_PER_FOLDER 本を超えたら違反にする。
// 数えるのは直下だけで、下位フォルダの文書は、そのフォルダが数える。日付のある記録 (ADR・提案書) と提出物の
// フォルダは対象外 (core/Role.ts の FOLDER_SIZE_EXEMPT_DIRS)。docs/ のどのフォルダも数える
// (3 フォルダの外の文書も免除しない。ADR-0003 決定 6)。旧い構成の repo では何も出さない。
//
// 15 は、問題の起きた実例 (16・21・23・26・33・35 本) を全部捉え、問題の無い実例 (10 本以下) を捉えない値
// (ADR-0004)。利用 repo の設定では変えられない (ADR-0005)。

import { join, posix, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { isDirectory, listDocFiles } from '../core/DocFiles.js';
import type { Violation } from '../core/Report.js';
import { detectLayout, isFolderSizeExempt, isGeneratedIndex } from '../core/Role.js';

export const MAX_DOCS_PER_FOLDER = 15;

export class FolderSizeCheck implements Check {
  readonly name = 'folder-size-check';

  run(ctx: CheckContext): readonly Violation[] {
    const docsDir = join(ctx.targetRoot, 'docs');
    if (!isDirectory(docsDir)) {
      return [{ severity: 'cannot-check', message: `docs が無い: ${relative(ctx.targetRoot, docsDir)}` }];
    }
    if (detectLayout(docsDir) !== 'v4') return [];

    const counts = new Map<string, number>();
    for (const rel of listDocFiles(docsDir)) {
      if (isGeneratedIndex(rel)) continue;
      const dir = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }

    const violations: Violation[] = [];
    for (const [dir, count] of counts) {
      if (count <= MAX_DOCS_PER_FOLDER || isFolderSizeExempt(dir)) continue;
      violations.push({
        severity: 'violation',
        message: `1 フォルダの文書は ${MAX_DOCS_PER_FOLDER} 本まで: ${count} 本ある (超えたときの分け方は Igeta の要件定義書 02 §7)`,
        file: relative(ctx.targetRoot, join(docsDir, dir)),
      });
    }
    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? ''));
    return violations;
  }
}
