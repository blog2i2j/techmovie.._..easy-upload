import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import preact from 'eslint-config-preact';
import stylisticTs from '@stylistic/eslint-plugin-ts';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import neostandard from 'neostandard';

export default [
  {
    ignores: ['**/dist'],
  },
  ...neostandard({
    ts: true,
    filesTs: ['**/*.ts', '**/*.tsx'],
  }),

  js.configs.recommended,

  ...preact,

  ...tseslint.configs.recommended,

  prettierConfig,

  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx'],

    plugins: {
      '@stylistic/ts': stylisticTs,
      prettier: prettierPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      jest: {
        version: 26,
      },
    },

    rules: {
      'no-use-before-define': 0,
      semi: ['error', 'always'],
      'no-undef': 0,
      'comma-dangle': ['error', 'always-multiline'],
      indent: 'off',
      '@stylistic/ts/indent': ['error', 2],
      '@stylistic/ts/type-annotation-spacing': 'error',
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
        },
      ],
    },
  },
];
