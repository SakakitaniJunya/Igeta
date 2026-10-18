// node --test dist/generators/DocsMigrate.test.js
// `igeta docs-migrate` の受入 (テスト仕様 07 の表: TST-101〜112・TST-301〜312)。一時フォルダの git repo に実際に走らせて確かめる。
// 持ち主は架空の @lead。案件名・個人情報は無い。
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { AgentsEntrypointCheck } from '../checks/AgentsEntrypointCheck.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { computeFingerprint } from '../core/Fingerprint.js';
import { buildLinkTable } from '../core/LinkTable.js';
import type { ProvenanceEntry } from '../core/ProvenanceSidecar.js';
import { writeSidecar } from '../core/ProvenanceSidecar.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import { cleanupWorkspaces as cleanupRebase, CHAPTER, MANIFEST, ROW_FROM, ANCHOR_ROW, SUBMISSION, makeLegacyRepo, reservationDoc, chapterDoc, write, POLICY_DOC, TERMS_DOC } from './rebaseFixture.test-support.js';
import { cleanupDocsMigrate, commitAll, doc, filesIn, git, idsUnder, makeGitRepo, OLD_LAYOUT, runMigrate, snapshot } from './docsMigrate.test-support.js';

after(() => {
  cleanupDocsMigrate();
  cleanupRebase();
});

const OWNER = ['--owner', '@lead'];

/** 旧い構成の repo に、本物の git の commit を付ける (makeLegacyRepo は git を作らない) */
function gitOver(root: string): void {
  git(root, ['init', '-q']);
  commitAll(root);
}

const commitCount = (root: string): string => git(root, ['rev-list', '--count', 'HEAD']).trim();

describe('docs-migrate (テスト仕様 07)', () => {
  it('TST-101 旧い構成を移す: 3 フォルダの外に文書が無い・人の決定の README がある・終了 0・commit も add もしない', async () => {
    const root = makeGitRepo(OLD_LAYOUT);
    const before = commitCount(root);
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    const top = readdirSync(join(root, 'docs')).sort();
    for (const name of top) assert.ok(['ai', 'client', 'person', 'README.md', 'dependencies.md'].includes(name), `docs 直下に余り: ${name}`);
    assert.ok(existsSync(join(root, 'docs/person/decisions/README.md')));
    assert.ok(existsSync(join(root, 'docs/person/design/shared/00-map.md')));
    assert.ok(existsSync(join(root, 'docs/ai/specs/shared/tests/02-other.md')));
    assert.ok(existsSync(join(root, 'docs/ai/specs/reservation/tests/01-approval-gate.md')));
    assert.ok(existsSync(join(root, 'docs/person/decisions/2025/0001-a.md')));
    assert.equal(commitCount(root), before);
    assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '');
    assert.ok(existsSync(join(root, 'AGENTS.md')));
    assert.ok(existsSync(join(root, '.github/CODEOWNERS')));
  });

  it('TST-102 v3 の構成を移す: docs/common/ が無い・3 フォルダの中の古い README が無い・空のフォルダが残らない', async () => {
    const root = makeGitRepo({
      'docs/common/glossary.md': doc({ id: 'glossary-v3', kind: 'glossary', status: 'fixed' }, '# 用語\n'),
      'docs/common/req.md': doc({ id: 'req-v3', kind: 'requirements', status: 'draft', depends_on: [] }, '# 要件\n'),
      'docs/ai/specs/api.md': doc({ id: 'api-v3', kind: 'api-spec', context: 'billing', status: 'draft', depends_on: [] }, '# API\n'),
      'docs/person/legacy/README.md': '# 旧い\n\n> このディレクトリの目的: 古い\n',
      'docs/client/delivery/q1/01-chapter.md': doc({ id: 'chapter-q1', kind: 'delivery-chapter', status: 'draft' }, '# 章\n'),
      'docs/client/delivery/q1/deliverable.json': JSON.stringify({ title: 't', issuer: 'i', version: '1', date: '2026-01-01', chapters: ['01-chapter.md'], output: 'q1.pdf' }),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.equal(existsSync(join(root, 'docs/common')), false);
    assert.equal(existsSync(join(root, 'docs/person/legacy/README.md')), false);
    assert.ok(existsSync(join(root, 'docs/person/design/shared/10-glossary.md')));
    assert.ok(existsSync(join(root, 'docs/ai/specs/billing/api/api.md')));
    assert.ok(existsSync(join(root, 'docs/client/delivery/q1/01-chapter.md')));
    const emptyDirs = readdirSync(join(root, 'docs'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => readdirSync(join(entry.parentPath, entry.name)).length === 0);
    assert.deepEqual(emptyDirs.map((entry) => entry.name), []);
  });

  it('TST-103 2 回目の実行は何も変えない (角括弧の humanPaths が、持ち主の付いたファイルに当たっても 2 回目で止まらない)', async () => {
    // 角括弧の glob は CODEOWNERS に写せないので、当たるファイルには 1 件ずつ行が要る (既存の行で足りている)
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      '.igeta.json': JSON.stringify({ humanPaths: ['src/[a-c]*.ts'] }),
      '.github/CODEOWNERS': '/src/alpha.ts @lead\n',
      'src/alpha.ts': 'export const alpha = 1;\n',
    });
    assert.equal((await runMigrate(root, OWNER)).code, 0);
    commitAll(root);
    const after1 = snapshot(root);
    const second = await runMigrate(root, OWNER);
    assert.equal(second.code, 0, second.err.join('\n'));
    assert.equal(git(root, ['status', '--short']).trim(), '');
    assert.deepEqual(snapshot(root), after1);
  });

  it('TST-104 --dry-run は計画を種類ごとにパスの順で出し、作業ツリーを 1 バイトも変えない', async () => {
    const root = makeGitRepo(OLD_LAYOUT);
    const before = snapshot(root);
    const result = await runMigrate(root, [...OWNER, '--dry-run']);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.deepEqual(snapshot(root), before);
    assert.equal(git(root, ['status', '--short']).trim(), '');
    const moves = result.out.filter((line) => line.startsWith('MOVE ')).map((line) => line.slice(5).split(' -> ')[0] ?? '');
    assert.deepEqual(moves, [...moves].sort());
    assert.ok(result.out.some((line) => line === 'MOVE docs/00-map.md -> docs/person/design/shared/00-map.md'));
    assert.ok(result.out.some((line) => line.startsWith('DELETE docs/adr/README.md ')));
    assert.ok(result.out.some((line) => line === 'CREATE AGENTS.md'));
    assert.ok(result.out.every((line) => /^(MOVE|DELETE|CREATE|APPEND|REWRITE|NOTICE|DRY-RUN) /.test(line)));
  });

  it('TST-105 移す文書を指すリンク (#節つき・画像・docs/ の外の README から) は、全部が新しい相対パスになる', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'README.md': '# 入口\n\n[要件](docs/product/02-audience-directories.md#x)\n',
      'docs/design/basic/02-solution-strategy.md': doc(
        { id: 'docs-model-strategy', kind: 'solution-strategy', status: 'draft', depends_on: ['requirements'] },
        '# 解決戦略\n\n[要件](../../product/01-requirements.md#1-業務要件) を見る。\n',
      ),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.ok(readFileSync(join(root, 'README.md'), 'utf8').includes('(docs/person/requirements/02-audience-directories.md#x)'));
    const strategy = readFileSync(join(root, 'docs/person/design/shared/02-solution-strategy.md'), 'utf8');
    assert.ok(strategy.includes('(../../requirements/01-requirements.md#1-業務要件)'));
  });

  it('TST-106 提出物 (章・由来・台帳・ログ・manifest) はフォルダごと移り、sourceDoc が新しいパスになる。再合意の知らせが出る', async () => {
    const repo = makeLegacyRepo();
    gitOver(repo.root);
    const result = await runMigrate(repo.root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    const moved = 'docs/client/delivery/design-document';
    assert.ok(existsSync(join(repo.root, moved, '01-reservation.md')));
    assert.ok(existsSync(join(repo.root, moved, '01-reservation.provenance.json')));
    assert.ok(existsSync(join(repo.root, moved, 'agreements.ledger.jsonl')));
    assert.ok(existsSync(join(repo.root, moved, 'deliverable.json')));
    assert.equal(existsSync(join(repo.root, 'docs/delivery')), false);
    const sidecar = JSON.parse(readFileSync(join(repo.root, moved, '01-reservation.provenance.json'), 'utf8')) as { sourceDoc: string };
    assert.equal(sidecar.sourceDoc, `${moved}/01-reservation.md`);
    assert.ok(result.out.some((line) => line.startsWith('NOTICE 再合意:')));
    assert.ok(result.out.some((line) => line.startsWith('REWRITE docs/client/delivery/design-document/01-reservation.provenance.json')));
  });

  it('TST-107 文書と同じフォルダの画像を、その文書だけが使うなら、文書と一緒に移り、リンクが解決する', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/design/basic/02-solution-strategy.md': doc(
        { id: 'docs-model-strategy', kind: 'solution-strategy', status: 'draft', depends_on: ['requirements'] },
        '# 解決戦略\n\n![構成](images/arch.svg)\n',
      ),
      'docs/design/basic/images/arch.svg': '<svg></svg>\n',
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.equal(existsSync(join(root, 'docs/person/design/shared/images/arch.svg')), true);
    assert.equal(existsSync(join(root, 'docs/design/basic/images/arch.svg')), false);
    assert.ok(readFileSync(join(root, 'docs/person/design/shared/02-solution-strategy.md'), 'utf8').includes('![構成](images/arch.svg)'));
  });

  it('TST-108 過去の版と同じ本文の手引きの写しは消す。depends_on の id を外し、本文のリンクは文字と手引きのパスになる', async () => {
    // 手引き (human-review) の本文は、v0.5.0 と HEAD の版の値の表にある。リンクの行き先を 1 つ書き換えて、比べ方が行き先を見ないことを確かめる
    const guide = readFileSync(join(IGETA_ROOT, 'templates/docs/ai/handbook/how-to/03-human-review.md'), 'utf8');
    const copyId = /^id:\s*(\S+)/m.exec(guide)?.[1] ?? '';
    assert.notEqual(copyId, '');
    const changed = guide.replace(/\]\(([^)]+)\)/, '](../elsewhere.md)');
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/guides/03-human-review.md': changed,
      'docs/product/03-refs.md': doc(
        { id: 'refs', kind: 'requirements', status: 'draft', depends_on: [copyId, 'requirements'] },
        '# 参照\n\n[手引き](../guides/03-human-review.md) を見る。\n',
      ),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.equal(existsSync(join(root, 'docs/guides')), false);
    const refs = readFileSync(join(root, 'docs/person/requirements/03-refs.md'), 'utf8');
    const frontmatter = refs.split('---')[1] ?? '';
    assert.ok(!frontmatter.includes(copyId), 'depends_on から写しの id が外れていない');
    assert.ok(frontmatter.includes('depends_on: [requirements]'));
    assert.ok(refs.includes('手引き `node_modules/igeta/templates/docs/ai/handbook/how-to/03-human-review.md`'));
  });

  it('TST-109 年・まとまり・超過: ADR は年のフォルダへ・context の無い文書は shared へ (一覧で知らせる)・解説は下位フォルダへ・API の超過は作業の列', async () => {
    const explanations: Record<string, string> = {};
    for (let i = 1; i <= 16; i += 1) {
      const n = String(i).padStart(2, '0');
      explanations[`docs/explanation/${n}-e.md`] = doc({ id: `explain-${n}`, kind: 'explanation', status: 'active' }, `# 解説 ${n}\n`);
    }
    const apis: Record<string, string> = {};
    for (let i = 1; i <= 16; i += 1) {
      const n = String(i).padStart(2, '0');
      apis[`docs/api/reservation/a${n}.md`] = doc({ id: `api-${n}`, kind: 'api-spec', context: 'reservation', status: 'draft', depends_on: [] }, `# API ${n}\n`);
    }
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/api/general.md': doc({ id: 'api-general', kind: 'api-spec', status: 'draft', depends_on: [] }, '# 共通の API\n'),
      ...explanations,
      ...apis,
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.ok(existsSync(join(root, 'docs/person/decisions/2025/0001-a.md')));
    assert.ok(existsSync(join(root, 'docs/person/decisions/2026/0002-b.md')));
    assert.ok(existsSync(join(root, 'docs/person/decisions/2026/0003-c.md')));
    assert.ok(existsSync(join(root, 'docs/ai/specs/shared/api/general.md')));
    assert.ok(result.out.some((line) => line.startsWith('NOTICE context: docs/api/general.md')));
    for (let i = 1; i <= 16; i += 1) {
      const n = String(i).padStart(2, '0');
      assert.ok(existsSync(join(root, `docs/ai/handbook/explanation/shared/${n}-e.md`)), `解説 ${n} が下位フォルダに無い`);
    }
    assert.ok(result.out.some((line) => line.startsWith('WORK 1 フォルダの 15 本の超過: ') && !line.endsWith(': 0 件')));
  });

  it('TST-110 承認の割り当て: AGENTS.md と CODEOWNERS を作り、入口の 3 行を新しい 3 行に替える。AI の入口の検査が通る', async () => {
    const root = makeGitRepo(OLD_LAYOUT);
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.ok(existsSync(join(root, 'AGENTS.md')));
    const codeowners = readFileSync(join(root, '.github/CODEOWNERS'), 'utf8');
    assert.ok(codeowners.includes('/docs/person/ @lead'));
    const entrance = readFileSync(join(root, 'docs/README.md'), 'utf8');
    assert.ok(entrance.includes('- **人が決める** — `person/`'));
    assert.ok(!entrance.includes('- **顧客** (非エンジニア)'));
    const agents = new AgentsEntrypointCheck().run({ targetRoot: root, igetaRoot: IGETA_ROOT });
    assert.deepEqual(agents, []);
  });

  it('TST-111 人の型になっていない基本設計は、終了 0 で、型・向き・届く・ADR の違反を種類ごとの件数で出す', async () => {
    const root = makeGitRepo(OLD_LAYOUT);
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    const typeLine = result.out.find((line) => line.startsWith('WORK 人の文書の型と量'));
    assert.ok(typeLine !== undefined && !typeLine.endsWith(': 0 件'), '人の文書の型の作業の列が空');
    assert.ok(result.out.some((line) => line.startsWith('WORK 索引と参照')));
    assert.ok(result.out.some((line) => line.startsWith('WORK AI の文書の未決の節')));
  });

  it('TST-112 --split-report: 由来が指す正本の行が変わったものを、取れる操作つきで 1 行ずつ出す。何も書かない', async () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ row101: '| REQ-101 | 予約は 60 日前まで受け付ける | 備考 A |' }));
    gitOver(repo.root);
    const before = snapshot(repo.root);
    const result = await runMigrate(repo.root, ['--split-report']);
    assert.equal(result.code, 0, result.err.join('\n'));
    const lines = result.out.filter((line) => line.startsWith('SPLIT '));
    assert.equal(lines.length, 1, result.out.join('\n'));
    assert.ok(lines[0]?.includes('取り直して承認し直す / 顧客へ新しい版を出す'));
    assert.ok(lines[0]?.includes(ROW_FROM));
    assert.deepEqual(snapshot(repo.root), before);
  });

  // ---- 止める条件 (テスト仕様 07 の 2 の否定テスト) ----

  it('TST-301 止める条件 S1〜S9: どれも STOP の行を出し、終了 2。作業ツリーは前と同じ', async () => {
    const stopCases: { code: string; build: () => string; args: readonly string[] }[] = [
      {
        code: 'S1',
        args: OWNER,
        build: () => {
          const root = makeGitRepo(OLD_LAYOUT);
          writeFileSync(join(root, 'untracked.txt'), 'x\n');
          return root;
        },
      },
      { code: 'S2', args: OWNER, build: () => makeGitRepo({ ...OLD_LAYOUT, 'docs/product/09-nokind.md': '# 種類の無い文書\n' }) },
      {
        code: 'S3',
        args: OWNER,
        build: () => {
          const guide = readFileSync(join(IGETA_ROOT, 'templates/docs/ai/handbook/how-to/03-human-review.md'), 'utf8');
          return makeGitRepo({ ...OLD_LAYOUT, 'docs/guides/03-human-review.md': `${guide}\n手で足した 1 文。\n` });
        },
      },
      { code: 'S4', args: OWNER, build: () => makeGitRepo({ ...OLD_LAYOUT, CODEOWNERS: '* @someone\n' }) },
      {
        code: 'S4',
        args: OWNER,
        build: () => makeGitRepo({ ...OLD_LAYOUT, 'docs/a-map.md': doc({ id: 'map-a', kind: 'map', status: 'active' }, '# A\n') }),
      },
      { code: 'S5', args: OWNER, build: () => makeGitRepo({ ...OLD_LAYOUT, 'docs/contracts/no-context.md': doc({ id: 'nc', kind: 'context-contract', status: 'draft' }, '# 約束\n') }) },
      { code: 'S6', args: OWNER, build: () => makeGitRepo({ ...OLD_LAYOUT, 'docs/loose/pic.svg': '<svg></svg>\n' }) },
      {
        code: 'S7',
        args: OWNER,
        build: () => {
          const repo = makeLegacyRepo();
          writeFileSync(join(repo.root, 'docs/delivery/design-document/01-reservation.provenance.json'), '{ 壊れた');
          gitOver(repo.root);
          return repo.root;
        },
      },
      { code: 'S8', build: () => makeGitRepo(OLD_LAYOUT), args: [] },
      {
        code: 'S8',
        args: OWNER,
        build: () => {
          const repo = makeLegacyRepo();
          writeFileSync(join(repo.root, SUBMISSION, 'deliverable.json'), MANIFEST.replace('"01-reservation.md"', '"99-missing.md"'));
          gitOver(repo.root);
          return repo.root;
        },
      },
      {
        code: 'S9',
        args: OWNER,
        build: () => {
          const repo = makeLegacyRepo();
          write(repo.root, `${SUBMISSION}/img.svg`, '<svg></svg>\n');
          const chapter = readFileSync(join(repo.root, CHAPTER), 'utf8');
          writeFileSync(join(repo.root, CHAPTER), `${chapter}\n![図](img.svg)\n`);
          gitOver(repo.root);
          return repo.root;
        },
      },
    ];
    for (const stopCase of stopCases) {
      const root = stopCase.build();
      const beforeStatus = git(root, ['status', '--short']);
      const beforeFiles = snapshot(root);
      const result = await runMigrate(root, stopCase.args);
      assert.equal(result.code, 2, `${stopCase.code}: 終了コード 2 を期待 (${result.out.join(' / ')})`);
      assert.ok(result.out.some((line) => line.startsWith(`STOP ${stopCase.code}:`)), `${stopCase.code}: STOP の行が無い (${result.out.join(' / ')})`);
      assert.equal(git(root, ['status', '--short']), beforeStatus);
      assert.deepEqual(snapshot(root), beforeFiles);
    }
  });

  it('TST-302 止める条件は 1 つ目で止まらず、全部出す (S2 と S4 と S6 が同時にある)', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/product/09-nokind.md': '# 種類の無い文書\n',
      'docs/a-map.md': doc({ id: 'map-a', kind: 'map', status: 'active' }, '# A\n'),
      'docs/loose/pic.svg': '<svg></svg>\n',
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 2);
    for (const code of ['S2', 'S4', 'S6']) assert.ok(result.out.some((line) => line.startsWith(`STOP ${code}:`)), `${code} が出ていない`);
  });

  it('TST-303 kind が無く置き場所から推定できそうな文書は、推定で置かず S2 で止まる', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/design/basic/02-solution-strategy.md': '# 解決戦略\n\n## 構成\n\n本文。\n',
    });
    const before = snapshot(root);
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 2);
    assert.ok(result.out.some((line) => line.startsWith('STOP S2: docs/design/basic/02-solution-strategy.md')));
    assert.deepEqual(snapshot(root), before);
  });

  it('TST-304 手を入れた手引きの写し (本文に 1 文足した) は S3 で止まり、消さない', async () => {
    const guide = readFileSync(join(IGETA_ROOT, 'templates/docs/ai/handbook/how-to/03-human-review.md'), 'utf8');
    const root = makeGitRepo({ ...OLD_LAYOUT, 'docs/guides/03-human-review.md': `${guide}\n手で足した 1 文。\n` });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 2);
    assert.ok(result.out.some((line) => line.startsWith('STOP S3: docs/guides/03-human-review.md')));
    assert.ok(existsSync(join(root, 'docs/guides/03-human-review.md')));
  });

  it('TST-305 承認済みの章が、同じフォルダの画像 (id の無いファイル) を使う → S9。nonDocPaths に足すと進み、由来の状態は同じ', async () => {
    const repo = makeLegacyRepo();
    write(repo.root, `${SUBMISSION}/img.svg`, '<svg></svg>\n');
    const chapter = readFileSync(join(repo.root, CHAPTER), 'utf8');
    writeFileSync(join(repo.root, CHAPTER), `${chapter}\n![図](img.svg)\n`);
    gitOver(repo.root);
    const stopped = await runMigrate(repo.root, OWNER);
    assert.equal(stopped.code, 2);
    assert.ok(stopped.out.some((line) => line.startsWith('STOP S9:')));
    writeFileSync(join(repo.root, '.igeta.json'), JSON.stringify({ nonDocPaths: ['docs/delivery/**/*.svg'] }));
    commitAll(repo.root);
    const passed = await runMigrate(repo.root, OWNER);
    assert.equal(passed.code, 0, `${passed.out.join('\n')}\n${passed.err.join('\n')}`);
    // 画像は nonDocPaths に当たるので動かない (章のフォルダの中に残る)
    assert.ok(existsSync(join(repo.root, 'docs/delivery/design-document/img.svg')));
  });

  it('TST-306 コードフェンス・コードスパン・参照の形の定義の中のパスは書き換えず、一覧で知らせる', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/product/04-notes.md': doc(
        { id: 'notes', kind: 'requirements', status: 'draft', depends_on: [] },
        [
          '# 注記',
          '',
          '```',
          '[x](02-audience-directories.md)',
          '```',
          '',
          '`docs/product/02-audience-directories.md` を参照。',
          '',
          '[r]: ../product/02-audience-directories.md',
          '',
        ].join('\n'),
      ),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    const notes = readFileSync(join(root, 'docs/person/requirements/04-notes.md'), 'utf8');
    assert.ok(notes.includes('[x](02-audience-directories.md)'));
    assert.ok(notes.includes('`docs/product/02-audience-directories.md`'));
    assert.ok(notes.includes('[r]: ../product/02-audience-directories.md'));
    assert.ok(result.out.some((line) => line.startsWith('NOTICE 旧い path: docs/person/requirements/04-notes.md:')));
  });

  it('TST-307 移した後に由来の指紋が変わる (リンクの行き先の書き換えで要確認に変わる) → 終了 1 で、戻す手順を出す', async () => {
    const row = '| REQ-101 | 予約は 30 日前まで [未あり](./missing.md) | 備考 A |';
    const base = {
      'docs/requirements/reservation.md': reservationDoc({ row101: row }),
      'docs/requirements/policy.md': POLICY_DOC,
      'docs/glossary/terms.md': TERMS_DOC,
      [CHAPTER]: chapterDoc(),
      [`${SUBMISSION}/deliverable.json`]: MANIFEST,
    };
    const root = makeGitRepo(base);
    // v3 の指紋 (今の版) を、移す前の本文から計算する。リンク先は無い (壊れている) ので、行き先の文字がそのまま指紋に入る
    const index = buildSourceIndex(root, join(root, 'docs'));
    if (index === null) throw new Error('fixture: 索引が作れない');
    const resolution = resolveSource(index, ROW_FROM);
    if (resolution.kind === 'missing') throw new Error('fixture: 由来が解決できない');
    const fingerprint = computeFingerprint(resolution.text, 3, buildLinkTable(root, index).rewriterFor(resolution.doc.relPath));
    const entry: ProvenanceEntry = {
      anchor: ANCHOR_ROW,
      from: ROW_FROM,
      fingerprint,
      capturedBy: 'agent:writer',
      capturedAt: '2026-09-28',
      acceptedBy: 'reviewer@example.com',
      acceptedAt: '2026-09-29',
      normalizationVersion: 3,
    };
    writeSidecar(join(root, CHAPTER), { sourceDoc: CHAPTER, entries: [entry] });
    commitAll(root);
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 1, result.out.join('\n'));
    assert.ok(result.err.some((line) => line.startsWith('FAIL C4')), result.err.join('\n'));
    assert.ok(result.err.some((line) => line.includes('作業ツリーを戻す: git -C')));
  });

  it('TST-308 1 つの画像を、別々のフォルダへ移る 2 本の文書が使う → S6 で止まる', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/x/a.md': doc({ id: 'xa', kind: 'requirements', status: 'draft', depends_on: [] }, '![図](img.svg)\n'),
      'docs/x/b.md': doc({ id: 'xb', kind: 'solution-strategy', status: 'draft', depends_on: [] }, '![図](img.svg)\n'),
      'docs/x/img.svg': '<svg></svg>\n',
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 2);
    assert.ok(result.out.some((line) => line.startsWith('STOP S6: docs/x/img.svg')));
  });

  it('TST-309 約束 (contract) に context が無い・context: shared なら S5 で止まる', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/contracts/a.md': doc({ id: 'ca', kind: 'context-contract', status: 'draft' }, '# A\n'),
      'docs/contracts/b.md': doc({ id: 'cb', kind: 'context-contract', context: 'shared', status: 'draft' }, '# B\n'),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 2);
    assert.ok(result.out.some((line) => line.startsWith('STOP S5: docs/contracts/a.md')));
    assert.ok(result.out.some((line) => line.startsWith('STOP S5: docs/contracts/b.md')));
  });

  it('TST-310 nonDocPaths の下のファイルは動かさない。前から壊れていたリンクは一覧に出るだけで、完了条件 C1 を落とさない', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      '.igeta.json': JSON.stringify({ nonDocPaths: ['docs/assets/**'] }),
      'docs/assets/keep.svg': '<svg>keep</svg>\n',
      'docs/product/05-links.md': doc(
        { id: 'links', kind: 'requirements', status: 'draft', depends_on: [] },
        '# リンク\n\n[壊れ](./nothere.md) と ![絵](../assets/keep.svg)。\n',
      ),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.equal(readFileSync(join(root, 'docs/assets/keep.svg'), 'utf8'), '<svg>keep</svg>\n');
    assert.ok(result.out.some((line) => line.startsWith('NOTICE 前から壊れたリンク: docs/person/requirements/05-links.md')));
  });

  it('TST-311 捨てたものを黙らない: 区間の外に文章を持つ古い README は一覧で知らせ、手で変えた入口の 3 行は替えない', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/adr/README.md': '# ADR\n\n> このディレクトリの目的: 決めの記録\n\n手で書いた注意: 変えないこと。\n',
      'docs/README.md': (OLD_LAYOUT['docs/README.md'] ?? '').replace('で得る', 'で得る (手で直した)'),
    });
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.ok(result.out.some((line) => line.startsWith('NOTICE README: docs/adr/README.md') && line.includes('手で書いた注意')));
    assert.ok(result.out.some((line) => line.startsWith('NOTICE 入口:')));
    assert.ok(readFileSync(join(root, 'docs/README.md'), 'utf8').includes('で得る (手で直した)'));
  });

  it('TST-312 文書と本文を失わない: 文書の id の集合・移した文書の本文・文書でないファイルの数が同じ', async () => {
    const root = makeGitRepo({
      ...OLD_LAYOUT,
      'docs/design/basic/images/arch.svg': '<svg></svg>\n',
      'docs/design/basic/02-solution-strategy.md': doc(
        { id: 'docs-model-strategy', kind: 'solution-strategy', status: 'draft', depends_on: ['requirements'] },
        '# 解決戦略\n\n![構成](images/arch.svg)\n',
      ),
    });
    const idsBefore = idsUnder(root, 'docs');
    const bodyBefore = (readFileSync(join(root, 'docs/product/02-audience-directories.md'), 'utf8').split('---\n').slice(2).join('---\n')).trim();
    const nonDocBefore = filesIn(root, 'docs').filter((path) => !path.endsWith('.md'));
    const result = await runMigrate(root, OWNER);
    assert.equal(result.code, 0, result.err.join('\n'));
    assert.deepEqual(idsUnder(root, 'docs'), idsBefore);
    const bodyAfter = (readFileSync(join(root, 'docs/person/requirements/02-audience-directories.md'), 'utf8').split('---\n').slice(2).join('---\n')).trim();
    assert.equal(bodyAfter, bodyBefore);
    assert.equal(filesIn(root, 'docs').filter((path) => !path.endsWith('.md')).length, nonDocBefore.length);
  });
});

