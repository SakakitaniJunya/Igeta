// 指紋の載せ替え・行の移動のテストが共有する fixture (テスト本体ではない。`*.test.js` だけが実行される)。
//
// v2 の時代に書かれた repo を作る: 由来 sidecar (3 エントリ・承認済み) と合意台帳 (1 提出・承認済み) が、
// v2 の指紋 (`normalizationVersion: 2`、台帳の行は版の項目なし) を持つ。本文には相対リンクがあり、
// 節と行の両方・章と正本の両方がリンクを含む。保存値は computeFingerprint(…, 2) で独立に計算するので、
// v2 の実装が残っていること自体も fixture が使っている。

import { mkdirSync, mkdtempSync, renameSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { LEDGER_FILENAME, ledgerPathFor } from '../core/AgreementLedger.js';
import { extractDeliveryBlocks } from '../core/DeliveryBlocks.js';
import { computeFingerprint } from '../core/Fingerprint.js';
import type { ProvenanceEntry, ProvenanceSidecar } from '../core/ProvenanceSidecar.js';
import { readSidecar, sidecarPathFor, writeSidecar } from '../core/ProvenanceSidecar.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import { chapterBody } from './AgreementRecordModule.js';

const workspaces: string[] = [];

/** `after(cleanupWorkspaces)` で呼ぶ。 */
export function cleanupWorkspaces(): void {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
}

export function makeRoot(prefix = 'igeta-rebase-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  workspaces.push(root);
  return root;
}

export function write(root: string, rel: string, content: string): string {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

export const SUBMISSION = 'docs/delivery/design-document';
export const CHAPTER = `${SUBMISSION}/01-reservation.md`;
export const ROW_FROM = 'reservation-flow/REQ-101';
export const SECTION_FROM = 'reservation-flow#2. 補足';
export const ANCHOR_ROW = '1. 予約の受付';
export const ANCHOR_SECTION = '2. 補足';
export const ANCHOR_NO_SOURCE = '3. ご挨拶';

/** 行 REQ-101 (リンクを含む)。状態の列を足す前の行。 */
export const ROW_101 = '| REQ-101 | 予約は 30 日前まで受け付ける ([用語集](../glossary/terms.md#予約)) | 備考 A |';
export const ROW_102 = '| REQ-102 | キャンセルは [規約](./policy.md) に従う | 備考 B |';

/** 正本。節 `2. 補足` にもリンクがある。 */
export function reservationDoc(overrides: { row101?: string; header?: string; separator?: string; row102?: string; supplement?: string } = {}): string {
  return [
    '---', 'id: reservation-flow', 'kind: requirements', 'status: fixed', 'depends_on: []', '---', '',
    '# 要件', '',
    '## 1. 機能要件', '',
    overrides.header ?? '| ID | 要件 | 備考 |',
    overrides.separator ?? '|---|---|---|',
    overrides.row101 ?? ROW_101,
    overrides.row102 ?? ROW_102,
    '',
    '## 2. 補足', '',
    overrides.supplement ?? '詳しくは [規約](./policy.md#キャンセル) と [外部](https://example.com/x) を参照。',
    '',
  ].join('\n');
}

export const POLICY_DOC = ['---', 'id: cancel-policy', 'kind: requirements', 'status: fixed', 'depends_on: []', '---', '', '# 規約', '', '## キャンセル', '', '規約の本文。', ''].join('\n');
export const TERMS_DOC = ['---', 'id: glossary-terms', 'kind: glossary', 'status: fixed', 'depends_on: []', '---', '', '# 用語集', '', '## 予約', '', '予約の定義。', ''].join('\n');

/** 章。3 つの節すべてがリンクを含み、章の文書から見た相対パスで書いてある。 */
export function chapterDoc(overrides: { link1?: string; link2?: string; link3?: string } = {}): string {
  return [
    '---', 'id: chapter-reservation', 'kind: delivery-chapter', 'status: draft', 'depends_on: []', '---', '',
    '# 予約', '',
    '## 1. 予約の受付', '',
    `予約は 30 日前まで受け付けます。詳しくは [要件](${overrides.link1 ?? '../../requirements/reservation.md#機能要件'}) を参照。`, '',
    '## 2. 補足', '',
    `補足です。[規約](${overrides.link2 ?? '../../requirements/policy.md'}) に従います。`, '',
    '## 3. ご挨拶', '',
    `ご挨拶です。[用語集](${overrides.link3 ?? '../../glossary/terms.md'}) もご覧ください。`, '',
    '## 関連', '',
    '| 区分 | 文書 |', '|---|---|', '| 上流 | 社内の文書 |', '',
  ].join('\n');
}

export const MANIFEST = JSON.stringify({
  title: 'サンプル設計書', issuer: 'サンプル開発株式会社', version: '1.0', date: '2026-01-10',
  chapters: ['01-reservation.md'], output: 'out/design.pdf',
});

export interface LegacyRepo {
  readonly root: string;
  readonly docsDir: string;
  readonly chapterPath: string;
  readonly submissionDir: string;
  /** 台帳に書いた行 (v2 の時代の形。書いた順) */
  readonly ledgerLines: readonly string[];
}

/** v2 の時代の repo: 正本・章・manifest と、v2 の指紋を持つ由来 sidecar と合意台帳 (1.0 を提出して承認済み)。 */
export function makeLegacyRepo(): LegacyRepo {
  const root = makeRoot();
  write(root, 'docs/requirements/reservation.md', reservationDoc());
  write(root, 'docs/requirements/policy.md', POLICY_DOC);
  write(root, 'docs/glossary/terms.md', TERMS_DOC);
  const chapterPath = write(root, CHAPTER, chapterDoc());
  write(root, `${SUBMISSION}/deliverable.json`, MANIFEST);

  const index = buildSourceIndex(root, join(root, 'docs'));
  if (index === null) throw new Error('fixture: docs の索引が作れない');
  const rowText = textOf(resolveSource(index, ROW_FROM));
  const sectionText = textOf(resolveSource(index, SECTION_FROM));
  const content = readFileSync(chapterPath, 'utf8');
  const extracted = extractDeliveryBlocks(content, CHAPTER);
  if (extracted.kind !== 'ok') throw new Error('fixture: 章の塊が取れない');
  const greeting = extracted.blocks.find((b) => b.anchor === ANCHOR_NO_SOURCE);
  if (greeting === undefined) throw new Error('fixture: ご挨拶の節が無い');

  const common = { capturedBy: 'agent:writer', capturedAt: '2026-09-28', acceptedBy: 'reviewer@example.com', acceptedAt: '2026-09-29', normalizationVersion: 2 } as const;
  const entries: ProvenanceEntry[] = [
    { anchor: ANCHOR_ROW, from: ROW_FROM, fingerprint: computeFingerprint(rowText, 2), ...common },
    { anchor: ANCHOR_SECTION, from: SECTION_FROM, fingerprint: computeFingerprint(sectionText, 2), ...common },
    { anchor: ANCHOR_NO_SOURCE, from: null, reason: 'ご挨拶、由来を持たない', blockFingerprint: computeFingerprint(greeting.text, 2), ...common },
  ];
  const sidecar: ProvenanceSidecar = { sourceDoc: CHAPTER, entries };
  writeSidecar(chapterPath, sidecar);

  // 版の項目 (normalizationVersion) ができる前の台帳の行
  const exportLine = JSON.stringify({
    event: 'export', version: '1.0', date: '2026-01-10', manifest: 'deliverable.json', omitSections: ['関連'],
    chapters: [{
      file: '01-reservation.md',
      chapterFingerprint: computeFingerprint(chapterBody(content, CHAPTER, ['関連']), 2),
      sources: [
        { from: ROW_FROM, fingerprint: computeFingerprint(rowText, 2) },
        { from: SECTION_FROM, fingerprint: computeFingerprint(sectionText, 2) },
      ],
    }],
  });
  const approveLine = JSON.stringify({ event: 'approve', targetVersion: '1.0', approvedBy: '発注側の責任者', approvedAt: '2026-01-12' });
  const ledgerLines = [exportLine, approveLine];
  write(root, `${SUBMISSION}/${LEDGER_FILENAME}`, `${ledgerLines.join('\n')}\n`);

  return { root, docsDir: join(root, 'docs'), chapterPath, submissionDir: join(root, SUBMISSION), ledgerLines };
}

function textOf(resolution: ReturnType<typeof resolveSource>): string {
  if (resolution.kind === 'missing') throw new Error('fixture: 由来の from が解決できない');
  return resolution.text;
}

export function readLedgerBytes(repo: { submissionDir: string }): string {
  return readFileSync(ledgerPathFor(repo.submissionDir), 'utf8');
}

export function readEntries(chapterPath: string): readonly ProvenanceEntry[] {
  const result = readSidecar(chapterPath);
  if (result.kind !== 'ok') throw new Error(`fixture: sidecar が読めない (${sidecarPathFor(chapterPath)})`);
  return result.sidecar.entries;
}

/**
 * docs-migrate が行う移動を真似る (本物の docs-migrate はまだ無い。ここでは fixture のパスに決め打ちで書き換える):
 *   docs/requirements → docs/ai/requirements、docs/glossary → docs/ai/glossary、
 *   docs/delivery/design-document → docs/client/delivery/design-document (章・由来・台帳・manifest ごと)。
 * 動かすと章の相対リンクは深さが変わるので、章のリンクだけを書き換える (正本どうしのリンクは相対位置が変わらない)。
 */
export function relocate(repo: { readonly root: string }): { readonly chapterPath: string; readonly submissionDir: string; readonly docsDir: string } {
  const root = repo.root;
  mkdirSync(join(root, 'docs/ai'), { recursive: true });
  mkdirSync(join(root, 'docs/client/delivery'), { recursive: true });
  renameSync(join(root, 'docs/requirements'), join(root, 'docs/ai/requirements'));
  renameSync(join(root, 'docs/glossary'), join(root, 'docs/ai/glossary'));
  renameSync(join(root, SUBMISSION), join(root, 'docs/client/delivery/design-document'));
  const chapterPath = join(root, 'docs/client/delivery/design-document/01-reservation.md');
  const sidecar = readSidecar(chapterPath);
  if (sidecar.kind !== 'ok') throw new Error('fixture: 動かした後の sidecar が読めない');
  writeSidecar(chapterPath, { ...sidecar.sidecar, sourceDoc: relative(root, chapterPath) });
  writeFileSync(
    chapterPath,
    chapterDoc({
      link1: '../../../ai/requirements/reservation.md#機能要件',
      link2: '../../../ai/requirements/policy.md',
      link3: '../../../ai/glossary/terms.md',
    }),
  );
  return { chapterPath, submissionDir: join(root, 'docs/client/delivery/design-document'), docsDir: join(root, 'docs') };
}

/** 台帳の行を JSON として読む (追記された行の中身を確かめる)。 */
export function parseLedgerLines(bytes: string): Record<string, unknown>[] {
  return bytes
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
