// node --test dist
// fixture は一時ディレクトリに生成し、Check を直接呼んで Report の終了コードを検証する。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DomainDiagramDriftCheck } from './DomainDiagramDriftCheck.js';
import type { DomainDriftOptions } from './DomainDiagramDriftCheck.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import { IGETA_ROOT } from '../core/Paths.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-drift-'));
  workspaces.push(root);
  mkdirSync(join(root, 'docs', 'architecture', 'domain'), { recursive: true });
  return root;
}

function writeFile(root: string, relPath: string, content: string): string {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function diagram(codeRoot: string, classNames: readonly string[], extra = ''): string {
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

function runCheck(root: string, options: DomainDriftOptions = {}): Report {
  const report = new Report();
  report.addAll(new DomainDiagramDriftCheck(options).run({ targetRoot: root, igetaRoot: IGETA_ROOT }));
  return report;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('DomainDiagramDriftCheck', () => {
  let root = '';
  beforeEach(() => {
    root = makeRoot();
  });

  it('図と実装が一致すれば Ok', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', [
        'Reservation',
        'ReservationId',
        'ReservationRepositoryPort',
      ]),
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
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(report.isEmpty);
  });

  it('図にだけあるクラスは Violation', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation', 'OccupancyWindow']),
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/reservation.ts',
      'export class Reservation {}\n',
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /図にあるが実装に無い: OccupancyWindow/);
    assert.match(report.format(), /booking\.md:13/);
  });

  it('実装にだけある export は Violation', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/reservation.ts',
      'export class Reservation {}\n',
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/events/reservation-created.event.ts',
      'export class ReservationCreatedEvent {}\n',
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /実装にあるが図に無い: ReservationCreatedEvent \(class\)/);
  });

  it('*.spec.ts / コメント内の export は無視する', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/reservation.ts',
      '/*\n export class GhostFromBlockComment {}\n*/\n// export class GhostFromLineComment {}\nexport class Reservation {}\n',
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/reservation.spec.ts',
      'export class GhostSpec {}\n',
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('code_root が未実装かつフラグ無しは CannotCheck (skip しない)', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /実装が無い/);
  });

  it('allowMissingCode なら図側のみ検証して Ok', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(report.isEmpty);
  });

  it('frontmatter に code_root が無ければ CannotCheck', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      '---\nid: booking-domain\n---\n\n```mermaid\nclassDiagram\n  class Reservation\n```\n',
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /code_root が無い/);
  });

  it('classDiagram ブロックが無ければ CannotCheck (flowchart だけでは契約を満たさない)', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      '---\nid: booking-domain\ncode_root: apps/api/src/modules/booking\n---\n\n```mermaid\nflowchart TB\n  a --> b\n  class a foo\n```\n',
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /classDiagram ブロックが無い/);
  });

  it('図ディレクトリが無ければ CannotCheck', () => {
    const empty = mkdtempSync(join(tmpdir(), 'igeta-drift-empty-'));
    workspaces.push(empty);
    const report = runCheck(empty, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /図ディレクトリが存在しない/);
  });

  it('同一 code_root を複数ファイルに分割しても合算で照合する', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking-reservation.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    writeFile(
      root,
      'docs/design/detail/domain/booking-occupancy.md',
      diagram('apps/api/src/modules/booking', ['OccupancyWindow']),
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/reservation.ts',
      'export class Reservation {}\n',
    );
    writeFile(
      root,
      'apps/api/src/modules/booking/domain/occupancy-window.ts',
      'export type OccupancyWindow = { from: Date };\n',
    );
    const report = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('同一 code_root でクラス名が重複宣言されたら CannotCheck', () => {
    writeFile(
      root,
      'docs/design/detail/domain/a.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    writeFile(
      root,
      'docs/design/detail/domain/b.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /クラス名の重複宣言: Reservation/);
  });

  // 旧 CLI の「不明な引数は exit 2」に相当。引数解釈は CLI 層へ移ったので、
  // クラス層に残る同種の設定不備 (docsDir の指定ミス) を検証する。
  it('docsDir に存在しないディレクトリを指定したら CannotCheck', () => {
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root, {
      docsDir: join(root, 'docs', 'design', 'detail', 'nowhere'),
      allowMissingCode: true,
    });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /図ディレクトリが存在しない/);
  });

  it('kind が domain-model 以外の文書は照合対象外 (総論・集約マップ)', () => {
    writeFile(
      root,
      'docs/design/detail/domain/overview.md',
      '---\nid: domain-model\nkind: domain-overview\n---\n\n# 総論\n',
    );
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(report.isEmpty);
  });

  it('kind 未設定で code_root も無い文書は無言スキップせず CannotCheck', () => {
    writeFile(root, 'docs/design/detail/domain/stray.md', '---\nid: stray\n---\n\n# 図のない文書\n');
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /code_root が無い/);
  });

  it('README.md は図として扱わない', () => {
    writeFile(root, 'docs/design/detail/domain/README.md', '# コンテキストマップ\n');
    writeFile(
      root,
      'docs/design/detail/domain/booking.md',
      diagram('apps/api/src/modules/booking', ['Reservation']),
    );
    const report = runCheck(root, { allowMissingCode: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });
});
