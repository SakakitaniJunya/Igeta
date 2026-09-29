import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocTemplateCheck } from '../checks/DocTemplateCheck.js';

/**
 * 修飾 ID の自動書き換え (non-blocking N3)。DocTemplateCheck が構造化データで持つ
 * `unambiguousFixes` (定義元が 1 件に一意に決まるものだけ) を読んで書き換える (non-blocking N-a:
 * 以前は違反メッセージの文言を正規表現でパースしていたが、文言が変わると追随できず脆かった)。
 * 複数ファイルのローカル採番で曖昧なものは対象外 — 一意に解決できないものを機械が推測で書き換える
 * と、本文の意味を取り違えたまま直ってしまうため。
 *
 * 既定は dry-run (plan() を呼ぶだけ)。実際に書き込むのは write() を呼んだときだけ。
 * Spec: templates/docs/guides/03-human-review.md §4
 */

export interface FixIdsPlanEntry {
  readonly file: string;
  readonly line: number;
  readonly before: string;
  readonly after: string;
}

export interface FixIdsWriteResult {
  /** 実際に書き込んだ計画 */
  readonly written: readonly FixIdsPlanEntry[];
  /**
   * plan() 作成後にファイルが変わっていて before と一致しなかった計画 (non-blocking N-b)。
   * これらは書き込まない。1 件でもあれば呼び出し元は exit 2 (検査不能) にする。
   */
  readonly drifted: readonly FixIdsPlanEntry[];
}

export interface FixIdsOptions {
  readonly targetRoot: string;
  readonly igetaRoot: string;
  readonly docsDir?: string;
  readonly templatesDir?: string;
}

export class FixIdsModule {
  readonly #options: FixIdsOptions;

  constructor(options: FixIdsOptions) {
    this.#options = options;
  }

  /** 書き換え計画を作るだけ。ファイルには一切触れない (dry-run の実体)。 */
  plan(): readonly FixIdsPlanEntry[] {
    const result = new DocTemplateCheck({
      docsDir: this.#options.docsDir,
      templatesDir: this.#options.templatesDir,
      requireKind: true,
      requireHumanReview: true,
    }).analyze({ targetRoot: this.#options.targetRoot, igetaRoot: this.#options.igetaRoot });

    const fixesByLine = new Map<string, { file: string; line: number; fixes: Array<{ token: string; homeId: string }> }>();
    for (const fix of result.unambiguousFixes) {
      const key = `${fix.file}\u0000${fix.line}`;
      const entry = fixesByLine.get(key) ?? { file: fix.file, line: fix.line, fixes: [] };
      entry.fixes.push({ token: fix.token, homeId: fix.homeId });
      fixesByLine.set(key, entry);
    }

    const plan: FixIdsPlanEntry[] = [];
    for (const { file, line, fixes } of fixesByLine.values()) {
      const abs = join(this.#options.targetRoot, file);
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      const before = lines[line - 1] ?? '';
      let after = before;
      for (const { token, homeId } of fixes) {
        // すでに <doc-id>/TOKEN の形式で修飾されている箇所は変えない (裸の出現だけを直す)
        after = after.replace(new RegExp(`(?<![A-Za-z0-9-]/)\\b${token}\\b`, 'g'), `${homeId}/${token}`);
      }
      if (after !== before) plan.push({ file, line, before, after });
    }
    return plan.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }

  /**
   * plan() の結果を実際に書き込む。書き込む直前に該当行を再読み込みし、entry.before と一致する
   * ものだけを書く (non-blocking N-b)。plan() から write() までの間にファイルが変わっていた場合、
   * ずれた計画は drifted に積んで書かない (黙って上書きしない)。
   */
  write(plan: readonly FixIdsPlanEntry[]): FixIdsWriteResult {
    const byFile = new Map<string, FixIdsPlanEntry[]>();
    for (const entry of plan) {
      const list = byFile.get(entry.file) ?? [];
      list.push(entry);
      byFile.set(entry.file, list);
    }
    const written: FixIdsPlanEntry[] = [];
    const drifted: FixIdsPlanEntry[] = [];
    for (const [file, entries] of byFile) {
      const abs = join(this.#options.targetRoot, file);
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      let changed = false;
      for (const entry of entries) {
        const current = lines[entry.line - 1] ?? '';
        if (current !== entry.before) {
          drifted.push(entry);
          continue;
        }
        lines[entry.line - 1] = entry.after;
        written.push(entry);
        changed = true;
      }
      if (changed) writeFileSync(abs, lines.join('\n'));
    }
    return { written, drifted };
  }
}
