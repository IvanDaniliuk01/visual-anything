/**
 * Commands on solids (ADR 0075): defining one in one of the project's own packages, which also
 * replaces a solid's file; changing what it says about itself; and removing one that no appearance
 * shows. The local program sends `define-solid` only for a file it cleaned and holds, with the
 * description it worked out, so the core checks the definition's form and the package's caps here,
 * and never reads the file.
 */
import type { SolidDefinition, SolidPart, SpacePoint } from '@visual-anything/schema';
import { isId } from '../ids';
import { isLicenseId } from '../licenses';
import {
  MAX_PACKAGE_SOLIDS,
  MAX_PACKAGE_SOLID_BYTES,
  SOLID_CAPS,
  SOLID_PART_NAME,
} from '../solids/caps';
import { solidUsers, solidsIn } from '../solids/catalog';
import { checkedSolidCamera } from './traits';
import { compact, count, reject, type Draft } from './draft';
import type { DefineSolidCommand, RemoveSolidCommand, UpdateSolidCommand } from './types';

const HASH = /^[0-9a-f]{64}$/;

export function defineSolid(draft: Draft, command: DefineSolidCommand): string {
  const file = draft.ownPackage(command.package);
  const solid = checkedDefinition(command.solid);
  const id = solid.id;
  if (!id.startsWith(`${file.id}.`)) {
    reject(
      'id-outside-package',
      `The solid "${id}" must start with "${file.id}.", the id of its package.`,
      [id],
    );
  }
  const defined = solidsIn(draft.state).solid(id);
  if (defined && defined.package !== file.id) {
    reject('defined-twice', `The package "${defined.package}" already defines "${id}".`, [id]);
  }
  const solids = file.solids ?? [];
  const existing = solids.find((each) => each.id === id);
  if (existing && command.createOnly) {
    reject('id-taken', `The package "${file.name}" already has the solid "${id}".`, [id]);
  }
  if (!existing && draft.isTaken(id)) reject('id-taken', `The id "${id}" is already taken.`, [id]);
  const next = existing
    ? solids.map((each) => (each === existing ? solid : each))
    : [...solids, solid];
  if (next.length > MAX_PACKAGE_SOLIDS) {
    reject('solid-too-large', `A package holds at most ${MAX_PACKAGE_SOLIDS} solids.`, [file.id]);
  }
  const bytes = next.reduce((sum, each) => sum + each.bytes, 0);
  if (bytes > MAX_PACKAGE_SOLID_BYTES) {
    reject(
      'solid-too-large',
      `The solids of "${file.name}" would name ${bytes} bytes of files, past ${MAX_PACKAGE_SOLID_BYTES}.`,
      [file.id],
    );
  }
  const collection = { name: 'solids', package: file.id } as const;
  draft.apply(
    existing
      ? { op: 'replace', collection, item: solid }
      : { op: 'insert', collection, index: solids.length, item: solid },
  );
  if (!existing) draft.created.push(id);
  if (command.fileName !== undefined && typeof command.fileName === 'string') {
    const name = command.fileName.slice(0, 200);
    return existing
      ? `Replace the solid "${solid.name}" with "${name}"`
      : `Import "${name}" as a solid`;
  }
  return `${existing ? 'Replace' : 'Add'} the solid "${solid.name}"`;
}

export function updateSolid(draft: Draft, command: UpdateSolidCommand): string {
  const defined = solidsIn(draft.state).solid(command.id);
  if (!defined) {
    reject('unknown-solid', `No package in use defines the solid "${String(command.id)}".`, [
      command.id,
    ]);
  }
  draft.ownPackage(defined.package);
  const changes = command.changes as Record<string, unknown> | null | undefined;
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    reject('invalid-command', 'update-solid needs the changes to make.');
  }
  const allowed = new Set(['name', 'description', 'source', 'license', 'camera']);
  for (const key of Object.keys(changes)) {
    if (!allowed.has(key)) {
      reject(
        'invalid-command',
        `update-solid changes a solid's name, description, source, license and camera, not "${key}".`,
      );
    }
  }
  const next: SolidDefinition = { ...defined.definition };
  if (changes.name !== undefined)
    next.name = checkedText(changes.name, 'name', 200, true) as string;
  for (const key of ['description', 'source'] as const) {
    if (changes[key] === undefined) continue;
    if (changes[key] === null) delete next[key];
    else
      next[key] = checkedText(
        changes[key],
        key,
        key === 'description' ? 1000 : 500,
        false,
      ) as string;
  }
  if (changes.license !== undefined) {
    if (changes.license === null) delete next.license;
    else next.license = checkedLicense(changes.license);
  }
  if (changes.camera !== undefined)
    next.camera = checkedSolidCamera(changes.camera, `"${next.name}"`, invalidSolid);
  draft.apply({
    op: 'replace',
    collection: { name: 'solids', package: defined.package },
    item: next,
  });
  return `Change the solid "${next.name}"`;
}

export function removeSolid(draft: Draft, command: RemoveSolidCommand): string {
  const defined = solidsIn(draft.state).solid(command.id);
  if (!defined) {
    reject('unknown-solid', `No package in use defines the solid "${String(command.id)}".`, [
      command.id,
    ]);
  }
  draft.ownPackage(defined.package);
  const users = solidUsers(draft.state, command.id);
  if (users.length > 0) {
    reject(
      'in-use',
      `The solid "${defined.definition.name}" cannot be removed: ${count(users.length, 'component or element', 'components or elements')} show it.`,
      users,
    );
  }
  draft.apply({
    op: 'remove',
    collection: { name: 'solids', package: defined.package },
    key: command.id,
  });
  return `Remove the solid "${defined.definition.name}"`;
}

/** A solid's definition as a command gives it, checked field by field; refused as `invalid-solid`. */
function checkedDefinition(given: unknown): SolidDefinition {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    reject('invalid-command', 'define-solid needs the solid to define.');
  }
  const value = given as Record<string, unknown>;
  const keys = new Set([
    'id',
    'name',
    'description',
    'source',
    'license',
    'hash',
    'bytes',
    'bounds',
    'counts',
    'parts',
    'camera',
    'animations',
  ]);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) invalidSolid(`A solid's definition holds no "${key}".`);
  }
  if (!isId(value.id))
    invalidSolid(`${JSON.stringify(value.id) ?? 'undefined'} is not a valid id.`);
  const name = checkedText(value.name, 'name', 200, true) as string;
  if (typeof value.hash !== 'string' || !HASH.test(value.hash)) {
    invalidSolid('A solid names its file by the SHA-256 of its bytes, in lowercase hexadecimal.');
  }
  const bytes = value.bytes;
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1) {
    invalidSolid("A solid's size is a whole number of bytes.");
  }
  if (bytes > SOLID_CAPS.fileBytes) {
    reject('solid-too-large', `The solid's file is ${bytes} bytes, past ${SOLID_CAPS.fileBytes}.`);
  }
  const bounds = checkedBounds(value.bounds);
  const counts = checkedCounts(value.counts);
  const parts = checkedParts(value.parts);
  const camera = checkedSolidCamera(value.camera, `"${name}"`, invalidSolid);
  let animations: { duration: number }[] | undefined;
  if (value.animations !== undefined) {
    if (
      !Array.isArray(value.animations) ||
      value.animations.length === 0 ||
      value.animations.length > SOLID_CAPS.animations
    ) {
      invalidSolid(
        `A solid has from 1 to ${SOLID_CAPS.animations} animations, or leaves them out.`,
      );
    }
    animations = value.animations.map((each) => {
      const duration = (each as { duration?: unknown } | null)?.duration;
      if (
        typeof each !== 'object' ||
        Object.keys(each as object).length !== 1 ||
        typeof duration !== 'number' ||
        !(duration >= 0 && duration <= SOLID_CAPS.animationSeconds)
      ) {
        invalidSolid('An animation says only its duration, from 0 to 60 seconds.');
      }
      return { duration };
    });
  }
  return compact({
    id: value.id,
    name,
    description:
      value.description === undefined
        ? undefined
        : (checkedText(value.description, 'description', 1000, false) as string),
    source:
      value.source === undefined
        ? undefined
        : (checkedText(value.source, 'source', 500, false) as string),
    license: value.license === undefined ? undefined : checkedLicense(value.license),
    hash: value.hash,
    bytes,
    bounds,
    counts,
    parts,
    camera,
    animations,
  }) as SolidDefinition;
}

function checkedPoint(value: unknown, what: string): SpacePoint {
  const point = value as Record<string, unknown> | null;
  if (typeof point !== 'object' || point === null || Object.keys(point).length !== 3) {
    invalidSolid(`${what} is a point: x, y and z.`);
  }
  const axis = (key: 'x' | 'y' | 'z') => {
    const number = point[key];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      Math.abs(number) > SOLID_CAPS.largestSide
    ) {
      invalidSolid(`${what} is a point within 100 km.`);
    }
    return number;
  };
  return { x: axis('x'), y: axis('y'), z: axis('z') };
}

function checkedBounds(value: unknown): SolidDefinition['bounds'] {
  const bounds = value as Record<string, unknown> | null;
  if (typeof bounds !== 'object' || bounds === null || Object.keys(bounds).length !== 2) {
    invalidSolid("A solid's bounds are its least and greatest corners.");
  }
  const min = checkedPoint(bounds.min, "The bounds' least corner");
  const max = checkedPoint(bounds.max, "The bounds' greatest corner");
  if (min.x > max.x || min.y > max.y || min.z > max.z) {
    invalidSolid("A solid's least corner lies below its greatest.");
  }
  return { min, max };
}

function checkedCounts(value: unknown): SolidDefinition['counts'] {
  const counts = value as Record<string, unknown> | null;
  if (typeof counts !== 'object' || counts === null || Object.keys(counts).length !== 4) {
    invalidSolid("A solid's counts are its triangles, vertices, nodes and textures.");
  }
  const caps = {
    triangles: SOLID_CAPS.triangles,
    vertices: SOLID_CAPS.vertices,
    nodes: SOLID_CAPS.nodes,
    textures: SOLID_CAPS.textures,
  };
  const read = (key: keyof typeof caps) => {
    const number = counts[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0) {
      invalidSolid(`A solid's ${key} are a whole number.`);
    }
    if (number > caps[key])
      reject('solid-too-large', `The solid has ${number} ${key}, past ${caps[key]}.`);
    return number;
  };
  return {
    triangles: read('triangles'),
    vertices: read('vertices'),
    nodes: read('nodes'),
    textures: read('textures'),
  };
}

function checkedParts(value: unknown): SolidPart[] {
  if (!Array.isArray(value)) invalidSolid("A solid's parts are a list, empty when it has none.");
  if (value.length > SOLID_CAPS.parts) {
    reject(
      'solid-too-large',
      `The solid has ${value.length} named parts, past ${SOLID_CAPS.parts}.`,
    );
  }
  const names = new Set<string>();
  return value.map((each, at) => {
    const part = each as Record<string, unknown> | null;
    if (typeof part !== 'object' || part === null)
      invalidSolid('A part is its name, its holder and its point.');
    for (const key of Object.keys(part)) {
      if (key !== 'name' && key !== 'parent' && key !== 'point')
        invalidSolid(`A part holds no "${key}".`);
    }
    if (typeof part.name !== 'string' || !SOLID_PART_NAME.test(part.name)) {
      invalidSolid(`Part ${at}'s name is not one cleaning keeps.`);
    }
    if (names.has(part.name)) invalidSolid(`Two parts are named "${part.name}".`);
    names.add(part.name);
    const result: SolidPart = { name: part.name };
    if (part.parent !== undefined) {
      // Parts are in depth-first order, so a holder always comes before what it holds.
      if (
        typeof part.parent !== 'number' ||
        !Number.isInteger(part.parent) ||
        part.parent < 0 ||
        part.parent >= at
      ) {
        invalidSolid(`Part "${part.name}" names a holder that does not come before it.`);
      }
      result.parent = part.parent;
    }
    if (part.point !== undefined)
      result.point = checkedPoint(part.point, `Part "${part.name}"'s point`);
    return result;
  });
}

function checkedText(
  value: unknown,
  what: string,
  most: number,
  required: boolean,
): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || (required && value.trim() === '') || value.length > most) {
    invalidSolid(
      `A solid's ${what} is text of at most ${most} characters${required ? ', not empty' : ''}.`,
    );
  }
  return value;
}

function checkedLicense(value: unknown): string {
  if (typeof value !== 'string' || !isLicenseId(value)) {
    invalidSolid(`${JSON.stringify(value) ?? 'undefined'} is not a license this project knows.`);
  }
  return value;
}

function invalidSolid(message: string): never {
  return reject('invalid-solid', message);
}
