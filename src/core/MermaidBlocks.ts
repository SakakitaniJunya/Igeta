// Mermaid の図の取り出し (テスト仕様 08 §0 の D5)。
// PersonFormCheck (D2〜D4) と MermaidCheck (描画確認) が同じ関数を使い、`~~~mermaid`・字下げ 3 つ・小文字の `mermaid` だけ、
// の扱いが両方で同じになる。
//
// 図 = コードフェンス (``` か ~~~、字下げは空白 3 つまで) で、info の最初の語が小文字の `mermaid` のもの。他のフェンスの中・
// 引用 (`>`) の中・タブ字下げは図ではない。閉じた図 = 開きと同じ記号で、開き以上の長さで、info が空で、字下げが空白 3 つまでの
// 閉じのフェンスがある図。閉じない図は図ではなく、以降の本文が全部図の中身になる。

/** 取り出した 1 つの図 */
export interface MermaidBlock {
  /** 開きのフェンスの行 (1 始まり) */
  readonly startLine: number;
  readonly closed: boolean;
  /** 図種 (正規化後。`graph` = flowchart、`stateDiagram-v2` = stateDiagram)。読めなければ null。閉じない図は null */
  readonly type: string | null;
  /** 図種の行が無い (中身が空・`%%` の行だけ) ために type が null。設定・指示が閉じない・図種の綴りが違うときは false */
  readonly noTypeLine: boolean;
  /** 「中身」の判定用の行数。図種の行・空行・`%%` の行・設定・指示を除く。閉じない図は 0 */
  readonly contentLines: number;
  /** 図種の行と空行を除いた行数。`%%` の行・設定・指示を含む (D4 の 40 行の警告が使う)。閉じない図は 0 */
  readonly bodyLines: number;
  /** 閉じた図だけ。フェンスの中身 */
  readonly code?: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const MERMAID_INFO = /^mermaid(\s|$)/;

/** Mermaid の図種の先頭の語 (flowchart・graph・mindmap …)。ここに無い語は「図種を読めない」 */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'classDiagram-v2',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'mindmap',
  'timeline',
  'zenuml',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'kanban',
  'architecture-beta',
  'radar-beta',
  'treemap-beta',
  'C4Context',
  'C4Container',
  'C4Component',
  'C4Dynamic',
  'C4Deployment',
]);

const NORMALIZED: ReadonlyMap<string, string> = new Map([
  ['graph', 'flowchart'],
  ['stateDiagram-v2', 'stateDiagram'],
]);

/** 開きのフェンスの行の記号と長さと info。フェンスでなければ null */
function fenceOf(line: string): { readonly marker: string; readonly length: number; readonly info: string } | null {
  const match = FENCE.exec(line);
  if (match === null) return null;
  const run = match[1] ?? '';
  return { marker: run.charAt(0), length: run.length, info: (match[2] ?? '').trim() };
}

/** 閉じのフェンスか (開きと同じ記号・開き以上の長さ・info が空・字下げ 3 つまで) */
function closes(line: string, open: { readonly marker: string; readonly length: number }): boolean {
  const fence = fenceOf(line);
  return fence !== null && fence.marker === open.marker && fence.length >= open.length && fence.info === '';
}

interface Parsed {
  readonly type: string | null;
  readonly noTypeLine: boolean;
  readonly contentLines: number;
  readonly bodyLines: number;
}

/** フェンスの中身から、図種・中身の行数・bodyLines を読む */
function parseBody(body: readonly string[]): Parsed {
  let i = 0;
  let typeLine: string | null = null;
  let unterminated = false;
  // 図種の行の手前を飛ばす: 空行・`%%` の行・先頭の `---` から次の `---` までの設定・`%%{` から `}%%` を含む行までの指示
  for (; i < body.length; i += 1) {
    const trimmed = (body[i] ?? '').trim();
    if (trimmed === '' || (trimmed.startsWith('%%') && !trimmed.startsWith('%%{'))) continue;
    if (trimmed.startsWith('%%{')) {
      let end = i;
      while (end < body.length && !(body[end] ?? '').includes('}%%')) end += 1;
      if (end >= body.length) {
        unterminated = true;
        break;
      }
      i = end;
      continue;
    }
    if (trimmed === '---') {
      let end = i + 1;
      while (end < body.length && (body[end] ?? '').trim() !== '---') end += 1;
      if (end >= body.length) {
        unterminated = true;
        break;
      }
      i = end;
      continue;
    }
    typeLine = trimmed;
    break;
  }

  const nonBlank = body.filter((line) => line.trim() !== '').length;
  if (unterminated) return { type: null, noTypeLine: false, contentLines: 0, bodyLines: nonBlank };
  if (typeLine === null) return { type: null, noTypeLine: true, contentLines: 0, bodyLines: nonBlank };

  const word = typeLine.split(/\s+/)[0] ?? '';
  const type = KNOWN_TYPES.has(word) ? (NORMALIZED.get(word) ?? word) : null;

  // 中身: 図種の行より後ろで、空でも `%%` 始まりでもない行 (図種の行より後ろの設定・指示は数えない)
  let contentLines = 0;
  let inDirective = false;
  for (let j = i + 1; j < body.length; j += 1) {
    const trimmed = (body[j] ?? '').trim();
    if (inDirective) {
      if (trimmed.includes('}%%')) inDirective = false;
      continue;
    }
    if (trimmed === '') continue;
    if (trimmed.startsWith('%%{')) {
      inDirective = !trimmed.includes('}%%');
      continue;
    }
    if (trimmed.startsWith('%%')) continue;
    contentLines += 1;
  }
  return { type, noTypeLine: false, contentLines, bodyLines: nonBlank - 1 };
}

/**
 * 図を出現順に返す。`from` は本文の開始行の添字 (0 始まり。frontmatter の次の行。frontmatter が無ければ 0)。
 * 他の種類のフェンスの中は読まない。閉じない図があれば、それ以降は全部図の中身なので、そこで終わる。
 */
export function extractMermaidBlocks(lines: readonly string[], from: number): readonly MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  let i = from;
  while (i < lines.length) {
    const open = fenceOf(lines[i] ?? '');
    if (open === null) {
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < lines.length && !closes(lines[end] ?? '', open)) end += 1;
    const closed = end < lines.length;
    if (!MERMAID_INFO.test(open.info)) {
      // 他のフェンス。閉じなければ以降は全部その中身
      i = closed ? end + 1 : lines.length;
      continue;
    }
    if (!closed) {
      blocks.push({ startLine: i + 1, closed: false, type: null, noTypeLine: false, contentLines: 0, bodyLines: 0 });
      break;
    }
    const body = lines.slice(i + 1, end);
    blocks.push({ startLine: i + 1, closed: true, ...parseBody(body), code: body.join('\n') });
    i = end + 1;
  }
  return blocks;
}
