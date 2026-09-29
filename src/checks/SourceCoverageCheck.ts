// source-coverage: 逆方向の網羅。既定 OFF。
// Spec: docs/explanation/05-coverage-and-learning.md §2
//
// 正本の行のうち、どの delivery-chapter の sidecar の from にも現れないものを一覧する。
// 対象は「行頭セル定義 (`| PREFIX-nnn | ... |`) を持つ文書」全部 (05 §2 は「正本の要件行」と
// 書くが、REQ に限らず FN 等の行定義も同じ機構で作られるため kind を限定しない。実装で広げた
// 判断として報告する)。
//
// 対象外:
//   - 文書単位: frontmatter `clientExempt: true`
//   - 行単位: `.igeta.json` の coverageExemptions (理由必須)
//   - frontmatter id を持たない文書 (修飾 ID を組み立てられないので、そもそも from から
//     参照する手段が無い。source-coverage の対象では判定できない)

import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { findDeliveryChapters } from '../core/DeliveryBlocks.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import { classifyLines } from '../core/LineClassifier.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import type { Violation } from '../core/Report.js';
import { buildSourceIndex } from '../core/SourceResolver.js';

const ROW_TOKEN_RE = /^\|\s*([A-Z]+-\d{3})\s*\|/;

export interface SourceCoverageCheckOptions {
  readonly docsDir?: string;
  readonly configPath?: string;
}

export class SourceCoverageCheck implements Check {
  readonly name = 'source-coverage';

  readonly #options: SourceCoverageCheckOptions;

  constructor(options: SourceCoverageCheckOptions = {}) {
    this.#options = options;
  }

  run(ctx: CheckContext): readonly Violation[] {
    const docsDir = this.#options.docsDir ?? join(ctx.targetRoot, 'docs');
    const configResult = loadIgetaConfig(ctx.targetRoot, this.#options.configPath);
    if ('violation' in configResult) return [configResult.violation];

    const sourceIndex = buildSourceIndex(ctx.targetRoot, docsDir);
    if (sourceIndex === null) return [{ severity: 'cannot-check', message: `docs が無い: ${docsDir}` }];

    const violations: Violation[] = [];
    const referenced = new Set<string>();
    for (const chapterAbsPath of findDeliveryChapters(docsDir)) {
      const sidecarResult = readSidecar(chapterAbsPath);
      if (sidecarResult.kind === 'invalid') {
        violations.push(sidecarResult.violation);
        continue;
      }
      if (sidecarResult.kind === 'ok') {
        for (const entry of sidecarResult.sidecar.entries) {
          if (entry.from !== null) referenced.add(entry.from);
        }
      }
    }

    const exemptions = new Map(configResult.config.coverageExemptions.map((e) => [e.id, e.reason]));

    for (const doc of sourceIndex.docs) {
      if (doc.kind === 'delivery-chapter') continue; // 章自身は正本ではない
      if (doc.clientExempt) continue;
      if (doc.id === null || doc.id === '') continue; // 修飾できない文書は from から参照する手段が無い

      const kinds = classifyLines(doc.lines);
      const seen = new Set<string>();
      for (let i = doc.bodyStart; i < doc.lines.length; i += 1) {
        if (kinds[i] !== 'body') continue;
        const matched = ROW_TOKEN_RE.exec((doc.lines[i] ?? '').trim());
        const token = matched?.[1];
        if (token === undefined || seen.has(token)) continue;
        seen.add(token);
        const qualifiedId = `${doc.id}/${token}`;
        if (referenced.has(qualifiedId) || exemptions.has(qualifiedId)) continue;
        violations.push({
          severity: 'violation',
          file: doc.relPath,
          line: i + 1,
          message: `未参照: ${qualifiedId} (どの delivery-chapter の由来にも現れない)`,
        });
      }
    }

    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    return violations;
  }
}
