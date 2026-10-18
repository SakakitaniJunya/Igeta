// docs-migrate の適用 (テスト仕様 07 の M10 の順序 ②〜⑨)。計画 (DocsMigratePlan) どおりに書く。commit も git add もしない。
// 順序: ② fingerprint-rebase → ③ 手引きの写しと消す README を消す → ④ ファイルを移す → ⑤⑥ 内容 (リンク・sourceDoc・location) を書く
//       → ⑦ 空のフォルダを消す → ⑧ 承認の割り当て・決定台帳の索引の雛形 → ⑨ 索引を作り直す。⑩ の完了条件は呼び出し側が測る。

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DocGraphCheck } from '../checks/DocGraphCheck.js';
import { rebaseFingerprints } from './FingerprintRebaseModule.js';
import type { Plan } from './DocsMigratePlan.js';
import type { Violation } from '../core/Report.js';
import { isDrift } from './DocsMigrateVerify.js';

export interface ApplyResult {
  readonly ok: boolean;
  /** 戻せなくなったときの説明 (ok が false のとき) */
  readonly failure?: string;
  /** 索引を作り直したときの、ハードな違反 (DocGraph が返したもの) */
  readonly graphViolations: readonly Violation[];
}

/** 空のフォルダを、下から順に消す (docs/ 自体は残す) */
function removeEmptyDirs(dirAbs: string, keepRoot: string): void {
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    removeEmptyDirs(join(dirAbs, entry.name), keepRoot);
  }
  if (dirAbs !== keepRoot && readdirSync(dirAbs).length === 0) rmdirSync(dirAbs);
}

export async function applyPlan(args: { readonly root: string; readonly igetaRoot: string; readonly plan: Plan }): Promise<ApplyResult> {
  const { root, igetaRoot, plan } = args;
  const docsAbs = join(root, 'docs');

  // ② 指紋を今の正規化の版へ載せ替える (移す前の本文で計算する。リンクを書き換えても指紋は変わらない)
  const rebased = rebaseFingerprints({ targetRoot: root, docsDir: docsAbs, dir: docsAbs });
  if (rebased.violations.length > 0) {
    return {
      ok: false,
      failure: `fingerprint-rebase で読めないものがあった: ${rebased.violations.map((v) => v.message).join(' / ')}`,
      graphViolations: [],
    };
  }

  // ③ 手引きの写し・消す README を消す
  for (const path of plan.deletes.keys()) unlinkSync(join(root, path));

  // ④ ファイルを移す。二段で (移し先が、別の移すファイルの移し元になる場合に備えて、いったん一時の名前へ)
  const pairs = [...plan.moves].map(([from, to], index) => ({
    from: join(root, from),
    to: join(root, to),
    tmp: join(dirname(join(root, from)), `.igeta-migrate-${process.pid}-${index}`),
  }));
  for (const pair of pairs) renameSync(pair.from, pair.tmp);
  for (const pair of pairs) {
    mkdirSync(dirname(pair.to), { recursive: true });
    renameSync(pair.tmp, pair.to);
  }

  // ⑤⑥ 中身 (リンク・frontmatter の参照・sourceDoc・location)。移したあとの場所に書く
  for (const edit of plan.edits) {
    const abs = join(root, edit.newPath);
    const current = readFileSync(abs, 'utf8');
    const next = edit.transform === undefined ? edit.newText : edit.transform(current);
    if (next !== current) writeFileSync(abs, next);
  }

  // 新しく作るファイル (決定台帳の索引の雛形)
  for (const [path, content] of plan.creates) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  // ⑦ 空になったフォルダを消す
  if (existsSync(docsAbs) && statSync(docsAbs).isDirectory()) removeEmptyDirs(docsAbs, docsAbs);

  // ⑧ 承認の割り当て (AGENTS.md・CODEOWNERS)
  for (const write of plan.approvals) {
    mkdirSync(dirname(join(root, write.relPath)), { recursive: true });
    writeFileSync(join(root, write.relPath), write.content);
  }

  // ⑨ 索引を作り直す (docs/dependencies.md・各フォルダの README・ADR の索引)。1 回では不動点にならないことがあるので、
  // 索引のずれが無くなるまで (3 回まで) 作り直す。直後の検査で索引のずれが残れば、完了条件 C3 が落とす
  const ctx = { targetRoot: root, igetaRoot };
  let graph: readonly Violation[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    graph = await new DocGraphCheck({ write: true }).run(ctx);
    const drift = (await new DocGraphCheck().run(ctx)).filter(isDrift);
    if (drift.length === 0) break;
  }
  return { ok: true, graphViolations: graph };
}
