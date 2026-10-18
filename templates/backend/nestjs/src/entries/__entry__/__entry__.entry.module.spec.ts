import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ok } from '@/shared/domain/result.js';
import { DatabaseModule, FIRESTORE } from '@/entries/database/database.module.js';
import { __Context__ModuleToken, __Entry__Controller } from '@/entries/__entry__/__entry__.controller.js';
import { __Entry__EntryModule } from '@/entries/__entry__/__entry__.entry.module.js';
import { VERIFIER, __Entry__Guard } from '@/entries/__entry__/__entry__.guard.js';
import type { __Context__Module } from '@/modules/__context__/index.js';

describe('__Entry__EntryModule.register', () => {
  const verify = async () => ok({ shop: 's-1' });

  async function compile() {
    // Firestore には繋がない。組み立てが FIRESTORE を module の公開面に渡せることだけを見る。
    return Test.createTestingModule({ imports: [DatabaseModule, __Entry__EntryModule.register({ verify })] })
      .overrideProvider(FIRESTORE)
      .useValue({})
      .compile();
  }

  it('module の公開面が作られ、controller に注入される', async () => {
    const moduleRef = await compile();
    const sample = moduleRef.get<__Context__Module>(__Context__ModuleToken, { strict: false });
    expect(Object.keys(sample).sort()).toEqual(['close__Aggregate__', 'create__Aggregate__', 'list__Aggregate__Items']);
    expect(moduleRef.get(__Entry__Controller)).toBeInstanceOf(__Entry__Controller);
  });

  it('渡した verify が VERIFIER として Guard に注入される', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(VERIFIER, { strict: false })).toBe(verify);
    expect(moduleRef.get(__Entry__Guard)).toBeInstanceOf(__Entry__Guard);
  });
});
