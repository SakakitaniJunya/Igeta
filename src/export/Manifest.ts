// deliverable.json (提出用 PDF の manifest) の読み込みと検証。
// パスはすべて manifest ファイルのあるディレクトリを基準に解決する。
// 検査そのものが成立しない (JSON が壊れている・必須項目が無い・章ファイルが無い) は
// 1 件も見逃さず全件集めてから ManifestError として投げる (直すたびに 1 件ずつ再実行させない)。

import { existsSync, readFileSync, statSync } from 'node:fs';
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
 * target は `resolve(dir, ...)` 済みの絶対パスであること (join() は絶対パスの引数を
 * 正規化してしまい脱出を検出できないため使わない)。
 */
function isWithinDir(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
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
  } else if (!isWithinDir(manifestDir, resolve(manifestDir, raw['output']))) {
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
    if (!isWithinDir(manifestDir, path)) {
      errors.push(`章ファイルが manifest の外を指している: ${chapter}`);
      continue;
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      errors.push(`章ファイルが存在しない: ${chapter}`);
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
