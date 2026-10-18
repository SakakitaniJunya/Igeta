/** vitest の JSON 出力 (`--reporter=json`) の集計。emulator の spec の skip だけを「許される skip」と見なす。 */

export interface VitestSkip {
  readonly file: string;
  readonly title: string;
  readonly reason: string;
  readonly allowed: boolean;
}

export interface VitestSummary {
  readonly files: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: readonly VitestSkip[];
}

interface AssertionResult {
  readonly status?: string;
  readonly title?: string;
  readonly fullName?: string;
}

interface FileResult {
  readonly name?: string;
  readonly status?: string;
  readonly assertionResults?: readonly AssertionResult[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function summarizeVitestJson(json: unknown, requireEmulator: boolean): VitestSummary {
  const results: readonly FileResult[] = isRecord(json) && Array.isArray(json['testResults']) ? (json['testResults'] as FileResult[]) : [];
  let passed = 0;
  let failed = 0;
  const skipped: VitestSkip[] = [];
  for (const file of results) {
    const name = file.name ?? '(不明なファイル)';
    const isEmulator = /\.emulator\.spec\./.test(name);
    const assertions = file.assertionResults ?? [];
    for (const test of assertions) {
      if (test.status === 'passed') passed += 1;
      else if (test.status === 'failed') failed += 1;
      else {
        const reason = isEmulator
          ? requireEmulator
            ? 'emulator の spec (--require-emulator あり: skip は許さない)'
            : 'emulator の spec (--require-emulator なし)'
          : '理由不明の skip';
        skipped.push({ file: name, title: test.fullName ?? test.title ?? '', reason, allowed: isEmulator && !requireEmulator });
      }
    }
    // 読み込みで落ちたファイル (テストが 1 件も無いのに failed)
    if (file.status === 'failed' && assertions.length === 0) failed += 1;
  }
  return { files: results.length, passed, failed, skipped };
}
