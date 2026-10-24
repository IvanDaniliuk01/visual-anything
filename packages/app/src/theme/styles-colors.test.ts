/**
 * The stylesheets take their colors from the theme tokens, never write one out: a color written in a
 * stylesheet would be the same in both themes, and no contrast test would see it.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCE_FOLDER, readSource } from './testing';

/** Stylesheets of other work in progress, which move onto the tokens when their owners next change them. */
const NOT_YET_ON_TOKENS = new Set(['canvas/drop.css', 'canvas/keyboard.css']);

const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|:\s*(?:white|black)\b|\s(?:white|black)\s*;/gi;

function stylesheets(): string[] {
  return readdirSync(SOURCE_FOLDER, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map((path) => relative(SOURCE_FOLDER, join(SOURCE_FOLDER, path)).replaceAll('\\', '/'))
    .filter((path) => path !== 'theme/tokens.css')
    .sort();
}

/** The text of a stylesheet without its comments. */
function rulesIn(path: string): string {
  return readSource(path).replace(/\/\*.*?\*\//gs, '');
}

describe('stylesheets', () => {
  it('include the app’s own', () => {
    expect(stylesheets()).toEqual(
      expect.arrayContaining(['styles.css', 'shell/panel.css', 'shell/inspector.css']),
    );
  });

  it.each(stylesheets().filter((path) => !NOT_YET_ON_TOKENS.has(path)))(
    '%s writes out no color',
    (path) => {
      expect(rulesIn(path).match(COLOR_LITERAL) ?? []).toEqual([]);
    },
  );

  it('still have the ones not on the tokens yet, so that the list above stays true', () => {
    for (const path of NOT_YET_ON_TOKENS) expect(stylesheets()).toContain(path);
  });

  it('take the tokens first, from the generated file', () => {
    expect(rulesIn('styles.css').trimStart()).toMatch(/^@import '\.\/theme\/tokens\.css';/);
  });
});
