// node --test dist/core/AgreementLedger.test.js
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendLedgerEvent, ledgerPathFor, readLedger } from './AgreementLedger.js';
import type { AgreementEvent } from './AgreementLedger.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yatsu-ledger-'));
  workspaces.push(dir);
  return dir;
}

describe('AgreementLedger', () => {
  it('無ければ absent', () => {
    assert.deepEqual(readLedger(makeDir()), { kind: 'absent' });
  });

  it('export → approve を追記して読み返す', () => {
    const dir = makeDir();
    const exportEvent: AgreementEvent = {
      event: 'export',
      version: '1.0.0',
      date: '2026-09-30',
      manifest: '../design-document.json',
      omitSections: ['関連'],
      chapters: [{ file: '02-reservation.md', chapterFingerprint: 'sha256:aaa', sources: [{ from: 'reservation-flow/REQ-114', fingerprint: 'sha256:bbb' }] }],
    };
    const approveEvent: AgreementEvent = {
      event: 'approve',
      targetVersion: '1.0.0',
      approvedBy: '発注側の責任者',
      approvedAt: '2026-10-02',
    };
    appendLedgerEvent(dir, exportEvent);
    appendLedgerEvent(dir, approveEvent);
    const result = readLedger(dir);
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.deepEqual(result.events, [exportEvent, approveEvent]);
  });

  it('CannotCheck: 壊れた行 (JSON でない)', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), '{ not json\n');
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: event が export/approve のどちらでもない', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ event: 'x' })}\n`);
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: export に必須項目が無い', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ event: 'export', version: '1.0.0' })}\n`);
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: approve に approvedBy が無い', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ event: 'approve', targetVersion: '1.0.0', approvedAt: '2026-10-02' })}\n`);
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('追記のみ: 既存の行は書き換わらない', () => {
    const dir = makeDir();
    const first: AgreementEvent = { event: 'approve', targetVersion: '1.0.0', approvedBy: 'a', approvedAt: '2026-10-01' };
    const second: AgreementEvent = { event: 'approve', targetVersion: '1.1.0', approvedBy: 'b', approvedAt: '2026-10-02' };
    appendLedgerEvent(dir, first);
    appendLedgerEvent(dir, second);
    const result = readLedger(dir);
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
      assert.equal(result.events.length, 2);
      assert.deepEqual(result.events[0], first);
    }
  });
});
