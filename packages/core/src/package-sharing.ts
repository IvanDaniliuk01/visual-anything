/**
 * Packages shared between projects (R39, ADR 0051): what a package copied from another project needs
 * from the project it comes into, what changed between two versions of one, and how two versions
 * compare. The commands that add and update such a package are `add-package` and `replace-package`;
 * these tell the person what they will do before anything changes.
 */
import type { Id, PackageFile } from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { BUILTIN_PACKAGES } from './builtin';
import { sameJson } from './commands/draft';
import { imagesIn } from './images/catalog';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';

/** A definition or an image, by its id and name. */
export interface NamedItem {
  id: Id;
  name: string;
}

/** What changed in one list of a package: definitions or images. */
export interface ListChanges {
  /** What the new version has and the current one has not, named as the new version names it. */
  added: NamedItem[];
  /** What the current version has and the new one has not. */
  removed: NamedItem[];
  /** What both have, and differs, named as the new version names it. */
  changed: NamedItem[];
  /** Whether what both have comes in another order. */
  reordered: boolean;
}

/** A property of a package that an update can change. */
export type PackageProperty = 'name' | 'description' | 'version' | 'license' | 'attribution';

/** A property of a package that differs between two versions; absent where a version has none. */
export interface PropertyChange {
  key: PackageProperty;
  before?: string;
  after?: string;
}

/** What changes when a package is updated from one version to another. */
export interface PackageChanges {
  /** Whether nothing differs at all. */
  same: boolean;
  properties: PropertyChange[];
  components: ListChanges;
  relationTypes: ListChanges;
  images: ListChanges;
}

const PROPERTIES: readonly PackageProperty[] = [
  'name',
  'description',
  'version',
  'license',
  'attribution',
];

/** What changes when the package `current` becomes `incoming`, as the preview of an update says it. */
export function packageChanges(current: PackageFile, incoming: PackageFile): PackageChanges {
  const properties: PropertyChange[] = [];
  for (const key of PROPERTIES) {
    const before = current[key];
    const after = incoming[key];
    if (before === after) continue;
    properties.push({
      key,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    });
  }
  const components = listChanges(current.components, incoming.components);
  const relationTypes = listChanges(current.relationTypes, incoming.relationTypes);
  const images = listChanges(current.images ?? [], incoming.images ?? []);
  const unchanged = (list: ListChanges) =>
    list.added.length === 0 &&
    list.removed.length === 0 &&
    list.changed.length === 0 &&
    !list.reordered;
  return {
    same:
      properties.length === 0 &&
      unchanged(components) &&
      unchanged(relationTypes) &&
      unchanged(images),
    properties,
    components,
    relationTypes,
    images,
  };
}

function listChanges<T extends NamedItem>(
  current: readonly T[],
  incoming: readonly T[],
): ListChanges {
  const before = new Map(current.map((each) => [each.id, each]));
  const after = new Map(incoming.map((each) => [each.id, each]));
  const named = (each: T): NamedItem => ({ id: each.id, name: each.name });
  const kept = incoming.filter((each) => before.has(each.id)).map((each) => each.id);
  const keptBefore = current.filter((each) => after.has(each.id)).map((each) => each.id);
  return {
    added: incoming.filter((each) => !before.has(each.id)).map(named),
    removed: current.filter((each) => !after.has(each.id)).map(named),
    changed: incoming
      .filter((each) => {
        const was = before.get(each.id);
        return was !== undefined && !sameJson(was, each);
      })
      .map(named),
    reordered: kept.some((id, at) => keptBefore[at] !== id),
  };
}

/** What a package needs from the project it comes into, beyond what it defines itself. */
export interface PackageNeeds {
  /** The built-in packages that define what it needs and that the project does not use yet. */
  builtIn: Id[];
  /** What it needs that no package in use, and no built-in package, defines. */
  missing: Id[];
}

/**
 * What a package needs from a project to be added to it, or to replace the package of the same id
 * there: the definitions it derives from, and those its limits and badges name, and the images its
 * components show. What the package defines itself, Essence and "relates to" are never needed; what
 * the package it would replace defines does not count as there.
 */
export function packageNeeds(state: ProjectSnapshot, file: PackageFile): PackageNeeds {
  const own = new Set<Id>([
    ...file.components.map((each) => each.id),
    ...file.relationTypes.map((each) => each.id),
    ...(file.images ?? []).map((each) => each.id),
  ]);
  const definitions = definitionsIn(state);
  const images = imagesIn(state);
  const elsewhere = (owner: { package: Id } | undefined) =>
    owner !== undefined && owner.package !== file.id;
  const used = new Set(state.project.packages);
  const builtIn: Id[] = [];
  const missing: Id[] = [];
  for (const id of referencesOf(file)) {
    if (own.has(id) || id === ESSENCE_ID || id === RELATES_TO_ID) continue;
    if (
      elsewhere(definitions.components.get(id)) ||
      elsewhere(definitions.relationTypes.get(id)) ||
      elsewhere(images.image(id))
    ) {
      continue;
    }
    const builtin = BUILTIN_PACKAGES.find(
      (each) =>
        each.id !== file.id &&
        !used.has(each.id) &&
        (each.components.some((definition) => definition.id === id) ||
          each.relationTypes.some((definition) => definition.id === id) ||
          (each.images ?? []).some((image) => image.id === id)),
    );
    if (builtin !== undefined) {
      if (!builtIn.includes(builtin.id)) builtIn.push(builtin.id);
    } else if (!missing.includes(id)) {
      missing.push(id);
    }
  }
  return { builtIn, missing };
}

/**
 * Every id a package names outside its own lists, in the order it names them: what its components
 * and relation types derive from, the relation types its badges name, what its limits name and the
 * images its components show.
 */
function referencesOf(file: PackageFile): Id[] {
  const ids: Id[] = [];
  for (const component of file.components) {
    ids.push(component.derivesFrom);
    for (const badge of component.appearance?.detail?.badges ?? []) {
      if (badge.when === 'from-end') ids.push(badge.relationType);
    }
    const image = component.appearance?.image;
    if (typeof image === 'object') ids.push(image.image);
  }
  for (const relationType of file.relationTypes) {
    ids.push(relationType.derivesFrom);
    for (const end of [relationType.limits?.from, relationType.limits?.to]) {
      if (Array.isArray(end)) ids.push(...end);
    }
  }
  return ids.filter((id) => typeof id === 'string');
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * How two semantic versions compare: -1 when `a` comes before `b`, 1 after, 0 when they are the same
 * version; undefined when either is missing or no semantic version. A pre-release comes before its
 * release, and its parts compare as numbers where both are numbers.
 */
export function compareVersions(
  a: string | undefined,
  b: string | undefined,
): -1 | 0 | 1 | undefined {
  const left = a === undefined ? null : SEMVER.exec(a);
  const right = b === undefined ? null : SEMVER.exec(b);
  if (left === null || right === null) return undefined;
  for (let at = 1; at <= 3; at += 1) {
    const difference = Number(left[at]) - Number(right[at]);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  const [preLeft, preRight] = [left[4], right[4]];
  if (preLeft === preRight) return 0;
  if (preLeft === undefined) return 1;
  if (preRight === undefined) return -1;
  const leftParts = preLeft.split('.');
  const rightParts = preRight.split('.');
  for (let at = 0; at < Math.max(leftParts.length, rightParts.length); at += 1) {
    const x = leftParts[at];
    const y = rightParts[at];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const numbers = /^\d+$/.test(x) && /^\d+$/.test(y);
    if (numbers) return Number(x) < Number(y) ? -1 : 1;
    if (/^\d+$/.test(x)) return -1;
    if (/^\d+$/.test(y)) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
