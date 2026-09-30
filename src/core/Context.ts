// frontmatter `context: <kebab>` (業務のまとまり) を読む共通ロジック。
// Spec: docs/explanation/07-context-boundaries.md §1
//
// 無記入は `shared` (共有) — 既存文書が全部 context 未記入のまま境界検査に引っかからないようにする。
// `delivery-chapter` は対象外 (由来層が別途管理し、複数 context を要約するのが前提のため)。frontmatter に
// 誤って `context` を書いていても読まず、常に `shared` として扱う (この kind には適用しない)。
//
// 読み取りは core/Frontmatter.ts 経由のみ (DocGraphCheck の自前パーサは別レイヤなので触らない)。

import type { FrontmatterData } from './Frontmatter.js';
import { scalar } from './Frontmatter.js';

/** 未記入・delivery-chapter のときの既定値。 */
export const SHARED_CONTEXT = 'shared';

/**
 * frontmatter の `context` を読む。kind が `delivery-chapter` なら常に SHARED_CONTEXT を返す
 * (フィールドの有無に関わらず適用しない)。
 */
export function readContext(kind: string | null, data: FrontmatterData): string {
  if (kind === 'delivery-chapter') return SHARED_CONTEXT;
  const raw = scalar(data, 'context');
  return raw === undefined || raw === '' ? SHARED_CONTEXT : raw;
}
