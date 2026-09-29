// ID (PREFIX-nnn) の「定義」を集める共通ロジックと、AUTOGEN 区間の判定。
//
// 定義は、その文書の要件表などの**行頭セル** (`| REQ-nnn | ...`) だけに限る。本文中の「言及」
// (前提列・対応業務列・自由記述での参照) は定義に数えない — 数えると、他ファイルの ID を裸で
// 参照しているだけなのに「このファイルにも定義がある」と誤認し、修飾義務や重複採番の判定が
// 素通りする (code-reviewer 実バグ #3 / #7)。DocTemplateCheck (idHomes) と AnalyzeModule /
// DiffTraceModule (collectDefinedIds) が別々に「本文全体を正規表現で走査」していたため、この
// 区別が食い違っていた。ここに 1 か所だけ持ち、3 箇所とも同じ判定を使う。
//
// AUTOGEN 区間 (`igeta docs-graph --write` が生成する ADR 一覧・ディレクトリ索引・決定台帳の
// 「仮置き一覧」) は他文書の行をそのまま写す索引であって、手で書いた本文の主張ではない。
// ID の定義収集だけでなく、修飾 ID・決定帰属・仮置き参照・レビューシートの ID 解決などの検査
// からも除外しないと、docs-graph --write のたびに「台帳が落ちる → 直す → 次の docs-graph で
// 戻る」を繰り返す (code-reviewer 実バグ #1/#2/#6)。判定をここに 1 か所だけ持つ。

/**
 * AUTOGEN 区間 (`<!-- AUTOGEN...:start -->` 〜 `<!-- AUTOGEN...:end -->`) の中を判定するトグル。
 * コードフェンスと同じ行単位の粒度: start/end 行自体も対象外にする。
 */
export function makeAutogenTracker(): (line: string) => boolean {
  let inAutogen = false;
  return (line: string): boolean => {
    if (/<!--\s*AUTOGEN[A-Za-z:-]*:start/.test(line)) {
      inAutogen = true;
      return true;
    }
    if (/<!--\s*AUTOGEN[A-Za-z:-]*:end/.test(line)) {
      inAutogen = false;
      return true;
    }
    return inAutogen;
  };
}

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
  const inAutogen = makeAutogenTracker();
  for (const line of lines) {
    if (inAutogen(line)) continue;
    const matched = rowRe.exec(line.trim());
    const token = matched?.[1];
    if (token === undefined || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}
