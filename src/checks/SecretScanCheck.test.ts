// node --test dist
// fixture は一時ディレクトリに生成する。検出パターンを直書きするため、
// このファイル自身は SecretScanCheck の走査対象から外れている。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecretScanCheck } from './SecretScanCheck.js';
import type { SecretScanOptions } from './SecretScanCheck.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import { IGETA_ROOT } from '../core/Paths.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-secret-'));
  workspaces.push(root);
  return root;
}

function writeFile(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function runCheck(root: string, options: SecretScanOptions = {}): Report {
  const report = new Report();
  report.addAll(new SecretScanCheck(options).run({ targetRoot: root, igetaRoot: IGETA_ROOT }));
  return report;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('SecretScanCheck', () => {
  let root = '';
  beforeEach(() => {
    root = makeRoot();
  });

  it('機密が無ければ Ok', () => {
    writeFile(root, 'README.md', '# 設計書テンプレート\n\n普通の文章。\n');
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(report.isEmpty);
  });

  it('社内制約 ID は既定では検出しない', () => {
    writeFile(root, 'docs/rule.md', '前段\n本リポジトリは C-123 に従う。\n');
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(report.isEmpty);
  });

  it('社内制約 ID は internalIds で検出する', () => {
    writeFile(root, 'docs/rule.md', '前段\n本リポジトリは C-123 に従う。\n');
    const report = runCheck(root, { internalIds: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /社内制約 ID\): C-123/);
    assert.match(report.format(), /docs\/rule\.md:2/);
  });

  it('internalIds の有無に関わらずトークンは検出する', () => {
    const token = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
    writeFile(root, 'docs/rule.md', `C-123 の配線\nTOKEN=${token}\n`);

    const off = runCheck(root);
    assert.equal(off.exitCode, ExitCode.Violation, off.format());
    assert.equal(off.violations.length, 1, off.format());
    assert.match(off.format(), /トークン\): ghp_A1b2…/);
    assert.doesNotMatch(off.format(), /社内制約 ID/);

    const on = runCheck(root, { internalIds: true });
    assert.equal(on.exitCode, ExitCode.Violation, on.format());
    assert.equal(on.violations.length, 2, on.format());
    assert.match(on.format(), /トークン\): ghp_A1b2…/);
    assert.match(on.format(), /社内制約 ID\): C-123/);
  });

  it('ローカル絶対パスを検出する', () => {
    writeFile(root, 'scripts/run.sh', 'cd /Users/sakaki/project/igeta && npm test\n');
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /ローカル絶対パス\): \/Users\/sakaki\/project\/igeta/);
  });

  it('メールアドレスを検出する', () => {
    writeFile(root, 'docs/contact.md', '担当: taro.yamada@creanest.co.jp\n');
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /メールアドレス\): taro\.yamada@creanest\.co\.jp/);
  });

  it('VCS URL のユーザ部はメールアドレスとみなさない', () => {
    writeFile(
      root,
      'package-lock.json',
      '  "resolved": "git+ssh://git@github.com/acme/tool.git#0123456789abcdef"\n',
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('トークンらしき文字列を検出する (値は伏せる)', () => {
    writeFile(
      root,
      '.env.sample',
      [
        'GITHUB_TOKEN=ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
        'GITHUB_FINE=github_pat_11ABCDEFG0aBcDeFgHiJkLmNoP',
        'OPENAI_KEY=sk-AbCdEfGhIjKlMnOpQrStUvW1234567890',
        'GOOGLE_KEY=AIzaSyB1cD3fG5hJ7kL9mN0pQ2rS4tU6vW8yZ0a',
        'SLACK_BOT=xoxb-1234567890-ABCDEFGHIJKL',
      ].join('\n'),
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.equal(report.violations.length, 5, report.format());
    for (const violation of report.violations) {
      assert.match(violation.message, /トークン\)/);
    }
    // 生値は出さない
    assert.doesNotMatch(report.format(), /Q7r8/);
    assert.match(report.format(), /ghp_A1b2… \(40 文字\)/);
  });

  it('禁止語リストの語を検出する', () => {
    writeFile(root, 'deny-list/names.txt', '# 顧客名\n\nAcme商事\n');
    writeFile(root, 'docs/case.md', '本事例は Acme商事 向けに構築した。\n');
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /禁止語\): Acme商事/);
    assert.equal(report.violations.length, 1, report.format());
  });

  it('禁止語リストは denyListPath で差し替えられる', () => {
    writeFile(root, 'custom/words.txt', 'Contoso\n');
    writeFile(root, 'docs/case.md', 'contoso 様の案件。\n');
    const report = runCheck(root, { denyListPath: join(root, 'custom', 'words.txt') });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /禁止語\): contoso/);
  });

  it('denyListPath を明示して存在しなければ CannotCheck', () => {
    writeFile(root, 'README.md', '# ok\n');
    const report = runCheck(root, { denyListPath: join(root, 'nowhere.txt') });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /禁止語リストが存在しない/);
  });

  it('プレースホルダは検出しない', () => {
    writeFile(
      root,
      'docs/placeholder.md',
      [
        'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx',
        'OPENAI_KEY=sk-your-key-goes-here-0000000',
        'path: /Users/your-name/project/app',
        'mail: user@example.com',
        'MAIL=YOUR_ADDRESS@EXAMPLE.COM',
        '参照: <C-123>',
      ].join('\n'),
    );
    // 制約 ID のプレースホルダも見るため、ここだけ任意規則を有効にする
    const report = runCheck(root, { internalIds: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(report.isEmpty);
  });

  it('別体系の ID や kebab-case を誤検出しない', () => {
    writeFile(
      root,
      'docs/ids.md',
      '| SEC-001 | XC-101 | INF-101 | ARC-001 |\ntask-management-system-v2 を採用する。\n',
    );
    writeFile(root, 'package.json', '{ "devDependencies": { "@types/node": "^22.20.4" } }\n');
    const report = runCheck(root, { internalIds: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('除外ディレクトリは走査しない', () => {
    const secret = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8\n';
    writeFile(root, 'node_modules/pkg/index.js', secret);
    writeFile(root, 'dist/cli.js', secret);
    writeFile(root, 'coverage/lcov.info', secret);
    writeFile(root, '.git/config', secret);
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('バイナリファイルは読み飛ばす', () => {
    writeFile(root, 'assets/logo.bin', 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8\u0000\u0001\n');
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('自分自身とそのテストは走査対象外', () => {
    const secret = 'const sample = "/Users/sakaki/project/igeta";\n';
    writeFile(root, 'src/checks/SecretScanCheck.ts', secret);
    writeFile(root, 'src/checks/SecretScanCheck.test.ts', secret);
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });
});
