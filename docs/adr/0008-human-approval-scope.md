---
id: adr-0008-human-approval-scope
title: ADR-0008 人の承認の門は GitHub に置き、Igeta は見分けと点検を受け持つ
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0001-document-role-directories, adr-0005-enforcement-rollout-and-canonical-sync]
relates_to: [adr-0002-role-boundary-invariants]
---

# ADR-0008: 人の承認の門は GitHub に置き、Igeta は見分けと点検を受け持つ

> **TL;DR**: 人の承認を強制するのは GitHub (ブランチ保護と CODEOWNERS。どちらも PR の起点側の内容で働く)。
> Igeta は (1) 人の承認が要るパスの一覧 (2) 差分がそのパスに触れたかを見分ける `approval-scope`
> (3) GitHub の設定が門として成り立っているかを点検する `doctor` (4) CODEOWNERS と門の workflow の雛形、を受け持つ。
> 見分けはパスだけで行い、ファイルの中身による例外は置かない

## 関連

- **上流 (depends_on)**: ADR-0001 (確定させる人で分ける) / ADR-0005 (ルール化)
- **下流**: `src/gate/` (`approval-scope`・`doctor`) / `init`・`docs-migrate` が置く CODEOWNERS と門の workflow / [テスト仕様 — 人の承認の門](../design/test/specs/01-approval-gate.md)

## Status

2026-10-02 提案。

## Context

ADR-0001 は置き場所を「確定させる人」で決めた。この決まりは、承認が要る変更を誰にも迂回されずに止められて初めて効く。
Igeta のコマンドだけを門にすると、PR が門のコード・版・設定・CI の定義を書き換えて、自分で自分を通せる。ファイルの中身で
例外を作る (生成索引の区間だけの変更は除く、package.json は igeta の行だけ見る) と、例外ごとに抜け道が生まれた。
想定する相手は PR の作者 (AI) で、GitHub と Igeta の配布元は信頼する。

## Decision Drivers

- 門の信頼の根は、PR が書き換えられないもの (GitHub の設定と、起点側の内容) だけにする
- 見分けの規則は 1 行で言える単純さにする (例外を置かない)。GitHub の文書に書かれていない挙動に頼らない

## Decision

**1. 人の承認が要るパス** (固定。小文字と大文字を区別しない)

| パス | 理由 |
|---|---|
| `docs/person/**`・`docs/client/**` | 人が確定させる文書 (ADR-0001) |
| `.github/**`・`CODEOWNERS`・`docs/CODEOWNERS` | 門と CI を決めるファイル (CODEOWNERS は GitHub が読む 3 か所すべて) |
| `.igeta.json`・`.igeta-version` | 検査の設定と、門が使う Igeta の版 |
| どの階層の `AGENTS.md`・`CLAUDE.md`、`.claude/**` | AI への指示と権限 |
| `.igeta.json` の `humanPaths` の glob | repo ごとに足す分 (足すことだけができる) |

**2. 強制は GitHub が行う**: ブランチ保護で (a) PR を必須 (b) CODEOWNERS の持ち主のレビューを必須
(c) 新しい push で承認を取り消す、または最後の push の承認を必須 (d) 管理者にも適用し、迂回の許可を置かない
(e) 門の workflow を必須の検査にする。CODEOWNERS は 1 のパスを人の持ち主に割り当てる

**3. `igeta approval-scope`**: 差分のパスが 1 に当たれば `human`、当たらなければ `ai`。中身は見ない。構成と `humanPaths` は
起点のツリーから読む。判定できなければ検査不能を返し、呼ぶ側は `human` として扱う。CI では、`human` の理由のパスの全部に、
起点の CODEOWNERS で持ち主のレビューが求められることも確かめ、欠ければ検査不能にする (大文字と小文字だけが違うパスと、人の文書を承認の要らない場所へ移す形を止める)

**4. 例外を置かずに済ませる条件**: `docs/person/`・`docs/client/` の下の生成物 (索引・決定台帳の一覧) は、
その 2 つの下の文書だけから作る。`ai/` だけを変えた PR で、`person/`・`client/` の下のファイルは変わらない

**5. 門の workflow**: `pull_request_target` で動かす (定義は起点側のものが使われる)。PR の中身はデータとして読むだけで、
PR の依存を入れず、PR のコードを動かさず、npm scripts を経由しない。Igeta は起点の `.igeta-version` の版を repo の外に入れて
使う (Igeta 自身の repo は起点を build する)。この Igeta で `approval-scope` と文書の検査 (`docs-check`・`template-check`) を回し、
検査不能と違反で失敗にする。変わった行の一覧を job の要約に出す

**6. `igeta doctor`**: 2 の (a)〜(e) と、CODEOWNERS の持ち主が有効かを GitHub から読む。欠けていれば違反、読めなければ検査不能

**7. AI が `person/` を書くとき**: 起案してよい。決まりの状態は `仮` にし、人が承認したら `決定` に変える。
人が読むのは、`review-sheet --diff` が並べる「変わった行」。この決まりは機械で強制しない (`AGENTS.md` に書く)

## 却下した選択肢

- **Igeta のコマンドや npm scripts を門にする**: PR が門のコード・版・設定・scripts を書き換えて自分を通せる
- **中身で例外を作る** (生成索引の区間、package.json の igeta の行): 例外ごとに抜け道が生まれ、規則が言えなくなる
- **変更の大きさで見分ける**: 1 行でも、キャンセル料の率は人の決定

## Consequences

- 良い方向: 門の信頼の根が GitHub の設定と起点の内容だけになる。見分けの規則が表 1 つで言える
- 代償: `.github/**` 全体が人の承認になる。Igeta を npm scripts で呼ぶだけの CI は門にならない (門の workflow に替える)。
  人の文書を消す・移す PR には、持ち主の付かない場所への追加を混ぜられない (PR を分ける)
- 限界: (1) ブランチ保護を置けない repo では強制が無く、`doctor` が違反を出し続ける。(2) AI が人と同じ GitHub
  アカウントで PR を作ると、持ち主のレビューが成り立たない (AI 用のアカウントを分ける)。(3) 人の決定を `ai/` に
  書く誤りは見分けられない (ADR-0001)。(4) workflow が呼ぶ外部の action の中身は、commit の固定までしか守れない

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| [テスト仕様 — 人の承認の門](../design/test/specs/01-approval-gate.md) | `approval-scope`・`doctor`・雛形 | 表のテストが 1 件でも落ちる |
| `AgentsEntrypointCheck` | `.github/CODEOWNERS` | 1 のパスのどれかに、最後に当たる行の持ち主がいない |

## 再検討トリガ

- 誤字の修正で止まる回数が多く人の承認が滞るなら、「決まりの表の行が変わらない変更」を別扱いにする案を検討する
