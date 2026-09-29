// deliverable.json (提出用 PDF の manifest) の読み込みと検証。
// パスはすべて manifest ファイルのあるディレクトリを基準に解決する。
// 検査そのものが成立しない (JSON が壊れている・必須項目が無い・章ファイルが無い) は
// 1 件も見逃さず全件集めてから ManifestError として投げる (直すたびに 1 件ずつ再実行させない)。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface DeliverableManifest {
  readonly title: string;
  readonly subtitle: string | null;
  readonly recipient: string;
  readonly issuer: string;
  readonly version: string;
  readonly date: string;
  /** manifest に書かれたままの相対パス (表示用) */
  readonly chapters: readonly string[];
  /** forbid の正規表現ソース文字列 */
  readonly forbid: readonly string[];
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

const REQUIRED_STRING_FIELDS = ['title', 'recipient', 'issuer', 'version', 'date'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
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

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(raw[field])) {
      errors.push(`必須項目が無い: ${field}`);
    }
  }

  const subtitleRaw = raw['subtitle'];
  if (subtitleRaw !== undefined && typeof subtitleRaw !== 'string') {
    errors.push('subtitle は文字列でなければならない');
  }

  const chaptersRaw = raw['chapters'];
  if (!isStringArray(chaptersRaw) || chaptersRaw.length === 0) {
    errors.push('必須項目が無い、または空: chapters (1 件以上の章ファイルの配列)');
  }

  const forbidRaw = raw['forbid'];
  if (forbidRaw !== undefined && !isStringArray(forbidRaw)) {
    errors.push('forbid は文字列の配列でなければならない');
  }

  if (!isNonEmptyString(raw['output'])) {
    errors.push('必須項目が無い: output');
  } else if (!raw['output'].toLowerCase().endsWith('.pdf')) {
    errors.push(`output は .pdf で終わる必要がある: ${raw['output']}`);
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

  const manifestDir = dirname(absoluteManifestPath);
  const chapters = isStringArray(chaptersRaw) ? chaptersRaw : [];
  const chapterPaths = chapters.map((chapter) => join(manifestDir, chapter));
  const missingChapters = chapters.filter((_, i) => {
    const path = chapterPaths[i];
    return path === undefined || !existsSync(path) || !statSync(path).isFile();
  });
  for (const chapter of missingChapters) {
    errors.push(`章ファイルが存在しない: ${chapter}`);
  }

  if (errors.length > 0) {
    throw new ManifestError(errors);
  }

  const output = raw['output'] as string;
  const outputPdfPath = join(manifestDir, output);
  const outputHtmlPath = `${outputPdfPath.slice(0, -'.pdf'.length)}.html`;

  return {
    title: raw['title'] as string,
    subtitle: typeof subtitleRaw === 'string' ? subtitleRaw : null,
    recipient: raw['recipient'] as string,
    issuer: raw['issuer'] as string,
    version: raw['version'] as string,
    date: raw['date'] as string,
    chapters,
    forbid: isStringArray(forbidRaw) ? forbidRaw : [],
    output,
    manifestPath: absoluteManifestPath,
    manifestDir,
    chapterPaths,
    outputPdfPath,
    outputHtmlPath,
    forbidPatterns,
  };
}
