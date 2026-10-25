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

const NO_MARKUP =
  'The app turns no text into markup in the page: it draws an image only by decoding it as a picture (CLAUDE.md, ADR-0027).';

/**
 * What keeps the app from turning text into HTML or SVG markup in the page, so that no picture or text
 * from a project reaches an HTML parser there. Tests may use these, as `shortcuts.test.ts` does.
 */
export const pageSafety = {
  files: ['packages/app/src/**/*.{ts,tsx}'],
  ignores: ['**/*.test.{ts,tsx}'],
  rules: {
    'no-restricted-properties': [
      'error',
      ...[
        'innerHTML',
        'outerHTML',
        'insertAdjacentHTML',
        'setHTMLUnsafe',
        'createContextualFragment',
        'srcdoc',
      ].map((property) => ({ property, message: NO_MARKUP })),
      { object: 'document', property: 'write', message: NO_MARKUP },
      { object: 'document', property: 'writeln', message: NO_MARKUP },
    ],
    'no-restricted-syntax': [
      'error',
      ...[
        "JSXAttribute[name.name='dangerouslySetInnerHTML']",
        "JSXAttribute[name.name='srcDoc']",
        // PixiJS's Graphics.svg() parses the markup in the live page.
        "CallExpression[callee.property.name='svg']",
        "CallExpression[callee.property.name='parseHTMLUnsafe']",
        "NewExpression[callee.name='DOMParser']",
        // PixiJS's loadSVG with parseAsGraphicsContext parses the markup in the live page too.
        "Property[key.name='parseAsGraphicsContext']",
      ].map((selector) => ({ selector, message: NO_MARKUP })),
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'pixi.js',
            importNames: [
              'HTMLText',
              'HTMLTextStyle',
              'HTMLTextPipe',
              'HTMLTextRenderData',
              'BatchableHTMLText',
              'DOMContainer',
            ],
            message: `PixiJS's HTML text and DOM containers put text into the page as HTML. ${NO_MARKUP}`,
          },
          { name: 'pixi.js/text-html', message: NO_MARKUP },
          { name: 'pixi.js/dom', message: NO_MARKUP },
        ],
      },
    ],
  },
};

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/dist-bench/',
    'dist-exe/',
    '**/coverage/',
    '.claude/',
    'packages/schema/schemas/',
  ]),
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
  pageSafety,
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
