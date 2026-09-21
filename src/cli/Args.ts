/** 引数が仕様に合わない。CLI 層が exit 2 (検査不能) に変換する。 */
export class ArgParseError extends Error {}

export interface ArgSpec {
  /** 値を伴うオプション名 (`--root <dir>` なら 'root') */
  readonly valueOptions?: readonly string[];
  /** 値を伴わないオプション名 (`--write` なら 'write') */
  readonly boolOptions?: readonly string[];
}

export interface ParsedArgs {
  has(name: string): boolean;
  get(name: string): string | undefined;
  readonly positional: readonly string[];
}

/**
 * 依存ゼロの最小パーサ。`--name value` と `--flag` のみ扱う。
 * 未知のオプションは黙って無視せず ArgParseError にする (綴り間違いを検査不能として顕在化させる)。
 */
export function parseArgs(argv: readonly string[], spec: ArgSpec = {}): ParsedArgs {
  const valueOptions = new Set(spec.valueOptions ?? []);
  const boolOptions = new Set(spec.boolOptions ?? []);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (boolOptions.has(name)) {
      flags.add(name);
      continue;
    }
    if (valueOptions.has(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ArgParseError(`${arg} に値がありません`);
      }
      values.set(name, value);
      i += 1;
      continue;
    }
    throw new ArgParseError(`不明な引数: ${arg}`);
  }

  return {
    has: (name) => flags.has(name) || values.has(name),
    get: (name) => values.get(name),
    positional,
  };
}
