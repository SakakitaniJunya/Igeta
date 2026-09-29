// 行の分類 (autogen / html コメント / コードフェンス / 本文) と、本文中の引用・否定・伝聞の判定を
// 1 か所に集約する。
//
// 以前は同じ判定を DocTemplateCheck (checkIds / checkQualifiedIds / checkDecisionAttribution /
// checkAcceptedGate)・DocGraphCheck (collectTentativeMarks)・ReviewSheetModule
// (findTableRow / findDecisionRows) がそれぞれ個別に (makeAutogenTracker・makeCommentTracker・
// makeFenceTracker・isQuotedAt 等を検査ごとに違う組み合わせで) 実装していたため、除外の範囲が
// 検査ごとに食い違っていた (code-reviewer 実バグ #1/#2/#3/#4/#5/#6 系列)。ここに 1 か所だけ持ち、
// 全部同じ classifyLines / hasLiveOccurrence / hasLiveMatch を使う。

export type LineKind = 'autogen' | 'html-comment' | 'code-fence' | 'body';

/**
 * 各行を 4 種類に分類する。複数行にまたがる区間 (コードフェンス・HTML コメント・AUTOGEN) は
 * ここで状態を追う。3 種類のトグルは必ず全部その行に通してから判定する — AUTOGEN の開始/終了
 * マーカーは単行の HTML コメントでもあるため、どれかを先に確定させて次に進むと、他のトグルが
 * その行を見られず区間の状態が更新されない (code-reviewer 実バグ #1 で見つかった相互作用)。
 * 優先順位: コードフェンス > AUTOGEN > HTML コメント > 本文 (フェンス内の AUTOGEN/コメント風の
 * 例示は例示であって本物の区間ではない)。
 */
export function classifyLines(lines: readonly string[]): readonly LineKind[] {
  let fence: string | null = null;
  let inAutogen = false;
  let inComment = false;
  return lines.map((rawLine): LineKind => {
    const line = rawLine ?? '';

    let fenced: boolean;
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]?.[0];
      if (marker !== undefined) {
        if (fence === null) fence = marker;
        else if (marker === fence) fence = null;
      }
      fenced = true; // フェンス行自体もフェンス区間として扱う
    } else {
      fenced = fence !== null;
    }
    // フェンス内はリテラルなテキスト。AUTOGEN/コメント風の例示がフェンス内にあっても、
    // それは例示であって本物の区間ではないので inAutogen/inComment の状態を更新しない。
    if (fenced) return 'code-fence';

    let autogen: boolean;
    if (/<!--\s*AUTOGEN[A-Za-z:-]*:start/.test(line)) {
      inAutogen = true;
      autogen = true;
    } else if (/<!--\s*AUTOGEN[A-Za-z:-]*:end/.test(line)) {
      inAutogen = false;
      autogen = true;
    } else {
      autogen = inAutogen;
    }

    // AUTOGEN・HTML コメントの 2 つは必ず両方この行に通してから判定する。AUTOGEN の開始/終了
    // マーカーは単行の HTML コメントでもあるため、どちらかを先に確定させて次に進むと、他方が
    // この行を見られず区間の状態が更新されない (code-reviewer 実バグ #1 で見つかった相互作用)。
    let commented: boolean;
    if (inComment) {
      commented = true;
      if (line.includes('-->')) inComment = false;
    } else {
      const startIdx = line.indexOf('<!--');
      if (startIdx === -1) {
        commented = false;
      } else {
        commented = true;
        if (line.indexOf('-->', startIdx + 4) === -1) inComment = true;
      }
    }

    if (autogen) return 'autogen';
    if (commented) return 'html-comment';
    return 'body';
  });
}

// --- 本文中の引用・否定・伝聞 (code-reviewer B2 / round 3 C2) ---
// 「」『』内に完全に収まる語は引用 (置き換え前の表記の引用・訂正の記録) であって現在の主張ではない。
// 語の直後の否定・伝聞は「そう主張していない」ことの表明なので除外する。
const NEGATION_TAIL_RE = /^(ではな(い|かった)|でな(い|かった)|していな(い|かった)|しなかった|せず)/;
const HEARSAY_TAIL_RE = /^.{0,4}と(書かれてい|書いてあっ|記載されてい|言われてい)/;

/** index が「」『』の対で開いた引用の内側かどうか (深さ 1 以上)。 */
export function isQuotedAt(line: string, index: number): boolean {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    const ch = line[i];
    if (ch === '「' || ch === '『') depth += 1;
    else if (ch === '」' || ch === '』') depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/** keywordEnd 直後が否定・伝聞の言い回しなら true (主張ではないので除外する)。 */
export function isNegatedOrHearsayAfter(line: string, keywordEnd: number): boolean {
  const tail = line.slice(keywordEnd, keywordEnd + 16);
  return NEGATION_TAIL_RE.test(tail) || HEARSAY_TAIL_RE.test(tail);
}

/**
 * 行内でキーワード (「仮置き」等の固定文字列) が「主張として有効」に出現するか。
 * 引用・否定・伝聞でない出現が 1 件でもあれば true。行内の**全出現**を独立に判定する
 * (round 3 C2: 否定の decoy を先に置いても後続の本物の主張を見逃さない)。
 * 呼び出し側は classifyLines の結果が `body` の行だけにこれを適用する
 * (AUTOGEN・HTML コメント・コードフェンスは別レイヤの除外)。
 */
export function hasLiveOccurrence(line: string, keyword: string): boolean {
  let from = 0;
  for (;;) {
    const index = line.indexOf(keyword, from);
    if (index === -1) return false;
    if (!isQuotedAt(line, index) && !isNegatedOrHearsayAfter(line, index + keyword.length)) return true;
    from = index + keyword.length;
  }
}

/** 正規表現パターン版 (決定帰属の「CEO が決定」等)。行内の全出現を独立に判定する。 */
export function hasLiveMatch(line: string, patterns: readonly RegExp[]): boolean {
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const global = new RegExp(pattern.source, flags);
    for (const matched of line.matchAll(global)) {
      const index = matched.index;
      if (index === undefined) continue;
      if (!isQuotedAt(line, index) && !isNegatedOrHearsayAfter(line, index + matched[0].length)) return true;
    }
  }
  return false;
}
