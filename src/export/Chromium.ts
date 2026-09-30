// PDF 化には Playwright が既に落としてある Chromium を使う (playwright-core は自前では
// ブラウザを持たない)。ネットワークからの取得は一切行わず、ローカルのキャッシュを探すだけ。
// 見つからなければ `npx playwright install chromium` を案内して呼び出し側が非 0 終了する。

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const CHROMIUM_DIR_RE = /^chromium-(\d+)$/;

export const PLAYWRIGHT_INSTALL_HINT = 'npx playwright install chromium を実行してください';

function browsersRoot(): string {
  const override = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (override !== undefined && override !== '' && override !== '0') return override;
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Caches', 'ms-playwright');
    case 'win32':
      return join(home, 'AppData', 'Local', 'ms-playwright');
    default:
      return join(home, '.cache', 'ms-playwright');
  }
}

/** chromium-<revision> ディレクトリ配下から実行ファイルを探す。プラットフォームで置き場所が違う。 */
function findExecutableIn(dir: string): string | null {
  const candidates = [
    // macOS (arm64 / intel、Playwright のバージョンにより app 名が異なる)
    ...readdirSync(dir)
      .filter((entry) => entry.startsWith('chrome-mac'))
      .flatMap((entry) => {
        const macDir = join(dir, entry);
        if (!existsSync(macDir) || !statSync(macDir).isDirectory()) return [];
        return readdirSync(macDir)
          .filter((name) => name.endsWith('.app'))
          .map((appName) =>
            join(macDir, appName, 'Contents', 'MacOS', appName.replace(/\.app$/, '')),
          );
      }),
    join(dir, 'chrome-linux', 'chrome'),
    join(dir, 'chrome-win', 'chrome.exe'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** 見つかった中で最新リビジョンの Chromium 実行ファイル。無ければ null。 */
export function findChromiumExecutable(): string | null {
  const root = browsersRoot();
  if (!existsSync(root)) return null;

  const revisions = readdirSync(root)
    .map((name) => ({ name, match: CHROMIUM_DIR_RE.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .map((entry) => ({ name: entry.name, revision: Number(entry.match[1]) }))
    .sort((a, b) => b.revision - a.revision);

  for (const { name } of revisions) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    const executable = findExecutableIn(dir);
    if (executable !== null) return executable;
  }
  return null;
}
