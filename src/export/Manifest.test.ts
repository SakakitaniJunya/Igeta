// node --test dist
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ManifestError, parseManifest } from './Manifest.js';

const workspaces: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'igeta-export-manifest-'));
  workspaces.push(dir);
  return dir;
}

function writeManifest(dir: string, content: unknown): string {
  const path = join(dir, 'deliverable.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}

function writeChapter(dir: string, name: string, content = '# title\n'): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

const VALID_BASE = {
  title: 'サンプル設計書',
  recipient: 'サンプル株式会社 御中',
  issuer: 'CreaNest 株式会社',
  version: '1.0',
  date: '2026-09-29',
  chapters: ['00-intro.md'],
  output: 'out/design-document.pdf',
};

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('parseManifest', () => {
  it('必須項目が揃っていれば絶対パスを解決する', () => {
    const dir = makeWorkspace();
    writeChapter(dir, '00-intro.md');
    const path = writeManifest(dir, VALID_BASE);

    const manifest = parseManifest(path);

    assert.equal(manifest.title, VALID_BASE.title);
    assert.equal(manifest.recipient, 'サンプル株式会社 御中');
    assert.equal(manifest.subtitle, null);
    assert.equal(manifest.chapterPaths.length, 1);
    assert.equal(manifest.chapterPaths[0], join(dir, '00-intro.md'));
    assert.equal(manifest.outputPdfPath, join(dir, 'out', 'design-document.pdf'));
    assert.equal(manifest.outputHtmlPath, join(dir, 'out', 'design-document.html'));
    assert.deepEqual(manifest.forbid, []);
  });

  it('存在しない manifest は ManifestError', () => {
    const dir = makeWorkspace();
    assert.throws(() => parseManifest(join(dir, 'nope.json')), ManifestError);
  });

  it('壊れた JSON は ManifestError', () => {
    const dir = makeWorkspace();
    const path = writeManifest(dir, '{ not json');
    assert.throws(() => parseManifest(path), ManifestError);
  });

  it('必須項目の欠落を全件まとめて報告する', () => {
    const dir = makeWorkspace();
    const path = writeManifest(dir, { output: 'out/x.pdf' });
    try {
      parseManifest(path);
      assert.fail('ManifestError を期待した');
    } catch (error) {
      assert.ok(error instanceof ManifestError);
      const messages = error.messages.join('\n');
      for (const field of ['title', 'recipient', 'issuer', 'version', 'date']) {
        assert.match(messages, new RegExp(field));
      }
      assert.match(messages, /chapters/);
    }
  });

  it('章ファイルが存在しなければ全件まとめて報告する', () => {
    const dir = makeWorkspace();
    writeChapter(dir, '00-intro.md');
    const path = writeManifest(dir, { ...VALID_BASE, chapters: ['00-intro.md', 'missing-a.md', 'missing-b.md'] });
    try {
      parseManifest(path);
      assert.fail('ManifestError を期待した');
    } catch (error) {
      assert.ok(error instanceof ManifestError);
      assert.equal(error.messages.filter((m) => m.includes('章ファイルが存在しない')).length, 2);
      assert.ok(error.messages.some((m) => m.includes('missing-a.md')));
      assert.ok(error.messages.some((m) => m.includes('missing-b.md')));
    }
  });

  it('output が .pdf で終わらなければエラー', () => {
    const dir = makeWorkspace();
    writeChapter(dir, '00-intro.md');
    const path = writeManifest(dir, { ...VALID_BASE, output: 'out/design-document.txt' });
    assert.throws(() => parseManifest(path), ManifestError);
  });

  it('forbid の正規表現が不正ならエラー', () => {
    const dir = makeWorkspace();
    writeChapter(dir, '00-intro.md');
    const path = writeManifest(dir, { ...VALID_BASE, forbid: ['([a-z'] });
    assert.throws(() => parseManifest(path), ManifestError);
  });

  it('forbid が有効な正規表現ならコンパイル済みパターンを返す', () => {
    const dir = makeWorkspace();
    writeChapter(dir, '00-intro.md');
    const path = writeManifest(dir, { ...VALID_BASE, forbid: ['DEC-\\d', 'REQ-\\d'] });
    const manifest = parseManifest(path);
    assert.equal(manifest.forbidPatterns.length, 2);
    assert.equal(manifest.forbidPatterns[0]?.test('DEC-1'), true);
  });
});
