/**
 * KaTeX's stylesheet in the app (ADR 0106), split in two and written by `generate-katex-css.ts` from
 * the pinned KaTeX's own `katex.css`, so that the panels draw Math with KaTeX's layout and fonts:
 *
 * - `katex.css`, its rules without its fonts, which every page that draws Math in panels takes;
 * - `katex-fonts.css`, its `@font-face` rules, each with its woff2 file alone, which the app takes.
 *   The woff and TrueType files KaTeX lists after it are left out, since every browser the app runs
 *   in reads woff2, so that the app ships 20 font files and not 60. Each file is the app's own, as the
 *   policy's `font-src 'self'` asks: `?no-inline` keeps Vite from writing a small one, such as
 *   KaTeX_Size3's, into the stylesheet as a `data:` address the policy would refuse.
 *
 * The read-only page bundles the families its project uses in its own way (task A9.3).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

/** The command that writes the two stylesheets; a test fails while they differ from what it writes. */
export const GENERATE_KATEX_CSS = 'pnpm exec tsx packages/app/src/text/generate-katex-css.ts';

/** Where KaTeX's fonts are, from this folder: the app's own dependency, pinned. */
export const KATEX_FONTS = '../../node_modules/katex/dist/fonts/';

/** What heads each stylesheet. */
const HEADER = (what: string) =>
  `/* ${what} Written by \`${GENERATE_KATEX_CSS}\` from KaTeX's katex.css (MIT); do not edit. */\n`;

/** KaTeX's stylesheet split into its rules and its fonts, the fonts as woff2 files of the app's. */
export function katexStylesheets(source: string): { layout: string; fonts: string } {
  const faces: string[] = [];
  const layout = source.replace(/@font-face\s*\{[^}]*\}\s*/g, (face) => {
    faces.push(woff2Only(face.trim()));
    return '';
  });
  if (faces.length === 0) throw new Error('KaTeX’s stylesheet has no @font-face rule.');
  return {
    layout: HEADER('KaTeX’s rules (ADR 0106), without its fonts.') + layout,
    fonts: `${HEADER('KaTeX’s fonts (ADR 0106), each as its woff2 file alone.')}${faces.join('\n')}\n`,
  };
}

/** The two stylesheets' paths, in this folder. */
export const KATEX_CSS_FILES = {
  layout: resolve(import.meta.dirname, 'katex.css'),
  fonts: resolve(import.meta.dirname, 'katex-fonts.css'),
} as const;

/** The two stylesheets as the generator writes them: from the pinned KaTeX, formatted as the repository is. */
export async function generatedKatexStylesheets(): Promise<{ layout: string; fonts: string }> {
  const source = readFileSync(
    createRequire(KATEX_CSS_FILES.layout).resolve('katex/dist/katex.css'),
    'utf8',
  );
  const { layout, fonts } = katexStylesheets(source);
  const options = { ...(await resolveConfig(KATEX_CSS_FILES.layout)), parser: 'css' };
  return { layout: await format(layout, options), fonts: await format(fonts, options) };
}

/** A `@font-face` rule whose `src` names its woff2 file alone, as a file of the app's. */
function woff2Only(face: string): string {
  return face.replace(/src:\s*([^;]+);/, (_whole, sources: string) => {
    const woff2 =
      /url\(\s*['"]?fonts\/([\w-]+\.woff2)['"]?\s*\)\s*format\(\s*['"]woff2['"]\s*\)/.exec(sources);
    if (woff2 === null) throw new Error(`A font of KaTeX’s has no woff2 file: ${sources}`);
    return `src: url('${KATEX_FONTS}${woff2[1]}?no-inline') format('woff2');`;
  });
}
