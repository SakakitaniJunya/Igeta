// origin/main の設計書と基準ファイルを git から読む。T1(b) と「基準が増えていないか」の比較元。

import { GitError, listFilesAtRef, readFileAtRef } from '../core/GitRef.js';
import { BASELINE_FILE, parseBaseline } from '../core/trace/Baseline.js';
import type { TraceDocInput } from '../core/trace/TraceIndex.js';
import { toDocInput } from './TraceLoad.js';

export interface TraceOrigin {
  readonly inputs: readonly TraceDocInput[];
  /** origin に基準ファイルが無ければ undefined (初めて基準を入れる変更) */
  readonly baseline: readonly string[] | undefined;
}

/** ref の時点の docs/ と基準を読む。git が読めなければ error (読めないのに「問題なし」にしない) */
export function readOrigin(root: string, ref: string, isV4: boolean): { readonly origin: TraceOrigin } | { readonly error: string } {
  try {
    const inputs = listFilesAtRef(root, ref, 'docs')
      .filter((path) => path.endsWith('.md'))
      .flatMap((path) => toDocInput(path.slice('docs/'.length), readFileAtRef(root, ref, path), isV4) ?? []);
    const hasBaseline = listFilesAtRef(root, ref, BASELINE_FILE).length > 0;
    if (!hasBaseline) return { origin: { inputs, baseline: undefined } };
    const parsed = parseBaseline(readFileAtRef(root, ref, BASELINE_FILE));
    if ('error' in parsed) return { error: `${ref}:${BASELINE_FILE} が読めない: ${parsed.error}` };
    return { origin: { inputs, baseline: parsed.fingerprints } };
  } catch (error) {
    if (error instanceof GitError) return { error: error.message };
    throw error;
  }
}
