// 起動に必須の環境変数の検査。無い・空なら起動で落とす (原則: 値を仮定しない)。
// module ごとの設定は、その module の index.ts が読む。ここは requireEnv だけ。

export type Env = Readonly<Record<string, string | undefined>>;

export function requireEnv(key: string, env: Env = process.env): string {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(`missing required env var: ${key}`);
  }
  return value;
}
