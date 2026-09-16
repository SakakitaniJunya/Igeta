// node --test scripts/
// fixture は一時ディレクトリに生成し、CLI を実プロセスで起動して exit code を検証する。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'check-domain-diagram-drift.mjs');
const workspaces = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-drift-'));
  workspaces.push(root);
  mkdirSync(join(root, 'docs', 'architecture', 'domain'), { recursive: true });
  return root;
}

function writeFile(root, relPath, content) {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function diagram(codeRoot, classNames, extra = '') {
  return [
    '---',
    'id: booking-domain',
    'canonical: true',
    `code_root: ${codeRoot}`,
    '---',
    '',
    '# booking',
    '',
    '```mermaid',
    'classDiagram',
    '  %% コメント行は無視される',
    ...classNames.map((name) => `  class ${name}`),
    extra,
    '```',
    '',
  ].join('\n');
}

function runCheck(root, args = []) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('check-domain-diagram-drift', () => {
  let root;
  beforeEach(() => {
    root = makeRoot();
  });

  it('図と実装が一致すれば exit 0', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation', 'ReservationId', 'ReservationRepositoryPort']),
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/reservation.ts',
      'export class Reservation {}\n',
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/value-objects/reservation-id.ts',
      'export class ReservationId {}\n',
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/ports/reservation.repository.port.ts',
      'export interface ReservationRepositoryPort { save(): Promise<void>; }\n' +
        "export const RESERVATION_REPOSITORY = Symbol('ReservationRepositoryPort');\n",
    );
    const result = runCheck(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^OK /m);
  });

  it('図にだけあるクラスは exit 1', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation', 'OccupancyWindow']),
    );
    writeFile(root, 'apps/api/src/modules/booking/domain/reservation.ts', 'export class Reservation {}\n');
    const result = runCheck(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /図にあるが実装に無い: OccupancyWindow/);
    assert.match(result.stderr, /booking\.md:13/);
  });

  it('実装にだけある export は exit 1', () => {
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    writeFile(root, 'apps/api/src/modules/booking/domain/reservation.ts', 'export class Reservation {}\n');
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/events/reservation-created.event.ts',
      'export class ReservationCreatedEvent {}\n',
    );
    const result = runCheck(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /実装にあるが図に無い: ReservationCreatedEvent \(class\)/);
  });

  it('*.spec.ts / コメント内の export は無視する', () => {
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    writeFile(root, 'apps/api/src/modules/booking/domain/reservation.ts',
      '/*\n export class GhostFromBlockComment {}\n*/\n// export class GhostFromLineComment {}\nexport class Reservation {}\n');
    writeFile(root, 'apps/api/src/modules/booking/domain/reservation.spec.ts', 'export class GhostSpec {}\n');
    const result = runCheck(root);
    assert.equal(result.status, 0, result.stderr);
  });

  it('code_root が未実装かつフラグ無しは exit 2 (skip しない)', () => {
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    const result = runCheck(root);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /実装が無い/);
  });

  it('--allow-missing-code なら図側のみ検証して exit 0', () => {
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SKIP /);
  });

  it('frontmatter に code_root が無ければ exit 2', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      '---\nid: booking-domain\n---\n\n```mermaid\nclassDiagram\n  class Reservation\n```\n',
    );
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /code_root が無い/);
  });

  it('classDiagram ブロックが無ければ exit 2 (flowchart だけでは契約を満たさない)', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      '---\nid: booking-domain\ncode_root: apps/api/src/modules/booking\n---\n\n```mermaid\nflowchart TB\n  a --> b\n  class a foo\n```\n',
    );
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /classDiagram ブロックが無い/);
  });

  it('図ディレクトリが無ければ exit 2', () => {
    const empty = mkdtempSync(join(tmpdir(), 'yatsu-drift-empty-'));
    workspaces.push(empty);
    const result = runCheck(empty, ['--allow-missing-code']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /図ディレクトリが存在しない/);
  });

  it('同一 code_root を複数ファイルに分割しても合算で照合する', () => {
    writeFile(root, 'docs/design/detail/domain/booking-reservation.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    writeFile(root, 'docs/design/detail/domain/booking-occupancy.md', diagram('apps/api/src/modules/booking', ['OccupancyWindow']));
    writeFile(root, 'apps/api/src/modules/booking/domain/reservation.ts', 'export class Reservation {}\n');
    writeFile(root, 'apps/api/src/modules/booking/domain/occupancy-window.ts', 'export type OccupancyWindow = { from: Date };\n');
    const result = runCheck(root);
    assert.equal(result.status, 0, result.stderr);
  });

  it('同一 code_root でクラス名が重複宣言されたら exit 2', () => {
    writeFile(root, 'docs/design/detail/domain/a.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    writeFile(root, 'docs/design/detail/domain/b.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /クラス名の重複宣言: Reservation/);
  });

  it('不明な引数は exit 2', () => {
    const result = runCheck(root, ['--skip-everything']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /不明な引数/);
  });

  it('kind が domain-model 以外の文書は SKIP する (総論・集約マップ)', () => {
    writeFile(
      root,
      'docs/design/detail/domain/overview.md',
      '---\nid: domain-model\nkind: domain-overview\n---\n\n# 総論\n',
    );
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SKIP {2}docs\/design\/detail\/domain\/overview\.md \(kind: domain-overview\)/);
    assert.match(result.stdout, /図 1 枚/);
  });

  it('kind 未設定で code_root も無い文書は無言スキップせず exit 2', () => {
    writeFile(root, 'docs/design/detail/domain/stray.md', '---\nid: stray\n---\n\n# 図のない文書\n');
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /code_root が無い/);
  });

  it('README.md は図として扱わない', () => {
    writeFile(root, 'docs/design/detail/domain/README.md', '# コンテキストマップ\n');
    writeFile(root, 'docs/design/detail/domain/booking.md', diagram('apps/api/src/modules/booking', ['Reservation']));
    const result = runCheck(root, ['--allow-missing-code']);
    assert.equal(result.status, 0, result.stderr);
  });
});
