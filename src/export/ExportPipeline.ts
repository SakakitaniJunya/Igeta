// igeta export の本体。manifest 検証 → forbid 検査 → 章 HTML 化 → PDF 化までを一本化する。
// CLI 層 (ExportCommand) は結果を出力コードに変換するだけにするため、ここでは exit も print もしない。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChapterInput } from './ChapterRenderer.js';
import { renderChapters } from './ChapterRenderer.js';
import type { ForbidHit } from './ForbidScan.js';
import { scanForbidden } from './ForbidScan.js';
import { buildHtmlDocument } from './HtmlDocument.js';
import { ManifestError, parseManifest } from './Manifest.js';
import { joinStrippedLines, stripFrontmatterAndAutogen } from './MarkdownStrip.js';
import { omitSections } from './OmitSections.js';
import { ChromiumNotFoundError, MermaidRenderError, renderPdf } from './PdfRenderer.js';

export interface ExportOptions {
  readonly manifestPath: string;
  readonly htmlOnly: boolean;
}

export type ExportOutcome =
  | {
      readonly kind: 'ok';
      readonly htmlPath: string;
      readonly pdfPath: string | null;
      readonly warnings: readonly string[];
    }
  | { readonly kind: 'manifest-error'; readonly messages: readonly string[] }
  | { readonly kind: 'forbid-violation'; readonly hits: readonly ForbidHit[] }
  | { readonly kind: 'mermaid-error'; readonly messages: readonly string[] }
  | { readonly kind: 'chromium-not-found'; readonly message: string };

export async function runExport(options: ExportOptions): Promise<ExportOutcome> {
  let manifest;
  try {
    manifest = parseManifest(options.manifestPath);
  } catch (error) {
    if (error instanceof ManifestError) return { kind: 'manifest-error', messages: error.messages };
    throw error;
  }

  const strippedByChapter = manifest.chapters.map((relPath, i) => {
    const absPath = manifest.chapterPaths[i];
    if (absPath === undefined) throw new Error('manifest.chapterPaths と chapters の対応が壊れている');
    const content = readFileSync(absPath, 'utf8');
    const stripped = stripFrontmatterAndAutogen(content);
    const lines = omitSections(stripped, manifest.omitSections);
    return { relPath, absPath, lines };
  });

  const forbidHits: ForbidHit[] = strippedByChapter.flatMap(({ relPath, lines }) =>
    scanForbidden(relPath, lines, manifest.forbidPatterns, manifest.forbid),
  );
  if (forbidHits.length > 0) return { kind: 'forbid-violation', hits: forbidHits };

  const chapterInputs: ChapterInput[] = strippedByChapter.map(({ relPath, absPath, lines }) => ({
    relPath,
    absPath,
    strippedText: joinStrippedLines(lines),
  }));

  const { chapters, toc, mermaidBlocks, warnings } = renderChapters(chapterInputs);

  const html = buildHtmlDocument({
    meta: {
      title: manifest.title,
      subtitle: manifest.subtitle,
      recipient: manifest.recipient,
      issuer: manifest.issuer,
      version: manifest.version,
      date: manifest.date,
    },
    chapters,
    toc,
  });

  mkdirSync(dirname(manifest.outputHtmlPath), { recursive: true });
  writeFileSync(manifest.outputHtmlPath, html);

  if (options.htmlOnly) {
    return { kind: 'ok', htmlPath: manifest.outputHtmlPath, pdfPath: null, warnings };
  }

  mkdirSync(dirname(manifest.outputPdfPath), { recursive: true });
  try {
    await renderPdf({
      htmlPath: manifest.outputHtmlPath,
      pdfPath: manifest.outputPdfPath,
      title: manifest.title,
      mermaidBlocks,
    });
  } catch (error) {
    if (error instanceof ChromiumNotFoundError) {
      return { kind: 'chromium-not-found', message: error.message };
    }
    if (error instanceof MermaidRenderError) {
      return { kind: 'mermaid-error', messages: error.messages };
    }
    throw error;
  }

  return {
    kind: 'ok',
    htmlPath: manifest.outputHtmlPath,
    pdfPath: manifest.outputPdfPath,
    warnings,
  };
}
