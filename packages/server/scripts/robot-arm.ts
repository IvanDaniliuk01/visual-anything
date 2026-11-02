/**
 * Writes the robot arm's solids into the sample `examples/robot-arm` (M9, ADR 0075; M15, ADR 0090):
 * the arm's and its workcell's (`workcell-solids.ts`: the table, a bin and the workpiece), each one's
 * canonical file as `solids/<hash>.glb`, and their definitions in the sample's package,
 * `packages/robot-arm.vapackage`, whose other contents it leaves as they are. Each file is the
 * program's canonical form, which the cleaner takes back unchanged: this checks it before writing
 * anything. A file of an earlier solid left in the sample's `solids/` is removed, since this script
 * alone writes that folder.
 *
 * Run it with `pnpm --filter @visual-anything/server robot-arm` after changing `robot-arm-solid.ts`
 * or `workcell-solids.ts`, then `pnpm --filter @visual-anything/server samples`, and commit what they
 * wrote: the tests fail while the committed files differ from these bytes.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackageFile, SolidDefinition } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { cleanSolid } from '../src/solids/clean';
import { robotArmDefinition, robotArmFile } from './robot-arm-solid';
import { WORKCELL_SOLIDS, workcellDefinition, workcellFile } from './workcell-solids';

const SAMPLE = fileURLToPath(new URL('../../../examples/robot-arm/', import.meta.url));
const PACKAGE = join(SAMPLE, 'packages', 'robot-arm.vapackage');
const SOLIDS = join(SAMPLE, 'solids');

const made: { bytes: Uint8Array; definition: (bytes: Uint8Array) => SolidDefinition }[] = [
  { bytes: robotArmFile(), definition: robotArmDefinition },
  ...WORKCELL_SOLIDS.map((solid) => ({
    bytes: workcellFile(solid),
    definition: (bytes: Uint8Array) => workcellDefinition(solid, bytes),
  })),
];

const definitions: SolidDefinition[] = [];
for (const { bytes, definition } of made) {
  const cleaned = await cleanSolid(bytes);
  if (!cleaned.ok) {
    throw new Error(
      `The cleaner refuses a solid: ${cleaned.problems.map((each) => each.message).join(' ')}`,
    );
  }
  if (Buffer.compare(Buffer.from(cleaned.bytes), Buffer.from(bytes)) !== 0) {
    throw new Error('The cleaner changes a solid: write it in the canonical form it keeps.');
  }
  definitions.push(definition(bytes));
}

mkdirSync(SOLIDS, { recursive: true });
const names = new Set(definitions.map((each) => `${each.hash}.glb`));
for (const each of readdirSync(SOLIDS)) {
  if (each.endsWith('.glb') && !names.has(each)) rmSync(join(SOLIDS, each));
}
made.forEach(({ bytes }, at) => {
  const name = `${(definitions[at] as SolidDefinition).hash}.glb`;
  writeFileSync(join(SOLIDS, name), bytes);
  console.log(`Wrote ${join(SOLIDS, name)} (${bytes.length.toLocaleString()} bytes)`);
});

const file = JSON.parse(readFileSync(PACKAGE, 'utf8')) as PackageFile;
const ours = new Set(definitions.map((each) => each.id));
const others = (file.solids ?? []).filter((each) => !ours.has(each.id));
writeFileSync(PACKAGE, formatFile('package', { ...file, solids: [...definitions, ...others] }));
console.log(`Wrote ${PACKAGE}`);
