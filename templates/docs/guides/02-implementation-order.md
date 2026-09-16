---
id: implementation-order
title: 実装順序と各ステップの Definition of Done
type: guide
kind: implementation-order
status: active
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [domain-overview]
relates_to: [domain-model, module-spec, test-plan]
---

# 実装順序と Definition of Done

> **When to use**: `scaffold:module` で最初のコンテキストを展開する前に読む。コンテキストは**上流から**着手し、1 コンテキスト内は **contract → domain → application → infrastructure → presentation → web** を必ず直列で回す。
> - 各ステップの DoD は「動いた」ではなく **テストの種別 + `check:domain-drift` 緑 + `check:deps` 緑**で定義する (§2)
> - 手戻りの規則を先に決める: **契約の過不足に気付いたら必ず Step 1 に戻る**。controller 側で辻褄を合わせない (§3)
> - 並列化は**コンテキスト単位のみ**。同一コンテキスト内の並列は禁止 (§4)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ドメイン総論](../design/detail/domain/01-overview.md) のコンテキストマップ | — |
| 下流 | `templates/api-module` / `scripts/scaffold-module.mjs` / 各コンテキストの実装 | class 名 |

## 1. コンテキストの着手順 — 図から機械的に決める

**規則**: ドメイン総論のコンテキストマップの矢印方向に従い、**入ってくる矢印が無いコンテキスト (上流) から**着手する。同位のものは「他コンテキストから参照される数が多い順」。
この規則は人の判断を挟まない。マップが更新されたら着手順も更新される (マップが SoT、本節はその読み方)。

<!-- 下の表はプロジェクトごとに埋める。図が更新されたら図が勝つ -->

| # | コンテキスト | 上流とする理由 |
|---|---|---|
| 1 | `<tenancy など、全コンテキストが参照する型を供給するもの>` | 入ってくる矢印が無い |
| 2 | | |

## 2. 1 コンテキスト内の順番と DoD

**Step 0 は最初の 1 コンテキストでのみ実行する**。以降のコンテキストは Step 1 から。

| # | ステップ | 主な成果物 | Definition of Done |
|---|---|---|---|
| 0 | 基盤 | `apps/api` / `packages/api-contract` / 共有カーネル | `scaffold:module … --include-kernel` 実行済 / CI から `--allow-missing-code` を**外した** / `check:deps` が緑 |
| 1 | **契約** | `packages/api-contract` の OpenAPI 3.1 + 型/クライアント生成 | OpenAPI が lint 緑 / 生成物がコミットされている / **この時点で実装コードは 1 行も無い** |
| 2 | **domain** | VO → entity → aggregate → domain event → port の順で作る + クラス図 | 単体テスト (不変条件・状態遷移の**否定ケース必須**) / カバレッジ 80% / `check:domain-drift` 緑 / `check:deps` 緑 |
| 3 | **application** | use case / application service + DTO | port の手書きスタブだけで通る単体テスト (DB を立てない) / 異常系が `AppError` の `statusCode` で検証されている / カバレッジ 80% |
| 4 | **infrastructure** | Prisma repository adapter / migration (EXCLUDE・RLS の raw SQL) / 外部 SaaS adapter | 結合テスト (実 Postgres): ① EXCLUDE 違反がドメインエラー (例: `SlotAlreadyTaken`) に翻訳される ② **他テナント行が 0 件で返る** ③ `withTenant()` を経由しないクエリが 0 件になる |
| 5 | **presentation** | NestJS controller (生成型のみ使用) + `providers.ts` への配線 | contract test (生成型に対する request/response 検証) / 認可の否定テスト (他テナント指定で **403**) / `check:deps` 緑 |
| 6 | **web** | `apps/web` の Server Component + 文言 catalog | 3 状態 (空 / ローディング / エラー = `loading.tsx` / `error.tsx` + 空表示) が実装済 / 日本語リテラル検出 lint 緑 / E2E で主要導線 1 本 |

**Step 2 の内部順序を守る理由**: VO を後回しにすると entity が生文字列・生数値を持ったまま固まり、後から VO を差し込む作業が全 repository と全テストに波及する。port を最後にするのは、port のシグネチャが aggregate の形に依存するため。

## 3. 進む条件と戻る条件

**進む条件**: 前ステップの DoD がすべて緑。「後で直す」を持ち越さない (原則: サイレント縮退禁止)。

| 気付いた内容 | 戻る先 | やってはいけない回避 |
|---|---|---|
| リクエスト/レスポンスに項目が足りない・型が違う | **Step 1 (契約)** | controller で型を手書きして辻褄を合わせる |
| ドメインの表現力が足りない (状態・不変条件の不足) | **Step 2 (domain・図も更新)** | application に業務ルールを書く |
| port のシグネチャが DB 制約と噛み合わない (EXCLUDE の粒度など) | **Step 2 (port 定義)** | adapter で Prisma 型を漏らして回避する |
| 生成クライアントが web の要求と合わない | **Step 1 (契約)** | web 側で fetch を手書きする |
| テナント越境が塞がっていない | **Step 4 (RLS) と Step 5 (認可)** | フロントで隠して塞いだことにする |

**戻ったら、そのステップ以降の DoD を全部取り直す**。図だけ直して CI を通さない状態でマージしない。

## 4. 並列化できる単位

- **コンテキスト間は並列可**。条件は「上流コンテキストの Step 2 (domain) と `index.ts` の公開面が確定していること」。確定前に下流の application を書くと、公開面の変更が下流の書き直しになる
- **同一コンテキスト内は直列**。Step 1〜6 を分担しない。契約とドメインを別々の人が同時に動かすと、どちらが SoT か決まらなくなる
- 並列作業は **git worktree を分ける**。共有資源は 2 つだけで、どちらも衝突するので直列化する:
  - `packages/api-contract` の OpenAPI — **1 PR = 1 コンテキスト**。同時編集しない
  - `apps/api/prisma/migrations/` — migration を作る前に必ず main を取り込む (タイムスタンプ順序が壊れると `migrate deploy` が失敗する)
- 全コンテキストの domain event を購読するだけのコンテキスト (通知など) は、**並列に走らせず最後に 1 本で書く**

## 5. 各ステップで叩くコマンド

```bash
npm run scaffold:module -- --context <context> --aggregate <Aggregate>   # Step 2 の雛形展開
npm run check:domain-drift                                              # 図 ↔ 実装 (exit 2 = 検査不能)
npm run check:deps                                                      # レイヤ・境界違反
npm run test:scripts                                                    # scripts/ 自体の自己テスト
```

雛形の中身とプレースホルダは `templates/`、レイヤと境界の規約は `templates/api-shared-kernel/.dependency-cruiser.cjs`。
