// PDF ページの寸法と、Mermaid 図をページ内に収めるための寸法計算。
// PdfRenderer.ts の page.pdf() margin と HtmlDocument.ts の CSS が同じ値を
// 参照するための正 (SoT)。ここを変えれば両方に効く。

/** A4 の縦幅 (mm) */
export const PDF_PAGE_HEIGHT_MM = 297;
export const PDF_MARGIN_TOP_MM = 22;
export const PDF_MARGIN_BOTTOM_MM = 18;
export const PDF_MARGIN_LEFT_MM = 15;
export const PDF_MARGIN_RIGHT_MM = 15;

/** ヘッダ/フッタの余白を除いた、印字できる本文領域の高さ (mm)。 */
export const PRINTABLE_HEIGHT_MM = PDF_PAGE_HEIGHT_MM - PDF_MARGIN_TOP_MM - PDF_MARGIN_BOTTOM_MM;

/** pre.mermaid の内側余白 (mm)。HtmlDocument.ts の `pre` 共通ルールと合わせる。 */
export const MERMAID_PADDING_MM = 3;

/**
 * Mermaid 図 1 個の入れ物 (pre.mermaid, padding 込み) の高さ上限 (mm)。
 * printable height をそのまま使わず、見出し・前後の説明文と同じページに乗る余地を
 * 残す安全マージンを引く。`break-inside: avoid` と組み合わせれば、この高さに収まらない
 * 図は丸ごと次ページへ送られ、新しいページの先頭からは必ず収まる (上限 < printable height)。
 */
const DIAGRAM_SAFETY_MARGIN_MM = 15;
export const MERMAID_CONTAINER_MAX_HEIGHT_MM = PRINTABLE_HEIGHT_MM - DIAGRAM_SAFETY_MARGIN_MM;

/** svg 本体の高さ上限 (mm)。入れ物の高さ上限から padding 分を引く。 */
export const MERMAID_SVG_MAX_HEIGHT_MM = MERMAID_CONTAINER_MAX_HEIGHT_MM - MERMAID_PADDING_MM * 2;
