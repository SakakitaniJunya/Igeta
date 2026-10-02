// node --test dist/core/IgetaConfig.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesGlob } from '../gate/PathGlob.js';
import { DEFAULT_IGETA_CONFIG, loadIgetaConfig } from './IgetaConfig.js';
import { IGETA_ROOT } from './Paths.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-igetaconfig-'));
  workspaces.push(root);
  return root;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('loadIgetaConfig', () => {
  it('ファイルが無ければ既定値', () => {
    const result = loadIgetaConfig(makeRoot());
    assert.deepEqual(result, { config: DEFAULT_IGETA_CONFIG });
  });

  it('sharedKinds と contextSizeLimit を読む', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ sharedKinds: ['glossary'], contextSizeLimit: 500 }));
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, {
      config: { ...DEFAULT_IGETA_CONFIG, sharedKinds: ['glossary'], contextSizeLimit: 500 },
    });
  });

  it('未知のフィールドは無視する (将来の設定追加に備える)', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ notYetImplemented: ['x'] }));
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, { config: DEFAULT_IGETA_CONFIG });
  });

  it('CannotCheck: JSON が壊れている', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), '{ not json');
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
    assert.equal((result as { violation: { severity: string } }).violation.severity, 'cannot-check');
  });

  it('CannotCheck: オブジェクトでない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), '[1,2,3]');
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
  });

  it('CannotCheck: sharedKinds が文字列の配列でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ sharedKinds: [1, 2] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
  });

  it('CannotCheck: contextSizeLimit が正の数でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ contextSizeLimit: -1 }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
  });

  it('--config で場所を上書きできる', () => {
    const root = makeRoot();
    const altPath = join(root, 'alt.json');
    writeFileSync(altPath, JSON.stringify({ contextSizeLimit: 10 }));
    const result = loadIgetaConfig(root, altPath);
    assert.deepEqual(result, {
      config: { ...DEFAULT_IGETA_CONFIG, contextSizeLimit: 10 },
    });
  });

  it('coverageExemptions ({ id, reason } の配列) を読む', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, '.igeta.json'),
      JSON.stringify({ coverageExemptions: [{ id: 'reservation-flow/REQ-999', reason: '内部専用 API、顧客要件外' }] }),
    );
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, {
      config: {
        ...DEFAULT_IGETA_CONFIG,
        coverageExemptions: [{ id: 'reservation-flow/REQ-999', reason: '内部専用 API、顧客要件外' }],
      },
    });
  });

  it('CannotCheck: coverageExemptions の要素に reason が無い (理由必須)', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ coverageExemptions: [{ id: 'x/REQ-001' }] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result, JSON.stringify(result));
  });

  it('CannotCheck: coverageExemptions が配列でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ coverageExemptions: 'x' }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result, JSON.stringify(result));
  });

  it('CannotCheck: --config で明示した場所が無い (省略時の既定値フォールバックと違う)', () => {
    const root = makeRoot();
    const result = loadIgetaConfig(root, join(root, 'nonexistent.json'));
    assert.ok('violation' in result, JSON.stringify(result));
    assert.match((result as { violation: { message: string } }).violation.message, /--config で指定した場所が無い/);
  });

  it('省略時 (既定パス) に .igeta.json が無いのは既定値のまま (回帰確認)', () => {
    const root = makeRoot();
    assert.deepEqual(loadIgetaConfig(root), { config: DEFAULT_IGETA_CONFIG });
  });

  it('reagreementRules ({ kind, section? } の配列) を読む', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, '.igeta.json'),
      JSON.stringify({ reagreementRules: [{ kind: 'requirements' }, { kind: 'business-flow', section: '1. 予約の受付' }] }),
    );
    const result = loadIgetaConfig(root);
    assert.ok('config' in result, JSON.stringify(result));
    if ('config' in result) {
      assert.deepEqual(result.config.reagreementRules, [{ kind: 'requirements' }, { kind: 'business-flow', section: '1. 予約の受付' }]);
    }
  });

  it('CannotCheck: reagreementRules の要素に kind が無い', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ reagreementRules: [{ section: 'x' }] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result, JSON.stringify(result));
  });

  it('CannotCheck: reagreementRules が配列でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ reagreementRules: 'x' }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result, JSON.stringify(result));
  });

  it('CannotCheck: 指定した場所がディレクトリ (「JSON が壊れている」と誤表示しない)', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'a-directory'));
    const result = loadIgetaConfig(root, join(root, 'a-directory'));
    assert.ok('violation' in result, JSON.stringify(result));
    assert.match((result as { violation: { message: string } }).violation.message, /ディレクトリ/);
    assert.doesNotMatch((result as { violation: { message: string } }).violation.message, /JSON が壊れている/);
  });
});

describe('loadIgetaConfig: humanPaths (ADR-0008)', () => {
  it('既定は空 (足すことだけができる)', () => {
    const result = loadIgetaConfig(makeRoot());
    assert.ok('config' in result);
    assert.deepEqual(result.config.humanPaths, []);
  });

  it('glob の配列を読む (Igeta 自身が足す 7 つ)', () => {
    const root = makeRoot();
    const humanPaths = [
      'templates/**',
      'src/checks/**',
      'src/gate/**',
      'src/core/Role.ts',
      'src/core/IgetaConfig.ts',
      'src/core/LineClassifier.ts',
      'docs/explanation/0[3-9]-*.md',
    ];
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ humanPaths }));
    const result = loadIgetaConfig(root);
    assert.ok('config' in result, JSON.stringify(result));
    assert.deepEqual(result.config.humanPaths, humanPaths);
  });

  it('CannotCheck: 配列でない・文字列でない要素がある', () => {
    for (const humanPaths of ['templates/**', [1], [['a']], null, { a: 1 }]) {
      const root = makeRoot();
      writeFileSync(join(root, '.igeta.json'), JSON.stringify({ humanPaths }));
      const result = loadIgetaConfig(root);
      assert.ok('violation' in result, JSON.stringify(humanPaths));
      assert.equal(result.violation.severity, 'cannot-check');
      assert.match(result.violation.message, /humanPaths は glob \(文字列\) の配列/);
    }
  });

  it('CannotCheck: 使えない構文の glob は黙って通さない (どのパスにも当たらない設定になるため)', () => {
    // 外す設定は無いので、`!` の否定は特に落とす。先頭の `/` や末尾の `/` は当たらない glob になる
    for (const glob of ['!templates/**', '/templates/**', './templates/**', 'templates/', 'src/{checks}/**', '']) {
      const root = makeRoot();
      writeFileSync(join(root, '.igeta.json'), JSON.stringify({ humanPaths: ['src/gate/**', glob] }));
      const result = loadIgetaConfig(root);
      assert.ok('violation' in result, JSON.stringify(glob));
      assert.equal(result.violation.severity, 'cannot-check');
      assert.ok(result.violation.message.includes(`humanPaths の ${JSON.stringify(glob)} は glob として使えない`), result.violation.message);
    }
  });
});

describe('loadIgetaConfig: nonDocPaths (ADR-0003 決定 6)', () => {
  it('既定は空', () => {
    const result = loadIgetaConfig(makeRoot());
    assert.ok('config' in result);
    assert.deepEqual(result.config.nonDocPaths, []);
  });

  it('3 フォルダの外を指す glob を読む', () => {
    const root = makeRoot();
    const nonDocPaths = ['docs/legacy/**', 'docs/images/**', 'docs/*.md', 'docs/{vendor,tmp}/**'];
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ nonDocPaths }));
    const result = loadIgetaConfig(root);
    assert.ok('config' in result, JSON.stringify(result));
    assert.deepEqual(result.config.nonDocPaths, nonDocPaths);
  });

  it('違反: 3 フォルダの配下に当たる glob は、設定そのものが違反 (cannot-check ではなく violation)', () => {
    const hitting = [
      'docs/person/**',
      'docs/ai/specs/**',
      'docs/client/delivery/01-chapter.md', // 配下の 1 本だけを指す書き方も
      'docs/**',
      '**',
      '**/*.md',
      'docs/*/**',
      'docs/p*/**',
      'docs/{legacy,client}/**',
      'docs/Person/**', // 大文字小文字だけを変えても、大文字小文字を区別しないファイルシステムでは同じ場所
      'DOCS/AI/specs/**',
    ];
    for (const glob of hitting) {
      const root = makeRoot();
      writeFileSync(join(root, '.igeta.json'), JSON.stringify({ nonDocPaths: ['docs/legacy/**', glob] }));
      const result = loadIgetaConfig(root);
      assert.ok('violation' in result, `${glob} は 3 フォルダの配下に当たるのに通った`);
      assert.equal(result.violation.severity, 'violation', glob);
      assert.ok(result.violation.message.includes(JSON.stringify(glob)), result.violation.message);
      assert.match(result.violation.message, /ADR-0003 決定 6/);
    }
  });

  it('違反の説明は当たったフォルダと、当たった glob 全部を挙げる', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ nonDocPaths: ['docs/person/**', 'docs/legacy/**', 'docs/ai/x.md'] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
    assert.match(result.violation.message, /"docs\/person\/\*\*" \(docs\/person\)/);
    assert.match(result.violation.message, /"docs\/ai\/x\.md" \(docs\/ai\)/);
    assert.doesNotMatch(result.violation.message, /docs\/legacy/);
  });

  it('CannotCheck: 配列でない・使えない構文 (形の検査は違反より先)', () => {
    for (const nonDocPaths of ['docs/legacy/**', [1]]) {
      const root = makeRoot();
      writeFileSync(join(root, '.igeta.json'), JSON.stringify({ nonDocPaths }));
      const result = loadIgetaConfig(root);
      assert.ok('violation' in result);
      assert.equal(result.violation.severity, 'cannot-check');
      assert.match(result.violation.message, /nonDocPaths は glob \(文字列\) の配列/);
    }
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ nonDocPaths: ['!docs/legacy/**'] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
    assert.equal(result.violation.severity, 'cannot-check');
  });

  it('humanPaths と nonDocPaths は同じ設定ファイルで一緒に読める', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ humanPaths: ['src/gate/**'], nonDocPaths: ['docs/legacy/**'], contextSizeLimit: 100 }));
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, {
      config: { ...DEFAULT_IGETA_CONFIG, contextSizeLimit: 100, humanPaths: ['src/gate/**'], nonDocPaths: ['docs/legacy/**'] },
    });
  });
});

describe('Igeta 自身の .igeta.json (ADR-0008 決定 1)', () => {
  const EXPECTED = [
    'templates/**',
    'src/checks/**',
    'src/gate/**',
    'src/core/Role.ts',
    'src/core/IgetaConfig.ts',
    'src/core/LineClassifier.ts',
    'docs/explanation/0[3-9]-*.md',
  ];

  it('読めて、ADR-0008 が決めた 7 つの humanPaths を持つ', () => {
    const result = loadIgetaConfig(IGETA_ROOT);
    assert.ok('config' in result, JSON.stringify(result));
    assert.deepEqual(result.config.humanPaths, EXPECTED);
    assert.deepEqual(result.config.nonDocPaths, []);
  });

  it('全利用 repo の決まりを決めるもの・門の実装そのもの・person の行へ書き直すまでの解説が、人の承認で守られる', () => {
    const result = loadIgetaConfig(IGETA_ROOT);
    assert.ok('config' in result);
    const guarded = (path: string): boolean => result.config.humanPaths.some((glob) => matchesGlob(path, glob));
    for (const path of [
      'templates/docs/README.md',
      'src/checks/DocGraphCheck.ts',
      'src/gate/ApprovalScope.ts', // approval-scope の本体。ここを人の承認なしに変えられると門が開く
      'src/gate/PathGlob.ts',
      'src/core/Role.ts',
      'src/core/IgetaConfig.ts',
      'src/core/LineClassifier.ts',
      'docs/explanation/03-audience-layers.md',
      'docs/explanation/09-reader-granularity.md',
    ]) {
      assert.equal(guarded(path), true, `${path} が守られていない`);
    }
    for (const path of ['src/cli/commands/InitCommand.ts', 'src/core/Report.ts', 'docs/explanation/02-human-review-layer.md', 'docs/explanation/10-folder-placement.md', 'README.md']) {
      assert.equal(guarded(path), false, `${path} まで守られている`);
    }
  });
});
