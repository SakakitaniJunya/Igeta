// deliverable.json (提出用 PDF の manifest) の読み込みと検証。
// パスはすべて manifest ファイルのあるディレクトリを基準に解決する。
// 検査そのものが成立しない (JSON が壊れている・必須項目が無い・章ファイルが無い) は
// 1 件も見逃さず全件集めてから ManifestError として投げる (直すたびに 1 件ずつ再実行させない)。

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface DeliverableManifest {
  readonly title: string;
  readonly subtitle: string | null;
  /** 表紙の宛名。空文字または省略のときは null (表紙に宛名の行を出さない) */
  readonly recipient: string | null;
  readonly issuer: string;
  readonly version: string;
  readonly date: string;
  /** manifest に書かれたままの相対パス (表示用) */
  readonly chapters: readonly string[];
  /** forbid の正規表現ソース文字列 */
  readonly forbid: readonly string[];
  /**
   * 出力から除く H2 節の見出し文字列。既定は `["関連"]` (社内向けの上流/下流表を提出物に出さない)。
   * `[]` を渡すと何も除かない。
   */
  readonly omitSections: readonly string[];
  /** manifest に書かれたままの相対パス (表示用)。`.pdf` で終わる */
  readonly output: string;
}

export interface ResolvedManifest extends DeliverableManifest {
  readonly manifestPath: string;
  readonly manifestDir: string;
  /** chapters と同じ順序の絶対パス */
  readonly chapterPaths: readonly string[];
  readonly outputPdfPath: string;
  readonly outputHtmlPath: string;
  /** forbid をコンパイル済みの正規表現にしたもの (chapters と同じ順不問、forbid と同じ順) */
  readonly forbidPatterns: readonly RegExp[];
}

/** manifest が仕様を満たさない。全件のメッセージを持つ。 */
export class ManifestError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(messages.join('\n'));
    this.messages = messages;
  }
}

const REQUIRED_STRING_FIELDS = ['title', 'issuer', 'version', 'date'] as const;
const DEFAULT_OMIT_SECTIONS: readonly string[] = ['関連'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * target が dir の配下 (dir 自身を含む) に収まっているかを判定する。
 * `../` による親ディレクトリへの脱出、絶対パスによる差し替えのどちらも弾く。
 * dir・target はどちらも symlink 解決済みの実体パスであること (isPathWithinRealDir /
 * assertOutputWithinManifestDir の内部専用。lexical な resolve() だけでは symlink による
 * 脱出 (章ファイル自体が外を指す symlink、出力先の途中の階層が外を指す symlink) を
 * 見逃す)。
 */
function isWithinDir(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** lexicalPath 自身または最も近い実在の祖先ディレクトリを返す (無ければファイルシステムの根)。 */
function nearestExistingAncestor(lexicalPath: string): string {
  let current = lexicalPath;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current; // 根に達した (通常は起きない)
    current = parent;
  }
  return current;
}

/**
 * lexicalTarget (存在するとは限らない) を、symlink を解決した実体パスに正規化してから
 * realDir (symlink 解決済み) の配下かどうかを判定する。
 * 実在しない末尾部分は symlink になりようがないため、実在する最も近い祖先だけ realpath し、
 * 残りはそのまま繋げる。章ファイル (既に存在する) にも出力先 (まだ存在しない) にも使える。
 */
export function isPathWithinRealDir(realDir: string, lexicalTarget: string): boolean {
  const ancestor = nearestExistingAncestor(lexicalTarget);
  const realAncestor = realpathSync(ancestor);
  const remainder = relative(ancestor, lexicalTarget);
  const realTarget = remainder === '' ? realAncestor : resolve(realAncestor, remainder);
  return isWithinDir(realDir, realTarget);
}

/**
 * 出力先の親ディレクトリが manifest の外を指していないかを、書き込みの直前 (mkdir の後) に
 * もう一度確かめる。parseManifest() の検査から実際の書き込みまでの間に親ディレクトリが
 * symlink にすり替えられる隙を狭めるための再検証で、mkdir 済みなので親は実在する前提。
 */
export function assertOutputWithinManifestDir(manifestDir: string, outputPath: string): void {
  const realManifestDir = realpathSync(manifestDir);
  const parent = dirname(outputPath);
  const realParent = realpathSync(parent);
  if (!isWithinDir(realManifestDir, realParent)) {
    throw new ManifestError([`output の書き込み先が manifest の外を指している (書き込み直前の再検証): ${outputPath}`]);
  }
}

/** deliverable.json を読み、検証し、解決済みの絶対パスを添えて返す。1 件でも違反があれば全件まとめて ManifestError。 */
export function parseManifest(manifestPath: string): ResolvedManifest {
  const errors: string[] = [];
  const absoluteManifestPath = resolve(manifestPath);

  if (!existsSync(absoluteManifestPath)) {
    throw new ManifestError([`manifest が存在しない: ${manifestPath}`]);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absoluteManifestPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ManifestError([`manifest が JSON として読めない: ${manifestPath} (${message})`]);
  }

  if (!isRecord(raw)) {
    throw new ManifestError([`manifest が JSON オブジェクトではない: ${manifestPath}`]);
  }

  const manifestDir = dirname(absoluteManifestPath);
  // symlink 判定の基準。manifestDir 自体が symlink 越しにあってもよい (よくある正常系)。
  const realManifestDir = realpathSync(manifestDir);

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(raw[field])) {
      errors.push(`必須項目が無い: ${field}`);
    }
  }

  const subtitleRaw = raw['subtitle'];
  if (subtitleRaw !== undefined && typeof subtitleRaw !== 'string') {
    errors.push('subtitle は文字列でなければならない');
  }

  const recipientRaw = raw['recipient'];
  if (recipientRaw !== undefined && typeof recipientRaw !== 'string') {
    errors.push('recipient は文字列でなければならない');
  }

  const chaptersRaw = raw['chapters'];
  if (!isStringArray(chaptersRaw) || chaptersRaw.length === 0) {
    errors.push('必須項目が無い、または空: chapters (1 件以上の章ファイルの配列)');
  }

  const forbidRaw = raw['forbid'];
  if (forbidRaw !== undefined && !isStringArray(forbidRaw)) {
    errors.push('forbid は文字列の配列でなければならない');
  }

  const omitSectionsRaw = raw['omitSections'];
  if (omitSectionsRaw !== undefined && !isStringArray(omitSectionsRaw)) {
    errors.push('omitSections は文字列の配列でなければならない');
  }

  if (!isNonEmptyString(raw['output'])) {
    errors.push('必須項目が無い: output');
  } else if (!raw['output'].toLowerCase().endsWith('.pdf')) {
    errors.push(`output は .pdf で終わる必要がある: ${raw['output']}`);
  } else if (!isPathWithinRealDir(realManifestDir, resolve(manifestDir, raw['output']))) {
    errors.push(`output が manifest の外を指している: ${raw['output']}`);
  }

  // forbid の正規表現としての妥当性はここで検証する (後段で全件コンパイルするため)
  const forbidPatterns: RegExp[] = [];
  if (isStringArray(forbidRaw)) {
    for (const source of forbidRaw) {
      try {
        forbidPatterns.push(new RegExp(source, 'gu'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`forbid の正規表現が不正: ${source} (${message})`);
      }
    }
  }

  const chapters = isStringArray(chaptersRaw) ? chaptersRaw : [];
  const chapterPaths: string[] = [];
  for (const chapter of chapters) {
    const path = resolve(manifestDir, chapter);
    // まず lexical に脱出していないか (../ ・絶対パス) を見る。存在しなくても弾けるので、
    // 実在しないファイルを指す明らかな脱出はここで即座に検出できる。
    if (!isWithinDir(manifestDir, path)) {
      errors.push(`章ファイルが manifest の外を指している: ${chapter}`);
      continue;
    }
    // 存在確認: realpath は対象が実在しないと投げるため、symlink 解決の前に確かめる。
    if (!existsSync(path) || !statSync(path).isFile()) {
      errors.push(`章ファイルが存在しない: ${chapter}`);
      continue;
    }
    // lexical には manifest 配下でも、章ファイル自体や途中の階層が外を指す symlink なら弾く。
    if (!isPathWithinRealDir(realManifestDir, path)) {
      errors.push(`章ファイルが manifest の外を指している: ${chapter}`);
      continue;
    }
    chapterPaths.push(path);
  }

  if (errors.length > 0) {
    throw new ManifestError(errors);
  }

  const output = raw['output'] as string;
  const outputPdfPath = resolve(manifestDir, output);
  const outputHtmlPath = `${outputPdfPath.slice(0, -'.pdf'.length)}.html`;

  return {
    title: raw['title'] as string,
    subtitle: typeof subtitleRaw === 'string' ? subtitleRaw : null,
    recipient: typeof recipientRaw === 'string' && recipientRaw.trim() !== '' ? recipientRaw : null,
    issuer: raw['issuer'] as string,
    version: raw['version'] as string,
    date: raw['date'] as string,
    chapters,
    forbid: isStringArray(forbidRaw) ? forbidRaw : [],
    omitSections: isStringArray(omitSectionsRaw) ? omitSectionsRaw : DEFAULT_OMIT_SECTIONS,
    output,
    manifestPath: absoluteManifestPath,
    manifestDir,
    chapterPaths,
    outputPdfPath,
    outputHtmlPath,
    forbidPatterns,
  };
}
