/**
 * Writes the robot arm's solid into the sample `examples/robot-arm` (M9, ADR 0075): its canonical
 * file as `solids/<hash>.glb`, and its definition in the sample's package, `packages/robot-arm.vapackage`,
 * whose other contents it leaves as they are. The file is the program's canonical form, which the
 * cleaner takes back unchanged: this checks it before writing anything. A file of an earlier arm left
 * in the sample's `solids/` is removed, since this script alone writes that folder.
 *
 * Run it with `pnpm --filter @visual-anything/server robot-arm` after changing `robot-arm-solid.ts`,
 * then `pnpm --filter @visual-anything/server samples`, and commit what they wrote: the tests fail
 * while the committed file differs from these bytes.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackageFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { cleanSolid } from '../src/solids/clean';
import { robotArmDefinition, robotArmFile, ROBOT_ARM_SOLID } from './robot-arm-solid';

const SAMPLE = fileURLToPath(new URL('../../../examples/robot-arm/', import.meta.url));
const PACKAGE = join(SAMPLE, 'packages', 'robot-arm.vapackage');
const SOLIDS = join(SAMPLE, 'solids');

const bytes = robotArmFile();
const cleaned = await cleanSolid(bytes);
if (!cleaned.ok) {
  throw new Error(
    `The cleaner refuses the arm: ${cleaned.problems.map((each) => each.message).join(' ')}`,
  );
}
if (Buffer.compare(Buffer.from(cleaned.bytes), Buffer.from(bytes)) !== 0) {
  throw new Error('The cleaner changes the arm: write it in the canonical form it keeps.');
}
const definition = robotArmDefinition(bytes);

mkdirSync(SOLIDS, { recursive: true });
const name = `${definition.hash}.glb`;
for (const each of readdirSync(SOLIDS)) {
  if (each.endsWith('.glb') && each !== name) rmSync(join(SOLIDS, each));
}
writeFileSync(join(SOLIDS, name), bytes);

const file = JSON.parse(readFileSync(PACKAGE, 'utf8')) as PackageFile;
const solids = (file.solids ?? []).filter((each) => each.id !== ROBOT_ARM_SOLID);
writeFileSync(PACKAGE, formatFile('package', { ...file, solids: [definition, ...solids] }));
console.log(`Wrote ${join(SOLIDS, name)} (${bytes.length.toLocaleString()} bytes) and ${PACKAGE}`);
