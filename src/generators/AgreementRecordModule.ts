// export --record-agreement: 提出した版を合意台帳に記録する。
// Spec: docs/explanation/08-agreement-ledger.md §2
//
// 提出物のディレクトリ = manifest のあるディレクトリ。台帳はその直下に置く。
// 由来の検査 (provenance-check / provenance-coverage) が通らない章が 1 つでもあれば記録しない
// (由来の怪しい提出物を合意の土台にしない)。検査は出力より前に行い、通らなければ 1 ファイルも書かない。

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ProvenanceCheck } from '../checks/ProvenanceCheck.js';
import { ProvenanceCoverageCheck } from '../checks/ProvenanceCoverageCheck.js';
import type { AgreementExportChapter, AgreementExportEvent } from '../core/AgreementLedger.js';
import { appendLedgerEvent, readLedger } from '../core/AgreementLedger.js';
import { computeFingerprint } from '../core/Fingerprint.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import type { Violation } from '../core/Report.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import type { ResolvedManifest } from '../export/Manifest.js';
import { UnclosedAutogenError, joinStrippedLines, stripFrontmatterAndAutogen } from '../export/MarkdownStrip.js';
import { omitSections } from '../export/OmitSections.js';

export interface AgreementRecordRequest {
  readonly manifest: ResolvedManifest;
  readonly targetRoot: string;
  readonly docsDir: string;
}

export type AgreementPrepareResult =
  | { readonly kind: 'ok'; readonly event: AgreementExportEvent }
  | { readonly kind: 'rejected'; readonly violations: readonly Violation[] };

/** 提出物に出る本文 (frontmatter・AUTOGEN・omitSections を除いたもの) の指紋。 */
export function chapterFingerprint(content: string, relPath: string, omitTitles: readonly string[]): string {
  const lines = omitSections(stripFrontmatterAndAutogen(content, relPath), omitTitles);
  return computeFingerprint(joinStrippedLines(lines));
}

/** 記録してよいかを確かめ、記録する行を組み立てる。ここでは何も書かない。 */
export function prepareAgreementRecord(request: AgreementRecordRequest): AgreementPrepareResult {
  const { manifest, targetRoot, docsDir } = request;
  const violations: Violation[] = [];

  const ledger = readLedger(manifest.manifestDir);
  if (ledger.kind === 'invalid') return { kind: 'rejected', violations: [ledger.violation] };
  if (ledger.kind === 'ok' && ledger.events.some((e) => e.event === 'export' && e.version === manifest.version)) {
    return {
      kind: 'rejected',
      violations: [{ severity: 'violation', message: `版 ${manifest.version} は既に台帳に記録されている (版を上げてから提出する)` }],
    };
  }

  const chapters = manifest.chapterPaths;
  violations.push(...new ProvenanceCheck({ targetRoot, docsDir, chapters }).analyze().violations);
  violations.push(...new ProvenanceCoverageCheck({ targetRoot, docsDir, chapters }).analyze().violations);
  if (violations.length > 0) return { kind: 'rejected', violations };

  const sourceIndex = buildSourceIndex(targetRoot, docsDir);
  const recorded: AgreementExportChapter[] = [];
  for (let i = 0; i < manifest.chapters.length; i += 1) {
    const file = manifest.chapters[i];
    const absPath = manifest.chapterPaths[i];
    if (file === undefined || absPath === undefined) throw new Error('manifest.chapterPaths と chapters の対応が壊れている');
    const relPath = relative(targetRoot, absPath);

    let fingerprint: string;
    try {
      fingerprint = chapterFingerprint(readFileSync(absPath, 'utf8'), relPath, manifest.omitSections);
    } catch (error) {
      if (error instanceof UnclosedAutogenError) {
        violations.push({ severity: 'cannot-check', message: error.message });
        continue;
      }
      throw error;
    }

    const sidecar = readSidecar(absPath);
    if (sidecar.kind === 'invalid') {
      violations.push(sidecar.violation);
      continue;
    }
    const sources: { from: string; fingerprint: string }[] = [];
    if (sidecar.kind === 'ok') {
      for (const entry of sidecar.sidecar.entries) {
        if (entry.from === null) continue;
        const resolution = sourceIndex === null ? { kind: 'missing' as const } : resolveSource(sourceIndex, entry.from);
        if (resolution.kind === 'missing') {
          violations.push({ severity: 'violation', file: relPath, message: `${entry.anchor}: from が解決できない (${entry.from})` });
          continue;
        }
        sources.push({ from: entry.from, fingerprint: computeFingerprint(resolution.text) });
      }
    }
    recorded.push({ file, chapterFingerprint: fingerprint, sources });
  }
  if (violations.length > 0) return { kind: 'rejected', violations };

  return {
    kind: 'ok',
    event: {
      event: 'export',
      version: manifest.version,
      date: manifest.date,
      manifest: relative(manifest.manifestDir, manifest.manifestPath),
      omitSections: manifest.omitSections,
      chapters: recorded,
    },
  };
}

/** 出力が成功した後に呼ぶ。追記できなければ理由を返す。 */
export function appendAgreementRecord(manifest: ResolvedManifest, event: AgreementExportEvent): Violation | null {
  return appendLedgerEvent(manifest.manifestDir, event);
}
