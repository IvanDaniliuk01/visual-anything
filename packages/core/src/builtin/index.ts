import type { Id, PackageFile } from '@visual-anything/schema';
import { C4 } from './c4';
import { DATA_MODELING } from './data-modeling';
import { DATA_SCIENCE } from './data-science';
import { MACHINE_LEARNING } from './machine-learning';
import { PHYSICAL_AI } from './physical-ai';
import { PROCESS } from './process';
import { SYSTEMS } from './systems';

export { C4 } from './c4';
export { DATA_MODELING } from './data-modeling';
export { DATA_SCIENCE } from './data-science';
export { ESSENCE, RELATES_TO } from './essence-and-relates-to';
export { MACHINE_LEARNING } from './machine-learning';
export { PHYSICAL_AI } from './physical-ai';
export { PROCESS } from './process';
export { SYSTEMS } from './systems';

/**
 * The packages built into Visual Anything. A project uses one by listing its id; the package is not
 * copied into the project folder.
 */
export const BUILTIN_PACKAGES: readonly PackageFile[] = [
  SYSTEMS,
  DATA_MODELING,
  C4,
  DATA_SCIENCE,
  MACHINE_LEARNING,
  PHYSICAL_AI,
  PROCESS,
];

/** The built-in package with this id, if there is one. */
export function builtinPackage(id: Id): PackageFile | undefined {
  return BUILTIN_PACKAGES.find((builtin) => builtin.id === id);
}

/**
 * The package ids no project's own package may take: those of the built-in packages, and those of the
 * domains Visual Anything plans built-in packages for, so that shipping one never stops a project from
 * opening.
 */
export const RESERVED_PACKAGE_IDS: ReadonlySet<Id> = new Set([
  'systems',
  'data-modeling',
  'c4',
  'data-science',
  'neuroscience',
  'physical-ai',
  // The visual packages planned next (ADR 0079).
  'machine-learning',
  'process',
  'networks',
  'kubernetes',
  'control-and-circuits',
  'anatomy',
]);
