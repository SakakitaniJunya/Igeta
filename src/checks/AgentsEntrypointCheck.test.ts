// node --test dist/checks/AgentsEntrypointCheck.test.js
// AI の入口 (repo 直下の AGENTS.md) と、人の承認が要る側に CODEOWNERS のオーナーが付いているかの検査
// (ADR-0002 条件 15、ADR-0008 決定 1・3)。CODEOWNERS は GitHub の規則どおり読む: 後ろの行が勝ち、
// `docs/person/*` は直下のファイルにしか当たらない。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IGETA_ROOT } from '../core/Paths.js';
import type { Violation } from '../core/Report.js';
import { kindOfPath } from '../core/Role.js';
import { AgentsEntrypointCheck, CODEOWNERS_TARGETS } from './AgentsEntrypointCheck.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const AGENTS_OK = [
  '# AGENTS.md',
  '',
  '- 決まりは `docs/person/` (人が承認する。上流)',
  '- 作り方は `docs/ai/` (あなたの持ち場)',
  '',
].join('\n');

/** scaffold が作る形: 人の承認が要る側 (docs/person/・docs/client/ と、門を決める設定ファイル) にオーナーを付ける */
const CODEOWNERS_LINES: readonly string[] = [
  'docs/person/ @creanest/owners',
  'docs/client/ @creanest/owners',
  '/.github/ @creanest/owners',
  '/.igeta.json @creanest/owners',
  '/AGENTS.md @creanest/owners',
  '/package.json @creanest/owners',
];

const codeowners = (lines: readonly string[]): string => `${['# 人の承認が要る側', ...lines].join('\n')}\n`;

/** 新しい構成 (docs/person がある) で、AGENTS.md と CODEOWNERS が揃った repo */
function makeValidRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
  workspaces.push(root);
  write(root, 'docs/person/requirements/01-requirements.md', '---\nkind: requirements\n---\n# 要件\n');
  write(root, 'docs/ai/handbook/how-to/01-setup.md', '---\nkind: guide\n---\n# 手順\n');
  write(root, 'AGENTS.md', AGENTS_OK);
  write(root, '.github/CODEOWNERS', codeowners(CODEOWNERS_LINES));
  return root;
}

const run = (root: string): readonly Violation[] => new AgentsEntrypointCheck().run({ targetRoot: root, igetaRoot: IGETA_ROOT });

/** 「.github/CODEOWNERS が <守る対象> を守っていない」の、守る対象の名前 */
const labelsOf = (violations: readonly Violation[]): (string | undefined)[] =>
  violations.map((violation) => /が (.+?) を守っていない/.exec(violation.message)?.[1]);

const PERSON = 'docs/person/ (配下全体)';
const CLIENT = 'docs/client/ (配下全体)';
const CONFIG_LABELS = ['.github/CODEOWNERS (自身)', '.github/workflows/ (配下全体)', '.igeta.json', 'AGENTS.md', 'package.json'];

describe('AgentsEntrypointCheck: AGENTS.md', () => {
  let root: string;
  beforeEach(() => {
    root = makeValidRoot();
  });

  it('AGENTS.md が docs/person/ と docs/ai/ に触れ、CODEOWNERS が人の承認が要る側を守っていれば通る', () => {
    assert.deepEqual(run(root), []);
  });

  it('repo 直下に AGENTS.md が無ければ落ちる (docs/ の中に置いても入口にならない)', () => {
    rmSync(join(root, 'AGENTS.md'));
    write(root, 'docs/ai/handbook/how-to/AGENTS.md', AGENTS_OK);
    // CODEOWNERS の行は AGENTS.md を指すので、AGENTS.md 自体が無いことだけが違反になる
    const violations = run(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.severity, 'violation');
    assert.equal(violations[0]?.file, 'AGENTS.md');
    assert.match(violations[0]?.message ?? '', /repo 直下に AGENTS\.md が無い/);
  });

  it('AGENTS.md がフォルダなら無いのと同じ', () => {
    rmSync(join(root, 'AGENTS.md'));
    mkdirSync(join(root, 'AGENTS.md'));
    assert.match(run(root)[0]?.message ?? '', /repo 直下に AGENTS\.md が無い/);
  });

  it('docs/person/ に触れていなければ落ち、触れていないのが docs/ai/ ならそちらが落ちる', () => {
    write(root, 'AGENTS.md', '# AGENTS.md\n\n作り方は `docs/ai/` を読む。\n');
    const noPerson = run(root);
    assert.equal(noPerson.length, 1);
    assert.match(noPerson[0]?.message ?? '', /AGENTS\.md が docs\/person\/ に触れていない/);

    write(root, 'AGENTS.md', '# AGENTS.md\n\n決まりは [人の文書](docs/person/design/shared/00-map.md)。\n');
    const noAi = run(root);
    assert.equal(noAi.length, 1);
    assert.match(noAi[0]?.message ?? '', /AGENTS\.md が docs\/ai\/ に触れていない/);
  });

  it('どちらにも触れていなければ 2 件落ちる', () => {
    write(root, 'AGENTS.md', '# AGENTS.md\n\nこの repo のルール。\n');
    assert.equal(run(root).length, 2);
  });

  it('名前の続きだけが似ているもの (docs/personal・docs/aim・mydocs/person) は触れたことにならない', () => {
    write(root, 'AGENTS.md', '# AGENTS.md\n\n`docs/personal/` と `docs/aim/` と `mydocs/person/` を読む。\n');
    assert.equal(run(root).length, 2);
  });

  it('./docs/person や、フォルダの末尾の / が無い書き方・文末の言及も触れたことになる', () => {
    write(root, 'AGENTS.md', 'まず ./docs/person を読む。次に docs/ai\n');
    assert.deepEqual(run(root), []);
  });
});

describe('AgentsEntrypointCheck: .github/CODEOWNERS (人の承認が要る側にオーナーが付いているか)', () => {
  let root: string;
  beforeEach(() => {
    root = makeValidRoot();
  });

  const setCodeowners = (lines: readonly string[]): void => write(root, '.github/CODEOWNERS', codeowners(lines));
  /** 基準の行のうち、docs/person/・docs/client/ の行だけを差し替える (設定ファイルの行は残す) */
  const withDocsLines = (person: string, client: string): readonly string[] => [person, client, ...CODEOWNERS_LINES.slice(2)];

  it('CODEOWNERS が無ければ落ちる', () => {
    rmSync(join(root, '.github'), { recursive: true });
    const violations = run(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.file, '.github/CODEOWNERS');
    assert.match(violations[0]?.message ?? '', /\.github\/CODEOWNERS が無い/);
  });

  it('AGENTS.md と CODEOWNERS の両方が無ければ、それぞれ 1 件ずつ落ちる', () => {
    rmSync(join(root, 'AGENTS.md'));
    rmSync(join(root, '.github'), { recursive: true });
    assert.equal(run(root).length, 2);
  });

  describe('配下全体を守る書き方だけを数える (`/*` は直下のファイルにしか当たらない)', () => {
    it('docs/person/* と docs/client/* は、下のフォルダの文書を守らないので落ちる', () => {
      setCodeowners(withDocsLines('docs/person/* @creanest/owners', 'docs/client/* @creanest/owners'));
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [PERSON, CLIENT]);
      assert.ok(violations.every((violation) => violation.severity === 'violation' && violation.file === '.github/CODEOWNERS'));
      // 当たらないのは、下のフォルダの代表のパス。案内に、配下全体に当たる書き方と、/* の限界を出す
      assert.match(violations[0]?.message ?? '', /docs\/person\/design\/shared\/00-map\.md に当たる行が無い/);
      assert.match(violations[0]?.message ?? '', /docs\/person\/decisions\/2026\/0001-x\.md に当たる行が無い/);
      assert.match(violations[0]?.message ?? '', /docs\/person\/\* は直下のファイルにしか当たらない/);
      assert.match(violations[1]?.message ?? '', /docs\/client\/delivery\/x\/01\.md に当たる行が無い/);
    });

    it('先頭に / を付けた /docs/person/* も同じ (repo 直下の docs/person/ の、直下のファイルだけ)', () => {
      setCodeowners(withDocsLines('/docs/person/* @creanest/owners', '/docs/client/* @creanest/owners'));
      assert.deepEqual(labelsOf(run(root)), [PERSON, CLIENT]);
    });

    const WHOLE_FOLDER_FORMS: ReadonlyArray<readonly [string, string]> = [
      ['docs/person/', 'docs/client/'],
      ['/docs/person/', '/docs/client/'],
      ['docs/person/**', 'docs/client/**'],
      ['/docs/person/**', '/docs/client/**'],
      ['docs/person', 'docs/client'],
      ['/docs/person', '/docs/client'],
    ];
    for (const [person, client] of WHOLE_FOLDER_FORMS) {
      it(`配下全体に当たる書き方 ${person} と ${client} は通る (オーナーが複数・メールでもよい)`, () => {
        setCodeowners(withDocsLines(`${person} @a @creanest/owners person@example.com`, `${client} @b`));
        assert.deepEqual(run(root), []);
      });
    }

    it('名前の続きだけが似ているフォルダ (docs/personal/・docs/client-old/) の行は、docs/person/・docs/client/ を守らない', () => {
      setCodeowners(withDocsLines('docs/personal/ @creanest/owners', 'docs/client-old/ @creanest/owners'));
      assert.deepEqual(labelsOf(run(root)), [PERSON, CLIENT]);
    });

    it('1 つ下のフォルダだけを守る行 (docs/person/design/・docs/person/decisions/) は、requirements の文書を守らないので落ちる', () => {
      setCodeowners([
        'docs/person/design/ @creanest/owners',
        'docs/person/decisions/ @creanest/owners',
        ...CODEOWNERS_LINES.slice(1),
      ]);
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [PERSON]);
      assert.match(violations[0]?.message ?? '', /docs\/person\/requirements\/01-requirements\.md に当たる行が無い/);
      assert.equal(/design\/shared\/00-map\.md に当たる行が無い/.test(violations[0]?.message ?? ''), false);
    });

    it('CRLF の CODEOWNERS も同じに読む', () => {
      write(root, '.github/CODEOWNERS', `${CODEOWNERS_LINES.join('\r\n')}\r\n`);
      assert.deepEqual(run(root), []);
    });
  });

  describe('最後に当たった行が決める (広い書き方で守る repo は通し、後ろの行でオーナーを外したら落とす)', () => {
    it('* だけの 1 行で、docs/person/・docs/client/・設定ファイルの全部を守っていれば通る', () => {
      setCodeowners(['* @lead']);
      assert.deepEqual(run(root), []);
    });

    it('/docs/ のような広い行は docs/person/・docs/client/ を守るが、設定ファイルは別の行が要る', () => {
      setCodeowners(['/docs/ @lead']);
      assert.deepEqual(labelsOf(run(root)), CONFIG_LABELS);
      setCodeowners(['docs/ @lead', ...CODEOWNERS_LINES.slice(2)]);
      assert.deepEqual(run(root), []);
      setCodeowners(['/docs/ @lead', '/.github/ @lead', '/.igeta.json @lead', '/AGENTS.md @lead', '/package.json @lead']);
      assert.deepEqual(run(root), []);
    });

    it('* の後ろで docs/person/ のオーナーを外すと、docs/person/ だけが落ちる (オーナーの無い行が最後に当たる)', () => {
      setCodeowners(['* @lead', 'docs/person/']);
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [PERSON]);
      assert.match(violations[0]?.message ?? '', /docs\/person\/requirements\/01-requirements\.md に最後に当たる 3 行目 \(docs\/person\/\) にオーナーが無い/);
    });

    it('docs/person/ に付けたオーナーを、後ろの行でその下のフォルダだけ外しても落ちる (人の決定の年のフォルダ)', () => {
      setCodeowners([...CODEOWNERS_LINES, 'docs/person/decisions/2026/']);
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [PERSON]);
      assert.match(violations[0]?.message ?? '', /docs\/person\/decisions\/2026\/0001-x\.md に最後に当たる 8 行目 \(docs\/person\/decisions\/2026\/\) にオーナーが無い/);
      assert.equal(/requirements\/01-requirements\.md/.test(violations[0]?.message ?? ''), false);
    });

    it('具体的なファイルの行でオーナーを外した場合も落ちる (docs/client/delivery/x/01.md)', () => {
      setCodeowners([...CODEOWNERS_LINES, '/docs/client/delivery/x/01.md']);
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [CLIENT]);
      assert.match(violations[0]?.message ?? '', /docs\/client\/delivery\/x\/01\.md に最後に当たる 8 行目/);
    });

    it('後ろの行が別のオーナーに替えるだけなら通る。前の行がオーナーを外していても、後ろの行がオーナーを付ければ通る', () => {
      setCodeowners([...CODEOWNERS_LINES, 'docs/person/decisions/ @creanest/decision-makers']);
      assert.deepEqual(run(root), []);
      setCodeowners(['docs/person/', 'docs/client/', '* @lead']);
      assert.deepEqual(run(root), []);
      setCodeowners(['docs/person/', 'docs/person/ @creanest/owners', ...CODEOWNERS_LINES.slice(1)]);
      assert.deepEqual(run(root), []);
    });

    it('どの行にも当たらないパスは、守られていない (当たる行が無い)。オーナーがあっても、別のパスの行は守らない', () => {
      setCodeowners(['/src/ @lead']);
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [PERSON, CLIENT, ...CONFIG_LABELS]);
      assert.ok(violations.every((violation) => /に当たる行が無い/.test(violation.message)));
    });

    it('拡張子で当てる行 (*.md) は、その拡張子のファイルだけを守る', () => {
      setCodeowners(['*.md @lead']);
      // docs/person/・docs/client/ の代表のパスは全部 .md、設定ファイルは AGENTS.md だけが .md
      assert.deepEqual(labelsOf(run(root)), ['.github/CODEOWNERS (自身)', '.github/workflows/ (配下全体)', '.igeta.json', 'package.json']);
    });
  });

  describe('設定ファイル (ADR-0008 決定 3): CODEOWNERS 自身・workflows・.igeta.json・AGENTS.md・package.json', () => {
    const CONFIG_LINE_REMOVALS: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['/.github/ @creanest/owners', ['.github/CODEOWNERS (自身)', '.github/workflows/ (配下全体)']],
      ['/.igeta.json @creanest/owners', ['.igeta.json']],
      ['/AGENTS.md @creanest/owners', ['AGENTS.md']],
      ['/package.json @creanest/owners', ['package.json']],
    ];
    for (const [line, labels] of CONFIG_LINE_REMOVALS) {
      it(`${line} の行が無ければ、${labels.join('・')} が落ちる`, () => {
        setCodeowners(CODEOWNERS_LINES.filter((candidate) => candidate !== line));
        assert.deepEqual(labelsOf(run(root)), labels);
      });
    }

    it('.github/workflows/ の行だけ・.github/CODEOWNERS の行だけでも、それぞれの対象は守れる', () => {
      setCodeowners([...CODEOWNERS_LINES.slice(0, 2), '.github/workflows/ @creanest/owners', ...CODEOWNERS_LINES.slice(3)]);
      assert.deepEqual(labelsOf(run(root)), ['.github/CODEOWNERS (自身)']);
      setCodeowners([...CODEOWNERS_LINES.slice(0, 2), '.github/CODEOWNERS @creanest/owners', ...CODEOWNERS_LINES.slice(3)]);
      assert.deepEqual(labelsOf(run(root)), ['.github/workflows/ (配下全体)']);
    });

    it('名前だけの行 (AGENTS.md・package.json) はどの階層の同じ名前にも当たるので、repo 直下のものも守る', () => {
      setCodeowners([...CODEOWNERS_LINES.slice(0, 3), '.igeta.json @a', 'AGENTS.md @a', 'package.json @a']);
      assert.deepEqual(run(root), []);
    });

    it('* の後ろで設定ファイルのオーナーを外すと、その設定ファイルだけが落ちる', () => {
      setCodeowners(['* @lead', '/.igeta.json']);
      assert.deepEqual(labelsOf(run(root)), ['.igeta.json']);
      setCodeowners(['* @lead', '.github/workflows/']);
      assert.deepEqual(labelsOf(run(root)), ['.github/workflows/ (配下全体)']);
      setCodeowners(['* @lead', '/.github/CODEOWNERS']);
      assert.deepEqual(labelsOf(run(root)), ['.github/CODEOWNERS (自身)']);
    });
  });

  describe('コメント', () => {
    it('行頭のコメント・行頭が空白のコメントの行は、行とみなさない。オーナーの後ろのコメントは読み飛ばす', () => {
      setCodeowners([
        '# docs/client/ @creanest/owners',
        '   # docs/person/ @creanest/owners',
        'docs/person/ @creanest/owners # 人の決まり',
        ...CODEOWNERS_LINES.slice(2),
      ]);
      assert.deepEqual(labelsOf(run(root)), [CLIENT]);
    });

    it('パターンの後ろがコメントだけの行は、オーナーの無い行', () => {
      setCodeowners([...CODEOWNERS_LINES, 'docs/person/ # オーナーなし']);
      const violations = run(root);
      assert.deepEqual(labelsOf(violations), [PERSON]);
      assert.match(violations[0]?.message ?? '', /8 行目 \(docs\/person\/\) にオーナーが無い/);
    });
  });

  it('代表のパスは、置き場所の表 (Role.ts) にある場所と、設定ファイルのパス', () => {
    for (const target of CODEOWNERS_TARGETS) {
      for (const path of target.paths) {
        if (path.startsWith('docs/')) {
          assert.notEqual(kindOfPath(path.slice('docs/'.length)), null, `${path} が置き場所の表の場所ではない`);
        }
      }
    }
    assert.deepEqual(
      CODEOWNERS_TARGETS.map((target) => target.label),
      [PERSON, CLIENT, ...CONFIG_LABELS],
    );
    assert.deepEqual(
      CODEOWNERS_TARGETS.flatMap((target) => (target.label.startsWith('docs/') ? [] : target.paths)),
      ['.github/CODEOWNERS', '.github/workflows/ci.yml', '.igeta.json', 'AGENTS.md', 'package.json'],
    );
  });
});

describe('AgentsEntrypointCheck: 構成の検出', () => {
  it('person・ai・client のうち 1 つしか無くても新しい構成として検査する', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    write(root, 'docs/client/proposals/2026/01-proposal.md', '---\nkind: proposal\n---\n# 提案\n');
    assert.equal(run(root).length, 2);
  });

  it('旧い構成の repo は、AGENTS.md も CODEOWNERS も無くても何も出さない', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    write(root, 'docs/product/01-requirements.md', '---\nkind: requirements\n---\n# 要件\n');
    assert.deepEqual(run(root), []);
  });

  it('docs/common/ だけがある repo (person・ai・client が無い) も、新しい構成ではないので何も出さない', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    write(root, 'docs/common/01-glossary.md', '---\nkind: glossary\n---\n# 用語集\n');
    assert.deepEqual(run(root), []);
  });

  it('docs/ が無ければ検査不能', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    const violations = run(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.severity, 'cannot-check');
  });
});
