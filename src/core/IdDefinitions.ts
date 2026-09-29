// ID (PREFIX-nnn) の「定義」を集める共通ロジック。
//
// 定義は、その文書の要件表などの**行頭セル** (`| REQ-nnn | ...`) だけに限る。本文中の「言及」
// (前提列・対応業務列・自由記述での参照) は定義に数えない — 数えると、他ファイルの ID を裸で
// 参照しているだけなのに「このファイルにも定義がある」と誤認し、修飾義務や重複採番の判定が
// 素通りする (code-reviewer 実バグ #3 / #7)。DocTemplateCheck (idHomes) と AnalyzeModule /
// DiffTraceModule (collectDefinedIds) が別々に「本文全体を正規表現で走査」していたため、この
// 区別が食い違っていた。ここに 1 か所だけ持ち、3 箇所とも同じ判定を使う。

/**
 * 行頭が `| PREFIX-nnn |` の行だけを「定義」として集める (1 doc 内の重複は 1 件に数える)。
 * 順序は出現順。
 */
export function collectRowDefinedTokens(lines: readonly string[], prefix: string): string[] {
  const rowRe = new RegExp(`^\\|\\s*(${prefix}-\\d{3})\\s*\\|`);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const line of lines) {
    const matched = rowRe.exec(line.trim());
    const token = matched?.[1];
    if (token === undefined || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}
