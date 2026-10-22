// リポジトリルートを静的配信する最小サーバ（外部依存なし）。
// render.js が ../../scripts/locales.mjs を import するため、
// store-screenshots/ ではなくリポジトリルートを配信する。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const EDITOR_DIR = join(REPO_ROOT, 'store-screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export function serveRepo(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      const file = join(REPO_ROOT, path);
      if (!file.startsWith(REPO_ROOT)) throw new Error('path escape');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolveP) => {
    server.listen(port, '127.0.0.1', () => {
      resolveP({ server, port: server.address().port });
    });
  });
}
