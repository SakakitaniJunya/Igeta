// 門の判定 (approval-scope) と設定 (.igeta.json の humanPaths・nonDocPaths) が使う glob。
// Spec: docs/adr/0008-human-approval-scope.md (humanPaths)、docs/adr/0003-docs-model-migration-and-dogfooding.md 決定 6 (nonDocPaths)
//
// Node の path.matchesGlob は実験的で版ごとに挙動が違い、先頭が `.` の名前に `*` が当たらない。
// 門の判定は「見落とすより多く拾う」側に倒す必要があり、設定の書き間違い (どのパスにも当たらない glob)
// を黙って通すこともできないので、使える構文を絞ってここに持つ。
//
// 使える構文: `/` 区切り / `*` (1 階層の中の任意の文字列) / `?` (1 文字) / `[a-z]`・`[!a-z]` /
// `{a,b}` (選択肢。`,` で区切る) / `**` だけの階層 (0 個以上の階層)。先頭が `.` の名前にも当たる。
// 使えない構文 (`!` の否定・`\` のエスケープ・extglob・先頭の `/`・末尾の `/`・前後の空白・`..`・
// `{1..3}` の範囲) は validateGlob が理由を返す。黙って当たらない glob にしない。
//
// 大文字小文字は区別しない (テスト仕様 01 の R5)。macOS・Windows の既定のファイルシステムでは `docs/Person/` と
// `docs/person/` が同じ場所になるので、大文字小文字だけを変えたパスで門を抜けられないようにする (門は見落とすより多く拾う)。
// `X/**` は X そのもの (ファイル・symlink・submodule) にも当たる。名前の続き (`docs/personal/`) には当たらない。

const MAX_BRACE_VARIANTS = 256;
const EXTGLOB_OPENER = /[?*+@!]\(/;
const REGEXP_SPECIAL = new Set(['\\', '^', '$', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '/']);

/** glob の書き方が使える構文から外れている。message は設定の書き手に見せる。 */
class GlobSyntaxError extends Error {}

type Segment = { readonly kind: 'globstar' } | { readonly kind: 'name'; readonly regex: RegExp };

/** `{a,b}` を選択肢ごとの glob に展開する。ネストと複数の `{}` を扱う。 */
function expandBraces(pattern: string): readonly string[] {
  const start = pattern.indexOf('{');
  const stray = pattern.indexOf('}');
  if (start === -1) {
    if (stray !== -1) throw new GlobSyntaxError('`}` に対応する `{` が無い');
    return [pattern];
  }
  if (stray !== -1 && stray < start) throw new GlobSyntaxError('`}` に対応する `{` が無い');

  let depth = 0;
  let end = -1;
  const cuts: number[] = [];
  for (let i = start; i < pattern.length; i += 1) {
    const ch = pattern.charAt(i);
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    } else if (ch === ',' && depth === 1) cuts.push(i);
  }
  if (end === -1) throw new GlobSyntaxError('`{` に対応する `}` が無い');
  if (cuts.length === 0) {
    throw new GlobSyntaxError('`{}` の中は `,` で区切った選択肢で書く (範囲 `{1..3}` と 1 つだけの `{a}` は使えない)');
  }

  const alternatives: string[] = [];
  let from = start + 1;
  for (const cut of cuts) {
    alternatives.push(pattern.slice(from, cut));
    from = cut + 1;
  }
  alternatives.push(pattern.slice(from, end));

  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(end + 1);
  const variants: string[] = [];
  for (const alternative of alternatives) {
    for (const variant of expandBraces(`${prefix}${alternative}${suffix}`)) {
      variants.push(variant);
      if (variants.length > MAX_BRACE_VARIANTS) {
        throw new GlobSyntaxError(`\`{}\` の選択肢が多すぎる (${MAX_BRACE_VARIANTS} 通りまで)`);
      }
    }
  }
  return variants;
}

/** 1 階層分の glob (`/` を含まない) を、その階層の名前全体に当てる正規表現にする。 */
function nameToRegExp(name: string): RegExp {
  let source = '';
  let i = 0;
  while (i < name.length) {
    const ch = name.charAt(i);
    if (ch === '*') {
      while (name.charAt(i + 1) === '*') i += 1; // 階層の中の `**` は `*` と同じ
      source += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      source += '[^/]';
      i += 1;
    } else if (ch === '[') {
      const negated = name.charAt(i + 1) === '!' || name.charAt(i + 1) === '^';
      const bodyStart = i + (negated ? 2 : 1);
      const close = name.indexOf(']', bodyStart);
      if (close === -1) throw new GlobSyntaxError('`[` に対応する `]` が無い');
      if (close === bodyStart) throw new GlobSyntaxError('文字クラス `[]` が空');
      const body = name.slice(bodyStart, close);
      if (body.includes('[')) throw new GlobSyntaxError('文字クラスの中に `[` は書けない (`[:alpha:]` は使えない)');
      let classSource = '';
      for (let k = 0; k < body.length; k += 1) {
        const c = body.charAt(k);
        if (c === '-') classSource += k === 0 || k === body.length - 1 ? '\\-' : '-';
        else if (c === '\\' || c === ']' || c === '^') classSource += `\\${c}`;
        else classSource += c;
      }
      source += `[${negated ? '^' : ''}${classSource}]`;
      i = close + 1;
    } else {
      source += REGEXP_SPECIAL.has(ch) ? `\\${ch}` : ch;
      i += 1;
    }
  }
  try {
    return new RegExp(`^${source}$`, 'iu');
  } catch {
    throw new GlobSyntaxError('文字クラスの範囲が不正 (例: `[z-a]`)');
  }
}

/** 構文を検査して階層の並びにする。展開した選択肢ごとに 1 つ。 */
function compileGlob(pattern: string): readonly (readonly Segment[])[] {
  if (pattern.trim() === '') throw new GlobSyntaxError('空の glob は書けない');
  if (pattern !== pattern.trim()) throw new GlobSyntaxError('前後に空白は付けない (その名前の階層に当たる glob になる)');
  if (/[\u0000-\u001f\u007f]/.test(pattern)) throw new GlobSyntaxError('制御文字は書けない');
  if (pattern.includes('\\')) throw new GlobSyntaxError('`\\` (エスケープ) は使えない');
  if (pattern.startsWith('!')) throw new GlobSyntaxError('先頭の `!` (否定) は使えない');
  if (pattern.startsWith('/') || pattern.startsWith('./')) {
    throw new GlobSyntaxError('先頭の `/` `./` は付けない (repo のルートからの相対パスで書く)');
  }
  if (pattern.endsWith('/')) throw new GlobSyntaxError('末尾の `/` は使えない (ディレクトリは `dir/**` と書く)');
  if (EXTGLOB_OPENER.test(pattern)) throw new GlobSyntaxError('extglob (`+(` `@(` `!(` など) は使えない');

  return expandBraces(pattern).map((variant) =>
    variant.split('/').map((name): Segment => {
      if (name === '') throw new GlobSyntaxError('空の階層 (`//`) は書けない');
      if (name === '.' || name === '..') throw new GlobSyntaxError('`.` `..` の階層は書けない');
      return name === '**' ? { kind: 'globstar' } : { kind: 'name', regex: nameToRegExp(name) };
    }),
  );
}

/** 書き方が使える構文に収まっていれば null、外れていれば設定の書き手に見せる理由を返す。 */
export function validateGlob(pattern: string): string | null {
  try {
    compileGlob(pattern);
    return null;
  } catch (error) {
    if (error instanceof GlobSyntaxError) return error.message;
    throw error;
  }
}

const compiled = new Map<string, readonly (readonly Segment[])[]>();

function compileCached(pattern: string): readonly (readonly Segment[])[] {
  const hit = compiled.get(pattern);
  if (hit !== undefined) return hit;
  const result = compileGlob(pattern);
  compiled.set(pattern, result);
  return result;
}

/** glob が path (repo のルートからの相対パス、`/` 区切り) に当たるか。pattern は validateGlob を通したもの。 */
export function matchesGlob(path: string, pattern: string): boolean {
  const names = path.split('/');
  return compileCached(pattern).some((segments) => matchSegments(segments, names));
}

function matchSegments(segments: readonly Segment[], names: readonly string[]): boolean {
  const memo = new Map<number, boolean>();
  const rec = (gi: number, ni: number): boolean => {
    const key = gi * (names.length + 1) + ni;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const segment = segments[gi];
    let result: boolean;
    if (segment === undefined) result = ni === names.length;
    else if (segment.kind === 'globstar') result = rec(gi + 1, ni) || (ni < names.length && rec(gi, ni + 1));
    else {
      const name = names[ni];
      result = name !== undefined && segment.regex.test(name) && rec(gi + 1, ni + 1);
    }
    memo.set(key, result);
    return result;
  };
  return rec(0, 0);
}

/**
 * glob が folder (例 `docs/person`) そのもの、またはその配下のパスに当たりうるか。
 * 配下のどの名前にも当たるように書ける (`docs/**`・`docs/*` + `/**`・`**` など) かを階層ごとに調べるので、
 * `docs/person/requirements/01-requirements.md` のような 1 本だけを指す glob も取りこぼさない。
 */
export function globCanMatchUnder(pattern: string, folder: string): boolean {
  const names = folder.split('/');
  return compileCached(pattern).some((segments) => {
    const rec = (gi: number, ni: number): boolean => {
      if (ni === names.length) return true; // folder を使い切った。残りの階層は配下のどの名前にも合わせられる
      const segment = segments[gi];
      if (segment === undefined) return false; // folder より手前のパス (例: `docs`) にしか当たらない
      if (segment.kind === 'globstar') return rec(gi + 1, ni) || rec(gi, ni + 1);
      const name = names[ni];
      return name !== undefined && segment.regex.test(name) && rec(gi + 1, ni + 1);
    };
    return rec(0, 0);
  });
}
