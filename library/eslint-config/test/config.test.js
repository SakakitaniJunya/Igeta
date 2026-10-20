/** @igeta/eslint-config の自己テスト。わざと違反した fixture が、規則 1 つにつき 1 行で落ちることを確かめる。 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { base, tests } from '../index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VIOLATIONS = path.join(ROOT, 'fixtures', 'violations');

async function lint({ file, configs, lintAs }) {
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: configs });
  const source = readFileSync(path.join(VIOLATIONS, file), 'utf8');
  const [result] = await eslint.lintText(source, { filePath: path.join(VIOLATIONS, lintAs ?? file) });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

// [規約 ID, 落ちるはずの規則, fixture, 別名で掛ける path (任意)]
const VIOLATION_ROWS = [
  ['MD-01', 'max-lines', 'md-01-max-lines.ts'],
  ['FN-07', 'max-lines-per-function', 'fn-07-max-lines-per-function.ts'],
  ['FN-07', 'max-depth', 'fn-07-max-depth.ts'],
  ['FN-05', 'max-params', 'fn-05-max-params.ts'],
  ['FN-12', 'no-nested-ternary', 'fn-12-no-nested-ternary.ts'],
  ['FN-12', 'max-len', 'fn-12-max-len.ts'],
  ['NM-09', 'id-length', 'nm-09-id-length.ts'],
  ['NM-06', '@typescript-eslint/naming-convention', 'nm-06-naming-convention-type.ts'],
  ['NM-06', '@typescript-eslint/naming-convention', 'nm-06-naming-convention-function.ts'],
  ['NM-06', '@typescript-eslint/naming-convention', 'nm-06-naming-convention-variable.ts'],
  ['MD-07', 'import/extensions', 'md-07-import-extensions.ts'],
  ['MD-07', 'no-restricted-imports', 'md-07-no-restricted-imports.ts'],
  ['CM-05', 'jsdoc/require-jsdoc', 'cm-05-require-jsdoc-function.ts'],
  ['CM-05', 'jsdoc/require-jsdoc', 'cm-05-require-jsdoc-type.ts'],
  ['CM-05', 'jsdoc/require-jsdoc', 'cm-05-require-jsdoc-class.ts'],
  ['CM-05', 'jsdoc/require-jsdoc', 'cm-05-require-jsdoc-arrow.ts'],
  ['NM-10', '@typescript-eslint/no-magic-numbers', 'nm-10-no-magic-numbers.ts'],
  ['FN-06', 'no-restricted-syntax', 'fn-06-no-restricted-syntax-annotation.ts'],
  ['FN-06', 'no-restricted-syntax', 'fn-06-no-restricted-syntax-default.ts'],
  ['TS-01', '@typescript-eslint/no-explicit-any', 'ts-01-no-explicit-any.ts'],
  ['TS-02', '@typescript-eslint/consistent-type-assertions', 'ts-02-consistent-type-assertions.ts'],
  ['TS-03', 'import/no-default-export', 'ts-03-no-default-export.ts'],
  ['TS-05', 'unicorn/filename-case', 'ts-05-filename-case.ts', 'itemRepository.ts'],
  ['TS-06', '@typescript-eslint/consistent-type-imports', 'ts-06-consistent-type-imports.ts'],
  ['TS-07', 'promise/prefer-await-to-then', 'ts-07-prefer-await-to-then.ts'],
  ['TE-02', 'vitest/max-expects', 'te-02-max-expects.spec.ts'],
  ['TE-03', 'vitest/max-nested-describe', 'te-03-max-nested-describe.spec.ts'],
  ['TE-03', 'vitest/no-conditional-tests', 'te-03-no-conditional-tests.spec.ts'],
  ['TE-04', 'vitest/no-disabled-tests', 'te-04-no-disabled-tests.spec.ts'],
  ['TE-04', 'vitest/expect-expect', 'te-04-expect-expect.spec.ts'],
];

describe('違反した fixture は規則で落ちる', () => {
  for (const [standardId, ruleId, file, lintAs] of VIOLATION_ROWS) {
    it(`${standardId} ${ruleId} (${file})`, async () => {
      const ruleIds = await lint({ file, lintAs, configs: [...base, ...tests] });

      assert.ok(ruleIds.includes(ruleId), `${ruleId} が出ない: ${ruleIds.join(', ')}`);
    });
  }
});

describe('tests は base の 2 規則だけを緩める', () => {
  const RELAXED = ['max-lines-per-function', '@typescript-eslint/no-magic-numbers'];

  it('FN-07・NM-10 base だけで掛けると、テストの fixture は 2 規則とも落ちる', async () => {
    const ruleIds = await lint({ file: 'relaxed-in-tests.spec.ts', configs: base });

    assert.deepEqual(RELAXED.filter((ruleId) => !ruleIds.includes(ruleId)), []);
  });

  it('FN-07・NM-10 tests を足すと、同じ fixture で 2 規則とも落ちない', async () => {
    const ruleIds = await lint({ file: 'relaxed-in-tests.spec.ts', configs: [...base, ...tests] });

    assert.deepEqual(RELAXED.filter((ruleId) => ruleIds.includes(ruleId)), []);
  });
});

describe('規約に沿った書き方は落ちない', () => {
  it('TS-02 `as const` は許される', async () => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: base });
    const [result] = await eslint.lintText('/** 種類。 */\nexport const KINDS = [\'base\'] as const;\n', {
      filePath: path.join(VIOLATIONS, 'as-const.ts'),
    });

    assert.deepEqual(result?.messages, []);
  });

  it('TS-05 .tsx の部品は PascalCase のファイル名でよい', async () => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: base });
    const [result] = await eslint.lintText('export {};\n', { filePath: path.join(VIOLATIONS, 'ItemCard.tsx') });

    assert.deepEqual(result?.messages, []);
  });

  it('見本の本番コードとテストは違反 0 件', async () => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: [...base, ...tests] });
    const results = await eslint.lintFiles([path.join(ROOT, 'fixtures', 'clean')]);

    assert.deepEqual(results.flatMap((result) => result.messages), []);
  });
});
