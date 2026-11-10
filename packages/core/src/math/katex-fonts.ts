/**
 * Reads KaTeX's TrueType fonts from the installed package, for `generate.ts` and the tables' test.
 * Node only; nothing the core runs imports it.
 */
/* eslint-disable no-restricted-imports -- read by a build script and a test, outside what the core runs */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { MathFont } from './drawing';
import { MATH_FONTS } from './tables';

export function readMathFonts(): Map<MathFont, Uint8Array> {
  const katex = createRequire(import.meta.url).resolve('katex');
  const folder = join(dirname(katex), 'fonts');
  return new Map(MATH_FONTS.map((name) => [name, readFileSync(join(folder, `KaTeX_${name}.ttf`))]));
}
