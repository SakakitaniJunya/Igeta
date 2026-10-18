import { join } from 'node:path';
import type { TemplateVariant } from '../generators/TemplateExpandModule.js';

/**
 * 雛形の検査の手順表。副作用の無い純関数で、変種とオプションから「何を・どの順で走らせるか」だけを返す。
 * 実際に走らせるのは TemplatesCheck (CommandRunner 経由)。
 */

export const EMULATOR_PROJECT = 'demo-igeta';
export const RUST_IMAGE = 'rust:1-bookworm';
/** firestore のエミュレータが待ち受ける port (Docker から host へ届かせるため固定する) */
export const EMULATOR_PORT = 8080;
export const VITEST_RESULT_FILE = 'vitest-result.json';

export type StepKind = 'plain' | 'vitest' | 'cargo-test';

export interface Step {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly kind: StepKind;
  /** 落ちたらこの変種のあとの手順は意味が無い (install・準備) */
  readonly fatal?: boolean;
  /** 成功したあとに cwd の下にあるべきファイル */
  readonly expectFiles?: readonly string[];
}

export interface StepPlanOptions {
  readonly requireEmulator: boolean;
  /** Java があり emulator で包める */
  readonly emulator: boolean;
  /** rust の道具。cargo が無ければ docker */
  readonly rust: 'cargo' | 'docker';
  /** 変種の作業 dir (apps/ の親)。firebase.json はここに置く */
  readonly variantDir: string;
  /** apps/probe-app/backend など、手順を走らせる dir */
  readonly appDir: string;
  /** docker の volume 名に使う、作業ごとに一意な文字列 */
  readonly runId: string;
}

export interface StepPlan {
  readonly steps: readonly Step[];
  /** 成否に関わらず最後に走らせる後始末 */
  readonly cleanup: readonly Step[];
}

const sanitize = (id: string): string => id.replace(/[^A-Za-z0-9_.-]/g, '-');

/** `firebase emulators:exec` で inner (シェルの 1 行) を包んだ 1 手順 */
function emulatorStep(
  name: string,
  inner: string,
  opts: StepPlanOptions,
  kind: StepKind,
  firebase: readonly string[],
  cwd: string,
): Step {
  return {
    name,
    command: 'npx',
    args: [...firebase, 'emulators:exec', '--only', 'firestore', '--project', EMULATOR_PROJECT, inner],
    cwd,
    kind,
    ...(opts.requireEmulator ? { env: { REQUIRE_EMULATOR: '1' } } : {}),
  };
}

function nodeSteps(variant: Exclude<TemplateVariant, 'rust'>, opts: StepPlanOptions): Step[] {
  const cwd = opts.appDir;
  const plain = (name: string, command: string, args: readonly string[], extra: Partial<Step> = {}): Step => ({
    name,
    command,
    args,
    cwd,
    kind: 'plain',
    ...extra,
  });
  const vitest = `npx vitest run --reporter=default --reporter=json --outputFile=${VITEST_RESULT_FILE}`;
  const useEmulator = variant !== 'frontend' && opts.emulator;
  const test: Step = useEmulator
    ? emulatorStep('vitest (firestore emulator)', vitest, opts, 'vitest', ['--no-install', 'firebase'], cwd)
    : {
        name: 'vitest',
        command: 'npx',
        args: ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${VITEST_RESULT_FILE}`],
        cwd,
        kind: 'vitest',
      };
  return [
    plain('npm ci', 'npm', ['ci', '--no-audit', '--no-fund'], { fatal: true }),
    plain('tsc --noEmit', 'npx', ['tsc', '-p', 'tsconfig.json', '--noEmit']),
    test,
    plain('dependency-cruiser', 'npm', ['run', 'check:deps']),
    variant === 'frontend'
      ? plain('vite build', 'npm', ['run', 'build'], { expectFiles: ['dist/app.js'] })
      : plain('npm run build', 'npm', ['run', 'build']),
  ];
}

function rustSteps(opts: StepPlanOptions): StepPlan {
  const cargo = (args: readonly string[]): string => ['cargo', ...args].join(' ');
  if (opts.rust === 'cargo') {
    const cwd = opts.appDir;
    const test = cargo(['test', '--locked', '--', '--nocapture']);
    return {
      steps: [
        { name: 'cargo build --locked', command: 'cargo', args: ['build', '--locked'], cwd, kind: 'plain', fatal: true },
        opts.emulator
          ? emulatorStep('cargo test --locked (firestore emulator)', test, opts, 'cargo-test', ['--yes', 'firebase-tools@13'], cwd)
          : { name: 'cargo test --locked', command: 'cargo', args: ['test', '--locked', '--', '--nocapture'], cwd, kind: 'cargo-test' },
      ],
      cleanup: [],
    };
  }

  // Docker: bind mount は Colima などで host の tmp が見えないことがあるので、volume へ docker cp で写す。
  const volume = `igeta-check-rust-${sanitize(opts.runId)}`;
  const common = ['-v', `${volume}:/w`, '-w', '/w'];
  const caches = [
    '-v', 'igeta-cargo-registry:/usr/local/cargo/registry',
    '-v', 'igeta-cargo-target:/cache/target',
    '-v', 'igeta-rustup:/usr/local/rustup',
    '-e', 'CARGO_TARGET_DIR=/cache/target',
  ];
  const emulatorEnv = [
    '--add-host=host.docker.internal:host-gateway',
    '-e', `FIRESTORE_EMULATOR_HOST=host.docker.internal:${EMULATOR_PORT}`,
    ...(opts.requireEmulator ? ['-e', 'REQUIRE_EMULATOR=1'] : []),
  ];
  const dockerRun = (extra: readonly string[], command: readonly string[]): string[] => [
    'run', '--rm', ...common, ...caches, ...extra, RUST_IMAGE, ...command,
  ];
  const cwd = opts.variantDir;
  const docker = (name: string, args: readonly string[], extra: Partial<Step> = {}): Step => ({
    name,
    command: 'docker',
    args,
    cwd,
    kind: 'plain',
    ...extra,
  });
  const testArgs = ['cargo', 'test', '--locked', '--', '--nocapture'];
  const test: Step = opts.emulator
    ? emulatorStep(
        'cargo test --locked (docker, firestore emulator)',
        ['docker', ...dockerRun(emulatorEnv, testArgs)].join(' '),
        opts,
        'cargo-test',
        ['--yes', 'firebase-tools@13'],
        cwd,
      )
    : { ...docker('cargo test --locked (docker)', dockerRun([], testArgs)), kind: 'cargo-test' };
  return {
    steps: [
      docker('docker create', ['create', '--name', volume, '-v', `${volume}:/w`, RUST_IMAGE], { fatal: true }),
      docker('docker cp', ['cp', `${opts.appDir}/.`, `${volume}:/w`], { fatal: true }),
      docker('docker rm', ['rm', volume], { fatal: true }),
      docker('cargo build --locked (docker)', dockerRun([], ['cargo', 'build', '--locked']), { fatal: true }),
      test,
    ],
    cleanup: [docker('docker rm (後始末)', ['rm', '-f', volume]), docker('docker volume rm', ['volume', 'rm', '-f', volume])],
  };
}

export function planSteps(variant: TemplateVariant, opts: StepPlanOptions): StepPlan {
  if (variant === 'rust') return rustSteps(opts);
  return { steps: nodeSteps(variant, opts), cleanup: [] };
}

/** emulator を包むとき Docker 越しに host の emulator へ届かせる firebase.json (host を 0.0.0.0 にする) */
export const DOCKER_FIREBASE_JSON = `${JSON.stringify({ emulators: { firestore: { host: '0.0.0.0', port: EMULATOR_PORT }, ui: { enabled: false } } }, null, 2)}\n`;

export const firebaseJsonPath = (variantDir: string): string => join(variantDir, 'firebase.json');
