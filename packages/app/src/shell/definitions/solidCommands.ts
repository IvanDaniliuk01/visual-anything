/**
 * The actions the editors send for solids (ADR 0075), one gesture one action:
 *
 * - **Importing** a file the local program prepared defines it in the first of the project's own
 *   packages, or in a new one named after the project made in the same action, as the command line's
 *   import does: `Import "arm.glb" as a solid`. The program takes `define-solid` only for a file it
 *   holds, and gives the definition the description it worked out.
 * - **Replacing** a solid's file defines its id again with the new file, keeping what the person said
 *   of it: `Replace the solid "Arm" with "arm-2.glb"`.
 * - **A component's solid** is its appearance's `solid` trait, set whole, trait by trait as any other.
 */
import {
  DEFAULT_SOLID_CAMERA,
  SOLID_CAPS,
  componentSolid,
  definitionIdFor,
  definitionsIn,
  randomIds,
  solidsIn,
  type BatchCommand,
  type Command,
  type IdGenerator,
  type ProjectSnapshot,
  type SolidPreparedMessage,
} from '@visual-anything/core';
import type { AppearanceSolid, Id, SolidCamera, SolidDefinition } from '@visual-anything/schema';
import { proposedPackageId, takenIn } from './commands';
import { ownPackages } from './imageCommands';

/** The files Import… and Replace read as solids. */
export const SOLID_FILE_TYPES = '.glb,.gltf,model/gltf-binary,model/gltf+json';

/** The endings of a glTF file. */
const SOLID_ENDINGS = ['.glb', '.gltf'] as const;

/** Whether a file's name says it is a glTF file, which imports as a solid. */
export function isSolidFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return SOLID_ENDINGS.some((ending) => lower.endsWith(ending));
}

/** A solid's name from its file's: the name without its ending, or "Solid". */
export function solidBaseName(fileName: string): string {
  const lower = fileName.toLowerCase();
  const ending = SOLID_ENDINGS.find((each) => lower.endsWith(each));
  const base = (ending === undefined ? fileName : fileName.slice(0, -ending.length)).trim();
  return base === '' ? 'Solid' : base.slice(0, 200);
}

/** The most a file the app sends to be cleaned may weigh: 256 MiB (ADR 0075). */
export const MOST_SOLID_INPUT = 256 * 1024 * 1024;

/** What the person says of a solid, over what its file gives. */
export interface SolidChoices {
  name: string;
  description?: string;
  source?: string;
  license?: string;
}

/** Where an imported solid goes: the first of the project's own packages, or a new one. */
export function solidPackageFor(project: ProjectSnapshot): {
  package: Id;
  create?: { id: Id; name: string };
} {
  const first = ownPackages(project)[0];
  if (first !== undefined) return { package: first };
  const name = project.project.name.trim() === '' ? 'Solids' : project.project.name.slice(0, 200);
  const id = proposedPackageId(project, name);
  return { package: id, create: { id, name } };
}

/** A new id for a solid of a package, unused by anything in the project, solids included. */
export function newSolidId(
  project: ProjectSnapshot,
  packageId: Id,
  name: string,
  generate: IdGenerator = randomIds(),
): Id {
  const taken = takenIn(project);
  const solids = solidsIn(project).solids;
  return definitionIdFor(packageId, name, generate, (id) => taken(id) || solids.has(id), 'solid');
}

/** The text the person typed, trimmed, cut to its most and left out when empty. */
function given(text: string | undefined, most: number): string | undefined {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed.slice(0, most);
}

/** The definition of a prepared file, with the description the program worked out. */
function definitionOf(
  id: Id,
  prepared: SolidPreparedMessage,
  choices: SolidChoices,
  camera: SolidCamera,
): SolidDefinition {
  const description = given(choices.description, 1000);
  const source = given(choices.source, 500);
  const license = given(choices.license, 64);
  return {
    id,
    name: given(choices.name, 200) ?? 'Solid',
    ...(description === undefined ? {} : { description }),
    ...(source === undefined ? {} : { source }),
    ...(license === undefined ? {} : { license }),
    hash: prepared.hash,
    bytes: prepared.bytes,
    bounds: prepared.bounds,
    counts: prepared.counts,
    parts: prepared.parts,
    camera,
    ...(prepared.animations === undefined || prepared.animations.length === 0
      ? {}
      : { animations: prepared.animations }),
  };
}

/**
 * The one action that defines a prepared file as a solid: `Import "arm.glb" as a solid`, creating the
 * package it goes in first when the project has none of its own.
 */
export function importSolidAction(
  project: ProjectSnapshot,
  prepared: SolidPreparedMessage,
  fileName: string,
  choices: SolidChoices,
  generate: IdGenerator = randomIds(),
): { command: Command; solid: Id } {
  const target = solidPackageFor(project);
  const name = given(choices.name, 200) ?? solidBaseName(fileName);
  const id = newSolidId(project, target.package, name, generate);
  const define: Command = {
    type: 'define-solid',
    package: target.package,
    solid: definitionOf(id, prepared, { ...choices, name }, { ...DEFAULT_SOLID_CAMERA }),
    createOnly: true,
    fileName: fileName.slice(0, 200),
  };
  if (!target.create) return { command: define, solid: id };
  const batch: BatchCommand = {
    type: 'batch',
    label: `Import "${fileName.slice(0, 200)}" as a solid`,
    commands: [{ type: 'create-package', package: target.create }, define],
  };
  return { command: batch, solid: id };
}

/**
 * The one action that replaces a solid's file with a prepared one, keeping its id, name, description,
 * source, license and camera: every appearance that shows it shows the new file, and every anchor to
 * a part it keeps stays. `undefined` for a solid of no package of the project's own.
 */
export function replaceSolidAction(
  project: ProjectSnapshot,
  solidId: Id,
  prepared: SolidPreparedMessage,
  fileName: string,
): Command | undefined {
  const defined = solidsIn(project).solid(solidId);
  if (!defined || !ownPackages(project).includes(defined.package)) return undefined;
  const { definition } = defined;
  return {
    type: 'define-solid',
    package: defined.package,
    solid: definitionOf(
      definition.id,
      prepared,
      {
        name: definition.name,
        ...(definition.description === undefined ? {} : { description: definition.description }),
        ...(definition.source === undefined ? {} : { source: definition.source }),
        ...(definition.license === undefined ? {} : { license: definition.license }),
      },
      definition.camera,
    ),
    fileName: fileName.slice(0, 200),
  };
}

/** The solid a component's shapes show now, from its own appearance or the nearest it inherits. */
export function shownSolidOf(
  project: ProjectSnapshot,
  componentId: Id,
): AppearanceSolid | undefined {
  return componentSolid(definitionsIn(project), componentId);
}

/** How a solid is shown, its defaults left out, as an appearance stores it. */
export function storedSolid(solid: AppearanceSolid): AppearanceSolid {
  const stored: AppearanceSolid = { solid: solid.solid };
  if (solid.placement !== undefined && solid.placement !== 'drawing')
    stored.placement = solid.placement;
  if (solid.camera !== undefined) stored.camera = solid.camera;
  if (solid.lighting !== undefined && solid.lighting !== 'studio') stored.lighting = solid.lighting;
  return stored;
}

/** The action that sets a component's solid trait: a solid, `none`, or `null` to inherit it. */
export function componentSolidAction(
  componentId: Id,
  solid: AppearanceSolid | 'none' | null,
): Command {
  return {
    type: 'update-component',
    id: componentId,
    changes: {
      appearance: { solid: solid === null || solid === 'none' ? solid : storedSolid(solid) },
    },
  };
}

/** Whether a solid is past the cap on triangles or vertices, which simplifying can bring it within. */
export function overTriangleCaps(counts: { triangles: number; vertices: number }): boolean {
  return counts.triangles > SOLID_CAPS.triangles || counts.vertices > SOLID_CAPS.vertices;
}

/** The units a file to import may be in, and how many meters each is. */
export const SOLID_UNITS = [
  { unit: 'm', meters: 1 },
  { unit: 'cm', meters: 0.01 },
  { unit: 'mm', meters: 0.001 },
  { unit: 'in', meters: 0.0254 },
] as const;

export type SolidUnit = (typeof SOLID_UNITS)[number]['unit'];

/** A solid's size along each axis, in meters, from its bounds. */
export function solidSize(bounds: SolidDefinition['bounds']): { x: number; y: number; z: number } {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
}

/** A length in meters written in a unit, to at most four significant digits. */
export function lengthIn(meters: number, unit: SolidUnit, language: string): string {
  const per = SOLID_UNITS.find((each) => each.unit === unit)?.meters ?? 1;
  return (meters / per).toLocaleString(language, { maximumSignificantDigits: 4 });
}
