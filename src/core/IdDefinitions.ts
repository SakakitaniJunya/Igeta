// ID (PREFIX-nnn) の「定義」を集める共通ロジック。
//
// 定義は、その文書の要件表などの**行頭セル** (`| REQ-nnn | ...`) だけに限る。本文中の「言及」
// (前提列・対応業務列・自由記述での参照) は定義に数えない — 数えると、他ファイルの ID を裸で
// 参照しているだけなのに「このファイルにも定義がある」と誤認し、修飾義務や重複採番の判定が
// 素通りする (code-reviewer 実バグ #3 / #7)。DocTemplateCheck (idHomes) と AnalyzeModule /
// DiffTraceModule (collectDefinedIds) が別々に「本文全体を正規表現で走査」していたため、この
// 区別が食い違っていた。ここに 1 か所だけ持ち、3 箇所とも同じ判定を使う。
//
// AUTOGEN 区間 (`igeta docs-graph --write` が生成する ADR 一覧・ディレクトリ索引・決定台帳の
// 「仮置き一覧」) の除外は core/LineClassifier.ts の classifyLines に統一されている
// (code-reviewer 実バグ #1/#2/#6、及び同種の 5 件の再発防止)。

import { classifyLines } from './LineClassifier.js';

/**
 * 行頭が `| PREFIX-nnn |` の行だけを「定義」として集める (1 doc 内の重複は 1 件に数える)。
 * 順序は出現順。AUTOGEN 区間は除外する (code-reviewer 実バグ #3)。decision-log の
 * 「仮置き一覧 (自動生成)」節は `| OPEN-nnn | 場所 | 本文 |` という**索引** (仮置きマークが
 * 「どこにあるか」を示すだけ) を生成するが、これも行頭セルの見た目を持つため、除外しないと
 * 「§2 (未決 OPEN) に本物の定義が無い OPEN」でも索引の行だけで「定義済み」と誤認し、決定台帳に
 * 無い違反が消えてしまう。
 */
export function collectRowDefinedTokens(lines: readonly string[], prefix: string): string[] {
  const rowRe = new RegExp(`^\\|\\s*(${prefix}-\\d{3})\\s*\\|`);
  const seen = new Set<string>();
  const tokens: string[] = [];
  const kinds = classifyLines(lines);
  for (let i = 0; i < lines.length; i += 1) {
    if (kinds[i] !== 'body') continue;
    const matched = rowRe.exec((lines[i] ?? '').trim());
    const token = matched?.[1];
    if (token === undefined || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}
