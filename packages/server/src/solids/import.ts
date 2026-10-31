/**
 * Importing a solid outside the app (ADR 0075): what `visual-anything import` and Claude's
 * `import_solid` share. The file is cleaned and held by the program first (`store.ts`); this is the
 * one action that then defines it, `Import "arm.glb" as a solid`:
 *
 * - in the first of the project's own packages, or else a new package named after the project, made
 *   in the same action;
 * - named after its file, its id that name's with a short random ending, its source the copyright its
 *   file held, and its camera a three-quarter view (ADR 0075);
 * - with the description the program worked out, which the program gives it again as it takes it.
 */
import {
  DEFAULT_SOLID_CAMERA,
  builtinPackage,
  executeCommand,
  randomIds,
  slug,
  type BatchCommand,
  type Command,
  type IdGenerator,
  type ProjectSnapshot,
  type SolidPreparedMessage,
} from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import type { PreparedSolid } from './store';

/** The file name endings a solid's file has. */
export const SOLID_EXTENSIONS = ['.glb', '.gltf'] as const;

/** Whether a file's name says it is a glTF file, which imports as a solid. */
export function isSolidFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SOLID_EXTENSIONS.some((ending) => lower.endsWith(ending));
}

/** How the history names the action. */
export function solidImportLabel(fileName: string): string {
  return `Import "${fileName.slice(0, 200)}" as a solid`;
}

/** A solid's name from its file's: the name without its ending, or "Solid". */
export function solidBaseName(fileName: string): string {
  const lower = fileName.toLowerCase();
  const ending = SOLID_EXTENSIONS.find((each) => lower.endsWith(each));
  const base = (ending === undefined ? fileName : fileName.slice(0, -ending.length)).trim();
  return base === '' ? 'Solid' : base.slice(0, 200);
}

/** What the person or Claude chose for the solid, over what its file gives. */
export interface SolidChoices {
  name?: string;
  description?: string;
  source?: string;
  license?: string;
}

/** The action that defines a prepared file as a solid, or why it cannot be done. */
export type PlannedSolid =
  { ok: true; command: BatchCommand; solid: string } | { ok: false; problems: string[] };

/** Plans the one action that defines a prepared file as a solid, checked as it would run. */
export function planSolidImport(
  state: ProjectSnapshot,
  prepared: Pick<PreparedSolid, 'hash' | 'bytes' | 'description' | 'fileName' | 'source'>,
  choices: SolidChoices = {},
  generate: IdGenerator = randomIds(),
): PlannedSolid {
  const commands: Command[] = [];
  let packageId = state.packages.find((file) => !builtinPackage(file.id))?.id;
  if (packageId === undefined) {
    const made = createPackage(state, generate);
    if (!made.ok) return made;
    commands.push(made.command);
    packageId = made.command.package.id;
  }
  const name = (choices.name ?? solidBaseName(prepared.fileName)).slice(0, 200);
  const source = choices.source ?? prepared.source;
  const { description } = prepared;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const solid: SolidDefinition = {
      id: generate(`${packageId}.${slug(name, 'solid')}`),
      name,
      ...(choices.description === undefined ? {} : { description: choices.description }),
      ...(source === undefined ? {} : { source: source.slice(0, 500) }),
      ...(choices.license === undefined ? {} : { license: choices.license }),
      hash: prepared.hash,
      bytes: prepared.bytes.length,
      bounds: description.bounds,
      counts: description.counts,
      parts: description.parts,
      camera: { ...DEFAULT_SOLID_CAMERA },
      ...(description.animations.length === 0 ? {} : { animations: description.animations }),
    };
    const define: Command = {
      type: 'define-solid',
      package: packageId,
      solid,
      createOnly: true,
      fileName: prepared.fileName,
    };
    const command: BatchCommand = {
      type: 'batch',
      label: solidImportLabel(prepared.fileName),
      commands: [...commands, define],
    };
    const checked = executeCommand(state, command, { newId: generate });
    if (checked.ok) return { ok: true, command, solid: solid.id };
    problems = checked.problems.map((each) => each.message);
    if (!checked.problems.every((each) => each.code === 'id-taken')) break;
  }
  return { ok: false, problems };
}

/** A new package of the project's own, named after the project, with the first id the core accepts. */
function createPackage(
  state: ProjectSnapshot,
  generate: IdGenerator,
):
  | { ok: true; command: Extract<Command, { type: 'create-package' }>; state: ProjectSnapshot }
  | { ok: false; problems: string[] } {
  const name = state.project.name.trim() === '' ? 'Solids' : state.project.name.slice(0, 200);
  const base = slug(name, 'solids');
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 100; attempt++) {
    const id = attempt === 1 ? base : `${base}-${attempt}`;
    const command = { type: 'create-package' as const, package: { id, name } };
    const outcome = executeCommand(state, command, { newId: generate });
    if (outcome.ok) return { ok: true, command, state: outcome.state };
    problems = outcome.problems.map((each) => each.message);
  }
  return { ok: false, problems };
}

/** What cleaning gave and what importing does, line by line, for the command line. */
export function describeSolidImport(fileName: string, prepared: SolidPreparedMessage): string[] {
  const { counts, bounds, parts } = prepared;
  const animations = prepared.animations ?? [];
  const size = (axis: 'x' | 'y' | 'z') => round(bounds.max[axis] - bounds.min[axis]);
  const lines = [
    `Cleaned "${fileName}": ${counted(counts.triangles, 'triangle')}, ${counted(counts.vertices, 'vertex', 'vertices')}, ${counted(counts.nodes, 'node')}, ${counted(parts.length, 'named part')} and ${counted(counts.textures, 'texture')}, ${size('x')} × ${size('y')} × ${size('z')} m.`,
  ];
  if (animations.length > 0) lines.push(`It has ${counted(animations.length, 'animation')}.`);
  lines.push(`Its file is solids/${prepared.hash}.glb, ${counted(prepared.bytes, 'byte')}.`);
  if (prepared.source !== undefined) lines.push(`Its file says: ${prepared.source}`);
  if (prepared.report.length > 0) {
    lines.push('What cleaning dropped or changed:');
    for (const line of prepared.report) lines.push(`  ${line}`);
  }
  return lines;
}

function round(meters: number): string {
  return String(Math.round(meters * 10_000) / 10_000);
}

function counted(amount: number, one: string, many = `${one}s`): string {
  return `${amount.toLocaleString('en')} ${amount === 1 ? one : many}`;
}
