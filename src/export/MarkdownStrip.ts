// 章 Markdown から frontmatter (`---` 区切り) と `<!-- AUTOGEN:...:start -->` 〜
// `<!-- AUTOGEN:...:end -->` 区間を除去する。除去後も元ファイルの行番号を保持する
// (forbid 検出のメッセージが元ファイルの行を指すようにするため)。

export interface StrippedLine {
  readonly text: string;
  /** 元ファイルの 1 始まり行番号 */
  readonly line: number;
}

const AUTOGEN_START_RE = /<!--\s*AUTOGEN:[^>]*:start[^>]*-->/;
const AUTOGEN_END_RE = /<!--\s*AUTOGEN:[^>]*:end[^>]*-->/;

/** frontmatter の閉じ `---` の次の行 index (0 始まり) を返す。frontmatter が無ければ 0。 */
function frontmatterBodyStart(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') return i + 1;
  }
  return 0; // 閉じられていない frontmatter は frontmatter として扱わない
}

/** frontmatter と AUTOGEN 区間を除いた行を、元の行番号付きで返す。 */
export function stripFrontmatterAndAutogen(content: string): readonly StrippedLine[] {
  const lines = content.split(/\r?\n/);
  const bodyStart = frontmatterBodyStart(lines);
  const result: StrippedLine[] = [];
  let inAutogen = false;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!inAutogen && AUTOGEN_START_RE.test(line)) {
      inAutogen = true;
      continue;
    }
    if (inAutogen) {
      if (AUTOGEN_END_RE.test(line)) inAutogen = false;
      continue;
    }
    result.push({ text: line, line: i + 1 });
  }
  return result;
}

/** stripFrontmatterAndAutogen() の結果を、markdown-it に渡せる 1 本のテキストへ戻す。 */
export function joinStrippedLines(lines: readonly StrippedLine[]): string {
  return lines.map((l) => l.text).join('\n');
}
