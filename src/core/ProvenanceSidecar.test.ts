// node --test dist/core/ProvenanceSidecar.test.js
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSidecar, sidecarPathFor, withoutRebaseTrace, writeSidecar } from './ProvenanceSidecar.js';
import type { ProvenanceSidecar } from './ProvenanceSidecar.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('ProvenanceSidecar', () => {
  let root: string;
  let chapterPath: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'igeta-sidecar-'));
    workspaces.push(root);
    chapterPath = join(root, '02-reservation.md');
    writeFileSync(chapterPath, '# 章');
  });

  it('sidecar が無ければ absent', () => {
    assert.deepEqual(readSidecar(chapterPath), { kind: 'absent' });
  });

  it('sidecarPathFor は拡張子だけ書き換える', () => {
    assert.equal(sidecarPathFor(chapterPath), join(root, '02-reservation.provenance.json'));
  });

  it('書いて読み返すと同じ内容になる (from あり・無し両方)', () => {
    const sidecar: ProvenanceSidecar = {
      sourceDoc: 'docs/delivery/design-document/02-reservation.md',
      entries: [
        {
          anchor: '1. 予約の受付',
          from: 'reservation-flow/REQ-114',
          fingerprint: 'sha256:aaaa',
          capturedBy: 'agent:writer',
          capturedAt: '2026-09-28',
          acceptedBy: 'reviewer@example.com',
          acceptedAt: '2026-09-29',
          normalizationVersion: 1,
        },
        {
          anchor: '2. ご挨拶',
          from: null,
          reason: '挨拶文、由来を持たない',
          blockFingerprint: 'sha256:bbbb',
          capturedBy: 'agent:writer',
          capturedAt: '2026-09-28',
          normalizationVersion: 1,
        },
      ],
    };
    writeSidecar(chapterPath, sidecar);
    const result = readSidecar(chapterPath);
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.deepEqual(result.sidecar, sidecar);
  });

  it('CannotCheck: JSON が壊れている', () => {
    writeFileSync(sidecarPathFor(chapterPath), '{ not json');
    const result = readSidecar(chapterPath);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: sourceDoc が無い', () => {
    writeFileSync(sidecarPathFor(chapterPath), JSON.stringify({ entries: [] }));
    const result = readSidecar(chapterPath);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: from: null なのに reason が無い', () => {
    writeFileSync(
      sidecarPathFor(chapterPath),
      JSON.stringify({
        sourceDoc: 'x.md',
        entries: [{ anchor: 'a', from: null, blockFingerprint: 'sha256:x', capturedBy: 'x', capturedAt: '2026-01-01', normalizationVersion: 1 }],
      }),
    );
    const result = readSidecar(chapterPath);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: from ありなのに fingerprint が無い', () => {
    writeFileSync(
      sidecarPathFor(chapterPath),
      JSON.stringify({
        sourceDoc: 'x.md',
        entries: [{ anchor: 'a', from: 'doc/REQ-001', capturedBy: 'x', capturedAt: '2026-01-01', normalizationVersion: 1 }],
      }),
    );
    const result = readSidecar(chapterPath);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: capturedBy が無い', () => {
    writeFileSync(
      sidecarPathFor(chapterPath),
      JSON.stringify({
        sourceDoc: 'x.md',
        entries: [{ anchor: 'a', from: 'doc/REQ-001', fingerprint: 'sha256:x', capturedAt: '2026-01-01', normalizationVersion: 1 }],
      }),
    );
    const result = readSidecar(chapterPath);
    assert.equal(result.kind, 'invalid');
  });

  it('読んで書き戻しても、項目の並びが変わらない (触らない項目の行が差分に出ない)。知らない項目は落とす', () => {
    const path = sidecarPathFor(chapterPath);
    const entry = {
      acceptedAt: '2026-09-29', anchor: '1. 予約', from: 'doc/REQ-1', fingerprint: 'sha256:a', capturedBy: 'agent:writer',
      acceptedBy: 'reviewer@example.com', capturedAt: '2026-09-28', normalizationVersion: 2, unknownKey: 'x',
    };
    writeFileSync(path, `${JSON.stringify({ sourceDoc: 'x.md', entries: [entry] }, null, 2)}\n`);
    const read = readSidecar(chapterPath);
    assert.equal(read.kind, 'ok');
    if (read.kind !== 'ok') return;
    writeSidecar(chapterPath, read.sidecar);
    const after = JSON.parse(readFileSync(path, 'utf8')) as { entries: Record<string, unknown>[] };
    const { unknownKey, ...expected } = entry;
    assert.equal(unknownKey, 'x');
    assert.equal(JSON.stringify(after.entries[0]), JSON.stringify(expected));
  });

  describe('載せ替えの記録 (rebasedFrom / rebasedAt / rebasedBy)', () => {
    const rebased: ProvenanceSidecar = {
      sourceDoc: 'docs/delivery/design-document/02-reservation.md',
      entries: [
        {
          anchor: '1. 予約の受付',
          from: 'reservation-flow/REQ-114',
          fingerprint: 'sha256:3333',
          capturedBy: 'agent:writer',
          capturedAt: '2026-09-28',
          acceptedBy: 'reviewer@example.com',
          acceptedAt: '2026-09-29',
          normalizationVersion: 3,
          rebasedFrom: 'sha256:2222',
          rebasedAt: '2026-10-02',
          rebasedBy: 'igeta',
        },
        {
          anchor: '2. ご挨拶',
          from: null,
          reason: '挨拶文',
          blockFingerprint: 'sha256:5555',
          capturedBy: 'agent:writer',
          capturedAt: '2026-09-28',
          normalizationVersion: 3,
          rebasedFrom: 'sha256:4444',
          rebasedAt: '2026-10-02',
          rebasedBy: 'igeta',
        },
      ],
    };

    it('書いて読み返すと、載せ替えの記録も残る (from あり・無し両方)', () => {
      writeSidecar(chapterPath, rebased);
      const result = readSidecar(chapterPath);
      assert.equal(result.kind, 'ok');
      if (result.kind === 'ok') assert.deepEqual(result.sidecar, rebased);
    });

    it('CannotCheck: 載せ替えの記録の形が不正 (空文字・文字列でない)', () => {
      for (const bad of [{ rebasedFrom: '' }, { rebasedAt: 20261002 }, { rebasedBy: null }]) {
        writeFileSync(
          sidecarPathFor(chapterPath),
          JSON.stringify({
            sourceDoc: 'x.md',
            entries: [{ anchor: 'a', from: 'doc/REQ-001', fingerprint: 'sha256:x', capturedBy: 'x', capturedAt: '2026-01-01', normalizationVersion: 3, ...bad }],
          }),
        );
        assert.equal(readSidecar(chapterPath).kind, 'invalid', JSON.stringify(bad));
      }
    });

    it('withoutRebaseTrace: 載せ替えの記録だけを外し、他の項目 (承認を含む) は残す', () => {
      const entry = rebased.entries[0];
      assert.ok(entry !== undefined && entry.from !== null);
      const stripped = withoutRebaseTrace(entry);
      assert.deepEqual(Object.keys(stripped).sort(), ['acceptedAt', 'acceptedBy', 'anchor', 'capturedAt', 'capturedBy', 'fingerprint', 'from', 'normalizationVersion']);
      assert.equal(stripped.fingerprint, 'sha256:3333');
    });
  });
});
