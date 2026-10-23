// T7〜T11: コードの `@trace`、辺の片方向、定義の無い ID、番号の帯 (テスト仕様 13 の §0)。

import type { CodeTag } from './CodeTags.js';
import { edgeSides } from './model/Graph.js';
import type { Definition, Finding, RuleId, TraceDocIndex, TraceIndex } from './model/Types.js';
import type { TraceConfig } from './TraceConfig.js';

const TEST_FILE = /\.(test|spec)\.[^/]+$|_test\.[^/]+$/;

const finding = (rule: RuleId, level: Finding['level'], definition: Definition, message: string): Finding => ({
  rule,
  level,
  id: definition.token,
  path: definition.path,
  line: definition.line,
  message,
});

/** T7 (TBL がコードの @trace から参照される) と T8 (TST が文書とテストのコードの両方に現れる) */
function codeCoverage(index: TraceIndex, tags: readonly CodeTag[], config: TraceConfig): Finding[] {
  const tagged = (testsOnly: boolean): Set<string> =>
    new Set(tags.filter((tag) => !testsOnly || TEST_FILE.test(tag.path)).flatMap((tag) => tag.tokens));
  const anyCode = tagged(false);
  const testCode = tagged(true);
  const level = config.tblRule === 'error' ? 'violation' : 'warning';
  return index.definitions.flatMap((definition) => {
    if (definition.kind === 'TBL' && !anyCode.has(definition.token)) {
      return [finding('T7', level, definition, 'コードの先頭行の @trace から参照されていない (TST からの参照では満たさない)')];
    }
    if (definition.kind === 'TST' && !testCode.has(definition.token)) {
      return [finding('T8', 'violation', definition, 'テストのコードの先頭行の @trace に現れない')];
    }
    return [];
  });
}

/** T9: 辺が片方の行にしか書かれていない。FN → SCR の書き漏れと strictEdges は違反、ほかは警告 */
function oneSidedEdges(index: TraceIndex, config: TraceConfig): Finding[] {
  const sides = edgeSides(index.edges);
  return index.edges.flatMap((edge) => {
    if ((sides.get(`${edge.up}|${edge.down}`)?.size ?? 0) > 1) return [];
    const [up, down] = [index.nodes.get(edge.up), index.nodes.get(edge.down)];
    const owner = edge.declaredBy === 'up' ? up : down;
    if (up === undefined || down === undefined || owner === undefined) return [];
    const isFunctionToScreen = up.kind === 'FN' && down.kind === 'SCR' && edge.declaredBy === 'up';
    const level = config.strictEdges || isFunctionToScreen ? 'violation' : 'warning';
    const message = `${up.token} の下流に ${down.token} と書いてあるのは ${edge.declaredBy === 'up' ? up.token : down.token} の行だけで、相手の行に逆向きの欄が無い`;
    return [{ ...finding('T9', level, owner, message), path: edge.path, line: edge.line }];
  });
}

/** T10: 定義の無い ID (欄・@trace)、`@trace` の無いコード (違反)、`@trace` だけで ID の無いコード (警告) */
function unknownIds(index: TraceIndex, tags: readonly CodeTag[], config: TraceConfig): Finding[] {
  const defined = new Set(index.definitions.map((definition) => definition.token));
  const isKind = (token: string): boolean => config.kinds.includes(token.slice(0, token.lastIndexOf('-')));
  const fromColumns = index.dangling.map((entry): Finding => ({
    rule: 'T10', level: 'violation', id: entry.token, path: entry.path, line: entry.line, message: `欄の ${entry.token} に対応する定義が無い`,
  }));
  const fromCode = tags.flatMap((tag): Finding[] => {
    const where = { rule: 'T10', path: tag.path, line: 1 } as const;
    if (tag.state === 'absent') return [{ ...where, level: 'violation', id: '-', message: '先頭行に @trace が無い (trace.code の対象)' }];
    if (tag.state === 'empty') return [{ ...where, level: 'warning', id: '-', message: '@trace に ID が書かれていない (未記入)' }];
    return tag.tokens.filter((token) => isKind(token) && !defined.has(token)).map((token): Finding => ({ ...where, level: 'violation', id: token, message: `@trace の ${token} に対応する定義が無い` }));
  });
  return [...fromColumns, ...fromCode];
}

/** T11: 帯を宣言した節の定義の百の位が、帯と違う。見出しが無い宣言は (文書の宣言なら) 警告 */
function bandMismatches(doc: TraceDocIndex, config: TraceConfig): Finding[] {
  const normalize = (text: string): string => text.replace(/^\d+(\.\d+)*[.．]?\s+/, '');
  return doc.bands.flatMap((band) => {
    const headingIndex = doc.headings.findIndex((heading) => heading.text === band.heading || normalize(heading.text) === band.heading);
    const heading = doc.headings[headingIndex];
    if (heading === undefined) {
      if (config.bands.length > 0) return [];
      return [{ rule: 'T11', level: 'warning', id: '-', path: doc.path, message: `帯の宣言 "${band.heading}" に一致する見出しが無く、無効` } as const];
    }
    const end = doc.headings.slice(headingIndex + 1).find((next) => next.level <= heading.level)?.line ?? Number.POSITIVE_INFINITY;
    return doc.definitions
      .filter((definition) => definition.line > heading.line && definition.line < end && Number(definition.token.slice(-3, -2)) !== band.digit)
      .map((definition) => finding('T11', 'violation', definition, `「${band.heading}」の節は ${band.digit} 百番台だが ${definition.token} が違う`));
  });
}

/** T7〜T11 を検査する。コードの規則 (T7・T8・コードの T10) は trace.code が空なら見ない */
export function checkRulesB(index: TraceIndex, codeTags: readonly CodeTag[], config: TraceConfig): Finding[] {
  const hasCode = config.code.length > 0;
  return [
    ...(hasCode ? codeCoverage(index, codeTags, config) : []),
    ...oneSidedEdges(index, config),
    ...unknownIds(index, hasCode ? codeTags : [], config),
    ...index.docs.flatMap((doc) => bandMismatches(doc, config)),
  ];
}
