// node --test dist
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHtmlDocument } from './HtmlDocument.js';
import { MERMAID_CONTAINER_MAX_HEIGHT_MM, MERMAID_SVG_MAX_HEIGHT_MM } from './PdfLayout.js';

const BASE_META = {
  title: 'T',
  subtitle: null,
  recipient: null,
  issuer: 'I',
  version: '1.0',
  date: '2026-09-29',
};

describe('buildHtmlDocument — mermaid 図の高さ上限', () => {
  it('pre.mermaid の入れ物と svg の両方に高さ上限 (mm) の指定がある', () => {
    const html = buildHtmlDocument({ meta: BASE_META, chapters: [], toc: [] });
    assert.match(html, new RegExp(`max-height:\\s*${MERMAID_CONTAINER_MAX_HEIGHT_MM}mm`));
    assert.match(html, new RegExp(`max-height:\\s*${MERMAID_SVG_MAX_HEIGHT_MM}mm`));
    // 縦横比を保って縮めるための width:auto/height:auto も svg 側に付いている
    assert.match(html, /pre\.mermaid svg[^}]*width:\s*auto/);
    assert.match(html, /pre\.mermaid svg[^}]*height:\s*auto/);
    assert.match(html, /pre\.mermaid svg[^}]*max-width:\s*100%/);
  });
});
