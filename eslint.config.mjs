import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  prettierConfig,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          'selector': 'default',
          'format': ['camelCase'],
          'leadingUnderscore': 'allow'
        },
        {
          'selector': 'variable',
          'format': ['camelCase', 'UPPER_CASE', 'PascalCase']
        },
        {
          'selector': 'parameter',
          'format': ['camelCase'],
          'leadingUnderscore': 'allow'
        },
        {
          'selector': 'typeLike',
          'format': ['PascalCase']
        },
        {
          'selector': 'enumMember',
          'format': ['UPPER_CASE']
        }
      ],

      // General JavaScript/TypeScript rules
      'no-console': ['error', { 'allow': ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-caller': 'error',
      'no-labels': 'error',
      'no-iterator': 'error',
      'no-proto': 'error',
      'no-script-url': 'error',
      'no-throw-literal': 'error',
      'no-void': 'error',
      'no-with': 'error',
      'radix': 'error',
      'require-atomic-updates': 'error',
      'no-promise-executor-return': 'error',
      'no-unreachable-loop': 'error',
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      'complexity': ['error', 50],
      'max-depth': ['error', 4],
      'max-lines': ['error', 500],
      'max-lines-per-function': ['error', 80],
      'max-params': ['error', 5],
      'max-statements': ['error', 25],

      // Code style (handled by Prettier but still useful)
      'max-len': ['error', { 'code': 100, 'ignoreUrls': true, 'ignoreStrings': true }],
      'prettier/prettier': ['error', {
        'printWidth': 100,
        'tabWidth': 2,
        'singleQuote': true,
        'trailingComma': 'none',
        'arrowParens': 'always',
        'endOfLine': 'lf'
      }]
    },
  },
  {
    ignores: [
      'node_modules/',
      'main.js',
      '**/*.test.ts',
      'jest.config.js',
      'esbuild.config.mjs',
      'src/__mocks__/**',
      '.eslintrc.json'
    ]
  }
);
