/**
 * Igeta のコーディング規約 (MD / FN / NM / CM / TS / TE) のうち、機械で落とせる規則だけを載せた flat config。
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
const BOOLEAN_PARAMETER_MESSAGE = 'boolean の引数を作らない。union かオブジェクト引数にする (FN-06)';

const booleanParameterSelectors = [
  `${FUNCTION_NODES} > Identifier.params > TSTypeAnnotation > TSBooleanKeyword`,
  `${FUNCTION_NODES} > AssignmentPattern.params > Identifier.left > TSTypeAnnotation > TSBooleanKeyword`,
  `${FUNCTION_NODES} > AssignmentPattern.params > Literal.right[raw=/^(true|false)$/]`,
  `${FUNCTION_NODES} > TSParameterProperty.params > Identifier.parameter > TSTypeAnnotation > TSBooleanKeyword`,
  `${FUNCTION_NODES} > ObjectPattern.params > TSTypeAnnotation > TSBooleanKeyword`,
];

const NOT_BOOLEAN_PREFIXED = ':not([name=/^(is|has|can|should)[A-Z]/])';
const BOOLEAN_NAME_MESSAGE = '真偽値の名前は is / has / can / should で始める (NM-03)';

// 型情報なしで見られる範囲: 真偽値のリテラルで初期化した変数と、boolean と書いた変数・引数
const booleanNameSelectors = [
  `VariableDeclarator[init.raw=/^(true|false)$/] > Identifier.id${NOT_BOOLEAN_PREFIXED}`,
  `Identifier[typeAnnotation.typeAnnotation.type="TSBooleanKeyword"]${NOT_BOOLEAN_PREFIXED}`,
];

const ABBREVIATION_ALLOW_LIST = { id: true, db: true, ok: true, err: true, props: true, args: true, env: true };

const restrictedImportPatterns = [
  { group: ['../../*'], message: '相対 import は ../ 1 段まで。深い path は index か alias から取る (MD-07)' },
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
      'max-lines': ['error', { max: 150 }], // MD-01
      'max-lines-per-function': ['error', { max: 40 }], // FN-07
      'max-depth': ['error', 3], // FN-07
      'max-params': ['error', 3], // FN-05
      'no-nested-ternary': 'error', // FN-12
      'max-len': ['error', { code: 120 }], // FN-12
      // NM-09 (ok は Result の慣用名)
      'id-length': ['error', { min: 3, exceptions: ['i', 'id', 'db', 'ok'] }],
      '@typescript-eslint/naming-convention': [
        // NM-06
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
      ],
      'import/extensions': ['error', 'never'], // MD-07
      'no-restricted-imports': ['error', { patterns: restrictedImportPatterns }], // MD-07
      'jsdoc/require-jsdoc': [
        // CM-05
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, ArrowFunctionExpression: true },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
        },
      ],
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        // NM-10
        'error',
        { ignore: [0, 1, -1], ignoreEnums: true, ignoreNumericLiteralTypes: true, ignoreReadonlyClassProperties: true },
      ],
      'no-restricted-syntax': [
        // FN-06
        'error',
        ...booleanParameterSelectors.map((selector) => ({ selector, message: BOOLEAN_PARAMETER_MESSAGE })),
        ...booleanNameSelectors.map((selector) => ({ selector, message: BOOLEAN_NAME_MESSAGE })), // NM-03
      ],
      'no-param-reassign': ['error', { props: true }], // FN-04
      'no-else-return': 'error', // FN-08 (先頭の else だけ。残りは人)
      'no-negated-condition': 'error', // FN-09
      'prefer-const': 'error', // FN-11
      'no-var': 'error', // FN-11
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'anywhere' }], // CM-04
      'unicorn/prevent-abbreviations': ['error', { allowList: ABBREVIATION_ALLOW_LIST }], // NM-08
      '@typescript-eslint/no-explicit-any': 'error', // TS-01
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }], // TS-02 (as const は常に許される)
      'import/no-default-export': 'error', // TS-03
      'unicorn/filename-case': ['error', { case: 'kebabCase' }], // TS-05
      '@typescript-eslint/consistent-type-imports': 'error', // TS-06
      'promise/prefer-await-to-then': 'error', // TS-07
    },
  },
  {
    name: '@igeta/eslint-config/base-react-components',
    files: ['**/*.tsx'],
    // TS-05 (React の部品だけ PascalCase)
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
      '@typescript-eslint/no-magic-numbers': 'off', // NM-10 を緩める (期待値の数字を書く)
      'max-lines-per-function': 'off', // FN-07 を緩める (describe が 1 関数になる)
      'vitest/max-expects': ['error', { max: 3 }], // TE-02
      'vitest/max-nested-describe': ['error', { max: 2 }], // TE-03
      'vitest/no-conditional-tests': 'error', // TE-03
      'vitest/no-disabled-tests': 'error', // TE-04
      'vitest/expect-expect': 'error', // TE-04
    },
  },
];
