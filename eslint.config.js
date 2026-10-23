import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

/** Globals that would give a pure package network access or other I/O. */
const ioGlobals = [
  'fetch',
  'WebSocket',
  'XMLHttpRequest',
  'EventSource',
  'navigator',
  'process',
  'require',
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
];

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/', '.claude/', 'packages/schema/schemas/']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['*.{js,ts}', 'packages/server/**/*.ts', 'packages/schema/scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // core and schema run in Node and in the browser and have no I/O: in particular, no network access.
    files: ['packages/core/src/**/*.ts', 'packages/schema/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({
            name,
            message: 'core and schema have no I/O; this belongs in the server.',
          })),
          patterns: [
            {
              group: ['node:*'],
              message: 'core and schema have no I/O; this belongs in the server.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...ioGlobals.map((name) => ({
          name,
          message: 'core and schema have no I/O; this belongs in the server or the app.',
        })),
      ],
    },
  },
  prettier,
);
