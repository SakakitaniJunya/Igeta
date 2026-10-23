// origin の設計書と基準ファイルを git から読む。T1(b) と「基準が増えていないか」の比べ先。

import { GitError, grepFilesAtRef, listFilesAtRef, mergeBase, readFileAtRef, readFilesAtRef } from '../core/GitRef.js';
import { BASELINE_FILE, parseBaseline } from '../core/trace/Baseline.js';
import type { TraceDocInput } from '../core/trace/TraceIndex.js';
import { isListedDoc, toDocInput } from './TraceLoad.js';

/** ref の時点の、`trace_columns` を宣言した設計書 (候補) と基準 */
interface Snapshot {
  readonly inputs: readonly TraceDocInput[];
  /** 基準ファイルが無ければ undefined (初めて基準を入れる変更) */
  readonly baseline: readonly string[] | undefined;
}

/** origin の先端と、自分の branch との merge-base。比べ先は用途で分ける (T1(b) は両方、基準の増加は merge-base) */
export interface TraceOrigin {
  readonly tip: Snapshot;
  readonly mergeBase: Snapshot;
}

function readSnapshot(root: string, ref: string, isV4: boolean): Snapshot {
  const paths = grepFilesAtRef(root, ref, 'docs', 'trace_columns').filter((path) => path.endsWith('.md') && isListedDoc(path.slice('docs/'.length)));
  const texts = readFilesAtRef(root, ref, paths);
  const inputs = paths.flatMap((path) => toDocInput(path.slice('docs/'.length), texts.get(path) ?? '', isV4) ?? []);
  if (listFilesAtRef(root, ref, BASELINE_FILE).length === 0) return { inputs, baseline: undefined };
  const parsed = parseBaseline(readFileAtRef(root, ref, BASELINE_FILE));
  if ('error' in parsed) throw new GitError(`${ref}:${BASELINE_FILE} が読めない: ${parsed.error}`);
  return { inputs, baseline: parsed.fingerprints };
}

/** ref と HEAD の merge-base の時点・ref の先端の時点を読む。git が読めなければ error (読めないのに「問題なし」にしない) */
export function readOrigin(root: string, ref: string, isV4: boolean): { readonly origin: TraceOrigin } | { readonly error: string } {
  try {
    const base = mergeBase(root, ref, 'HEAD');
    return { origin: { tip: readSnapshot(root, ref, isV4), mergeBase: readSnapshot(root, base, isV4) } };
  } catch (error) {
    if (error instanceof GitError) return { error: error.message };
    throw error;
  }
}
