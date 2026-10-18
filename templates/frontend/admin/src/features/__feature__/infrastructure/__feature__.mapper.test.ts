// 変換のテスト: 既知の状態・未知の状態 (closed に読み替え)・一覧の件数と打ち切り・作るの本文は名称だけ・往復で値が変わらない。

import { describe, expect, it } from 'vitest';
import { toCreateRequest, toListModel, toModel } from '@/features/__feature__/infrastructure/__feature__.mapper';

const DTO = { id: 'a-1', name: '茅野', status: 'open' };

describe('toModel', () => {
  it.each([
    ['open は開いている', 'open', 'open'],
    ['closed は閉じている', 'closed', 'closed'],
    ['未知の状態は closed', '未来の状態', 'closed'],
  ])('%s', (_name, status, expected) => {
    expect(toModel({ ...DTO, status }).status).toBe(expected);
  });

  it('番号と名称はそのまま渡す', () => {
    expect(toModel(DTO)).toEqual({ id: 'a-1', name: '茅野', status: 'open' });
  });
});

describe('toListModel', () => {
  it('全件を変換し、打ち切りの印を保つ', () => {
    const list = toListModel({ items: [DTO, { ...DTO, id: 'b-2', status: 'closed' }], truncated: true });
    expect(list.items.map((item) => item.status)).toEqual(['open', 'closed']);
    expect(list.truncated).toBe(true);
  });

  it('空の一覧は空のまま', () => {
    expect(toListModel({ items: [], truncated: false })).toEqual({ items: [], truncated: false });
  });
});

describe('toCreateRequest', () => {
  it('作るの本文は名称だけ', () => {
    expect(toCreateRequest({ name: '茅野' })).toEqual({ name: '茅野' });
  });

  it('変換した値から元の名称に戻る (往復)', () => {
    const draft = { name: '伊那' };
    expect(toCreateRequest(draft).name).toBe(draft.name);
  });
});
