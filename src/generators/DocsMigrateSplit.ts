// docs-migrate --split-report (テスト仕様 07 の M19)。書き直す段のための報告だけを出す。何も書かない。
// 由来が指す正本の行が、保存値と一致しないもの (provenance-check の stale) を、章・from・いまの場所・
// 再合意の規則に当たるか・取れる操作で並べる。

import { join } from 'node:path';
import { findDeliveryChapters } from '../core/DeliveryBlocks.js';
import { loadIgetaConfig, DEFAULT_IGETA_CONFIG } from '../core/IgetaConfig.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import { buildSourceIndex } from '../core/SourceResolver.js';
import { ProvenanceCheck } from '../checks/ProvenanceCheck.js';

export function splitReportLines(root: string): string[] {
  const docsDir = join(root, 'docs');
  const loaded = loadIgetaConfig(root);
  const rules = 'config' in loaded ? loaded.config.reagreementRules : DEFAULT_IGETA_CONFIG.reagreementRules;
  const index = buildSourceIndex(root, docsDir);
  const lines: string[] = [];
  const stale = new ProvenanceCheck({ targetRoot: root, docsDir }).analyze().violations.filter((v) => /: stale/.test(v.message));
  for (const chapter of findDeliveryChapters(docsDir)) {
    const chapterRel = chapter.slice(root.length + 1);
    const read = readSidecar(chapter);
    if (read.kind !== 'ok') continue;
    for (const entry of read.sidecar.entries) {
      const hit = stale.find((v) => v.file === chapterRel && v.message.startsWith(`${entry.anchor}: stale`));
      if (hit === undefined) continue;
      const fromId = entry.from === null ? null : (entry.from.split('/')[0] ?? null);
      const source = fromId === null ? undefined : index?.byId.get(fromId);
      const kind = source?.kind ?? null;
      const reagree = kind !== null && rules.some((rule) => rule.kind === kind) ? '再合意が要る' : '通知のみ';
      const location = source === undefined ? '(正本が見つからない)' : source.relPath;
      lines.push(
        `SPLIT ${chapterRel} | ${entry.anchor} | from=${entry.from ?? '(なし)'} | いまの場所=${location} | 再合意の規則: ${reagree} | 取れる操作: 取り直して承認し直す / 顧客へ新しい版を出す`,
      );
    }
  }
  return lines;
}
