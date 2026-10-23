// 設計書のつながりの索引が使う型。定義・辺・節の見出し・索引そのもの。

import type { BandSpec, Direction } from '../TraceConfig.js';
import type { MarkdownTable } from '../../MarkdownTable.js';

export interface TraceDocInput {
  /** repo 直下からの相対パス */
  readonly path: string;
  readonly id: string | null;
  readonly context: string;
  readonly lines: readonly string[];
}

/** ID の定義 1 件。key は `context:token`。同じ key の定義が 2 件以上あれば T1 */
export interface Definition {
  readonly key: string;
  readonly token: string;
  readonly kind: string;
  readonly context: string;
  readonly path: string;
  /** 基準の指紋に使う文書の名前 `context/frontmatter の id`。文書を動かしても変わらない。id が無ければ path */
  readonly docRef: string;
  readonly line: number;
  /** DEC の表の「影響の種類」の値。列が無ければ空 */
  readonly impact: string;
}

/** 辺。declaredBy は、どちらの行の欄に書いてあったか */
export interface Edge {
  readonly up: string;
  readonly down: string;
  readonly declaredBy: Direction;
  readonly path: string;
  readonly line: number;
}

/** 欄に書いてあるが、定義の無い ID (T10) */
export interface Dangling {
  readonly token: string;
  /** 欄に書いてあった形 (`doc-id/ID` か ID)。読めない修飾もここに残る */
  readonly reference: string;
  readonly fromKey: string;
  readonly path: string;
  readonly docRef: string;
  readonly line: number;
}

/** 警告にする指摘 (読めなかった宣言など) */
export interface Notice {
  readonly path: string;
  readonly message: string;
}

export interface Heading {
  readonly text: string;
  readonly level: number;
  readonly line: number;
}

export interface TraceDocIndex {
  readonly path: string;
  readonly bands: readonly BandSpec[];
  readonly headings: readonly Heading[];
  readonly definitions: readonly Definition[];
}

export interface TraceIndex {
  readonly docs: readonly TraceDocIndex[];
  readonly definitions: readonly Definition[];
  /** key → 最初の定義 */
  readonly nodes: ReadonlyMap<string, Definition>;
  readonly edges: readonly Edge[];
  readonly dangling: readonly Dangling[];
  readonly notices: readonly Notice[];
}

/** `trace_columns` を宣言した文書を読んだ結果 */
export interface ParsedDoc {
  readonly input: TraceDocInput;
  readonly tables: readonly MarkdownTable[];
  readonly columns: ReadonlyMap<string, Direction>;
  readonly doc: TraceDocIndex;
}

/** key から定義を引く関数。文書の context → shared → 1 つしか無い context の順に探す */
export type Resolver = (token: string, docId: string | undefined, context: string) => string | undefined;

export type RuleId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11';

/** 規則が見つけた指摘 1 件。warning は落とさず、基準にも入れない */
export interface Finding {
  readonly rule: RuleId;
  readonly level: 'violation' | 'warning';
  /** 対象の ID。ID が無い指摘 (コードの先頭行の欠落など) は `-` */
  readonly id: string;
  readonly path: string;
  /** 指紋に使う文書の名前 (Definition.docRef)。コードなど文書でない指摘は無く、path を使う */
  readonly docRef?: string;
  readonly line?: number;
  readonly message: string;
  /** 同じ規則・ID・ファイルの別の違反を見分ける印 (欠けている向き・相手の ID・重複の相手)。基準の指紋に入る */
  readonly detail?: string;
}
