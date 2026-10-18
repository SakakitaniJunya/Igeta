// docs-migrate の手引きの写し (テスト仕様 07 の M11)。kind が document-taxonomy・human-review・provenance-workflow の文書は、
// Igeta の手引きを利用 repo へ写したもの。過去の版の手引きと本文 (frontmatter を除き、リンクの行き先・行末の空白・
// 改行の種類を無視) が一致するものだけ消す。一致しないもの (手を入れた写し) は止めて一覧に出す (S3)。
// 値の表はコードに固定する。表は Igeta の版 (タグ v0.1.0〜v0.5.0) の手引きの本文から作った (下の HANDBOOK_BODY_HASHES)。

import { createHash } from 'node:crypto';
import { parseFrontmatter } from '../core/Frontmatter.js';
import { AUDIENCE_ENTRANCE } from '../core/Audience.js';
import { bodyShapeForCompare } from './DocsMigrateLinks.js';

/** 利用 repo に写さない手引きの kind と、版に固定した手引きのファイル名 (ApprovalFilesModule の HANDBOOK_DIR と同じ並び) */
export const HANDBOOK_FILES: ReadonlyMap<string, string> = new Map([
  ['document-taxonomy', '01-document-taxonomy.md'],
  ['human-review', '03-human-review.md'],
  ['provenance-workflow', '04-provenance-workflow.md'],
]);

/** 消した写しのリンクを、版に固定した手引きのパスに置き換える (AGENTS.md と同じ置き場所) */
export const handbookPathOf = (kind: string): string | undefined => {
  const file = HANDBOOK_FILES.get(kind);
  return file === undefined ? undefined : `node_modules/igeta/templates/docs/ai/handbook/how-to/${file}`;
};

/**
 * 過去の版の手引きの本文の SHA256 (bodyShapeForCompare の出力)。kind ごとに、版の数だけ入る。
 * 値は v0.1.0〜v0.5.0 の tag の手引き (kind の付いた .md) から、handbookBodyHash で計算した。
 */
export const HANDBOOK_BODY_HASHES: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  // document-taxonomy: v0.1.0・v0.2.0・v0.3.0・v0.4.0・v0.5.0 と、v0.5.0 の後の変更 (HEAD, 未リリース)
  [
    'document-taxonomy',
    [
      '411e178a079dc65f771f29c4a8a404ac3e9496ce44f8cc7ef60ea79afe044955',
      'b0467346005e0c2ae594e1848051c6bad5dfb2cc9038e7aee2beebf141bdb682',
      '606e2219fb3d0642d7ab449fab71b93211d459c1765d057745d2846d7f132af0',
      '4b902891aa04b5090bdfeebdccfc4ad360407b4cc5fdb85a6b3dffab0958aa7c',
      '08f656c01d2b78cf7ef65de8b69545cca786f6a4867e23b1ce344bea7a7ffeae',
      'bc2f3d9415e5db4dbcda19b43ff90b97c95a2580e8a9c75e81e73adce83ab12e',
    ],
  ],
  // human-review: v0.3.0・v0.4.0・v0.5.0
  [
    'human-review',
    [
      'd38958905ec89a2981b349416883a2dad65d108a5c139eb1ab6748e173ff019a',
      '4c2e66498a489fb1239a936787c609ba22a1838553e54ce1d64e2f34e5b07e8a',
      '9094f4c8eab950e5b6e8e02a2c4b1dea31c60510954e8143f774b351fee07a9e',
    ],
  ],
  // provenance-workflow: v0.3.0・v0.4.0 (同じ本文)・v0.5.0
  [
    'provenance-workflow',
    [
      '57c431034d065c8ad0cf3ec4dfcc5bbdcdea8f8be7b4bd5baa49b2d4fd2cf01e',
      'd3e44c82c0737804a261dac8147196e715f1209248a2978c8f75baccb01da9b0',
    ],
  ],
]);

/** 本文の比べ方の値 (frontmatter を除き、リンクの行き先・行末の空白・改行の種類を無視した SHA256) */
export function handbookBodyHash(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const meta = parseFrontmatter(lines);
  const body = meta === null ? lines.join('\n') : lines.slice(meta.bodyStart).join('\n');
  return createHash('sha256').update(bodyShapeForCompare(body), 'utf8').digest('hex');
}

/** 過去の版 (v0.4.0) の入口の 3 行 (docs/README.md の「読み手別の入口」)。いまの 3 行と 1 字も違わないときだけ置き換える (M14) */
export const OLD_ENTRANCE: readonly string[] = [
  '- **顧客** (非エンジニア): 提出物の章 (`kind: delivery-chapter` / `delivery/`) を `igeta export` で束ねた PDF だけを読む',
  '- **開発者**: 全体の地図 (`00-map.md`) → まとまりの地図 (`kind: context-map` / `contexts/maps/`) → `igeta review-sheet` で今回の変更のレビューシートを読む',
  '- **AI**: 自分のまとまりの正本と隣のまとまりの約束 (`kind: context-contract` / `contexts/contracts/`) だけを読む。対象の一覧は `igeta context-files` で得る',
];

export const NEW_ENTRANCE: readonly string[] = AUDIENCE_ENTRANCE;
