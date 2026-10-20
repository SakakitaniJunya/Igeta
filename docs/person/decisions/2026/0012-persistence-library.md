---
id: adr-0012-persistence-library
title: ADR-0012 DB 層は雛形の写しをやめ、ライブラリ @igeta/persistence に置く — 受入条件は Firestore と Postgres の同じ契約テスト
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-20
depends_on: []
relates_to: []
---

# ADR-0012: DB 層は雛形の写しをやめ、ライブラリ `@igeta/persistence` に置く — 受入条件は Firestore と Postgres の同じ契約テスト

> **TL;DR**: 雛形 (hono・nestjs) に写して持っている DB 層を、`library/persistence` の 1 つの package (`@igeta/persistence`) に移す。入口は core・firestore・postgres・testing の 4 つ。Postgres は Kysely を採る。受入条件は、契約 C1〜C9 を InMemory・Firestore emulator・Postgres 16 の全部で通すこと。
> - 却下: Firestore と RDB を包む共通 ORM / 雛形に写しを置き続ける
> - 雛形の書き換え (後続の PR) と npm の公開は、この ADR の範囲に入れない

```mermaid
flowchart TB
  core[core: Result・AppError・Repository・Mapper] --> fs[firestore 入口]
  core --> pg[postgres 入口]
  fs --> sdkF[(@google-cloud/firestore)]
  pg --> sdkP[(Kysely + pg)]
  testing[testing 入口: 契約 C1〜C9・InMemory] -.-> fs
  testing -.-> pg
```

## 関連

- **上流 (depends_on)**: なし (2026-10-20 の方針が起点)
- **下流**: ai 側の検査仕様と実装タスク (索引が出す)。人の文書は ai の文書を指さない (ADR-0002 の不変条件)

## Status

2026-10-20 提案。方針は CEO が決めた。

## Context

- 雛形の DB 層は Firestore の型を含んだまま、hono と nestjs に写されている。直すときは変種の数だけ直す。
- 利用 repo は DB を Firestore から RDB へ移すことがある。今の写しでは、移すと port より下が全部書き直しになる。
- 契約テストの雛形は印 (`__aggregate__`) を読み解かないと読めず、版を持たない。

## Decision Drivers

1. 人が読んで分かる (印を持たない、1 ファイル 1 概念、150 行以内、業務語の名前)
2. DB を替えても port の振る舞いは同じ (契約で測る)
3. 版と配布で写しのずれを無くす (semver と CHANGELOG)

## Decision

**採用: `library/persistence` (npm `@igeta/persistence` 0.1.0) を Igeta に置き、雛形はこれを import する側に後続の PR で変える。**

1. 入口は 4 つ。core (Result・AppError・Repository・Mapper・TransactionRunner・IdGenerator・DocumentId・ListQuery)、`/firestore`、`/postgres`、`/testing` (契約テスト・InMemory・emulator と Postgres の helper)。SDK は peerDependencies。vitest は `/testing` だけが要る。
2. 受入条件: 契約 C1〜C9 を InMemory・Firestore emulator・Postgres 16 で通す。InMemory も壊れた record を生で置けるので、3 実装とも 9 行すべてを通す。
3. `library/**` は `.igeta.json` の humanPaths と CODEOWNERS に入れる。公開 API を持つ package なので、`src/**` と `templates/**` と同じく人の承認を要する。
4. Postgres は Kysely + pg。table の型は利用者が `Database` の型で渡し、変換は Mapper だけが持つ。migration は Kysely の `Migrator` を包む。

| 判断軸 | 採用案での扱い | 理由 |
|---|---|---|
| 読みやすさ | 印無し・1 ファイル 1 概念・150 行以内 | 契約が読めないと受入条件として使えない |
| DB の差し替え | port と契約は同じ。DB 固有の処理は入口の中だけ | Firestore から RDB への移行を入口の差し替えで済ませる |
| 配布 | 0.1.0 から semver と CHANGELOG | 雛形の版と利用 repo の版を揃える |
| 依存 | SDK は peer。core は SDK を import しない | 利用 repo が SDK の版を決める |

**Kysely を採り、Prisma を採らない理由** (一次情報、2026-10-20 確認): Kysely は query builder で、table の型は利用者の `Database` interface で受ける (<https://kysely.dev/docs/getting-started>)。Migrator は `kysely/migration` にある (<https://kysely.dev/docs/migrations>)。Prisma のクライアントは生成されたモデルごとの入口 (`db.orm.public.User` の形) で、型は `npx prisma contract emit` が作る (<https://www.prisma.io/docs/orm/prisma-client/type-safety>)。テーブルを引数で受ける汎用の基底を書く方法は、このページには無かった。

## 却下した選択肢

- **Firestore と RDB を包む共通 ORM**: doc の入れ子と SQL の join・集計は形が違う。共通の最小公倍数になり、両方の強みが消える。port は共有し、実装は各 DB に正直に書く。
- **雛形に写しを置き続ける**: hono と nestjs で 2 重に持つ。契約を両 DB で共有できず、ずれも検査されない。
- **Prisma**: 上の一次情報の通り、テーブル単位の汎用基底の書き方を確かめられなかった。Prisma 利用者は port を自分で実装し、契約を通せばよい。
- **Drizzle (採らず、比較も未了)**: TypeScript で table を定義する ORM で、対象は SQL dialect (<https://orm.drizzle.team/docs/overview>、2026-10-20 確認)。Firestore は対象外。汎用基底の型が書けるかは未確認。Kysely が T004 の spike で通らなければ、次の候補にする。
- **素の pg だけ**: SQL の文字列と行の型を手で書く量が増え、table の型が検査されない。

## Consequences

- 良い方向: DB を替える判断が port と入口の中で閉じる。受入は契約 9 行で測れる。
- 代償: 利用 repo は package を入れる。未公開の間は入れ方が決まらない (下記)。雛形の書き換えが後続 PR で要る。Kysely の汎用化が spike で落ちたら、Postgres 入口の形を変える。

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| 契約テスト (`describeRepositoryContract`) | InMemory・Firestore emulator・Postgres 16 | C1〜C9 のどれかが落ちる。CI では skip を許さない (REQUIRE_*) |
| 読みやすさの検査 (src の行数・import・名前・JSDoc) | `library/persistence/src` の全部 | 150 行超・`.js` 付き import・`@/`・印 `__`・JSDoc 無し |
| `secret-scan --internal-ids` | library の文書とコード | 社内制約 ID が入る |

## 再検討トリガ

- 汎用基底の型が Kysely で通らなかったら、Postgres 入口の table の渡し方を変える (この ADR を改める)
- 利用 repo から Prisma を使う要望が 2 件出たら、Prisma 向けの入口を検討する
- 契約の行の追加・変更が 2 回続いたら、契約に版を付ける

## 決めてほしいこと

- npm 公開の時期 (CEO 判断)。未公開の間、雛形の後続 PR は依存の入れ方が決まらない。
