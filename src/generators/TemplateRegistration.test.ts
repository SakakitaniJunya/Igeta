import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import { insertAtMarker, markerOf, MARKER_FILES, nextSteps, registrationFor } from './TemplateRegistration.js';
import type { TemplateVariant } from './TemplateExpandModule.js';

const baseDir = (variant: TemplateVariant): string =>
  variant === 'frontend' ? join(IGETA_ROOT, 'templates/frontend/admin') : join(IGETA_ROOT, 'templates/backend', variant);

const count = (text: string, needle: string): number => text.split('\n').filter((row) => row.trim() === needle).length;

describe('TemplateRegistration: 雛形の目印', () => {
  for (const { variant, file, kinds } of MARKER_FILES) {
    it(`${variant} ${file} は目印 ${kinds.join('・')} をそれぞれちょうど 1 つ持つ`, () => {
      const text = readFileSync(join(baseDir(variant), file), 'utf8');
      for (const kind of kinds) assert.equal(count(text, markerOf(kind)), 1, markerOf(kind));
      assert.equal((text.match(/@igeta:register-[a-z]+/g) ?? []).length, kinds.length, '表に無い目印がある');
    });
  }

  it('登録の表が書き込む先は、すべて目印の表にある', () => {
    const known = new Set(MARKER_FILES.flatMap((m) => m.kinds.map((k) => `${m.variant} ${m.file} ${k}`)));
    const cases: Array<[TemplateVariant, 'entry' | 'module' | 'feature']> = [
      ['hono', 'module'], ['hono', 'entry'], ['nestjs', 'entry'], ['rust', 'module'], ['rust', 'entry'], ['frontend', 'feature'],
    ];
    for (const [variant, unit] of cases) {
      const edits = registrationFor(variant, unit, { context: 'sample', entry: 'probe', feature: 'samples' }, true);
      assert.ok(edits.length > 0, `${variant} ${unit}`);
      for (const edit of edits) assert.ok(known.has(`${variant} ${edit.file} ${edit.kind}`), `${variant} ${edit.file} ${edit.kind}`);
    }
  });
});

describe('TemplateRegistration: 登録の行', () => {
  it('hono の module と entry', () => {
    const names = { context: 'sample', entry: 'probe' };
    const mod = registrationFor('hono', 'module', names, true).flatMap((e) => e.lines);
    assert.deepEqual(mod, ["import { createSampleModule } from '@/modules/sample/index.js';", 'const sample = createSampleModule(db);']);
    const entry = registrationFor('hono', 'entry', names, true).flatMap((e) => e.lines);
    assert.ok(entry.includes("app.route('/probe', createProbeRoutes({ verify, sample }));"));
    assert.ok(entry.some((l) => l.startsWith('const verify =')));
    assert.ok(!registrationFor('hono', 'entry', names, false).some((e) => e.kind === 'verify'));
  });

  it('nestjs は entry だけ (module の公開面は entry module が作る)', () => {
    assert.deepEqual(registrationFor('nestjs', 'module', { context: 'sample' }, true), []);
    const lines = registrationFor('nestjs', 'entry', { entry: 'probe' }, true).flatMap((e) => e.lines);
    assert.ok(lines.includes('ProbeEntryModule.register({ verify }),'));
  });

  it('rust は mod 名・変数をスネークにする', () => {
    const lines = registrationFor('rust', 'module', { context: 'stock-item' }, true).flatMap((e) => e.lines);
    assert.deepEqual(lines, ['pub mod stock_item;', 'let stock_item = backend::modules::stock_item::create_module(db.clone());']);
    const entry = registrationFor('rust', 'entry', { entry: 'admin-api', context: 'stock-item' }, true).flatMap((e) => e.lines);
    assert.ok(entry.some((l) => l.includes('.nest("/admin-api"') || l.includes('app.nest("/admin-api"')));
    assert.ok(entry.some((l) => l.includes('RoutesDeps { verify: CheckVerifier, stock_item }')));
  });

  it('frontend は import と route', () => {
    const lines = registrationFor('frontend', 'feature', { feature: 'samples' }, true).flatMap((e) => e.lines);
    assert.deepEqual(lines, ["import { SamplesScreen } from '@/features/samples';", "{ path: '/samples', screen: SamplesScreen },"]);
  });

  it('insertAtMarker は目印の直前に目印と同じ字下げで足し、目印は残す。単位を足すたびに積める', () => {
    const source = ['a', '  [', '    // @igeta:register-entry', '  ]', ''].join('\n');
    const once = insertAtMarker(source, 'entry', ['X,']);
    assert.equal(once, ['a', '  [', '    X,', '    // @igeta:register-entry', '  ]', ''].join('\n'));
    assert.match(insertAtMarker(once, 'entry', ['Y,']), /X,\n    Y,\n    \/\/ @igeta:register-entry/);
  });

  it('目印が無い・2 つあるときは投げる', () => {
    assert.throws(() => insertAtMarker('x\n', 'entry', ['a']), /0 個/);
    assert.throws(() => insertAtMarker('// @igeta:register-entry\n// @igeta:register-entry\n', 'entry', ['a']), /2 個/);
  });

  it('nextSteps: 変種が分かれば目印つきで、分からなければ README へ誘導する', () => {
    const steps = nextSteps('hono', 'module', { context: 'sample' });
    assert.ok(steps.some((s) => s.includes('src/index.ts の // @igeta:register-module')));
    assert.equal(nextSteps(undefined, 'module', {}).length, 1);
    assert.deepEqual(nextSteps('nestjs', 'module', { context: 'sample' }), []);
  });
});
