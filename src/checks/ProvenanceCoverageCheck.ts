// provenance-coverage: 順方向の網羅。既定 OFF。
// Spec: docs/explanation/05-coverage-and-learning.md §1
//
// delivery-chapter を H2 節単位の塊に分解し (「関連」節は除く)、全塊が sidecar にエントリ
// (from あり、または from: null + reason) を持つことを検査する。

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findDeliveryChapters, extractDeliveryBlocks } from '../core/DeliveryBlocks.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import type { Violation } from '../core/Report.js';

export interface ProvenanceCoverageCheckOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
  /** 絶対パス。省略なら docsDir 内の delivery-chapter 全部 */
  readonly chapters?: readonly string[];
}

export class ProvenanceCoverageCheck {
  readonly #options: ProvenanceCoverageCheckOptions;

  constructor(options: ProvenanceCoverageCheckOptions) {
    this.#options = options;
  }

  analyze(): { violations: readonly Violation[] } {
    const docsDir = this.#options.docsDir ?? join(this.#options.targetRoot, 'docs');
    const chapterPaths = this.#options.chapters ?? findDeliveryChapters(docsDir);
    const violations: Violation[] = [];
    if (chapterPaths.length === 0) return { violations };

    for (const chapterAbsPath of chapterPaths) {
      const chapterRelPath = relative(this.#options.targetRoot, chapterAbsPath);
      if (!existsSync(chapterAbsPath)) {
        violations.push({ severity: 'cannot-check', message: `章が無い: ${chapterRelPath}` });
        continue;
      }
      const content = readFileSync(chapterAbsPath, 'utf8');
      const extracted = extractDeliveryBlocks(content, chapterRelPath);
      if (extracted.kind === 'unclosed-autogen') {
        violations.push({ severity: 'cannot-check', message: extracted.message });
        continue;
      }
      // 同じ見出し (anchor) が章に 2 つ以上あると、sidecar の 1 エントリが両方を「網羅済み」に
      // してしまう (anchor は文字列一致でしか塊を特定できないため)。見出しを変えて区別させる
      // (code-reviewer round 1 blocker 5)。
      const linesByAnchor = new Map<string, number[]>();
      for (const block of extracted.blocks) {
        const lines = linesByAnchor.get(block.anchor) ?? [];
        lines.push(block.line);
        linesByAnchor.set(block.anchor, lines);
      }
      for (const [anchor, lines] of linesByAnchor) {
        if (lines.length > 1) {
          violations.push({
            severity: 'violation',
            file: chapterRelPath,
            line: lines[0],
            message: `見出し (anchor) が章に ${lines.length} 件重複している: ${anchor} (行 ${lines.join(', ')}。見出しを変えて区別する)`,
          });
        }
      }

      const sidecarResult = readSidecar(chapterAbsPath);
      if (sidecarResult.kind === 'invalid') {
        violations.push(sidecarResult.violation);
        continue;
      }
      const anchors = new Set(sidecarResult.kind === 'ok' ? sidecarResult.sidecar.entries.map((e) => e.anchor) : []);
      for (const block of extracted.blocks) {
        if (!anchors.has(block.anchor)) {
          violations.push({
            severity: 'violation',
            file: chapterRelPath,
            line: block.line,
            message: `塊に由来が無い: ${block.anchor} (from ありの provenance-capture、または --no-source --reason で由来なし宣言する)`,
          });
        }
      }
    }
    return { violations };
  }
}
