/**
 * Writes `advances.json` and `outlines.json` from the fonts of the pinned KaTeX (ADR 0106). Run it after
 * upgrading KaTeX, and commit what it writes: `pnpm exec tsx packages/core/src/math/generate.ts`. A test
 * fails while the two differ.
 *
 * A script run by hand, never imported by the core, so it may read and write files.
 */
/* eslint-disable no-restricted-imports -- a build script, outside what the core runs */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readMathFonts } from './katex-fonts';
import { buildAdvanceTable, buildOutlineTable, tableFile } from './tables';

const fonts = readMathFonts();
for (const [name, table] of [
  ['advances.json', buildAdvanceTable(fonts)],
  ['outlines.json', buildOutlineTable(fonts)],
] as const) {
  const target = fileURLToPath(new URL(`./${name}`, import.meta.url));
  const text = tableFile(table);
  writeFileSync(target, text);
  console.log(`Wrote ${target} (${new TextEncoder().encode(text).length} bytes)`);
}
