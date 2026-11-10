/**
 * Writes `katex.css` and `katex-fonts.css` from the pinned KaTeX's stylesheet (`katex-css.ts`). Run it
 * after upgrading KaTeX, and commit what it writes: `pnpm exec tsx packages/app/src/text/generate-katex-css.ts`.
 * A test fails while they differ.
 */
import { writeFileSync } from 'node:fs';
import { KATEX_CSS_FILES, generatedKatexStylesheets } from './katex-css';

const { layout, fonts } = await generatedKatexStylesheets();
writeFileSync(KATEX_CSS_FILES.layout, layout);
writeFileSync(KATEX_CSS_FILES.fonts, fonts);
console.log(`Wrote ${KATEX_CSS_FILES.layout} and ${KATEX_CSS_FILES.fonts}`);
