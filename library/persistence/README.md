# @igeta/persistence

DB 層の部品 (Result・AppError・Repository の port・Mapper・Transaction、契約テスト、InMemory 実装)。0.1.0 (未公開)。Firestore と Postgres の実装は次の版で入る (実装タスク 02 の T006・T007)。

## 入れ方

```sh
npm install @igeta/persistence
npm install -D vitest   # 契約テストを使う場合
```

## 入口

| 入口 | 中身 | 要る SDK |
|---|---|---|
| `@igeta/persistence` | Result・AppError・Repository・Mapper・TransactionRunner・DocumentId・ListQuery・IdGenerator | なし |
| `@igeta/persistence/testing` | describeRepositoryContract・InMemoryStore・InMemoryRepository・InMemoryTransactionRunner | vitest |
| `@igeta/persistence/firestore`・`/postgres` | 次の版で入る ([docs/postgres.md](docs/postgres.md)) | — |

## 使い方 (集約 1 つ: memo、InMemory)

```ts
import { createUuidGenerator, err, ok, unprocessable } from '@igeta/persistence';
import type { Mapper } from '@igeta/persistence';
import { InMemoryRepository, InMemoryStore, InMemoryTransactionRunner } from '@igeta/persistence/testing';

interface Memo { readonly id: string; readonly title: string; readonly state: 'draft' | 'published' }
interface MemoRecord { readonly title: string; readonly state: string }

// 保存の形と entity の変換。保存データが不正なら err を返す (読み出しは unprocessable になる)
const memoMapper: Mapper<Memo, MemoRecord> = {
  toRecord: ({ title, state }) => ({ title, state }),
  fromRecord: (id, { title, state }) =>
    typeof title === 'string' && title.length <= 40 && (state === 'draft' || state === 'published')
      ? ok({ id, title, state })
      : err(unprocessable('memo が不正')),
};

const store = new InMemoryStore<MemoRecord>();
const memos = new InMemoryRepository({
  store,
  mapper: memoMapper,
  filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }), // 絞り込みの値を保存の項目へ写す。undefined は絞らない
});
const runner = new InMemoryTransactionRunner(store);

await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
const page = await memos.list({ filter: { state: 'draft' }, limit: 20 }); // page.isTruncated: 続きがあれば true
```

## 契約テスト

上の `store`・`memos`・`runner` を、自分の repository の契約 C1〜C10 に通す。vitest のテストファイルに書く。

```ts
import { describeRepositoryContract } from '@igeta/persistence/testing';

const idGenerator = createUuidGenerator();

describeRepositoryContract({
  name: 'memos (InMemory)',
  setup: () => ({ repository: memos, runner, newId: () => idGenerator.next(), remove: (id) => store.remove(id) }),
  malformedKinds: [],
  fixtures: {
    createEntity: (id, state) => ({ id, title: state === 'draft' ? '下書き' : '公開', state }),
    filterByState: (state) => ({ state }),
    isSameContent: (left, right) => left.title === right.title && left.state === right.state,
  },
});
```

- `setup` は契約の最初に 1 回だけ呼ぶ。`newId` の id だけを使い、`remove(id)` で最後に全部消す (無い id を消しても失敗しない)。`close` があれば最後に呼ぶ
- `malformedKinds` は壊れた保存データの種類で、1 種類につき C9 の 1 行を登録する。種類を書くなら `setup` に `plantMalformed(kind, id)` (壊れた保存データを生で置く) も返す。空なら C9 は表から外れる
- id は `[A-Za-z0-9_-]` の 1〜64 字で、`__` で始まり `__` で終わる形は使えない

## 開発と版

```sh
npm test    # unit
```

semver。1.0.0 までは破壊的変更を minor で入れ、CHANGELOG.md に書く。
