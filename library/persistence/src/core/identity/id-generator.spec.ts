import { describe, expect, it } from 'vitest';
import { isDocumentId } from './document-id';
import { createUuidGenerator } from './id-generator';

describe('id-generator', () => {
  it('TST-116 生成した id は DocumentId の規則を満たす', () => {
    const generator = createUuidGenerator();

    const generatedId = generator.next();

    expect(isDocumentId(generatedId)).toBe(true);
  });

  it('TST-116 2 回生成した id は異なる', () => {
    const generator = createUuidGenerator();

    const firstId = generator.next();
    const secondId = generator.next();

    expect(firstId).not.toBe(secondId);
  });
});
