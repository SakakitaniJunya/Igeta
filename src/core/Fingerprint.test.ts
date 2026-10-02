// node --test dist/core/Fingerprint.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_NORMALIZATION_VERSION,
  computeFingerprint,
  isImplementedNormalizationVersion,
  matchStoredFingerprint,
  normalizeForFingerprint,
} from './Fingerprint.js';
import type { DestinationRewriter } from './Fingerprint.js';
import { buildLinkTable } from './LinkTable.js';
import { buildSourceIndex } from './SourceResolver.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-fingerprint-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, rel: string, id: string | null, body = '# 文書'): void {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  const frontmatter = id === null ? [] : ['---', `id: ${id}`, 'kind: requirements', 'depends_on: []', '---', ''];
  writeFileSync(target, `${[...frontmatter, body].join('\n')}\n`);
}

/** docs/ の文書 (id あり) を持つ repo と、本文がある文書 docPath でのリンクの解決を返す。 */
function rewriterIn(root: string, docPath: string): DestinationRewriter {
  return buildLinkTable(root, buildSourceIndex(root, join(root, 'docs'))).rewriterFor(docPath);
}

/** v2 の整形の決まり (v3 も v2 を含むので、同じ表で両方を確かめる)。 */
const FORMAT_ONLY_VERSIONS = [2, 3] as const;
const noLinks: DestinationRewriter = (destination) => destination;

describe('computeFingerprint: 整形の決まり (v2 と、v2 を含む v3)', () => {
  for (const version of FORMAT_ONLY_VERSIONS) {
    describe(`v${version}`, () => {
      const fp = (text: string): string => computeFingerprint(text, version, noLinks);

      it('CRLF と LF は同じ指紋になる', () => {
        assert.equal(fp('a\r\nb\r\n'), fp('a\nb\n'));
      });

      it('行末の空白は指紋に影響しない', () => {
        assert.equal(fp('予約の受付   \n内容'), fp('予約の受付\n内容'));
      });

      it('表の列幅をそろえる空白・区切り線の - の数は指紋に影響しない', () => {
        const a = ['| ID | 内容 |', '|---|---|', '| REQ-001 | 予約を受け付ける |'].join('\n');
        const b = ['| ID       | 内容            |', '|----------|-----------------|', '| REQ-001  | 予約を受け付ける |'].join('\n');
        assert.equal(fp(a), fp(b));
      });

      it('セル内容そのものが変わると指紋も変わる', () => {
        assert.notEqual(fp('| REQ-001 | 予約を受け付ける |'), fp('| REQ-001 | 予約を確定する |'));
      });

      it('本文の内容が変わると指紋が変わる', () => {
        assert.notEqual(fp('予約の受付は 30 日前まで'), fp('予約の受付は 60 日前まで'));
      });

      it('全角・半角の文字そのものは変換しない (連続する空白だけを正規化する)', () => {
        assert.notEqual(normalizeForFingerprint('３０日', version, noLinks), normalizeForFingerprint('30日', version, noLinks));
      });

      it('コードフェンスの中は字下げの違いで指紋が変わる', () => {
        const a = ['```ts', 'function f() {', '  return 1;', '}', '```'].join('\n');
        const b = ['```ts', 'function f() {', '    return 1;', '}', '```'].join('\n');
        assert.notEqual(fp(a), fp(b));
      });

      it('コードフェンスの外の整形 (連続する空白・表の列幅) は指紋を変えない', () => {
        const a = ['```ts', 'const  x = 1;', '```', '', '本文  の  整形。'].join('\n');
        const b = ['```ts', 'const  x = 1;', '```', '', '本文 の 整形。'].join('\n');
        assert.equal(fp(a), fp(b));
      });

      it('コードフェンスの中でも行末の空白・改行コードの違いは指紋に影響しない', () => {
        assert.equal(fp('```\r\ncode  \r\n```\r\n'), fp('```\ncode\n```\n'));
      });
    });
  }
});

describe('正規化の版', () => {
  // 載せ替え前の実装 (v2 だけがあった commit のビルド) で計算した値。v2 の実装を書き換えていないことの固定。
  const GOLDEN_V2: readonly { readonly name: string; readonly text: string; readonly normalized: string; readonly fingerprint: string }[] = [
    {
      name: '本文',
      text: '予約の受付は 30 日前まで\n内容',
      normalized: '予約の受付は 30 日前まで\n内容',
      fingerprint: 'sha256:8f6e748235d19fc3b909c46ecf6f000800543138d991ed509b980d27eed87461',
    },
    {
      name: 'CRLF・全角スペース',
      text: 'a\r\nb  \r\n\r\n　全角　スペース  混在\r\n',
      normalized: 'a\nb\n\n 全角 スペース 混在\n',
      fingerprint: 'sha256:4bbf1d1d7074a895c58b5498a8d9ddb8881f7644f066c0d950619e5453b6d7b0',
    },
    {
      name: '表',
      text: ['| ID       | 内容            |', '|----------|:---------------:|', '| REQ-001  | 予約を受け付ける |'].join('\n'),
      normalized: '| ID | 内容 |\n|---|\n| REQ-001 | 予約を受け付ける |',
      fingerprint: 'sha256:3fe3f9ae73f73e8a6e941300d52602b0c998cbd48355761c0cb7fe3fe6068813',
    },
    {
      name: 'コードフェンス',
      text: ['本文  です', '```ts', 'function f() {', '    return  1;', '}   ', '```', '', '表の外  の  空白'].join('\n'),
      normalized: '本文 です\n```ts\nfunction f() {\n    return  1;\n}\n```\n\n表の外 の 空白',
      fingerprint: 'sha256:d3cd2c4091d9a22582b987ee772b07d8813b78fc62bbfe15047be12840f0c8ba',
    },
    {
      name: 'リンク (v2 は行き先をそのまま残す)',
      text: ['詳しくは [要件](../requirements/reservation.md#機能要件) と [外部](https://example.com/a) を参照。', '| 用語 | [定義](./terms.md) |'].join('\n'),
      normalized: '詳しくは [要件](../requirements/reservation.md#機能要件) と [外部](https://example.com/a) を参照。\n| 用語 | [定義](./terms.md) |',
      fingerprint: 'sha256:9e7ef3f134b4663ce1643596764baec62da0efc497ba157a1cda6129e8fcc5d3',
    },
  ];

  for (const golden of GOLDEN_V2) {
    it(`v2 は載せ替え前の実装と同じ値を返す (${golden.name})`, () => {
      assert.equal(normalizeForFingerprint(golden.text, 2), golden.normalized);
      assert.equal(computeFingerprint(golden.text, 2), golden.fingerprint);
    });
  }

  it('今の版は 3、実装があるのは 2 と 3 だけ (1 とそれ以降は無い)', () => {
    assert.equal(CURRENT_NORMALIZATION_VERSION, 3);
    assert.deepEqual([0, 1, 2, 3, 4].map(isImplementedNormalizationVersion), [false, false, true, true, false]);
  });

  it('実装の無い版で計算しようとすると例外 (一致とみなす代用を作らない)', () => {
    assert.throws(() => computeFingerprint('a', 1), /版 1 の実装が無い/);
    assert.throws(() => computeFingerprint('a', 4, noLinks), /版 4 の実装が無い/);
  });

  it('v3 はリンクの行き先を直す関数が無いと例外 (黙って v2 と同じ値にしない)', () => {
    assert.throws(() => computeFingerprint('a', 3), /v3 にはリンクの行き先を直す関数が要る/);
  });

  it('リンクを含まない本文は、v2 と v3 で同じ指紋になる', () => {
    const text = ['## 節', '', '| ID | 内容 |', '|---|---|', '| REQ-001 | 予約を受け付ける |', '', '予約は 30 日前まで。'].join('\n');
    assert.equal(computeFingerprint(text, 3, noLinks), computeFingerprint(text, 2));
  });

  describe('matchStoredFingerprint (保存値を、保存した版で確かめる)', () => {
    const text = '予約は 30 日前まで。';
    it('保存した版で計算して同じなら match、本文が変わっていれば mismatch', () => {
      assert.equal(matchStoredFingerprint(computeFingerprint(text, 2), 2, text), 'match');
      assert.equal(matchStoredFingerprint(computeFingerprint(text, 2), 2, '予約は 60 日前まで。'), 'mismatch');
    });

    it('保存した版の実装が無ければ unverifiable (版番号だけを見て一致とみなさない)', () => {
      assert.equal(matchStoredFingerprint(computeFingerprint(text, 2), 1, text), 'unverifiable');
      assert.equal(matchStoredFingerprint('sha256:0', 0, text), 'unverifiable');
    });

    it('保存値が v2 の指紋なら、v3 で確かめても一致とみなさない (版を取り違えない)', () => {
      const withLink = '[要件](./a.md) を参照。';
      const root = makeRoot();
      writeDoc(root, 'docs/a.md', 'doc-a');
      const rewrite = rewriterIn(root, 'docs/x.md');
      assert.equal(matchStoredFingerprint(computeFingerprint(withLink, 2), 3, withLink, rewrite), 'mismatch');
      assert.equal(matchStoredFingerprint(computeFingerprint(withLink, 3, rewrite), 3, withLink, rewrite), 'match');
    });
  });
});

describe('computeFingerprint v3: リンクの行き先を文書 id で数える', () => {
  it('(a) 同じ本文でリンクのパスだけ違う 2 つ (別の深さの文書から同じ文書を指す) は、v3 の指紋が同じで v2 は違う', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/reservation.md', 'reservation-flow');
    writeDoc(root, 'docs/req/policy.md', 'cancel-policy');
    const shallow = [
      '詳しくは [要件](../req/reservation.md#機能要件) を参照。',
      '| 規約 | [キャンセル](../req/policy.md) |',
      '![図](../req/reservation.md)',
    ].join('\n');
    const deep = [
      '詳しくは [要件](../../req/reservation.md#機能要件) を参照。',
      '| 規約 | [キャンセル](../../req/policy.md) |',
      '![図](../../req/reservation.md)',
    ].join('\n');
    const inShallow = rewriterIn(root, 'docs/design/a.md');
    const inDeep = rewriterIn(root, 'docs/design/sub/b.md');
    assert.equal(computeFingerprint(shallow, 3, inShallow), computeFingerprint(deep, 3, inDeep));
    assert.notEqual(computeFingerprint(shallow, 2), computeFingerprint(deep, 2), 'v2 はパスの違いを別の内容と数える (v3 が直す対象)');
  });

  it('(a) 文書を動かしてリンクを書き換えても、本文の指紋は変わらない (リンク先の文書も動いた場合)', () => {
    const before = makeRoot();
    writeDoc(before, 'docs/req/reservation.md', 'reservation-flow');
    const after = makeRoot();
    writeDoc(after, 'docs/ai/req/reservation.md', 'reservation-flow');
    const textBefore = '要件は [こちら](../req/reservation.md#節) 。';
    const textAfter = '要件は [こちら](../../ai/req/reservation.md#節) 。';
    assert.equal(
      computeFingerprint(textBefore, 3, rewriterIn(before, 'docs/design/a.md')),
      computeFingerprint(textAfter, 3, rewriterIn(after, 'docs/client/design/a.md')),
    );
  });

  it('(b) リンク先の id だけ違う 2 つ (パスの文字は同じ) は、v3 の指紋が違う', () => {
    const one = makeRoot();
    writeDoc(one, 'docs/req/reservation.md', 'reservation-flow');
    const other = makeRoot();
    writeDoc(other, 'docs/req/reservation.md', 'reservation-flow-v2');
    const text = '詳しくは [要件](../req/reservation.md#機能要件) を参照。';
    assert.notEqual(computeFingerprint(text, 3, rewriterIn(one, 'docs/design/a.md')), computeFingerprint(text, 3, rewriterIn(other, 'docs/design/a.md')));
  });

  it('(b) 別の文書 (別の id) を指す 2 つは、v3 の指紋が違う', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    writeDoc(root, 'docs/req/b.md', 'doc-b');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    assert.notEqual(computeFingerprint('[x](../req/a.md)', 3, rewrite), computeFingerprint('[x](../req/b.md)', 3, rewrite));
  });

  it('リンクの文字・アンカーが変われば、v3 の指紋も変わる (行き先だけを id にする)', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    const base = computeFingerprint('[要件](../req/a.md#節 1) を参照', 3, rewrite);
    assert.notEqual(base, computeFingerprint('[仕様](../req/a.md#節 1) を参照', 3, rewrite), 'リンクの文字');
    assert.notEqual(base, computeFingerprint('[要件](../req/a.md#節 2) を参照', 3, rewrite), 'アンカー');
  });

  it('コードフェンスの中とインラインコードの中のリンクは、行き先を直さない (文字そのもの)', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    const fenced = ['```md', '[x](../req/a.md)', '```'].join('\n');
    assert.equal(normalizeForFingerprint(fenced, 3, rewrite), normalizeForFingerprint(fenced, 2), 'フェンスの中は v2 と同じ');
    assert.equal(normalizeForFingerprint('書き方は `[x](../req/a.md)` のとおり', 3, rewrite), '書き方は `[x](../req/a.md)` のとおり');
    assert.equal(normalizeForFingerprint('書き方は ``[x](../req/a.md)`` のとおり', 3, rewrite), '書き方は ``[x](../req/a.md)`` のとおり');
    assert.equal(normalizeForFingerprint('[x](../req/a.md) と `[y](../req/a.md)`', 3, rewrite), '[x](id:doc-a) と `[y](../req/a.md)`', '同じ行の、コードの外のリンクは直す');
  });

  it('リンクの文字にインラインコードを含むリンクも、行き先を直す', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    assert.equal(normalizeForFingerprint('[`provenance-check`](../req/a.md#節) を実行', 3, rewrite), '[`provenance-check`](id:doc-a#節) を実行');
  });

  it('タイトル付き・山括弧つきの行き先も、行き先だけを直す', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    assert.equal(normalizeForFingerprint('[x](../req/a.md "題")', 3, rewrite), '[x](id:doc-a "題")');
    assert.equal(normalizeForFingerprint('[x](<../req/a.md>)', 3, rewrite), '[x](<id:doc-a>)');
  });

  it('フェンスの判定は元の行で行う (v2 と同じ): 字下げが 4 文字以上・全角空白が続く後の ``` は元の本文ではフェンスでないので、その後のリンクも直す', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    const link = '[x](../req/a.md)';
    // v2 は字下げを 1 文字に詰める。詰めた後の行はフェンスに見えるが、元の行は字下げのコードブロックの一部でフェンスではない
    assert.equal(normalizeForFingerprint(['    ```', link].join('\n'), 3, rewrite), [' ```', '[x](id:doc-a)'].join('\n'), '半角 4 文字');
    assert.equal(normalizeForFingerprint(['　　　　```', link].join('\n'), 3, rewrite), [' ```', '[x](id:doc-a)'].join('\n'), '全角空白 4 文字');
    assert.equal(normalizeForFingerprint(['  　　```', link].join('\n'), 3, rewrite), [' ```', '[x](id:doc-a)'].join('\n'), '半角と全角の混在で 4 文字');
    assert.equal(normalizeForFingerprint(['    ~~~', link].join('\n'), 3, rewrite), [' ~~~', '[x](id:doc-a)'].join('\n'), '~~~ も同じ');
  });

  it('フェンスの判定は元の行で行う: 字下げのコードブロックの中の ``` が対になっていなくても、後のリンクを直す。対になっていれば、間のリンクも元の判定に従って直す', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    // 開きだけ (4 文字の字下げ) → 元の本文ではどこもフェンスの外
    const opened = ['1. 手順', '    ```sh', '    [a](../req/a.md)', '2. 次', '[b](../req/a.md)'].join('\n');
    assert.equal(normalizeForFingerprint(opened, 3, rewrite), ['1. 手順', ' ```sh', ' [a](id:doc-a)', '2. 次', '[b](id:doc-a)'].join('\n'));
    // 字下げの対 (リスト内のフェンス) も、v2 と同じくフェンスとは見ない: 間のリンクも直す。後ろのリンクは必ず直る
    const paired = ['1. 手順', '    ```md', '    [a](../req/a.md)', '    ```', '2. 次', '[b](../req/a.md)'].join('\n');
    assert.equal(normalizeForFingerprint(paired, 3, rewrite), ['1. 手順', ' ```md', ' [a](id:doc-a)', ' ```', '2. 次', '[b](id:doc-a)'].join('\n'));
  });

  it('元の行がフェンス (字下げ 0〜3 文字) なら、その中のリンクは直さず、閉じた後は直す。~~~ も同じ', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    for (const marker of ['```', '   ```', '~~~', '   ~~~']) {
      const text = [marker, '[a](../req/a.md)', marker, '[b](../req/a.md)'].join('\n');
      assert.equal(normalizeForFingerprint(text, 3, rewrite), [marker, '[a](../req/a.md)', marker, '[b](id:doc-a)'].join('\n'), JSON.stringify(marker));
    }
  });

  it('v2 は 1 行を 1 行へ写す (v3 が元の行とフェンスの判定を位置で対応させる前提)。改行は CRLF・CR・LF のどれでも同じ', () => {
    for (const text of ['', 'a', 'a\n', '\n\n', 'a\r\nb\rc\nd', '    ```\n[a](b)\n    ```', '　　　　```\r\n本文  \r\n```', '| a |  b |\n|---|---|\n', '```\n\n```\n']) {
      assert.equal(normalizeForFingerprint(text, 2).split('\n').length, text.split(/\r\n|\r|\n/).length, JSON.stringify(text));
    }
  });

  it('行き先を直さない関数を渡すと、どんな本文でも v2 と同じ (リンクの探索が行を壊さない)', () => {
    const tricky = [
      '[', ']', '[a](', '[a]()', '[a](b', '[](x.md)', '![](x.md)', '[a](b)(c)', '[[a](b)](c)', '[a](b "t" )', '[a](<b c>)', '[a]( b )',
      '`', '``', '`a', 'a`', '`[a](b)', '[a](b)`', '`[a](b)` [c](d)', '``a ` b`` [c](d)', '`a` `[b](c)` [d](e)',
      '```\n[a](b)\n```\n[c](d)', '~~~\n[a](b)', '    ```\n[a](b)\n    ```\n[c](d)', '| [a](b) | `[c](d)` |\n|---|---|',
      '日本語 [リンク](./a.md#節) と `コード` と [別](../b.md)\r\n次の行  \r\n',
    ];
    for (const text of tricky) {
      assert.equal(normalizeForFingerprint(text, 3, noLinks), normalizeForFingerprint(text, 2), JSON.stringify(text));
    }
  });

  it('表のセルの中のリンクも直す', () => {
    const root = makeRoot();
    writeDoc(root, 'docs/req/a.md', 'doc-a');
    const rewrite = rewriterIn(root, 'docs/design/x.md');
    assert.equal(normalizeForFingerprint('| 参照 | [a](../req/a.md) |', 3, rewrite), '| 参照 | [a](id:doc-a) |');
  });
});
