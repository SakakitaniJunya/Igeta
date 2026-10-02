---
id: adr-0005-enforcement-rollout-and-canonical-sync
title: ADR-0005 検査の強さは構成の実在と Igeta の版だけで決め、正典は 1 か所に置く
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories, adr-0002-role-boundary-invariants, adr-0003-docs-model-migration-and-dogfooding]
relates_to: [audience-directories, adr-0009-kind-placement, adr-0010-value-ownership]
---

# ADR-0005: 検査の強さは構成の実在と Igeta の版だけで決め、正典は 1 か所に置く

> **TL;DR**: `docs/person`・`ai`・`client` が 1 つでもある repo では、全検査が即違反 (CI 赤)。無い repo は毎回警告を出し、
> 次のメジャー版で違反にする。警告で始める検査 (まとまりの合計字数) も、違反に上げる時期は Igeta の版で決まる。
> どれも利用 repo の設定では変えられない。置き場所の正本は要件定義書 02 §7 で、ガイドとコードの表との一致をテストで固定する

## 関連

- **上流 (depends_on)**: ADR-0001 / ADR-0002 / ADR-0003
- **下流**: `src/core/Role.ts` / `TaxonomyGuideSync.test.ts` (新設) / `InitCommand.ts`・`ScaffoldCommand.ts` / 雛形の再編

## Status

2026-10-02 提案。

## Context

移行しただけでは、次に書く文書が旧い書き方に戻る。移行後の状態を破れないルールにする段取りが要る。
`.igeta.json` のフラグで検査を切れる形は、設定を外すだけで迂回できるので採らない。

## Decision Drivers

- 検査の強さは、構成の実在と Igeta の版だけで決まり、利用 repo の設定で変えられないこと
- 置き場所の正本は 1 か所 (要件定義書 02 §7)。ガイドとコードが正本と食い違ったら検査で落ちること

## Decision

**1. 強さの切替**

| repo の状態 | 強さ |
|---|---|
| `docs/person`・`ai`・`client` のどれかがある | ADR-0002 の条件はすべて即違反。ただし条件 8 (合計字数) は警告で、次のメジャー版で違反 |
| 上の 3 つがどれも無い (旧い構成) | 検査のたびに「`docs-migrate` を実行してください」と警告。次のメジャー版で違反 |
| `docs/common/` が残っている (v3 の構成) | 違反 |

新しい構成の repo で、docs/ 直下 (生成索引の 2 本を除く) に 3 フォルダにも `nonDocPaths` (ADR-0003 決定 6) にも
属さない文書があれば違反。

**2. 正典の一致**: kind → 置き場所の正本は要件定義書 02 §7 (Igeta 自身の repo)。Igeta の文書体系ガイド
(`templates/docs/ai/handbook/how-to/01-document-taxonomy.md`) と `src/core/Role.ts` の `ROLE_OF_KIND` はその転記で、
`TaxonomyGuideSync.test.ts` が 3 つを突き合わせ、1 行でも食い違えば落ちる。利用 repo にはガイドを写さない (ADR-0009)

**3. 利用 repo の追随**: 旧い構成の repo は、Igeta の版を上げてから ADR-0003 の手順で移す。v3 の構成の repo は、
版上げ・移行・書き直しを 1 本の PR にする (版を上げた瞬間に新しい構成と判定されるため。ADR-0003 決定 1)。
CI 設定と各 repo の制約文書は書き換えない (ガイドを指す参照のままでよい)

**4. 雛形と `init`/`scaffold`**: `templates/docs/` を `docs/` と同じ木に再編し、新しい repo には最初から 3 フォルダの
構成を生成する。旧い構成の雛形は削除する。`person/` の雛形は人の型 (結論 → 図 → 決まりの表 → 決めてほしいこと) に
作り直し、混ざった節と依存の向きは ADR-0010 のとおり直す。`data-management` の雛形を新しく作る。入口の 3 行
(`AUDIENCE_ENTRANCE` と docs/README.md) を新しい構成に替える。`scaffold` は Igeta の手引き 3 本を生成しない
(`implementation-order` はプロジェクトの文書として生成する)。person・client の雛形の指示の HTML コメントは外す

**5. AI が読む範囲**: `context-files` の範囲は ADR-0004 決定 3 の 5 のとおり
(`person/` の要件・全体共通・自分のまとまり + `ai/specs/` の全体共通・自分のまとまり + 隣の約束)

**6. 人の承認の強制**: ADR-0008

**実装で決める論点 (ここに 1 か所)**: `AGENTS.md` の節の文面 / `AgentsEntrypointCheck` がリンクの形式をどこまで見るか /
`review-sheet` が金額・率・期限らしい語として拾う語の一覧 / 字数の数え方の細目 (全角・半角はどちらも 1 字)

## 却下した選択肢

- **`.igeta.json` に `enforceRoleBoundary: true/false` を置く**: 外すだけで迂回できる
- **経過時間で警告から違反に切り替える**: 時刻という余計な状態が要る。版番号は迂回できない固定点
- **ガイドとコードの一致を人のレビューに委ねる**: 守らせ方の無い条件になる

## Consequences

- 良い方向: 新しい repo は最初から正しく、移行した repo は旧い書き方に戻れない
- 代償: `TaxonomyGuideSync.test.ts` はガイドの表の書式に依存する。表の列を変えたら追随させる

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `TaxonomyGuideSync.test.ts` (新設) | ガイドの表と `ROLE_OF_KIND` | 1 kind でも置き場所が食い違う |
| 構成の検出のテスト | 3 フォルダの有無・`docs/common/` の残存 | 新しい構成で検査が動かない / 旧い構成で警告が出ない |
| `InitCommand`・`ScaffoldCommand` のテスト | 新しく生成した repo | 旧い構成のパスを生成する / 生成直後に検査が落ちる |
| 雛形の再編 PR の受入条件 (ADR-0010) | ai の雛形の全部の節 | 置き場所の問いに「変わる」と答える節が残る |
| 版の切替のテスト | 次のメジャー版の値を与えた検査 | 合計字数と旧い構成が違反に切り替わらない |

## 再検討トリガ

- `TaxonomyGuideSync` がガイドの書式の変更で頻繁に壊れたら、ガイドの表を `ROLE_OF_KIND` から生成する向きに変える
