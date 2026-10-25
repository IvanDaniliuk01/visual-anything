/**
 * Writes the sample projects a new project can start from (ADR 0051) into the local program, from
 * their folders in `examples/`: every project file of each, as its text, in
 * `packages/server/src/samples/samples.json`. The program reads them from there, so that the single
 * executable holds them too.
 *
 * Run it with `pnpm --filter @visual-anything/server samples` after changing a sample, and commit the
 * file: a test fails while it differs from what this writes.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { samplesText } from '../src/samples-source';

const target = fileURLToPath(new URL('../src/samples/samples.json', import.meta.url));
writeFileSync(target, samplesText());
console.log(`Wrote ${target}`);
