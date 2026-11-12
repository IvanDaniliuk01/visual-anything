/**
 * Where the sample projects come from: their folders in the repository's `examples/`. Only the script
 * that embeds them and its test read these folders; the program reads the samples it holds.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileKindOf } from '@visual-anything/schema';
import { SAMPLE_IDS, isSampleExplorableFile, isSampleSolidFile } from './samples';

/** The repository's `examples/` folder. */
export const EXAMPLES = fileURLToPath(new URL('../../../examples', import.meta.url));

/**
 * Every project file of each sample, by its path inside the sample's folder with forward slashes, in
 * sorted order, as its text; each explorable's file in its `explorables/` (ADR 0107), as its text;
 * and each solid's file in its `solids/` (ADR 0075), in base64.
 */
export function collectSamples(): Record<string, Record<string, string>> {
  const samples: Record<string, Record<string, string>> = {};
  for (const id of SAMPLE_IDS) {
    const folder = join(EXAMPLES, id);
    const files: Record<string, string> = {};
    for (const path of projectFilesIn(folder)) {
      const at = join(folder, ...path.split('/'));
      files[path] = isSampleSolidFile(path)
        ? readFileSync(at).toString('base64')
        : readFileSync(at, 'utf8');
    }
    samples[id] = files;
  }
  return samples;
}

/** The text of `samples/samples.json`: the samples as 2-space JSON with a final newline. */
export function samplesText(): string {
  return `${JSON.stringify(collectSamples(), null, 2)}\n`;
}

/**
 * The project files of a folder: those at the top, and those in the folders right inside it, with the
 * explorables' files in `explorables/` and the solids' files named by their hash in `solids/`.
 */
function projectFilesIn(folder: string): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      for (const inner of readdirSync(path)) {
        const inside = `${name}/${inner}`;
        if (
          fileKindOf(inner) !== undefined ||
          isSampleSolidFile(inside) ||
          isSampleExplorableFile(inside)
        ) {
          paths.push(inside);
        }
      }
    } else if (fileKindOf(name) !== undefined) {
      paths.push(name);
    }
  }
  return paths.sort();
}
