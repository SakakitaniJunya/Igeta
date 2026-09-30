// node --test dist/core/ProvenanceSidecar.test.js
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSidecar, sidecarPathFor, writeSidecar } from './ProvenanceSidecar.js';
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
});
