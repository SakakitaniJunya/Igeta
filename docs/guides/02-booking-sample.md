---
id: booking-sample-guide
title: 記入済み予約サンプルで Igeta を試す
type: guide
kind: guide
status: active
owners: [eng]
depends_on: [document-taxonomy]
relates_to: []
---

# 記入済み予約サンプルで Igeta を試す

> **When to use**: 初めて Igeta を使う人が、設計書の完成例と検査の流れを確認するとき。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [文書体系](01-document-taxonomy.md) | document-taxonomy |
| 下流 | [予約サンプル](../../examples/booking/README.md) | REQ / FN / Reservation / TST |

## 1. 別フォルダへ取得

Node.js 22 以上と npm を用意します。

```bash
git clone --branch sample/booking-walkthrough https://github.com/SakakitaniJunya/Igeta.git igeta-booking-sample
cd igeta-booking-sample
npm ci
npm run sample:booking
npm run sample:check
```

予約作成・確定・キャンセル・再確定の拒否・別テナントの取得 `null` が表示されれば実行成功です。
サンプルの設計書は `examples/booking/docs/`、コードは `examples/booking/src/` にあります。
[サンプル README](../../examples/booking/README.md) の順に読むと REQ → FN → class → TST を追えます。

## 2. 設計書を直す

必須節や ID 形式は `templates/docs/` が正典です。上流要件から変更し、下流設計・実装も揃えます。
frontmatter の `depends_on` は上流文書の `id` を指します。本文のリンクは実在するパスを指します。

```bash
npm run sample:docs:graph  # サンプルの索引・依存グラフを再生成
npm run sample:check      # 文書・型・テスト・図・依存規約
npm run docs:lint         # サンプルを含む Markdown 記法
```

サンプルの `docs/dependencies.md` と各 README の AUTOGEN 区間は自動生成です。直接編集しません。
Igeta 自身の説明書を変更した場合は `npm run docs:graph` → `npm run docs:check` も実行します。

## 3. 自分の案件に展開

Igeta の `templates/`・`scripts/`・lint 設定を自分のリポジトリへコピーします。
設計書は `templates/docs/<X>` を `docs/<X>` へコピーし、ID・関連・本文を自分の要件に書き換えます。
このサンプルの固有名・仕様・未実装の前提を、そのまま顧客の確定仕様にしないでください。

```bash
# Igeta ルートで試す場合。展開先の表示のみで書き込みません。
npm run scaffold:module -- --context booking --aggregate Reservation --include-kernel --dry-run
```

実際の展開では `--dry-run` を外します。既存ファイルと衝突した場合は生成全体が中止されます。
共有 kernel は初回のみ展開し、以降は `--include-kernel` を外します。
雛形の展開だけでは NestJS や Next.js は起動しません。基盤・契約・配線・DB 等は別途整備します。
