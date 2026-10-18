import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMULATOR_PORT, planSteps } from './templatesSteps.js';
import type { StepPlanOptions } from './templatesSteps.js';

const opts = (over: Partial<StepPlanOptions> = {}): StepPlanOptions => ({
  requireEmulator: false,
  emulator: true,
  rust: 'cargo',
  variantDir: '/w/v',
  appDir: '/w/v/apps/probe-app/backend',
  runId: 'igeta-check-templates-abc',
  ...over,
});

const names = (variant: Parameters<typeof planSteps>[0], over?: Partial<StepPlanOptions>): string[] => planSteps(variant, opts(over)).steps.map((s) => s.name);

describe('planSteps', () => {
  it('hono / nestjs は npm ci → tsc → vitest (emulator) → depcruise → build の順', () => {
    for (const variant of ['hono', 'nestjs'] as const) {
      assert.deepEqual(names(variant), ['npm ci', 'tsc --noEmit', 'vitest (firestore emulator)', 'dependency-cruiser', 'npm run build']);
    }
  });

  it('emulator なしのときは vitest を直接走らせる', () => {
    const plan = planSteps('hono', opts({ emulator: false }));
    const vitest = plan.steps.find((s) => s.kind === 'vitest');
    assert.equal(vitest?.command, 'npx');
    assert.deepEqual(vitest?.args.slice(0, 2), ['vitest', 'run']);
    assert.equal(vitest?.env, undefined);
  });

  it('emulator は firestore だけ・demo-igeta で包み、--require-emulator のときだけ REQUIRE_EMULATOR=1 を渡す', () => {
    const wrapped = planSteps('nestjs', opts({ requireEmulator: true })).steps.find((s) => s.kind === 'vitest');
    assert.deepEqual(wrapped?.args.slice(0, 7), ['--no-install', 'firebase', 'emulators:exec', '--only', 'firestore', '--project', 'demo-igeta']);
    assert.match(wrapped?.args[7] ?? '', /^npx vitest run .*--outputFile=vitest-result\.json$/);
    assert.deepEqual(wrapped?.env, { REQUIRE_EMULATOR: '1' });
    assert.equal(planSteps('nestjs', opts()).steps.find((s) => s.kind === 'vitest')?.env, undefined);
  });

  it('frontend は emulator で包まず、vite build が dist/app.js を出すことを見る', () => {
    const plan = planSteps('frontend', opts({ requireEmulator: true }));
    assert.deepEqual(plan.steps.map((s) => s.name), ['npm ci', 'tsc --noEmit', 'vitest', 'dependency-cruiser', 'vite build']);
    assert.equal(plan.steps[2]?.args[0], 'vitest');
    assert.deepEqual(plan.steps[4]?.expectFiles, ['dist/app.js']);
  });

  it('install と準備は fatal、ほかは続けて全部の落ちを集める', () => {
    const fatal = planSteps('hono', opts()).steps.filter((s) => s.fatal).map((s) => s.name);
    assert.deepEqual(fatal, ['npm ci']);
  });

  it('rust (cargo) は cargo build --locked → cargo test --locked (emulator)', () => {
    const plan = planSteps('rust', opts({ requireEmulator: true }));
    assert.deepEqual(plan.steps.map((s) => s.name), ['cargo build --locked', 'cargo test --locked (firestore emulator)']);
    assert.deepEqual(plan.steps[0]?.args, ['build', '--locked']);
    assert.match(plan.steps[1]?.args.at(-1) ?? '', /^cargo test --locked/);
    assert.deepEqual(plan.steps[1]?.env, { REQUIRE_EMULATOR: '1' });
    assert.equal(plan.cleanup.length, 0);
  });

  it('rust (docker) は volume へ写して rust:1-bookworm で --locked、emulator は host.docker.internal 経由、後始末つき', () => {
    const plan = planSteps('rust', opts({ rust: 'docker', requireEmulator: true }));
    const lines = plan.steps.map((s) => [s.command, ...s.args].join(' '));
    assert.match(lines[0] ?? '', /^docker create --name igeta-check-rust-igeta-check-templates-abc /);
    assert.match(lines[1] ?? '', /^docker cp \/w\/v\/apps\/probe-app\/backend\/\. igeta-check-rust-/);
    assert.match(lines[3] ?? '', /rust:1-bookworm cargo build --locked$/);
    const test = plan.steps.at(-1);
    assert.equal(test?.command, 'npx');
    const inner = test?.args.at(-1) ?? '';
    assert.match(inner, /docker run --rm .*-e FIRESTORE_EMULATOR_HOST=host\.docker\.internal:8080 -e REQUIRE_EMULATOR=1 rust:1-bookworm cargo test --locked/);
    assert.equal(EMULATOR_PORT, 8080);
    assert.ok(plan.cleanup.length === 2 && plan.cleanup.every((s) => s.command === 'docker'));
  });

  it('rust は emulator なしなら docker run だけで cargo test --locked', () => {
    const plan = planSteps('rust', opts({ rust: 'docker', emulator: false }));
    const test = plan.steps.at(-1);
    assert.equal(test?.command, 'docker');
    assert.doesNotMatch((test?.args ?? []).join(' '), /FIRESTORE_EMULATOR_HOST/);
  });
});
