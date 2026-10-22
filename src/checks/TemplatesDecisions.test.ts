// node --test dist/checks/TemplatesDecisions.test.js
// 決定の雛形 (ADR-0013): ADR は proposed/ に置く・履歴の節と持ち主の欄を持つ。台帳は状態・根拠・持ち主・期限の列を持つ。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory, readLedger } from '#decision/core';
import { IGETA_ROOT } from '../core/Paths.js';

const DECISIONS = join(IGETA_ROOT, 'templates', 'docs', 'person', 'decisions');

describe('決定の雛形', () => {
  it('ADR の雛形は proposed/ にあり、持ち主 (awaiting) と、行が 0 本の承認の履歴の表を持つ', () => {
    const text = readFileSync(join(DECISIONS, 'proposed', 'NNNN-__slug__.md'), 'utf8');
    assert.match(text, /^awaiting: /m);
    assert.equal(parseHistory(text.split('\n')).startIndex >= 0, true);
    assert.deepEqual(parseHistory(text.split('\n')).rows, []);
  });

  it('決定台帳の雛形は、DEC と OPEN の表に状態の列 (2 列目) と、根拠・持ち主・期限の列を持つ', () => {
    const ledger = readLedger(readFileSync(join(DECISIONS, '01-decisions.md'), 'utf8'));
    assert.equal(ledger.hasStateColumn, true);
    const dec = ledger.rows.find((row) => row.id === 'DEC-001');
    const open = ledger.rows.find((row) => row.id === 'OPEN-001');
    assert.ok(dec !== undefined && '根拠' in dec.cells && '状態' in dec.cells);
    assert.ok(open !== undefined && '持ち主' in open.cells && '期限' in open.cells && '根拠' in open.cells);
  });
});
