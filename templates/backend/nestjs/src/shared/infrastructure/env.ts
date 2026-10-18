// 必須の環境変数を読む。無い・空なら起動時に気づけるよう投げる (既定値で黙って進めない)。

export function requireEnv(name: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}
