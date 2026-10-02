---
id: adr-0008-human-approval-scope
title: ADR-0008 人の承認が要るパスを決めて見分ける — 強制は GitHub の設定に任せ、強制の門は次の版にする
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

# ADR-0008: 人の承認が要るパスを決めて見分ける — 強制は GitHub の設定に任せ、強制の門は次の版にする

> **TL;DR**: この版の Igeta が受け持つのは、(1) 人の承認が要るパスの一覧 (2) 変更がそのパスに触れたかをパスだけで
> 見分ける `approval-scope` (3) そのパスを人の持ち主に割り当てる CODEOWNERS の雛形 (4) GitHub の保護の設定を読む `doctor`。
> 強制は GitHub の設定に任せ、この版の Igeta は強制しない。作者が検査を外す・偽ることまで防ぐ「強制の門」は、次の版で設計する

## 関連

- **上流 (depends_on)**: ADR-0001 (確定させる人で分ける) / ADR-0005 (ルール化)
- **下流**: `src/gate/` (`approval-scope`・`doctor`) / `init`・`docs-migrate` が置く CODEOWNERS / テスト仕様 01 (見分け)・06 (CODEOWNERS)

## Status

2026-10-02 提案。詳細設計の安全面の評価 (指摘 9 件) を受けて、強制の門を次の版に分けた。

## Context

ADR-0001 は置き場所を「確定させる人」で決めた。この決まりが効くには、人の承認が要る変更を見分けられ、承認なしに
入らないことが要る。前の実装は、Igeta のコマンドを門にし、ファイルの中身で例外を作った (生成索引の区間、package.json の
igeta の行)。門のコード・版・設定を変更の作者が書き換えられ、例外ごとに抜け道が生まれた。作者に抜けられない門を
作るには、GitHub の保護を置ける契約・人と AI のアカウントの分離・AI に与える権限、が先に決まっている必要がある。

## Decision Drivers

- 見分けの規則は 1 行で言える単純さにする (例外を置かない)。作者が選べるものを信頼しない
- 前提が決まっていない強制を、決まったふりで作らない。保証しないことを明記する

## Decision

**1. 人の承認が要るパス** (固定。小文字と大文字を区別しない)

| パス | 理由 |
|---|---|
| `docs/person/**`・`docs/client/**` | 人が確定させる文書 (ADR-0001) |
| `.github/**`・`CODEOWNERS`・`docs/CODEOWNERS` | 保護と CI を決めるファイル (CODEOWNERS は GitHub が読む 3 か所すべて) |
| `.igeta.json`・`.igeta-version` | 検査の設定と、使う Igeta の版 |
| どの階層の `AGENTS.md`・`CLAUDE.md`、`.claude/**` | AI への指示と権限 |
| `.igeta.json` の `humanPaths` の glob | repo ごとに足す分 (足すことだけができる) |

**2. 強制は GitHub の設定に任せる**: 推奨の設定は (a) PR を必須 (b) CODEOWNERS の持ち主のレビューを必須 (c) 新しい push で
承認を取り消す (d) 管理者にも適用し、迂回の許可を置かない。CODEOWNERS は 1 のパスを人の持ち主に割り当てる
(`init`・`docs-migrate` が置く)。Igeta 自身は、この版では強制しない

**3. `igeta approval-scope`**: 変わったパスが 1 に当たれば `human`、当たらなければ `ai`。中身は見ない。構成と `humanPaths` は、
変更を入れる先のブランチの先端から読む。判定できなければ検査不能を返す。`human` と検査不能のとき、AI は取り込まずに人へ渡す

**4. 例外を置かずに済ませる条件**: `docs/person/`・`docs/client/` の下の生成物 (索引・決定台帳の一覧) は、
その 2 つの下の文書だけから作る。`ai/` だけを変えた変更で、`person/`・`client/` の下のファイルは変わらない

**5. 強制の門は次の版**: 信頼できる版の Igeta で検査する workflow、変更の全部のパスに持ち主のレビューが求められることの
確かめ、`doctor` の残りの項目 (管理者の迂回・必須の検査) は、次の版で設計する。それまでは、人が取り込む運用で補う (`AGENTS.md` に書く)

**6. `igeta doctor`**: 2 の (a)〜(c) と、GitHub が返す CODEOWNERS の誤りを読む。欠けていれば違反、読めなければ検査不能。確かめないことを出力に書く

**7. AI が `person/` を書くとき**: 起案してよい。決まりの状態は `仮` にし、人が承認したら `決定` に変える。
人が読むのは、`review-sheet --diff` が並べる「変わった行」。この決まりは機械で強制しない (`AGENTS.md` に書く)

## 却下した選択肢

- **Igeta のコマンドや npm scripts を門にする**: 変更の作者が門のコード・版・設定・scripts を書き換えて自分を通せる
- **中身で例外を作る** (生成索引の区間、package.json の igeta の行): 例外ごとに抜け道が生まれ、規則が言えなくなる
- **変更の大きさで見分ける**: 1 行でも、キャンセル料の率は人の決定
- **強制の門をこの版に入れる**: 安全面の評価で、古い枝の設定を読ませる・必須の検査を偽る・宛先を付け替える・移動で
  持ち主を外す・古い承認を残す・門自身のコードを先に弱める、の手口が残った。直し方は AI に与える権限で変わる

## Consequences

- 良い方向: 見分けの規則が表 1 つで言える。保証することとしないことが分かれている
- 代償: `.github/**` 全体が人の承認になる。承認の強制は repo ごとの GitHub の設定に依る
- 限界 (この版が保証しないこと): (1) 作者が CI の定義や npm scripts を書き換えて検査を外すこと (2) 保護を置けない契約の
  repo (`doctor` が違反を出し続ける) (3) AI が人と同じ GitHub アカウントで PR を作る運用 (作者は自分の PR を承認できない)
  (4) 移動のときに GitHub がどちらのパスで持ち主を決めるか (5) 人の決定を `ai/` に書く誤り (ADR-0001) (6) 持ち主が実在し、
  書き込み権限を持つか (7) `doctor` が見ない設定 (管理者の迂回・必須の検査・既定ブランチ以外) (8) 1 の表に無い、AI への指示や
  実行に効くファイル (`.mcp.json`・`.devcontainer/` など。使う repo が `humanPaths` に足す)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| テスト仕様 01 (人の承認が要る変更の見分け) | `approval-scope`・`doctor` | 表のテストが 1 件でも落ちる |
| `AgentsEntrypointCheck` (テスト仕様 06 の I14) | `.github/CODEOWNERS` | 1 のパスのどれかに、最後に当たる行の持ち主がいない |

## 再検討トリガ

- 保護を置ける契約と AI 用のアカウントが決まったら、強制の門を設計する (安全面の評価の指摘は issue に残す)
