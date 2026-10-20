/**
 * Igeta のコーディング規約 (RC / TS / TE) のうち、機械で落とせる規則だけを載せた flat config。
 * 使い方: `export default [...base, ...tests]`。各規則の横の ID は規約の規則 ID。
 */
import vitest from '@vitest/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import promise from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const SOURCE_FILES = ['**/*.ts', '**/*.tsx'];
const TEST_FILES = ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx', '**/test/**/*.ts'];

const FUNCTION_NODES =
  ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSEmptyBodyFunctionExpression, TSMethodSignature, TSFunctionType, TSConstructorType)';
const BOOLEAN_PARAMETER_MESSAGE = 'boolean の引数を作らない。union かオブジェクト引数にする (RC-10)';

const booleanParameterSelectors = [
  `${FUNCTION_NODES} > Identifier.params > TSTypeAnnotation > TSBooleanKeyword`,
  `${FUNCTION_NODES} > AssignmentPattern.params > Identifier.left > TSTypeAnnotation > TSBooleanKeyword`,
  `${FUNCTION_NODES} > AssignmentPattern.params > Literal.right[raw=/^(true|false)$/]`,
  `${FUNCTION_NODES} > TSParameterProperty.params > Identifier.parameter > TSTypeAnnotation > TSBooleanKeyword`,
  `${FUNCTION_NODES} > ObjectPattern.params > TSTypeAnnotation > TSBooleanKeyword`,
];

const restrictedImportPatterns = [
  { group: ['../../*'], message: '相対 import は ../ 1 段まで。深い path は index か alias から取る (RC-06)' },
];

/** 本番コード用。 */
export const base = [
  {
    name: '@igeta/eslint-config/base',
    files: SOURCE_FILES,
    languageOptions: { parser: tseslint.parser },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      import: importPlugin,
      jsdoc,
      promise,
      unicorn,
    },
    rules: {
      'max-lines': ['error', { max: 150 }], // RC-01
      'max-lines-per-function': ['error', { max: 40 }], // RC-02
      'max-depth': ['error', 3], // RC-02
      'max-params': ['error', 3], // RC-02, TS-05
      'no-nested-ternary': 'error', // RC-03
      'max-len': ['error', { code: 120 }], // RC-03
      'id-length': ['error', { min: 3, exceptions: ['i', 'id', 'db'] }], // RC-04
      '@typescript-eslint/naming-convention': [
        // RC-04
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
      ],
      'import/extensions': ['error', 'never'], // RC-06
      'no-restricted-imports': ['error', { patterns: restrictedImportPatterns }], // RC-06
      'jsdoc/require-jsdoc': [
        // RC-07
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, ArrowFunctionExpression: true },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
        },
      ],
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        // RC-09
        'error',
        { ignore: [0, 1, -1], ignoreEnums: true, ignoreNumericLiteralTypes: true, ignoreReadonlyClassProperties: true },
      ],
      'no-restricted-syntax': [
        // RC-10
        'error',
        ...booleanParameterSelectors.map((selector) => ({ selector, message: BOOLEAN_PARAMETER_MESSAGE })),
      ],
      '@typescript-eslint/no-explicit-any': 'error', // TS-01
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }], // TS-02 (as const は常に許される)
      'import/no-default-export': 'error', // TS-03
      'unicorn/filename-case': ['error', { case: 'kebabCase' }], // TS-06
      '@typescript-eslint/consistent-type-imports': 'error', // TS-07
      'promise/prefer-await-to-then': 'error', // TS-08
    },
  },
  {
    name: '@igeta/eslint-config/base-react-components',
    files: ['**/*.tsx'],
    // TS-06 (React の部品だけ PascalCase)
    rules: { 'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }] },
  },
];

/** テスト用。base の後ろに足す。 */
export const tests = [
  {
    name: '@igeta/eslint-config/tests',
    files: TEST_FILES,
    plugins: { vitest },
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off', // RC-09 を緩める (期待値の数字を書く)
      'max-lines-per-function': 'off', // RC-02 を緩める (describe が 1 関数になる)
      'vitest/max-expects': ['error', { max: 3 }], // TE-02
      'vitest/max-nested-describe': ['error', { max: 2 }], // TE-03
      'vitest/no-conditional-tests': 'error', // TE-03
      'vitest/no-disabled-tests': 'error', // TE-04
      'vitest/expect-expect': 'error', // TE-04
    },
  },
];
