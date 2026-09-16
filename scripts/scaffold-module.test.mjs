// node --test scripts/
// 実 templates/ を一時ディレクトリへコピーして展開し、
// 「展開直後の module が drift check を通る」ところまで検証する。
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPTS_DIR, '..');
const SCAFFOLD = join(SCRIPTS_DIR, 'scaffold-module.mjs');
const DRIFT = join(SCRIPTS_DIR, 'check-domain-diagram-drift.mjs');
const workspaces = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-scaffold-'));
  workspaces.push(root);
  cpSync(join(REPO_ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  return root;
}

const scaffold = (root, args) =>
  spawnSync(process.execPath, [SCAFFOLD, '--root', root, ...args], { encoding: 'utf8' });

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('scaffold-module', () => {
  let root;
  beforeEach(() => {
    root = makeRoot();
  });

  it('api module を apps/api 配下へ 4 レイヤ分展開する', () => {
    const result = scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation']);
    assert.equal(result.status, 0, result.stderr);
    for (const relPath of [
      'apps/api/src/modules/booking/booking.module.ts',
      'apps/api/src/modules/booking/index.ts',
      'apps/api/src/modules/booking/domain/reservation.ts',
      'apps/api/src/modules/booking/domain/value-objects/reservation-id.ts',
      'apps/api/src/modules/booking/domain/events/reservation-created.event.ts',
      'apps/api/src/modules/booking/domain/ports/reservation.repository.port.ts',
      'apps/api/src/modules/booking/application/dto/create-reservation.dto.ts',
      'apps/api/src/modules/booking/application/use-cases/create-reservation.use-case.ts',
      'apps/api/src/modules/booking/infrastructure/booking.providers.ts',
      'apps/api/src/modules/booking/infrastructure/adapters/prisma-reservation.repository.ts',
      'apps/api/src/modules/booking/presentation/booking.controller.ts',
      'apps/api/prisma/schema/booking.prisma',
    ]) {
      assert.ok(existsSync(join(root, relPath)), `未生成: ${relPath}`);
    }
  });

  it('プレースホルダを残さず置換する', () => {
    scaffold(root, ['--context', 'rental-unit', '--aggregate', 'RentalUnit']);
    const aggregate = readFileSync(
      join(root, 'apps/api/src/modules/rental-unit/domain/rental-unit.ts'),
      'utf8',
    );
    assert.match(aggregate, /export class RentalUnit \{/);
    assert.match(aggregate, /export type RentalUnitStatus =/);
    assert.doesNotMatch(aggregate, /__[A-Za-z]+__/);

    const port = readFileSync(
      join(root, 'apps/api/src/modules/rental-unit/domain/ports/rental-unit.repository.port.ts'),
      'utf8',
    );
    assert.match(port, /export const RENTAL_UNIT_REPOSITORY = Symbol\('RentalUnitRepositoryPort'\)/);
    assert.match(port, /export interface RentalUnitRepositoryPort/);

    const providers = readFileSync(
      join(root, 'apps/api/src/modules/rental-unit/infrastructure/rental-unit.providers.ts'),
      'utf8',
    );
    assert.match(providers, /export const rentalUnitProviders: Provider\[\]/);
  });

  it('migration ディレクトリ名のタイムスタンプが展開される', () => {
    const result = scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation']);
    assert.match(result.stdout, /apps\/api\/prisma\/migrations\/\d{14}_init_booking\/migration\.sql/);
  });

  it('既存ファイルと衝突したら 1 ファイルも書かずに exit 1', () => {
    scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation']);
    rmSync(join(root, 'apps/api/src/modules/booking/presentation'), { recursive: true });
    const result = scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /CONFLICT/);
    // 衝突検出後に部分展開していないこと
    assert.equal(existsSync(join(root, 'apps/api/src/modules/booking/presentation')), false);
  });

  it('--dry-run は 1 ファイルも書かない', () => {
    const result = scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation', '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^DRY /m);
    assert.equal(existsSync(join(root, 'apps/api')), false);
  });

  it('引数が規約に反したら exit 1 (Pascal な context を拒否)', () => {
    const result = scaffold(root, ['--context', 'Booking', '--aggregate', 'Reservation']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /--context は kebab-case 必須/);
  });

  it('--include-kernel で共有カーネルと Prisma datasource を 1 度だけ展開する', () => {
    const first = scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation', '--include-kernel']);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(existsSync(join(root, 'apps/api/src/shared/kernel/result.ts')));
    assert.ok(existsSync(join(root, 'apps/api/src/common/prisma/tenant-transaction.ts')));
    assert.ok(existsSync(join(root, 'apps/api/prisma/schema/_datasource.prisma')));

    const second = scaffold(root, ['--context', 'catalog', '--aggregate', 'ItemType', '--include-kernel']);
    assert.equal(second.status, 1, second.stdout);
    assert.match(second.stderr, /shared\/kernel\/result\.ts は既に存在する/);
  });

  it('web feature は apps/web へ展開する', () => {
    const result = scaffold(root, ['--kind', 'web', '--feature', 'booking']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(root, 'apps/web/app/(tenant)/booking/page.tsx')));
    assert.ok(existsSync(join(root, 'apps/web/app/(tenant)/booking/error.tsx')));
    assert.ok(existsSync(join(root, 'apps/web/app/(tenant)/booking/loading.tsx')));
    const catalog = JSON.parse(readFileSync(join(root, 'apps/web/messages/ja/booking.json'), 'utf8'));
    assert.equal(catalog.booking.title, 'Booking');
  });

  it('展開直後の module は図を書けば drift check が緑になる', () => {
    scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation', '--include-kernel']);

    const diagramDir = join(root, 'docs/design/detail/domain');
    mkdirSync(diagramDir, { recursive: true });
    writeFileSync(
      join(diagramDir, 'booking.md'),
      [
        '---',
        'id: booking-domain',
        'canonical: true',
        'code_root: apps/api/src/modules/booking',
        '---',
        '',
        '```mermaid',
        'classDiagram',
        '  class Reservation',
        '  class ReservationId',
        '  class ReservationStatus',
        '  class ReservationCreatedEvent',
        '  class ReservationRepositoryPort',
        '```',
        '',
      ].join('\n'),
    );

    const drift = spawnSync(process.execPath, [DRIFT, '--root', root], { encoding: 'utf8' });
    assert.equal(drift.status, 0, `${drift.stdout}${drift.stderr}`);
  });

  it('図に 1 クラス足りなければ drift check が落ちる (契約が実際に効いている)', () => {
    scaffold(root, ['--context', 'booking', '--aggregate', 'Reservation']);
    const diagramDir = join(root, 'docs/design/detail/domain');
    mkdirSync(diagramDir, { recursive: true });
    writeFileSync(
      join(diagramDir, 'booking.md'),
      '---\nid: booking-domain\ncode_root: apps/api/src/modules/booking\n---\n\n' +
        '```mermaid\nclassDiagram\n  class Reservation\n  class ReservationId\n' +
        '  class ReservationStatus\n  class ReservationCreatedEvent\n```\n',
    );
    const drift = spawnSync(process.execPath, [DRIFT, '--root', root], { encoding: 'utf8' });
    assert.equal(drift.status, 1, drift.stdout);
    assert.match(drift.stderr, /実装にあるが図に無い: ReservationRepositoryPort/);
  });
});
