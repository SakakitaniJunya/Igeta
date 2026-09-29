// 設計書がテンプレート (templates/docs/*.md) の必須構造を満たしているか検証する。
// 文書体系の正典は docs/README.md、構造規約は docs/guides/01-document-taxonomy.md。
//
// kind は frontmatter が優先。無ければ **テンプレの配置と同じ docs 上の位置**から決まる
// (templates/docs/design/basic/tables/__context__.md → docs/design/basic/tables/*.md)。
// 両方あって食い違う場合は違反 (置き場所と宣言のどちらかが間違っている)。
//
// 検証内容: ① frontmatter の kind がテンプレ登録済み ② テンプレの必須 H2 節が全部ある
// ③ 「関連」節に上流・下流が 1 件以上 (表・箇条書きのどちらでもよい) ④ ID 接頭辞の形式 (PREFIX-nnn)
// ⑤ depends_on が実在する doc id を指す ⑥ TL;DR (how-to は When to use) がある
//
// docs は検査対象リポジトリ (targetRoot)、テンプレは Igeta パッケージ (igetaRoot) から解決する。
// 利用者リポジトリは templates/ を持たず、Igeta のテンプレで検査される。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';

const OPTIONAL_SUFFIX = '(任意)';
const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage']);

export interface DocTemplateOptions {
  /** 検査対象ディレクトリ。未指定なら <targetRoot>/docs */
  readonly docsDir?: string;
  /** テンプレ置き場。未指定なら <igetaRoot>/templates/docs */
  readonly templatesDir?: string;
  /** kind 未設定の doc を違反として扱う */
  readonly requireKind?: boolean;
  /**
   * 人間レビュー層 (地図の網羅・決定の帰属・仮置きの参照・修飾 ID) を検査する。
   * 既存プロジェクトを一斉に赤くしないための段階導入フラグ。既定 OFF。
   * kind ごとの構造検査 (①テンプレ適合 ②必須節 ③行数上限) は kind: map / decision-log を
   * 名乗った時点で opt-in なので、このフラグの影響を受けない。
   */
  readonly requireHumanReview?: boolean;
  /**
   * 「CEO が決定」等、人の決定を主張する表記の検出パターン。既定は company-person の
   * 実例 (「CEO 2026-09-29 決定」「〜が決定」) から採った 3 パターン。
   * キーワード判定は文書 lint であり会社 OS の「選ぶ」判断ではないので設定として持てる。
   */
  readonly decisionAttributionPatterns?: readonly RegExp[];
}

/** decisionAttributionPatterns の既定値。company-person の実例から採った表記。 */
export const DEFAULT_DECISION_ATTRIBUTION_PATTERNS: readonly RegExp[] = [
  /CEO[^\n。、]{0,20}決定/,
  /代表(?:取締役)?[^\n。、]{0,20}決定/,
  /[^\s|][^\n。、]{0,20}が決定(?:した|済み|している)?/,
];

const TENTATIVE_MARK = '仮置き';

/**
 * 「確定した」とみなす status の値。requirements/feature-brief の既定語彙は fixed。
 * accepted は spec-kit の語彙・将来 kind が使う可能性のある値として合わせて見る。
 */
const FINAL_STATUSES = new Set(['fixed', 'accepted']);
const OPEN_ID_RE = /OPEN-\d{3}/;

// 決定帰属・仮置きの誤検出対策 (code-reviewer B2)。
// 「」『』内に完全に収まる語は引用 (置き換え前の表記の引用・訂正の記録) であって現在の主張ではない。
// 語の直後の否定・伝聞は「そう主張していない」ことの表明なので除外する。
const NEGATION_TAIL_RE = /^(ではな(い|かった)|でな(い|かった)|していな(い|かった)|しなかった|せず)/;
const HEARSAY_TAIL_RE = /^.{0,4}と(書かれてい|書いてあっ|記載されてい|言われてい)/;

/** index が「」『』の対で開いた引用の内側かどうか (深さ 1 以上)。 */
function isQuotedAt(line: string, index: number): boolean {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    const ch = line[i];
    if (ch === '「' || ch === '『') depth += 1;
    else if (ch === '」' || ch === '』') depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/** keywordEnd 直後が否定・伝聞の言い回しなら true (主張ではないので除外する)。 */
function isNegatedOrHearsayAfter(line: string, keywordEnd: number): boolean {
  const tail = line.slice(keywordEnd, keywordEnd + 16);
  return NEGATION_TAIL_RE.test(tail) || HEARSAY_TAIL_RE.test(tail);
}

export interface DocTemplateResult {
  readonly violations: readonly Violation[];
  /** テンプレに登録されている kind の種類数 */
  readonly kindCount: number;
  /** テンプレに突き合わせて検査した doc の本数 */
  readonly checkedCount: number;
  /** kind を決められなかった doc (targetRoot からの相対パス) */
  readonly unmanaged: readonly string[];
}

type FrontmatterValue = string | readonly string[];
type FrontmatterData = ReadonlyMap<string, FrontmatterValue>;

interface Frontmatter {
  readonly data: FrontmatterData;
  readonly bodyStart: number;
}

interface Section {
  readonly text: string;
  /** 1 始まりの行番号 */
  readonly line: number;
}

interface TemplateEntry {
  readonly kind: string;
  /** ID 接頭辞。通常 1 個 (REQ)。decision-log は複数 (DEC, OPEN) を持つ */
  readonly idPrefixes: readonly string[];
  readonly idPattern: string;
  /** frontmatter line_limit。未設定なら null (上限なし) */
  readonly lineLimit: number | null;
  readonly required: readonly string[];
}

/** kind 解決済みの doc。人間レビュー層の横断検査 (地図網羅・決定帰属・修飾 ID) はこの一覧を使う。 */
interface ResolvedDoc {
  readonly relPath: string;
  readonly file: string;
  readonly lines: readonly string[];
  readonly meta: Frontmatter;
  readonly kind: string;
  readonly template: TemplateEntry;
}

interface PathSlot {
  readonly exact: Map<string, string>;
  placeholder: string | null;
}

interface ParsedDoc {
  readonly file: string;
  readonly lines: readonly string[];
  readonly meta: Frontmatter | null;
}

const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

const unquote = (value: string): string => value.replace(/^["']|["']$/g, '');

function scalar(data: FrontmatterData, key: string): string | undefined {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
}

function stringList(data: FrontmatterData, key: string): readonly string[] {
  const value = data.get(key);
  return Array.isArray(value) ? value : [];
}

/** 生成物 (先頭行に AUTOGENERATED マーカー) は索引であって設計書ではない */
const isGenerated = (path: string): boolean =>
  (readFileSync(path, 'utf8').split(/\r?\n/, 1)[0] ?? '').includes('AUTOGENERATED');

function listMarkdown(dir: string, recursive: boolean): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!recursive || SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.name.endsWith('.md') && entry.name !== 'README.md' && !isGenerated(full)) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

/** frontmatter の scalar と list (inline [] / ブロック -) を読む */
function parseFrontmatter(lines: readonly string[]): Frontmatter | null {
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const data = new Map<string, string | string[]>();
  let listKey: string | null = null;
  for (let i = 1; i < end; i += 1) {
    const raw = (lines[i] ?? '').replace(/\s+#\s.*$/, '');
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item !== null && listKey !== null) {
      const current = data.get(listKey);
      if (Array.isArray(current)) current.push(unquote((item[1] ?? '').trim()));
      continue;
    }
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(raw);
    if (pair === null) continue;
    const key = pair[1];
    if (key === undefined) continue;
    const value = (pair[2] ?? '').trim();
    if (value === '') {
      listKey = key;
      data.set(key, []);
      continue;
    }
    listKey = null;
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      data.set(key, inner === '' ? [] : inner.split(',').map((v) => unquote(v.trim())));
    } else {
      data.set(key, unquote(value));
    }
  }
  return { data, bodyStart: end + 1 };
}

const normalizeHeading = (text: string): string => text.replace(/^\d+(\.\d+)*[.．]?\s*/, '').trim();

/** コードフェンス外の H2 見出しを { text, line } で返す */
function extractSections(lines: readonly string[], bodyStart: number): Section[] {
  const sections: Section[] = [];
  let inFence = false;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const matched = /^##\s+(.*?)\s*$/.exec(line);
    if (matched !== null) sections.push({ text: normalizeHeading(matched[1] ?? ''), line: i + 1 });
  }
  return sections;
}

/** 指定 H2 節の本文行を返す */
function sectionBody(
  lines: readonly string[],
  sections: readonly Section[],
  index: number,
): readonly string[] {
  const current = sections[index];
  if (current === undefined) return [];
  const next = sections[index + 1];
  const end = next === undefined ? lines.length : next.line - 1;
  return lines.slice(current.line, end);
}

/** ファイル名先頭の連番 (01-, 12-) を外す。連番は読む順であって種類ではないので、テンプレと番号が違っても同じ文書 */
const withoutSeq = (name: string): string => name.replace(/^\d{2}-/, '');

function loadTemplates(dir: string): {
  registry: Map<string, TemplateEntry>;
  byPath: Map<string, PathSlot>;
  errors: string[];
} {
  const registry = new Map<string, TemplateEntry>();
  const byPath = new Map<string, PathSlot>();
  const errors: string[] = [];
  for (const file of listMarkdown(dir, true)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const parsed = parseFrontmatter(lines);
    const kind = parsed === null ? undefined : scalar(parsed.data, 'kind');
    if (parsed === null || kind === undefined || kind === '') {
      errors.push(`${file} テンプレに frontmatter kind がない`);
      continue;
    }
    if (registry.has(kind)) {
      errors.push(`kind が重複: ${kind}`);
      continue;
    }
    const sections = extractSections(lines, parsed.bodyStart);
    const idPrefixValue = scalar(parsed.data, 'id_prefix') ?? null;
    const idPrefixesList = stringList(parsed.data, 'id_prefixes');
    const lineLimitRaw = scalar(parsed.data, 'line_limit');
    registry.set(kind, {
      kind,
      idPrefixes: idPrefixesList.length > 0 ? idPrefixesList : idPrefixValue !== null ? [idPrefixValue] : [],
      idPattern: scalar(parsed.data, 'id_pattern') ?? 'numeric',
      lineLimit: lineLimitRaw === undefined ? null : Number(lineLimitRaw),
      required: sections
        .filter((section) => !section.text.endsWith(OPTIONAL_SUFFIX))
        .map((section) => section.text),
    });
    const relPath = relative(dir, file);
    const slot = dirname(relPath) === '.' ? '' : dirname(relPath);
    const name = basename(relPath);
    let entry = byPath.get(slot);
    if (entry === undefined) {
      entry = { exact: new Map<string, string>(), placeholder: null };
      byPath.set(slot, entry);
    }
    if (/__[a-z-]+__|NNNN/.test(name)) {
      if (entry.placeholder !== null) {
        errors.push(`${file} 同じ階層に雛形ファイルが 2 枚ある (kind を決められない)`);
      }
      entry.placeholder = kind;
    } else {
      entry.exact.set(withoutSeq(name), kind);
    }
  }
  return { registry, byPath, errors };
}

/** テンプレの配置から既定 kind を引く。完全一致ファイル名 (連番抜き) > 雛形 (__name__) の順 */
function kindFromPath(byPath: ReadonlyMap<string, PathSlot>, docRelPath: string): string | null {
  const slot = dirname(docRelPath) === '.' ? '' : dirname(docRelPath);
  const entry = byPath.get(slot);
  if (entry === undefined) return null;
  return entry.exact.get(withoutSeq(basename(docRelPath))) ?? entry.placeholder;
}

// EARS (Easy Approach to Requirements Syntax): 機能要件は
// 「<トリガ>のとき、システムは<応答>しなければならない」の形に固定する。
// 曖昧な「〜できる」「〜を考慮する」は検証不能な要件になるため落とす。
// 義務の助動詞だけを見る (「返さなければならない」「引き換えられなければならない」は可)。
// https://alistairmavin.com/ears/
const EARS_ROW_RE = /^\|\s*(REQ-1\d{2})\s*\|/;
const EARS_MODAL = 'なければならない';

type AddViolation = (line: number, message: string) => void;

function checkEars(lines: readonly string[], bodyStart: number, add: AddViolation): void {
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const matched = EARS_ROW_RE.exec(line);
    if (matched === null) continue;
    if (!line.includes(EARS_MODAL)) {
      add(
        i + 1,
        `EARS 記法でない: ${matched[1] ?? ''} (「<トリガ>のとき、システムは<応答>しなければならない」)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// arc42 12 章 (https://arc42.org/overview/) と kind の既定対応。
// 背骨を arc42 にすると決めた。章はフォルダではなく frontmatter
// `arc42: <1-12>` で表し、索引 (generate-docs-graph) が章順に並べ替える。
// null = arc42 の章を持たない文書 (arc42 の外側)。arc42 を書いていたら違反にする。
// 章 2 (Constraints) は専用文書を持たない: requirements の制約節と ADR が担う。
// ---------------------------------------------------------------------------
const ARC42_BY_KIND = new Map<string, number | null>([
  ['requirements', 1],
  ['feature-brief', 1],
  ['function-list', 1],
  ['as-is-overview', 3],
  ['external-integration', 3],
  ['solution-strategy', 4],
  ['domain-overview', 5],
  ['aggregate-map', 5],
  ['domain-model', 5],
  ['module-spec', 5],
  ['screen-spec', 5],
  ['api-spec', 5],
  ['table-spec', 5],
  ['business-flow', 6],
  ['sequence-spec', 6],
  ['state-machine', 6],
  ['job', 6],
  ['infra-design', 7],
  ['operations', 7],
  ['migration-plan', 7],
  ['crosscutting', 8],
  ['code-definitions', 8],
  ['messages', 8],
  ['permission-matrix', 8],
  ['i18n', 8],
  ['data-management', 8],
  ['secrets-management', 8],
  ['adr', 9],
  ['nonfunctional', 10],
  ['test-plan', 10],
  ['test-spec', 10],
  ['risks-tech-debt', 11],
  ['glossary', 12],
  // arc42 の外側: 実装手順 (spec-kit 由来) と対外文書・解説
  ['tasks', null],
  ['proposal', null],
  ['guide', null],
  ['implementation-order', null],
  ['document-taxonomy', null],
  ['explanation', null],
  ['runbook', null],
  // 人間レビュー層: 地図と決定台帳。人の入口であって arc42 の関心事の分類には乗らない
  ['map', null],
  ['decision-log', null],
  ['human-review', null],
]);

function checkArc42(
  kind: string,
  data: FrontmatterData,
  add: AddViolation,
  requireKind: boolean,
): void {
  if (!ARC42_BY_KIND.has(kind)) {
    add(1, `arc42 章の既定が未登録の kind: ${kind} (src/checks/DocTemplateCheck.ts の ARC42_BY_KIND に足す)`);
    return;
  }
  const expected = ARC42_BY_KIND.get(kind) ?? null;
  const raw = scalar(data, 'arc42');
  const declared = raw === undefined ? null : Number(raw);
  if (expected === null) {
    if (declared !== null) add(1, `arc42 章を持たない kind: ${kind} (frontmatter の arc42 を消す)`);
    return;
  }
  if (declared === null) {
    if (requireKind) add(1, `frontmatter に arc42 がない (kind: ${kind} の既定は ${expected})`);
    return;
  }
  if (declared !== expected) {
    add(1, `arc42 章が kind の既定と食い違う: frontmatter=${raw} / kind ${kind} の既定=${expected}`);
  }
}

function checkRelated(
  lines: readonly string[],
  sections: readonly Section[],
  bodyStart: number,
  add: AddViolation,
): void {
  const relatedIndex = sections.findIndex((section) => section.text.startsWith('関連'));
  const related = sections[relatedIndex];
  if (relatedIndex === -1 || related === undefined) {
    add(bodyStart + 1, '「関連」節がない (上流/下流の表が必須)');
    return;
  }
  const entries: { label: string; value: string }[] = [];
  for (const line of sectionBody(lines, sections, relatedIndex)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && !/^\|[\s|:-]+\|$/.test(trimmed)) {
      const cells = trimmed.split('|').map((cell) => cell.trim());
      entries.push({ label: cells[1] ?? '', value: cells[2] ?? '' });
      continue;
    }
    const bullet = /^[-*]\s+(.+?)\s*[:：]\s*(.*)$/.exec(trimmed);
    if (bullet !== null) entries.push({ label: bullet[1] ?? '', value: bullet[2] ?? '' });
  }
  const hasFilledRow = (keyword: string): boolean =>
    entries.some((entry) => entry.label.includes(keyword) && entry.value.replace(/[\s—-]/g, '') !== '');
  if (!hasFilledRow('上流')) add(related.line, '「関連」節に上流の行がない (空欄不可)');
  if (!hasFilledRow('下流')) add(related.line, '「関連」節に下流の行がない (空欄不可)');
}

function checkIds(
  lines: readonly string[],
  bodyStart: number,
  data: FrontmatterData,
  template: TemplateEntry,
  add: AddViolation,
): void {
  if (template.idPattern === 'class-name') {
    const codeRoot = scalar(data, 'code_root');
    if (codeRoot === undefined || codeRoot === '') {
      add(1, 'frontmatter に code_root がない (図↔実装照合に必須)');
    }
    return;
  }
  if (template.idPrefixes.length === 0) return;
  // bare-numeric = T001 形式 (spec-kit の tasks)。既定は PREFIX-nnn。
  const bare = template.idPattern === 'bare-numeric';
  let count = 0;
  for (const prefix of template.idPrefixes) {
    const pattern = bare
      ? new RegExp(`\\b${prefix}\\d[0-9A-Za-z_-]*`, 'g')
      : new RegExp(`\\b${prefix}-[A-Za-z0-9_-]+`, 'g');
    const strict = bare ? new RegExp(`^${prefix}\\d{3}$`) : new RegExp(`^${prefix}-\\d{3}$`);
    for (let i = bodyStart; i < lines.length; i += 1) {
      for (const token of (lines[i] ?? '').match(pattern) ?? []) {
        count += 1;
        if (!strict.test(token)) {
          add(i + 1, `ID 形式が不正: ${token} (${bare ? `${prefix}nnn` : `${prefix}-nnn`} の 3 桁)`);
        }
      }
    }
  }
  if (count === 0) {
    const labels = template.idPrefixes.map((prefix) => (bare ? `${prefix}nnn` : `${prefix}-nnn`)).join(' / ');
    add(bodyStart + 1, `${labels} の ID が 1 件もない`);
  }
}

const DEC_REQUIRED_COLUMNS = ['日付', '決めた人', '原文'];
const OPEN_REQUIRED_COLUMNS = ['論点', '仮置き値'];

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * decision-log の DEC-nnn / OPEN-nnn 行は、日付・決めた人・原文 (DEC) / 論点・仮置き値 (OPEN)
 * を空欄禁止にする (non-blocking N1)。「決めた」「未決」の中身が無い行は台帳として機能しないため。
 */
function checkDecisionLogRows(lines: readonly string[], bodyStart: number, add: AddViolation): void {
  for (let i = bodyStart; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? '').trim();
    if (!/^\|\s*(DEC|OPEN)-\d{3}\s*\|/.test(trimmed)) continue;
    let headerIndex = i;
    while (headerIndex > 0 && (lines[headerIndex - 1] ?? '').trim().startsWith('|')) headerIndex -= 1;
    if (headerIndex === i) continue; // 見出し行が見つからない (表構造の異常は他の検査が拾う)
    const headers = splitTableCells(lines[headerIndex] ?? '');
    const cells = splitTableCells(trimmed);
    const token = cells[0] ?? '';
    const required = token.startsWith('DEC') ? DEC_REQUIRED_COLUMNS : OPEN_REQUIRED_COLUMNS;
    for (const column of required) {
      const columnIndex = headers.indexOf(column);
      if (columnIndex === -1) continue; // 列名自体が無ければ別の検査 (必須節) が拾う
      const value = (cells[columnIndex] ?? '').trim();
      if (value === '' || value === '—' || value === '-') {
        add(i + 1, `${token} の「${column}」列が空欄`);
      }
    }
  }
}

/** doc 本文の行数。<!-- AUTOGEN --> 区間 (生成される仮置き一覧など) は上限の外に置く。 */
function countCheckableLines(lines: readonly string[]): number {
  let total = lines.length;
  if (lines[lines.length - 1] === '') total -= 1; // 末尾の改行 1 個は行数に数えない
  let inAutogen = false;
  for (const line of lines) {
    if (/<!--\s*AUTOGEN[A-Za-z:-]*:start/.test(line)) {
      inAutogen = true;
      continue;
    }
    if (/<!--\s*AUTOGEN[A-Za-z:-]*:end/.test(line)) {
      inAutogen = false;
      continue;
    }
    if (inAutogen) total -= 1;
  }
  return total;
}

/** コードフェンス外を判定するトグル。関連する 3 検査 (行数以外) がフェンス内の例示コードを誤検出しないために使う */
function makeFenceTracker(): (line: string) => boolean {
  let fence: string | null = null;
  return (line: string): boolean => {
    const matched = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (matched !== null) {
      const marker = matched[1]?.[0];
      if (marker !== undefined) {
        if (fence === null) fence = marker;
        else if (marker === fence) fence = null;
      }
      return true; // フェンス行自体は対象外
    }
    return fence !== null;
  };
}

/**
 * ID トークン (PREFIX-nnn) の定義元 doc を索引する。同一ファイル内の裸参照を許すための基準。
 * 各テンプレは「1 ファイル 1 ローカル採番」(REQ-001/101/201/301/401 等) を前提にしているため、
 * 同じ番号が複数ファイルで独立に定義されるのは正常 (欠陥ではない)。だから定義元は 1 件に絞らず
 * 全部残し、「同一ファイル内は裸で OK」の判定と「複数ファイルにある番号は修飾 ID が必須」の
 * 判定の両方に使う。番号の重複そのものを違反にはしない (それをやると全テンプレが赤くなる)。
 */
function buildIdHomes(resolved: readonly ResolvedDoc[]): ReadonlyMap<string, readonly string[]> {
  const idHomes = new Map<string, string[]>();
  for (const doc of resolved) {
    for (const prefix of doc.template.idPrefixes) {
      const strict = new RegExp(`\\b${prefix}-\\d{3}\\b`, 'g');
      const seenInDoc = new Set<string>();
      for (const token of doc.lines.join('\n').match(strict) ?? []) {
        if (seenInDoc.has(token)) continue; // 同一 doc 内の複数出現は 1 件と数える
        seenInDoc.add(token);
        const homes = idHomes.get(token) ?? [];
        homes.push(doc.relPath);
        idHomes.set(token, homes);
      }
    }
  }
  return idHomes;
}

/** 「他ファイルの REQ を参照するときは <doc-id>/REQ-nnn」を検査する正規表現。 */
function buildQualifiedIdRegex(prefixes: readonly string[]): RegExp | null {
  const unique = [...new Set(prefixes)];
  if (unique.length === 0) return null;
  const alt = unique.sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`(?:([a-z][a-z0-9-]*)\\/)?\\b(${alt})-(\\d{3})\\b`, 'g');
}

/**
 * 「## 関連」節の本文範囲 (0-based, [start, end))。この節は「文書」列が隣で ID の帰属を明示するので、
 * 修飾 ID・決定帰属の検査対象から外す (関連は要約であって、他ファイルの ID を裸で持ち出す主張ではない)。
 * 節が無ければ [-1, -1] (どの行も範囲に入らない)。
 */
function relatedSectionRange(lines: readonly string[], bodyStart: number): readonly [number, number] {
  const sections = extractSections(lines, bodyStart);
  const index = sections.findIndex((section) => section.text.startsWith('関連'));
  const related = sections[index];
  if (related === undefined) return [-1, -1];
  const next = sections[index + 1];
  const end = next === undefined ? lines.length : next.line - 1;
  return [related.line - 1, end]; // -1 して見出し行 (## 関連) 自体も範囲に含める
}

const inRange = (i: number, [start, end]: readonly [number, number]): boolean => i >= start && i < end;

/**
 * 「## 関連」節のうち、**表の行だけ**を検査対象から外す (code-reviewer B3)。
 * 隣の「文書」列が ID の帰属を明示するのは表の行だけで、節内の自由記述 (表の外) は
 * 他の本文と同じルールで検査する — 「関連」に逃げ込んで裸参照や無帰属の主張を書けないようにする。
 */
const isExemptRelatedRow = (i: number, relatedRange: readonly [number, number], line: string): boolean =>
  inRange(i, relatedRange) && line.trim().startsWith('|');

function checkQualifiedIds(
  doc: ResolvedDoc,
  idHomes: ReadonlyMap<string, readonly string[]>,
  idIndexRel: ReadonlyMap<string, string>,
  refRegex: RegExp,
  relatedRange: readonly [number, number],
  add: AddViolation,
): void {
  const inFence = makeFenceTracker();
  for (let i = doc.meta.bodyStart; i < doc.lines.length; i += 1) {
    const line = doc.lines[i] ?? '';
    if (inFence(line)) continue;
    if (isExemptRelatedRow(i, relatedRange, line)) continue;
    for (const matched of line.matchAll(refRegex)) {
      const docIdPart = matched[1];
      const token = `${matched[2] ?? ''}-${matched[3] ?? ''}`;
      const homes = idHomes.get(token);
      if (docIdPart !== undefined) {
        const targetFile = idIndexRel.get(docIdPart);
        if (targetFile === undefined) {
          add(i + 1, `修飾 ID が解決できない: ${docIdPart}/${token} (doc id "${docIdPart}" が存在しない)`);
        } else if (homes === undefined || !homes.includes(targetFile)) {
          add(i + 1, `修飾 ID が解決できない: ${docIdPart}/${token} (${token} は ${docIdPart} に無い)`);
        }
        continue;
      }
      if (homes === undefined || homes.includes(doc.relPath)) continue; // 未知の ID、または同一ファイル内
      const toDocId = (relPath: string): string => relPath.replace(/^.*\//, '').replace(/\.md$/, '');
      if (homes.length === 1) {
        const home = homes[0] ?? '';
        add(i + 1, `他ファイルの ID は修飾 ID (<doc-id>/${token}) で参照する: ${token} は ${home} 由来 (例: ${toDocId(home)}/${token})`);
      } else {
        // この番号は複数ファイルのローカル採番で独立に使われている (欠陥ではない)。
        // 裸で参照するとどちらの意味か分からないので、修飾 ID でどの文書のものかを明示させる。
        const examples = homes.map((home) => `${toDocId(home)}/${token}`).join(' か ');
        add(i + 1, `他ファイルの ID は修飾 ID で参照する: ${token} は複数の文書のローカル採番 (${homes.join(', ')}) にあるため、${examples} のどちらかを明示する`);
      }
    }
  }
}

/**
 * 未決の関門 (spec-kit の [NEEDS CLARIFICATION] 相当、S2)。requirements / feature-brief が
 * status: fixed (確定) を名乗っているのに OPEN-nnn を参照しているなら、その未決事項が解決する
 * まで確定を名乗れない。関連の対応 ID 列を含め本文全体を見る (未決が残っているかどうかが論点で、
 * 引用・関連の区別は関係ない)。
 */
function checkAcceptedGate(doc: ResolvedDoc, add: AddViolation): void {
  if (doc.kind !== 'requirements' && doc.kind !== 'feature-brief') return;
  const status = scalar(doc.meta.data, 'status');
  if (status === undefined || !FINAL_STATUSES.has(status)) return;
  for (let i = doc.meta.bodyStart; i < doc.lines.length; i += 1) {
    const open = (doc.lines[i] ?? '').match(OPEN_ID_RE)?.[0];
    if (open !== undefined) {
      add(i + 1, `status: ${status} だが ${open} を参照している (未決の関門。解決してから確定にする)`);
    }
  }
}

function checkDecisionAttribution(
  doc: ResolvedDoc,
  idHomes: ReadonlyMap<string, readonly string[]>,
  patterns: readonly RegExp[],
  relatedRange: readonly [number, number],
  add: AddViolation,
): void {
  // decision-log・adr 自身は決定の正本 (台帳・MADR)。列名 (「仮置き値」) や見出し (「仮置き一覧」)、
  // ADR の Decision 節が語彙として「仮置き」「決定」を含むのは当然で、自分自身への帰属を求めない。
  if (doc.kind === 'decision-log' || doc.kind === 'adr') return;
  const inFence = makeFenceTracker();
  for (let i = doc.meta.bodyStart; i < doc.lines.length; i += 1) {
    const line = doc.lines[i] ?? '';
    if (inFence(line)) continue;
    if (isExemptRelatedRow(i, relatedRange, line)) continue;
    if (/^#{1,6}\s/.test(line)) continue; // 見出し行は主張ではない

    let attribution: RegExpExecArray | null = null;
    for (const pattern of patterns) {
      const matched = pattern.exec(line);
      // パターンは全て文字列 "決定" で終わる (DEFAULT_DECISION_ATTRIBUTION_PATTERNS 参照)。
      // 引用 (「」『』内) と否定・伝聞 (〜ではない・〜と書かれていた 等) は主張ではないので除外する。
      if (matched !== null && !isQuotedAt(line, matched.index) && !isNegatedOrHearsayAfter(line, matched.index + matched[0].length)) {
        attribution = matched;
        break;
      }
    }
    if (attribution !== null) {
      const dec = line.match(/DEC-\d{3}/)?.[0];
      if (dec === undefined) {
        add(i + 1, `決定の帰属を主張しているが DEC-nnn の参照が無い: ${line.trim()}`);
      } else if (!idHomes.has(dec)) {
        add(i + 1, `${dec} が決定台帳に無い`);
      }
    }

    const tentativeIndex = line.indexOf(TENTATIVE_MARK);
    if (tentativeIndex !== -1 && !isQuotedAt(line, tentativeIndex) && !isNegatedOrHearsayAfter(line, tentativeIndex + TENTATIVE_MARK.length)) {
      const open = line.match(/OPEN-\d{3}/)?.[0];
      if (open === undefined) {
        add(i + 1, `「${TENTATIVE_MARK}」に OPEN-nnn の参照が無い: ${line.trim()}`);
      } else if (!idHomes.has(open)) {
        add(i + 1, `${open} が決定台帳に無い`);
      }
    }
  }
}

/** map の本文リンク先を、コードフェンス外から集める (フラグメント `#…` は無視)。 */
function extractLinkTargets(lines: readonly string[], bodyStart: number): string[] {
  const inFence = makeFenceTracker();
  const targets: string[] = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (inFence(line)) continue;
    for (const matched of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = matched[1];
      if (target !== undefined) targets.push((target.split('#')[0] ?? target).trim());
    }
  }
  return targets;
}

function resolveLinkAbs(fromFileAbs: string, targetRoot: string, target: string): string | null {
  if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // 外部リンク (http: / mailto: 等)
  if (target.startsWith('/')) return join(targetRoot, target.slice(1));
  return join(dirname(fromFileAbs), target);
}

function checkDoc(
  relPath: string,
  lines: readonly string[],
  meta: Frontmatter,
  template: TemplateEntry,
  idIndex: ReadonlyMap<string, string>,
  requireKind: boolean,
): Violation[] {
  const violations: Violation[] = [];
  const { data, bodyStart } = meta;
  const add: AddViolation = (line, message) =>
    violations.push({ severity: 'violation', message, file: relPath, line });

  const opener = /^>\s*\*\*(TL;DR|When to use)/;
  if (!lines.slice(bodyStart).some((line) => opener.test(line))) {
    add(bodyStart + 1, 'TL;DR / When to use ブロックがない');
  }

  const sections = extractSections(lines, bodyStart);
  const texts = sections.map((section) => section.text);
  for (const requiredText of template.required) {
    if (!texts.some((text) => text.startsWith(requiredText))) {
      add(bodyStart + 1, `必須の節がない: ## ${requiredText}`);
    }
  }

  checkRelated(lines, sections, bodyStart, add);
  checkIds(lines, bodyStart, data, template, add);

  if (template.kind === 'requirements') checkEars(lines, bodyStart, add);
  if (template.kind === 'decision-log') checkDecisionLogRows(lines, bodyStart, add);

  checkArc42(template.kind, data, add, requireKind);

  if (template.lineLimit !== null) {
    const total = countCheckableLines(lines);
    if (total > template.lineLimit) {
      add(1, `行数上限 (${template.lineLimit}) を超えている: ${total} 行`);
    }
  }

  for (const dependency of stringList(data, 'depends_on')) {
    if (dependency.startsWith('external:')) continue;
    if (!idIndex.has(dependency)) {
      add(1, `depends_on が存在しない id を指している: ${dependency}`);
    }
  }
  return violations;
}

/** テンプレに突き合わせて docs/ を検査する。exit も print もせず結果だけ返す。 */
export class DocTemplateCheck implements Check {
  readonly name = 'template-check';

  readonly #options: DocTemplateOptions;

  constructor(options: DocTemplateOptions = {}) {
    this.#options = options;
  }

  run(ctx: CheckContext): readonly Violation[] {
    return this.analyze(ctx).violations;
  }

  /** 違反に加えて検査の内訳 (kind 数・検査本数・kind 未設定) も返す。CLI の要約表示用。 */
  analyze(ctx: CheckContext): DocTemplateResult {
    const docsDir = this.#options.docsDir ?? join(ctx.targetRoot, 'docs');
    const templatesDir = this.#options.templatesDir ?? join(ctx.igetaRoot, 'templates', 'docs');
    const requireKind = this.#options.requireKind ?? false;
    const rel = (path: string): string => {
      const relPath = relative(ctx.targetRoot, path);
      return relPath === '' || relPath.startsWith('..') || isAbsolute(relPath) ? path : relPath;
    };
    const cannotCheck = (...messages: readonly string[]): DocTemplateResult => ({
      violations: messages.map((message) => ({ severity: 'cannot-check', message })),
      kindCount: 0,
      checkedCount: 0,
      unmanaged: [],
    });

    if (!isDir(templatesDir)) return cannotCheck(`テンプレ置き場が無い: ${rel(templatesDir)}`);
    if (!isDir(docsDir)) return cannotCheck(`docs が無い: ${rel(docsDir)}`);

    const { registry, byPath, errors } = loadTemplates(templatesDir);
    if (errors.length > 0) return cannotCheck(...errors);
    if (registry.size === 0) return cannotCheck(`テンプレが 1 枚も無い: ${rel(templatesDir)}`);

    const parsedDocs: ParsedDoc[] = [];
    const idIndex = new Map<string, string>();
    const idIndexRel = new Map<string, string>();
    const idOccurrences = new Map<string, string[]>();
    for (const file of listMarkdown(docsDir, true)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const meta = parseFrontmatter(lines);
      parsedDocs.push({ file, lines, meta });
      const id = meta === null ? undefined : scalar(meta.data, 'id');
      if (id !== undefined && id !== '') {
        idIndex.set(id, file);
        idIndexRel.set(id, rel(file));
        const occurrences = idOccurrences.get(id) ?? [];
        occurrences.push(rel(file));
        idOccurrences.set(id, occurrences);
      }
    }

    const violations: Violation[] = [];
    const unmanaged: string[] = [];
    const resolved: ResolvedDoc[] = [];
    let checkedCount = 0;

    // frontmatter id の重複 (non-blocking N2)。docs-check (DocGraphCheck) も同じ id を見て
    // 落とすが、template-check 単体でも検出できるようにする (両方の実行を前提にしない)。
    for (const [id, occurrences] of idOccurrences) {
      if (occurrences.length > 1) {
        violations.push({
          severity: 'violation',
          message: `frontmatter id が重複している: ${id} (${occurrences.join(', ')})`,
        });
      }
    }

    for (const { file, lines, meta } of parsedDocs) {
      const relPath = rel(file);
      if (meta === null) {
        // frontmatter 自体の検査は docs-graph 側の担当。ここでは kind 未設定と同じ扱いにする
        unmanaged.push(relPath);
        continue;
      }
      const pathKind = kindFromPath(byPath, relative(docsDir, file));
      const declared = scalar(meta.data, 'kind') ?? null;
      if (declared !== null && pathKind !== null && declared !== pathKind) {
        violations.push({
          severity: 'violation',
          message: `kind と置き場所が食い違う: frontmatter=${declared} / 配置=${pathKind}`,
          file: relPath,
          line: 1,
        });
        continue;
      }
      const kind = declared ?? pathKind;
      if (kind === null || kind === '') {
        unmanaged.push(relPath);
        continue;
      }
      const template = registry.get(kind);
      if (template === undefined) {
        violations.push({
          severity: 'violation',
          message: `未登録の kind: ${kind} (templates/docs にテンプレを作るか kind を直す)`,
          file: relPath,
          line: 1,
        });
        continue;
      }
      checkedCount += 1;
      violations.push(...checkDoc(relPath, lines, meta, template, idIndex, requireKind));
      resolved.push({ relPath, file, lines, meta, kind, template });
    }

    if (requireKind) {
      for (const path of unmanaged) {
        violations.push({
          severity: 'violation',
          message: 'kind を決められない (frontmatter kind か、テンプレのある階層への移動が要る)',
          file: path,
          line: 1,
        });
      }
    }

    if (this.#options.requireHumanReview ?? false) {
      violations.push(
        ...this.#analyzeHumanReviewLayer(ctx.targetRoot, resolved, idIndexRel),
      );
    }

    violations.sort(
      (a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0),
    );
    return { violations, kindCount: registry.size, checkedCount, unmanaged };
  }

  /**
   * 人間レビュー層の横断検査。①地図の網羅 ②決定の帰属 ③仮置きの OPEN 参照 ④修飾 ID。
   * kind 解決が終わった doc の一覧 (resolved) だけを対象にする — 未管理 doc の本文までは追わない。
   */
  #analyzeHumanReviewLayer(
    targetRoot: string,
    resolved: readonly ResolvedDoc[],
    idIndexRel: ReadonlyMap<string, string>,
  ): Violation[] {
    const violations: Violation[] = [];

    // ① 地図の網羅: kind: requirements の全文書が 00-map.md からリンクされていること
    const mapDoc = resolved.find((doc) => doc.kind === 'map');
    const requirementsDocs = resolved.filter((doc) => doc.kind === 'requirements');
    if (requirementsDocs.length > 0 && mapDoc === undefined) {
      violations.push({
        severity: 'violation',
        message: '00-map.md が無い (kind: requirements の文書は全部そこからリンクされる必要がある)',
      });
    } else if (mapDoc !== undefined) {
      const targets = new Set(
        extractLinkTargets(mapDoc.lines, mapDoc.meta.bodyStart)
          .map((target) => resolveLinkAbs(mapDoc.file, targetRoot, target))
          .filter((target): target is string => target !== null),
      );
      for (const reqDoc of requirementsDocs) {
        if (!targets.has(reqDoc.file)) {
          violations.push({
            severity: 'violation',
            message: `requirements 文書が 00-map.md からリンクされていない: ${reqDoc.relPath}`,
            file: mapDoc.relPath,
            line: 1,
          });
        }
      }
    }

    // ②③ 決定の帰属・仮置きの OPEN 参照、④ 修飾 ID。いずれも DEC-nnn/OPEN-nnn/REQ-nnn 等の
    // 定義元 (idHomes) を全 doc から作ってから判定する
    const idHomes = buildIdHomes(resolved);
    const attributionPatterns = this.#options.decisionAttributionPatterns ?? DEFAULT_DECISION_ATTRIBUTION_PATTERNS;
    const allPrefixes = [...new Set(resolved.flatMap((doc) => doc.template.idPrefixes))];
    const refRegex = buildQualifiedIdRegex(allPrefixes);

    for (const doc of resolved) {
      const add: AddViolation = (line, message) =>
        violations.push({ severity: 'violation', message, file: doc.relPath, line });
      const relatedRange = relatedSectionRange(doc.lines, doc.meta.bodyStart);
      checkDecisionAttribution(doc, idHomes, attributionPatterns, relatedRange, add);
      if (refRegex !== null) checkQualifiedIds(doc, idHomes, idIndexRel, refRegex, relatedRange, add);
      checkAcceptedGate(doc, add);
    }

    return violations;
  }
}
