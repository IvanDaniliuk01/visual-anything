/**
 * Writes `tokens.css` from `themes.ts` and `scale.ts`. Run it after changing either, and commit what it
 * writes: `pnpm exec tsx packages/app/src/theme/generate.ts`. A test fails while the two differ.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { themeStyleSheet } from './css';

const target = fileURLToPath(new URL('./tokens.css', import.meta.url));
writeFileSync(target, themeStyleSheet());
console.log(`Wrote ${target}`);
