// `igeta docs-check` が走らせる検査の束。
//
// 索引と参照の整合性 (DocGraphCheck) に、新しい構成 (docs/person・ai・client) の検査 3 本を足す:
// 置き場所 (RoleBoundaryCheck)・1 フォルダの本数 (FolderSizeCheck)・AI の入口 (AgentsEntrypointCheck)。
// 利用 repo は CI で `igeta docs-check` を呼んでいるので、コマンドの中に足せば CI の設定を変えずに効く
// (ADR-0005 決定 3)。旧い構成の repo では、移行を促す警告 1 件のほかは何も増えない。

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';
import { AgentsEntrypointCheck } from './AgentsEntrypointCheck.js';
import { DocGraphCheck } from './DocGraphCheck.js';
import { FolderSizeCheck } from './FolderSizeCheck.js';
import { RoleBoundaryCheck } from './RoleBoundaryCheck.js';

export class DocsCheck implements Check {
  readonly name = 'docs-check';

  readonly #graph = new DocGraphCheck();
  readonly #roleBoundary = new RoleBoundaryCheck();
  readonly #folderSize = new FolderSizeCheck();
  readonly #agentsEntrypoint = new AgentsEntrypointCheck();
  #warnings: string[] = [];

  /** 直近の run() が出した非ブロッキング警告 (索引の未解決参照・旧い構成の移行の促し) */
  get warnings(): readonly string[] {
    return this.#warnings;
  }

  async run(ctx: CheckContext): Promise<readonly Violation[]> {
    const violations = [...(await this.#graph.run(ctx))];
    this.#warnings = [...this.#graph.warnings];
    // docs/ が無いときの報告は DocGraphCheck が持つ。残りの検査は docs/ がある repo にだけ走らせ、同じ指摘を重ねない
    if (!existsSync(join(ctx.targetRoot, 'docs'))) return violations;
    violations.push(...this.#roleBoundary.run(ctx), ...this.#folderSize.run(ctx), ...this.#agentsEntrypoint.run(ctx));
    this.#warnings.push(...this.#roleBoundary.warnings);
    return violations;
  }
}
