// docs/ の第 1 階層の 3 フォルダ (確定させる人で分ける。ADR-0001)。
// approval-scope が「新しい構成か」を見る (ADR-0008) のと、nonDocPaths の glob がこの配下に当たる設定を
// 違反にする (ADR-0003 決定 6) のが使う。
export const ROLE_FOLDERS = ['docs/person', 'docs/ai', 'docs/client'] as const;
