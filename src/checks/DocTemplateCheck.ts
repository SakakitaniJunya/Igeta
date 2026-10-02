// 設計書がテンプレート (templates/docs/**/*.md) の必須構造を満たしているか検証する。
// 文書体系の正典は docs/README.md、構造規約は templates/docs/ai/handbook/how-to/01-document-taxonomy.md。
//
// kind は frontmatter が優先。無ければ置き場所から決まる。両方あって食い違う場合は違反 (置き場所と宣言のどちらかが
// 間違っている)。新しい構成 (docs/person・ai・client の下) の置き場所は、置き場所の型 (core/Role.ts) から引く。
// 旧い構成の置き場所は、雛形の配置ではなく固定の表 (core/LegacyTemplatePaths.ts) から引く。
// 旧い構成の文書の必須節と行数上限も、雛形を新しい構成の木へ移す前の固定の表 (core/LegacyTemplateRules.ts) で検査する。
//
// 検証内容: ① frontmatter の kind がテンプレ登録済み ② テンプレの必須 H2 節が全部ある
// ③ 「関連」節に上流・下流が 1 件以上 (表・箇条書きのどちらでもよい) ④ ID 接頭辞の形式 (PREFIX-nnn)
// ⑤ depends_on が実在する doc id を指す ⑥ TL;DR (how-to は When to use) がある
//
// docs は検査対象リポジトリ (targetRoot)、テンプレは Igeta パッケージ (igetaRoot) から解決する。
// 利用者リポジトリは templates/ を持たず、Igeta のテンプレで検査される。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { readContext, SHARED_CONTEXT } from '../core/Context.js';
import type { Frontmatter, FrontmatterData } from '../core/Frontmatter.js';
import { parseFrontmatter, scalar, stringList } from '../core/Frontmatter.js';
import { collectRowDefinedTokens } from '../core/IdDefinitions.js';
import type { LineKind } from '../core/LineClassifier.js';
import { classifyLines, hasLiveMatch, hasLiveOccurrence } from '../core/LineClassifier.js';
import type { Violation } from '../core/Report.js';
import { LEGACY_TEMPLATE_RULES } from '../core/LegacyTemplateRules.js';
import { legacyKindOfPath } from '../core/LegacyTemplatePaths.js';
import { kindOfPath, roleOfPath } from '../core/Role.js';

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
   * 「CEO が決定」等、人の決定を主張する表記の検出パターン。既定は ある案件の
   * 実例 (「CEO 2026-09-29 決定」「〜が決定」) から採った 3 パターン。
   * キーワード判定は文書 lint であり会社 OS の「選ぶ」判断ではないので設定として持てる。
   */
  readonly decisionAttributionPatterns?: readonly RegExp[];
}

/**
 * decisionAttributionPatterns の既定値。ある案件の実例から採った表記。
 * 「が決定」の主語は**人を指す語だけ**にする (code-reviewer 実バグ #6)。主語を問わない
 * `[^\s|]...が決定` は「価格が決定されるまで」「日程が決定次第」のような無生物主語まで誤検出した。
 * 人名+さん等、CEO/代表以外の主語を検出したいプロジェクトは decisionAttributionPatterns を丸ごと
 * 上書きできる (既存の設定機構。ここに新しい設定層は増やさない)。
 */
export const DEFAULT_DECISION_ATTRIBUTION_PATTERNS: readonly RegExp[] = [
  /CEO[^\n。、]{0,20}決定/,
  /代表(?:取締役)?[^\n。、]{0,20}決定/,
  /[^\s、。]{1,10}さん[^\n。、]{0,20}が決定(?:した|済み|している)?/,
];

const TENTATIVE_MARK = '仮置き';

/**
 * 「確定した」とみなす status の値。requirements/feature-brief の既定語彙は fixed。
 * accepted は spec-kit の語彙・将来 kind が使う可能性のある値として合わせて見る。
 */
const FINAL_STATUSES = new Set(['fixed', 'accepted']);
// 3 桁の直後に数字・ハイフン+数字が続くものは 3 桁 ID として扱わない (前提修正。日付入り ID
// `DEC-20260917-02`/`OPEN-20260917-02` — 移行元案件の旧 ID 形式の原文引用 — の先頭 3 桁を実在の
// 3 桁 ID に部分一致させない。03-audience-layers.md §7)。
const OPEN_ID_RE = /OPEN-\d{3}(?!\d)(?!-\d)/;

/**
 * 「他ファイルの ID は修飾 ID で参照する」違反のうち、定義元が 1 件に一意に決まるもの (=機械的に
 * 直せるもの) を構造化データで持つ。fix-ids はこれを直接読む — 違反メッセージの文言を正規表現で
 * パースする密結合をやめるため (non-blocking N-a, code-reviewer round 3)。
 */
export interface QualifiedIdFix {
  readonly file: string;
  readonly line: number;
  /** 行内でトークンが始まる 0-based の列。fix-ids はこの位置だけを書き換える (code-reviewer C4) */
  readonly column: number;
  readonly token: string;
  readonly homeId: string;
}

export interface DocTemplateResult {
  readonly violations: readonly Violation[];
  /** テンプレに登録されている kind の種類数 */
  readonly kindCount: number;
  /** テンプレに突き合わせて検査した doc の本数 */
  readonly checkedCount: number;
  /** kind を決められなかった doc (targetRoot からの相対パス) */
  readonly unmanaged: readonly string[];
  /** 定義元が 1 件に一意な裸の ID 参照。requireHumanReview 無しでは常に空配列 */
  readonly unambiguousFixes: readonly QualifiedIdFix[];
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
  /** lines の行ごとの分類 (autogen / html-comment / code-fence / body)。checkDoc 時点で 1 回だけ計算する */
  readonly kinds: readonly LineKind[];
}

interface ParsedDoc {
  readonly file: string;
  readonly lines: readonly string[];
  readonly meta: Frontmatter | null;
}

const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

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

function loadTemplates(dir: string): { registry: Map<string, TemplateEntry>; errors: string[] } {
  const registry = new Map<string, TemplateEntry>();
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
  }
  return { registry, errors };
}

/**
 * 置き場所から既定の kind を引く。新しい構成 (person / ai / client の下) は、まとまりのフォルダ名が雛形の配置と
 * 一致しないので、まとまりの 1 段だけワイルドカードにした置き場所の型 (要件定義書 02 §7、core/Role.ts) から引く
 * (REQ-304)。型だけでは kind が決まらない場所 (固定番号の文書など) は null で、frontmatter の kind に頼る。
 * 旧い構成は、雛形の配置と同じ位置だった固定の表 (core/LegacyTemplatePaths.ts) から引く。
 */
function kindFromPath(docRelPath: string): string | null {
  const posixPath = docRelPath.split(sep).join('/');
  return roleOfPath(posixPath) !== null ? kindOfPath(posixPath) : legacyKindOfPath(posixPath);
}

/**
 * 文書の検査に使う雛形。新しい構成の文書は、雛形そのもの。旧い構成の文書は、必須節と行数上限だけを、雛形を新しい構成の
 * 木へ移す前の値 (core/LegacyTemplateRules.ts) にする。旧い構成の repo は、移すまでの間も既存の検査が通る (REQ-106)。
 * ID の接頭辞・形式は雛形のまま。
 */
function templateFor(template: TemplateEntry, docRelPath: string): TemplateEntry {
  if (roleOfPath(docRelPath.split(sep).join('/')) !== null) return template;
  const legacy = LEGACY_TEMPLATE_RULES.get(template.kind);
  return legacy === undefined ? template : { ...template, required: legacy.required, lineLimit: legacy.lineLimit };
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
export const ARC42_BY_KIND: ReadonlyMap<string, number | null> = new Map<string, number | null>([
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
  ['delivery-chapter', null],
  ['runbook', null],
  // 人間レビュー層: 地図と決定台帳。人の入口であって arc42 の関心事の分類には乗らない
  ['map', null],
  ['decision-log', null],
  ['human-review', null],
  // まとまり (業務コンテキスト) の境界。docs/explanation/07-context-boundaries.md
  ['context-map', null],
  ['context-contract', null],
  // 由来 (provenance) の手引き。01-document-taxonomy 等と同じく固定名の単独文書で、
  // 汎用 kind: guide (__slug__.md) と kind を共有できない (テンプレ登録は kind 単位で 1 枚)
  ['provenance-workflow', null],
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
  kinds: readonly LineKind[],
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
    // 汎用の説明用プレースホルダはテンプレ・ガイド全体で「この接頭辞の ID 一般」を指す記法として
    // 使っており、実際の ID ではない (code-reviewer 実バグ #4)。2 種類の書き方がある: 全桁を
    // 汎用にする `nnn` (`PREFIX-nnn`) と、百番台だけを示す `Nxx` (`REQ-1xx`・`XC-4xx` 等、先頭は
    // 実数字、残り 2 桁が `x`)。3 桁部分が数字・`n`・`x` だけで構成され、`n`/`x` を 1 文字でも
    // 含むなら実 ID ではなくプレースホルダとして扱う。
    const suffixRe = bare ? new RegExp(`^${prefix}([0-9nx]{3})$`) : new RegExp(`^${prefix}-([0-9nx]{3})$`);
    const isPlaceholder = (token: string): boolean => {
      const suffix = suffixRe.exec(token)?.[1];
      return suffix !== undefined && /[nx]/.test(suffix);
    };
    for (let i = bodyStart; i < lines.length; i += 1) {
      // AUTOGEN・HTML コメント・コードフェンスは本文の主張ではないので検査対象外にする
      // (code-reviewer 実バグ #4 系。写された行 (AUTOGEN) を台帳が責められないようにする)。
      if (kinds[i] !== 'body') continue;
      const line = lines[i] ?? '';
      for (const token of line.match(pattern) ?? []) {
        if (isPlaceholder(token)) continue;
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
function countCheckableLines(lines: readonly string[], kinds: readonly LineKind[]): number {
  let total = lines.length;
  if (lines[lines.length - 1] === '') total -= 1; // 末尾の改行 1 個は行数に数えない
  for (const kind of kinds) {
    if (kind === 'autogen') total -= 1;
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
      // 定義は行頭セル (`| REQ-nnn | ...`) だけ (code-reviewer 実バグ #3)。本文中の言及
      // (前提列・対応業務列などでの参照) を定義に数えると、他ファイルの ID を裸で参照している
      // だけの doc まで「自分にも定義がある」と誤認し、修飾義務が素通りする。
      for (const token of collectRowDefinedTokens(doc.lines, prefix)) {
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

/** frontmatter id が無い場合だけのフォールバック (ファイル名から拡張子を外しただけ、連番は残る)。 */
const toDocId = (relPath: string): string => relPath.replace(/^.*\//, '').replace(/\.md$/, '');

/**
 * 修飾 ID として書く/認識する文字列。**frontmatter id を優先する** (main 決定、round 3 C4)。
 * ファイル名には先頭連番 (`02-tenancy.md`) が付くが、id は連番を持たない kebab-slug
 * (`id: tenancy`) が正典で、並べ替えても安定する。決定台帳も id 形式で書いている。
 * id が取れない (frontmatter に無い) doc だけファイル名 stem にフォールバックする。
 */
function qualifierFor(relPath: string, relPathToId: ReadonlyMap<string, string>): string {
  return relPathToId.get(relPath) ?? toDocId(relPath);
}

/**
 * トークン直前の語が候補 homeId (frontmatter id **または** ファイル名 stem) のいずれかと完全一致
 * するなら「広義の修飾済み」とみなす (code-reviewer C1、round 3 C4 で id/stem 両対応に修正)。
 * ある案件では `tenancy REQ-114` のように、スラッシュではなく空白 1 個で doc-id を前置く書き
 * 方が多用されている。id と stem の両方を見るのは、既存本文が stem 形式で書かれていても (後方互換)
 * 誤って未修飾と判定して fix-ids が二重修飾で本文を壊さないようにするため。
 */
function isSpaceQualified(
  line: string,
  matchIndex: number,
  homes: readonly string[],
  relPathToId: ReadonlyMap<string, string>,
): boolean {
  const before = line.slice(0, matchIndex);
  const precedingWord = /([A-Za-z0-9][A-Za-z0-9-]*)\s+$/.exec(before)?.[1];
  if (precedingWord === undefined) return false;
  return homes.some((home) => precedingWord === relPathToId.get(home) || precedingWord === toDocId(home));
}

function checkQualifiedIds(
  doc: ResolvedDoc,
  idHomes: ReadonlyMap<string, readonly string[]>,
  idIndexRel: ReadonlyMap<string, string>,
  relPathToId: ReadonlyMap<string, string>,
  refRegex: RegExp,
  relatedRange: readonly [number, number],
  kinds: readonly LineKind[],
  add: AddViolation,
  addFix: (line: number, column: number, token: string, homeId: string) => void,
): void {
  for (let i = doc.meta.bodyStart; i < doc.lines.length; i += 1) {
    // AUTOGEN・HTML コメント・コードフェンスは手で書いた本文の主張ではないので検査対象外にする
    // (code-reviewer 実バグ #1/#10)。分類は 1 か所 (classifyLines) に統一する。
    if (kinds[i] !== 'body') continue;
    const line = doc.lines[i] ?? '';
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
      if (isSpaceQualified(line, matched.index, homes, relPathToId)) continue; // 広義の修飾済み (C1/C4)
      if (homes.length === 1) {
        const home = homes[0] ?? '';
        const homeId = relPathToId.get(home);
        if (homeId === undefined) {
          // home に frontmatter id が無い。修飾は id に統一する方針 (main 決定) なので、
          // stem を書いても checker (idIndexRel は id しか見ない) が解決できない。fix-ids の対象
          // から外し、まず id を付けることを促す (code-reviewer 実バグ #4)。
          add(
            i + 1,
            `他ファイルの ID は修飾 ID (<doc-id>/${token}) で参照する: ${token} は ${home} 由来。${home} に frontmatter id が無いため、id を付けてから修飾する (fix-ids の対象外)`,
          );
        } else {
          add(i + 1, `他ファイルの ID は修飾 ID (<doc-id>/${token}) で参照する: ${token} は ${home} 由来 (例: ${homeId}/${token})`);
          addFix(i + 1, matched.index, token, homeId);
        }
      } else {
        // この番号は複数ファイルのローカル採番で独立に使われている (欠陥ではない)。
        // 裸で参照するとどちらの意味か分からないので、修飾 ID でどの文書のものかを明示させる。
        const examples = homes.map((home) => `${qualifierFor(home, relPathToId)}/${token}`).join(' か ');
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
function checkAcceptedGate(doc: ResolvedDoc, kinds: readonly LineKind[], add: AddViolation): void {
  if (doc.kind !== 'requirements' && doc.kind !== 'feature-brief') return;
  const status = scalar(doc.meta.data, 'status');
  if (status === undefined || !FINAL_STATUSES.has(status)) return;
  for (let i = doc.meta.bodyStart; i < doc.lines.length; i += 1) {
    if (kinds[i] !== 'body') continue; // コードフェンス等の例示は主張ではない (non-blocking N-d)
    const line = doc.lines[i] ?? '';
    const open = line.match(OPEN_ID_RE)?.[0];
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
  kinds: readonly LineKind[],
  add: AddViolation,
): void {
  // decision-log・adr・human-review (この検査自身を解説するガイド) は語彙として
  // 「仮置き」「決定」「OPEN-nnn」「DEC-nnn」を含むのが当然で、自分自身への帰属を求めない。
  // human-review はこの仕組みを人に説明するガイド (実例そのものではなく解説) で、他の kind と
  // 違って本文全体が「OPEN-nnn」「DEC-nnn」という**placeholder 記法の解説**であり、実在の決定・
  // 仮置きへの言及ではない (code-reviewer 実バグ #5)。
  if (doc.kind === 'decision-log' || doc.kind === 'adr' || doc.kind === 'human-review') return;
  for (let i = doc.meta.bodyStart; i < doc.lines.length; i += 1) {
    // AUTOGEN 区間は他文書の行をそのまま写す索引で、手で書いた本文の主張ではない
    // (code-reviewer 実バグ #1)。分類は 1 か所 (classifyLines) に統一する。
    if (kinds[i] !== 'body') continue;
    const line = doc.lines[i] ?? '';
    if (isExemptRelatedRow(i, relatedRange, line)) continue;
    if (/^#{1,6}\s/.test(line)) continue; // 見出し行は主張ではない

    if (hasLiveMatch(line, patterns)) {
      // 3 桁の直後に数字・ハイフン+数字が続くものは部分一致させない (前提修正、OPEN_ID_RE と同じ理由)
      const dec = line.match(/DEC-\d{3}(?!\d)(?!-\d)/)?.[0];
      if (dec === undefined) {
        add(i + 1, `決定の帰属を主張しているが DEC-nnn の参照が無い: ${line.trim()}`);
      } else if (!idHomes.has(dec)) {
        add(i + 1, `${dec} が決定台帳に無い`);
      }
    }

    if (hasLiveOccurrence(line, TENTATIVE_MARK)) {
      const open = line.match(OPEN_ID_RE)?.[0];
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
  kinds: readonly LineKind[],
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
  checkIds(lines, bodyStart, data, template, kinds, add);

  if (template.kind === 'requirements') checkEars(lines, bodyStart, add);
  if (template.kind === 'decision-log') checkDecisionLogRows(lines, bodyStart, add);

  checkArc42(template.kind, data, add, requireKind);

  if (template.lineLimit !== null) {
    const total = countCheckableLines(lines, kinds);
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
      unambiguousFixes: [],
    });

    if (!isDir(templatesDir)) return cannotCheck(`テンプレ置き場が無い: ${rel(templatesDir)}`);
    if (!isDir(docsDir)) return cannotCheck(`docs が無い: ${rel(docsDir)}`);

    const { registry, errors } = loadTemplates(templatesDir);
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
    // relPath → frontmatter id の逆引き。修飾 ID を書く/認識するときは id を正とする (round 3 C4)。
    const relPathToId = new Map<string, string>();
    for (const [id, relPath] of idIndexRel) relPathToId.set(relPath, id);

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
      const docRelPath = relative(docsDir, file);
      const pathKind = kindFromPath(docRelPath);
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
      const registered = registry.get(kind);
      if (registered === undefined) {
        violations.push({
          severity: 'violation',
          message: `未登録の kind: ${kind} (templates/docs にテンプレを作るか kind を直す)`,
          file: relPath,
          line: 1,
        });
        continue;
      }
      checkedCount += 1;
      const template = templateFor(registered, docRelPath);
      const kinds = classifyLines(lines);
      violations.push(...checkDoc(relPath, lines, meta, template, idIndex, requireKind, kinds));
      resolved.push({ relPath, file, lines, meta, kind, template, kinds });
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

    let unambiguousFixes: readonly QualifiedIdFix[] = [];
    if (this.#options.requireHumanReview ?? false) {
      const layer = this.#analyzeHumanReviewLayer(ctx.targetRoot, resolved, idIndexRel, relPathToId);
      violations.push(...layer.violations);
      unambiguousFixes = layer.fixes;
    }

    violations.sort(
      (a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0),
    );
    return { violations, kindCount: registry.size, checkedCount, unmanaged, unambiguousFixes };
  }

  /**
   * 人間レビュー層の横断検査。①地図の網羅 ②決定の帰属 ③仮置きの OPEN 参照 ④修飾 ID。
   * kind 解決が終わった doc の一覧 (resolved) だけを対象にする — 未管理 doc の本文までは追わない。
   */
  #analyzeHumanReviewLayer(
    targetRoot: string,
    resolved: readonly ResolvedDoc[],
    idIndexRel: ReadonlyMap<string, string>,
    relPathToId: ReadonlyMap<string, string>,
  ): { violations: Violation[]; fixes: QualifiedIdFix[] } {
    const violations: Violation[] = [];
    const fixes: QualifiedIdFix[] = [];

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

    // ①-2 地図の網羅 (2 段、docs/explanation/07-context-boundaries.md §8): まとまりの地図が
    // 1 枚も無い案件では何も起きない (既存案件を赤くしない)。
    // (a) 全体の地図が、存在する全部のまとまりの地図をリンクしているか
    // (b) まとまりの地図が、自分のまとまりの feature-brief 全部へリンクしているか
    const contextMapDocs = resolved.filter((doc) => doc.kind === 'context-map');
    if (contextMapDocs.length > 0 && mapDoc !== undefined) {
      const mapTargets = new Set(
        extractLinkTargets(mapDoc.lines, mapDoc.meta.bodyStart)
          .map((target) => resolveLinkAbs(mapDoc.file, targetRoot, target))
          .filter((target): target is string => target !== null),
      );
      for (const contextMap of contextMapDocs) {
        if (!mapTargets.has(contextMap.file)) {
          violations.push({
            severity: 'violation',
            message: `まとまりの地図が 00-map.md からリンクされていない: ${contextMap.relPath}`,
            file: mapDoc.relPath,
            line: 1,
          });
        }
      }
    }
    for (const contextMap of contextMapDocs) {
      const ownContext = readContext(contextMap.kind, contextMap.meta.data);
      const featureBriefs = resolved.filter(
        (doc) => doc.kind === 'feature-brief' && readContext(doc.kind, doc.meta.data) === ownContext,
      );
      if (featureBriefs.length === 0) continue;
      const targets = new Set(
        extractLinkTargets(contextMap.lines, contextMap.meta.bodyStart)
          .map((target) => resolveLinkAbs(contextMap.file, targetRoot, target))
          .filter((target): target is string => target !== null),
      );
      for (const brief of featureBriefs) {
        if (!targets.has(brief.file)) {
          violations.push({
            severity: 'violation',
            message: `feature-brief がまとまりの地図からリンクされていない: ${brief.relPath}`,
            file: contextMap.relPath,
            line: 1,
          });
        }
      }
    }
    // まとまりの地図が 1 枚以上ある案件では、context 無記入の feature-brief はどのまとまりの地図からも
    // 求められずに素通りしてしまう (code-reviewer round 1 non-blocking 3)。「未割り当て」として違反にする。
    if (contextMapDocs.length > 0) {
      for (const brief of resolved) {
        if (brief.kind !== 'feature-brief') continue;
        if (readContext(brief.kind, brief.meta.data) !== SHARED_CONTEXT) continue;
        violations.push({
          severity: 'violation',
          message: '未割り当て: feature-brief に context が無記入 (まとまりの地図がある案件では context を指定する)',
          file: brief.relPath,
          line: 1,
        });
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
      checkDecisionAttribution(doc, idHomes, attributionPatterns, relatedRange, doc.kinds, add);
      if (refRegex !== null) {
        checkQualifiedIds(doc, idHomes, idIndexRel, relPathToId, refRegex, relatedRange, doc.kinds, add, (line, column, token, homeId) => {
          fixes.push({ file: doc.relPath, line, column, token, homeId });
        });
      }
      checkAcceptedGate(doc, doc.kinds, add);
    }

    return { violations, fixes };
  }
}
