// GitHub の CODEOWNERS の読み方。「About code owners」の規則どおりに読む。AgentsEntrypointCheck が、人の承認が
// 要る側にオーナーが付いているかを、GitHub が選ぶ行と同じ行で確かめるために持つ。
//
// 規則:
//   - 1 行 = パターン + オーナー (空白区切り)。行頭、または空白の後ろの `#` から行末まではコメント。
//     パターンだけの行は、オーナーを持たない行 (そのパスは、承認する人が決まらない)
//   - 1 つのパスに複数の行が当たるときは、最後に当たる行だけが効く。前の行のオーナーは引き継がない
//   - パターンは .gitignore に近い書き方:
//       先頭の `/`、または途中の `/` があれば、repo 直下から数える。`AGENTS.md`・`docs/` のように名前だけ
//       (末尾の `/` は数えない) なら、どの階層の同じ名前にも当たる
//       末尾の `/` と末尾の `/**` は、そのフォルダの中の全部 (下のフォルダの中も)。名前で終わる `docs/person` も、
//       その名前のフォルダの中の全部に当たる
//       `*` は 1 階層の中の任意の文字、`?` は 1 文字、`**` は 0 個以上の階層。ただし、最後の階層が `*` だけの
//       パターン (`docs/person/*`) は、そのフォルダの直下のファイルだけに当たり、下のフォルダの中には当たらない
//   - `!`・`[ ]`・`#` のエスケープは GitHub が扱わないので、読まない (文字としてそのまま)
//
// パスは repo 直下からの相対パス (区切りは `/`、先頭に `/` を付けない)。大文字小文字は区別する。

export interface CodeownersEntry {
  /** 1 始まりの行番号 */
  readonly line: number;
  readonly pattern: string;
  /** パターンの後ろの語。空なら、オーナーを持たない行 */
  readonly owners: readonly string[];
}

/** コメントと空行を除いた各行を、パターンとオーナーに分ける */
export function parseCodeowners(text: string): readonly CodeownersEntry[] {
  const entries: CodeownersEntry[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const [pattern, ...owners] = raw.replace(/(?:^|\s)#.*$/, '').trim().split(/\s+/);
    if (pattern === undefined || pattern === '') return;
    entries.push({ line: index + 1, pattern, owners });
  });
  return entries;
}

const NEVER = /(?!)/;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 1 階層の中のパターン。`*`・`?` を正規表現にし、バックスラッシュは次の 1 文字をそのままの文字にする */
function segmentSource(segment: string): string {
  let source = '';
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i] ?? '';
    if (ch === '\\') {
      i += 1;
      source += escapeRegExp(segment[i] ?? '');
    } else if (ch === '*') {
      source += '[^/]*';
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(ch);
    }
  }
  return source;
}

function compilePattern(pattern: string): RegExp {
  if (pattern === '/') return NEVER; // `/` だけの行は、何にも当たらない
  let segments = pattern.split('/');
  if (segments[0] === '') {
    segments = segments.slice(1); // 先頭の `/`: repo 直下から
  } else if (segments.length === 1 || (segments.length === 2 && segments[1] === '')) {
    if (segments[0] !== '**') segments = ['**', ...segments]; // 名前だけ: どの階層にも当たる
  }
  if (segments.length > 1 && segments[segments.length - 1] === '') {
    segments = [...segments.slice(0, -1), '**']; // 末尾の `/` は `/**` と同じ
  }

  let source = '^';
  let needSlash = false;
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '**') {
      if (segments.length === 1) {
        source += '.+'; // `**` だけ: 全部
      } else if (index === 0) {
        source += '(?:.+/)?'; // 先頭の `**/`: 親のフォルダは何でもよい (無くてもよい)
        needSlash = false;
      } else if (last) {
        source += '/.*'; // 末尾の `/**`: フォルダの中の全部
      } else {
        source += '(?:/.+)?'; // 途中の `/**/`: 0 個以上のフォルダ
        needSlash = true;
      }
      return;
    }
    if (needSlash) source += '/';
    // 最後の階層が `*` だけなら、直下のファイルだけ。他の名前で終わるなら、その名前のフォルダの中も含む
    source += segment === '*' ? '[^/]+' : `${segmentSource(segment)}${last ? '(?:/.*)?' : ''}`;
    needSlash = true;
  });
  return new RegExp(`${source}$`);
}

/** CODEOWNERS のパターンが、そのパス (ファイル) に当たるか */
export function codeownersPatternMatches(pattern: string, path: string): boolean {
  return compilePattern(pattern).test(path);
}

/** そのパスに最後に当たる行。GitHub が、そのパスのオーナーを決める行。どの行にも当たらなければ undefined */
export function lastMatchingEntry(entries: readonly CodeownersEntry[], path: string): CodeownersEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry !== undefined && codeownersPatternMatches(entry.pattern, path)) return entry;
  }
  return undefined;
}
