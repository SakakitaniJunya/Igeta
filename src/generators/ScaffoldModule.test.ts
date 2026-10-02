// node --test dist
// 実 templates/ を展開し、
// 「展開直後の module が drift check を通る」ところまで検証する。
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScaffoldCommand } from '../cli/commands/ScaffoldCommand.js';
import { DomainDiagramDriftCheck } from '../checks/DomainDiagramDriftCheck.js';
import { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { Report } from '../core/Report.js';
import { ScaffoldModule } from './ScaffoldModule.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-scaffold-'));
  workspaces.push(root);
  cpSync(join(IGETA_ROOT, 'templates'), join(root, 'templates'), { recursive: true });
  return root;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function driftReport(root: string): Report {
  const report = new Report();
  report.addAll(new DomainDiagramDriftCheck({}).run({ targetRoot: root, igetaRoot: IGETA_ROOT }));
  return report;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('ScaffoldModule', () => {
  let root: string;
  let scaffold: ScaffoldModule;
  beforeEach(() => {
    root = makeRoot();
    scaffold = new ScaffoldModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
  });

  it('api module を apps/api 配下へ 4 レイヤ分展開する', () => {
    const result = scaffold.execute({ kind: 'api', context: 'booking', aggregate: 'Reservation' });
    assert.deepEqual(result.conflicts, []);
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
    scaffold.execute({ kind: 'api', context: 'rental-unit', aggregate: 'RentalUnit' });
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
    const result = scaffold.execute({ kind: 'api', context: 'booking', aggregate: 'Reservation' });
    const migration = result.written.find((entry) =>
      /apps\/api\/prisma\/migrations\/\d{14}_init_booking\/migration\.sql$/.test(entry.to),
    );
    assert.ok(migration !== undefined, result.written.map((entry) => entry.to).join('\n'));
    assert.ok(existsSync(migration.to));
  });

  it('既存ファイルと衝突したら 1 ファイルも書かない', () => {
    scaffold.execute({ kind: 'api', context: 'booking', aggregate: 'Reservation' });
    rmSync(join(root, 'apps/api/src/modules/booking/presentation'), { recursive: true });
    const result = scaffold.execute({ kind: 'api', context: 'booking', aggregate: 'Reservation' });
    assert.ok(result.conflicts.length > 0);
    assert.deepEqual(result.written, []);
    // 衝突検出後に部分展開していないこと
    assert.equal(existsSync(join(root, 'apps/api/src/modules/booking/presentation')), false);
  });

  it('plan() は 1 ファイルも書かない', () => {
    const entries = scaffold.plan({ kind: 'api', context: 'booking', aggregate: 'Reservation' });
    assert.ok(entries.length > 0);
    assert.equal(existsSync(join(root, 'apps/api')), false);
  });

  it('引数が規約に反したら violation (Pascal な context を拒否)', () => {
    const violations = scaffold.validate({ kind: 'api', context: 'Booking', aggregate: 'Reservation' });
    const report = new Report();
    report.addAll(violations);
    assert.equal(report.exitCode, 1);
    assert.match(report.format(), /context は kebab-case 必須/);
  });

  it('includeKernel で共有カーネルと Prisma datasource を 1 度だけ展開する', () => {
    const first = scaffold.execute({
      kind: 'api',
      context: 'booking',
      aggregate: 'Reservation',
      includeKernel: true,
    });
    assert.deepEqual(first.conflicts, []);
    assert.ok(existsSync(join(root, 'apps/api/src/shared/kernel/result.ts')));
    assert.ok(existsSync(join(root, 'apps/api/src/common/prisma/tenant-transaction.ts')));
    assert.ok(existsSync(join(root, 'apps/api/prisma/schema/_datasource.prisma')));

    const second = scaffold.execute({
      kind: 'api',
      context: 'catalog',
      aggregate: 'ItemType',
      includeKernel: true,
    });
    assert.deepEqual(second.written, []);
    assert.ok(second.conflicts.some((entry) => entry.to.endsWith('shared/kernel/result.ts')));
  });

  it('web feature は apps/web へ展開する', () => {
    const result = scaffold.execute({ kind: 'web', feature: 'booking' });
    assert.deepEqual(result.conflicts, []);
    assert.ok(existsSync(join(root, 'apps/web/app/(tenant)/booking/page.tsx')));
    assert.ok(existsSync(join(root, 'apps/web/app/(tenant)/booking/error.tsx')));
    assert.ok(existsSync(join(root, 'apps/web/app/(tenant)/booking/loading.tsx')));
    const catalog: unknown = JSON.parse(readFileSync(join(root, 'apps/web/messages/ja/booking.json'), 'utf8'));
    assert.ok(isRecord(catalog));
    const booking = catalog['booking'];
    assert.ok(isRecord(booking));
    assert.equal(booking['title'], 'Booking');
  });

  it('展開直後の module は図を書けば drift check が緑になる', () => {
    scaffold.execute({ kind: 'api', context: 'booking', aggregate: 'Reservation', includeKernel: true });

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

    const report = driftReport(root);
    assert.equal(report.exitCode, 0, report.format());
  });

  it('[TST-109] 新しい構成の repo: scaffold の次の手順の案内が docs/ai/specs/booking/domain/ を指し、domain-drift (--docs なし) が 2 つのまとまりの図を見る', async () => {
    // まとまり booking・billing に domain の図があり、どちらの図にも、実装に無いクラスが 1 つある
    const diagram = (context: string, classes: readonly string[]): string =>
      [
        '---',
        `id: ${context}-domain`,
        'kind: domain-model',
        `context: ${context}`,
        `code_root: apps/api/src/modules/${context}`,
        '---',
        '',
        '```mermaid',
        'classDiagram',
        ...classes.map((name) => `  class ${name}`),
        '```',
        '',
      ].join('\n');
    const write = (relPath: string, content: string): void => {
      mkdirSync(join(root, relPath, '..'), { recursive: true });
      writeFileSync(join(root, relPath), content);
    };
    write('docs/person/design/shared/00-map.md', '---\nkind: map\n---\n# 地図\n');
    write(
      'docs/ai/specs/booking/domain/01-reservation.md',
      diagram('booking', ['Reservation', 'ReservationId', 'ReservationStatus', 'ReservationCreatedEvent', 'ReservationRepositoryPort', 'Ghost']),
    );
    write('docs/ai/specs/billing/domain/01-invoice.md', diagram('billing', ['Invoice', 'Phantom']));
    write('apps/api/src/modules/billing/domain/invoice.ts', 'export class Invoice {}\n');

    const stdout: string[] = [];
    const code = await new ScaffoldCommand().run(
      ['--root', root, '--kind', 'api', '--context', 'booking', '--aggregate', 'Reservation'],
      { cwd: root, igetaRoot: IGETA_ROOT, stdout: (line) => stdout.push(line), stderr: (line) => stdout.push(line) },
    );
    assert.equal(code, ExitCode.Ok, stdout.join('\n'));
    const guidance = stdout.filter((line) => line.startsWith('NEXT')).join('\n');
    assert.ok(guidance.includes('docs/ai/specs/booking/domain/'), guidance);
    assert.equal(guidance.includes('docs/design/detail/domain'), false, guidance);

    const violations = new DomainDiagramDriftCheck({}).run({ targetRoot: root, igetaRoot: IGETA_ROOT });
    assert.deepEqual(
      violations.map((violation) => [violation.severity, violation.file, violation.message.replace(/ \(期待:.*$/, '')]),
      [
        ['violation', 'docs/ai/specs/billing/domain/01-invoice.md', '図にあるが実装に無い: Phantom'],
        ['violation', 'docs/ai/specs/booking/domain/01-reservation.md', '図にあるが実装に無い: Ghost'],
      ],
    );
  });

  it('図に 1 クラス足りなければ drift check が落ちる (契約が実際に効いている)', () => {
    scaffold.execute({ kind: 'api', context: 'booking', aggregate: 'Reservation' });
    const diagramDir = join(root, 'docs/design/detail/domain');
    mkdirSync(diagramDir, { recursive: true });
    writeFileSync(
      join(diagramDir, 'booking.md'),
      '---\nid: booking-domain\ncode_root: apps/api/src/modules/booking\n---\n\n' +
        '```mermaid\nclassDiagram\n  class Reservation\n  class ReservationId\n' +
        '  class ReservationStatus\n  class ReservationCreatedEvent\n```\n',
    );

    const report = driftReport(root);
    assert.equal(report.exitCode, 1);
    assert.match(report.format(), /実装にあるが図に無い: ReservationRepositoryPort/);
  });
});
