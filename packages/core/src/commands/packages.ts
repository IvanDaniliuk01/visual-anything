/**
 * Commands on packages shared between projects (R39, ADR 0051): adding a copy of a package from
 * another project, keeping its ids, and updating one of the project's own packages to another
 * version of it. Each is one action. Everything the package holds is checked as defining it piece by
 * piece would check it, and its images are cleaned again: what comes from another project is never
 * trusted.
 */
import type {
  Component,
  Id,
  ImageDefinition,
  PackageFile,
  RelationType,
} from '@visual-anything/schema';
import { RESERVED_PACKAGE_IDS, builtinPackage } from '../builtin';
import { isId } from '../ids';
import { imagesIn } from '../images/catalog';
import { packageNeeds } from '../package-sharing';
import { problem } from '../problems';
import { allUsers, usersOfDefinition } from '../rules';
import type { ProjectSnapshot } from '../snapshot';
import {
  afterComponentChange,
  afterRelationTypeChange,
  checkedComponent,
  checkedRelationType,
  describeUsers,
} from './definitions';
import { compact, reject, requireName, sameJson, type Draft } from './draft';
import { checkImageCaps, cleanedImage } from './images';
import { checkedPackageAbout } from './package-properties';
import type { AddPackageCommand, ReplacePackageCommand } from './types';

export function addPackage(draft: Draft, command: AddPackageCommand): string {
  const given = shapeOf(command.package, 'add-package');
  const { id } = given;
  const name = requireName(given.name, 'A package');
  if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
  if (RESERVED_PACKAGE_IDS.has(id)) {
    reject(
      'built-in-package',
      builtinPackage(id)
        ? `The id "${id}" is the built-in package "${builtinPackage(id)?.name}"'s; give the package another one.`
        : `The id "${id}" is kept for a package Visual Anything plans to build in; give the package another one.`,
      [id],
    );
  }
  if (draft.state.packages.some((file) => file.id === id)) {
    reject(
      'id-taken',
      `The package "${name}" cannot be added: this project already has a package with the id "${id}".`,
      [id],
    );
  }
  const about = checkedPackageAbout(given);
  checkIds(draft, given, name, 'added');
  const needs = needsOf(draft.state, given, name);
  const images = cleanedImages(draft, given, name);

  const before = draft.state;
  useBuiltIn(draft, needs);
  draft.apply({
    op: 'insert',
    collection: { name: 'packages' },
    index: draft.state.packages.length,
    item: compact({
      id,
      name,
      ...about,
      components: given.components,
      relationTypes: given.relationTypes,
      images: images.length === 0 ? undefined : images,
    }),
  });
  draft.apply({
    op: 'set-project',
    project: {
      ...draft.state.project,
      packages: [...draft.state.project.packages, ...needs, id],
    },
  });
  checkDefinitions(draft, before, id);
  draft.created.push(id);
  return `Add the package "${name}"`;
}

export function replacePackage(draft: Draft, command: ReplacePackageCommand): string {
  const given = shapeOf(command.package, 'replace-package');
  const current = draft.ownPackage(given.id);
  const name = requireName(given.name, 'A package');
  const about = checkedPackageAbout(given);
  checkIds(draft, given, current.name, 'updated', current);
  const needs = needsOf(draft.state, given, current.name);
  checkRemovedUnused(draft.state, current, given);
  const images = cleanedImages(draft, given, current.name);
  const next: PackageFile = compact({
    id: current.id,
    name,
    ...about,
    components: given.components,
    relationTypes: given.relationTypes,
    images: images.length === 0 ? undefined : images,
  });
  const label = `Update the package "${current.name}"`;
  if (sameJson(next, current)) return label;

  const before = draft.state;
  if (needs.length > 0) {
    useBuiltIn(draft, needs);
    draft.apply({
      op: 'set-project',
      project: { ...draft.state.project, packages: [...draft.state.project.packages, ...needs] },
    });
  }
  draft.apply({ op: 'replace', collection: { name: 'packages' }, item: next });
  checkDefinitions(draft, before, current.id);
  const had = new Set([
    ...current.components.map((each) => each.id),
    ...current.relationTypes.map((each) => each.id),
    ...(current.images ?? []).map((each) => each.id),
  ]);
  draft.created.push(
    ...[...next.components, ...next.relationTypes, ...(next.images ?? [])]
      .map((each) => each.id)
      .filter((each) => !had.has(each)),
  );
  return label;
}

/** Starts using built-in packages, as `update-project` does; the project file is set after. */
function useBuiltIn(draft: Draft, ids: readonly Id[]): void {
  for (const id of ids) {
    draft.apply({
      op: 'insert',
      collection: { name: 'packages' },
      index: draft.state.packages.length,
      item: builtinPackage(id) as PackageFile,
    });
  }
}

/** A package as a command gives it: an object with an id, a name and lists of definitions. */
function shapeOf(value: unknown, command: string): PackageFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${command} needs the package, as its file holds it.`);
  }
  const file = value as Partial<Record<keyof PackageFile, unknown>>;
  const lists = [file.components, file.relationTypes];
  if (lists.some((list) => !Array.isArray(list))) {
    reject('invalid-command', 'A package holds a list of components and one of relation types.');
  }
  if (file.images !== undefined && !Array.isArray(file.images)) {
    reject('invalid-command', 'A package’s images are a list.');
  }
  for (const each of [
    ...(file.components as unknown[]),
    ...(file.relationTypes as unknown[]),
    ...((file.images as unknown[] | undefined) ?? []),
  ]) {
    if (typeof each !== 'object' || each === null || Array.isArray(each)) {
      reject('invalid-command', 'Each definition and image of a package is an object.');
    }
  }
  return value as PackageFile;
}

/**
 * Refuses ids of the package's definitions and images that do not start with its own, that it uses
 * twice, or that anything in the project already takes, but for the package it replaces, saying
 * every one at once.
 */
function checkIds(
  draft: Draft,
  file: PackageFile,
  name: string,
  done: 'added' | 'updated',
  replaced?: PackageFile,
): void {
  const ids = [
    ...file.components.map((each) => each.id),
    ...file.relationTypes.map((each) => each.id),
    ...(file.images ?? []).map((each) => each.id),
  ];
  const invalid = ids.filter((id) => !isId(id));
  if (invalid.length > 0) {
    reject('invalid-id', `${JSON.stringify(invalid[0]) ?? 'undefined'} is not a valid id.`);
  }
  const quoted = (list: readonly Id[]) => list.map((id) => `"${id}"`).join(', ');
  const outside = ids.filter((id) => !id.startsWith(`${file.id}.`));
  if (outside.length > 0) {
    reject(
      'id-outside-package',
      `The package "${name}" cannot be ${done}: these ids of it do not start with "${file.id}.", the id of the package: ${quoted(outside)}.`,
      outside,
    );
  }
  const twice = ids.filter((id, at) => ids.indexOf(id) !== at);
  if (twice.length > 0) {
    const once = [...new Set(twice)];
    reject(
      'defined-twice',
      `The package "${name}" cannot be ${done}: it uses these ids more than once: ${quoted(once)}.`,
      once,
    );
  }
  const own = new Set<Id>(
    replaced === undefined
      ? []
      : [
          ...replaced.components.map((each) => each.id),
          ...replaced.relationTypes.map((each) => each.id),
          ...(replaced.images ?? []).map((each) => each.id),
        ],
  );
  const taken = ids.filter((id) => !own.has(id) && draft.isTaken(id));
  if (taken.length > 0) {
    reject(
      'id-taken',
      `The package "${name}" cannot be ${done}: this project already uses these ids of it: ${quoted(taken)}.`,
      taken,
    );
  }
}

/** The built-in packages to start using for what the package needs; refuses what none defines. */
function needsOf(state: ProjectSnapshot, file: PackageFile, name: string): Id[] {
  const { builtIn, missing } = packageNeeds(state, file);
  if (missing.length > 0) {
    reject(
      'unknown-parent',
      `The package "${name}" needs what no package in use, and no built-in package, defines; add the packages that define it first: ${missing.map((id) => `"${id}"`).join(', ')}.`,
      missing,
    );
  }
  return builtIn;
}

/** The images of a package, cleaned again, within what a package may hold, warning about what went. */
function cleanedImages(draft: Draft, file: PackageFile, name: string): ImageDefinition[] {
  const images = (file.images ?? []).map((image) => {
    const kind: unknown = (image as { kind?: unknown }).kind;
    if (kind !== 'svg' && kind !== 'bitmap') {
      reject('invalid-command', 'An image is of the kind "svg" or "bitmap".');
    }
    const result = cleanedImage(image);
    if (result.removed.length > 0) {
      draft.warnings.push(
        problem(
          'image-cleaned',
          `Cleaning the image "${image.name}" removed: ${result.removed.join(', ')}.`,
          [image.id],
        ),
      );
    }
    return result.image;
  });
  checkImageCaps({ id: file.id, name }, images);
  return images;
}

/**
 * Refuses an update that removes a definition the project still uses outside the package: elements
 * created from it, relations of it, views that nest by it, and definitions of other packages that
 * derive from it or name it in a limit or a badge. What uses it inside the package is the package's
 * new version's own business, which checking its definitions covers.
 */
function checkRemovedUnused(state: ProjectSnapshot, current: PackageFile, next: PackageFile): void {
  const kept = new Set([
    ...next.components.map((each) => each.id),
    ...next.relationTypes.map((each) => each.id),
  ]);
  const inside = new Set([
    ...current.components.map((each) => each.id),
    ...current.relationTypes.map((each) => each.id),
  ]);
  const removed: [Component | RelationType, 'component' | 'relation type'][] = [
    ...current.components
      .filter((each) => !kept.has(each.id))
      .map((each): [Component, 'component'] => [each, 'component']),
    ...current.relationTypes
      .filter((each) => !kept.has(each.id))
      .map((each): [RelationType, 'relation type'] => [each, 'relation type']),
  ];
  for (const [definition, noun] of removed) {
    const users = usersOfDefinition(state, definition.id);
    const outside = {
      ...users,
      derived: users.derived.filter((id) => !inside.has(id)),
      limits: users.limits.filter((id) => !inside.has(id)),
      badges: users.badges.filter((id) => !inside.has(id)),
    };
    const ids = allUsers(outside);
    if (ids.length > 0) {
      reject(
        'in-use',
        `The update of "${current.name}" removes the ${noun} "${definition.name}", which is still used here by ${describeUsers(outside)}; change or delete what uses it first.`,
        ids,
      );
    }
  }
}

/**
 * Checks each definition of the package now in the draft as `define-component` and
 * `define-relation-type` check one, storing what that check gives, and the images its components
 * show. Every definition of the package is known by then, so the order of its lists does not matter.
 */
function checkDefinitions(draft: Draft, before: ProjectSnapshot, id: Id): void {
  const stored = () => draft.state.packages.find((each) => each.id === id) as PackageFile;
  for (const component of stored().components) {
    const checked = checkedComponent(draft, stored(), component);
    if (!sameJson(checked, component)) {
      draft.apply({
        op: 'replace',
        collection: { name: 'components', package: id },
        item: checked,
      });
    }
  }
  for (const relationType of stored().relationTypes) {
    const checked = checkedRelationType(draft, stored(), relationType);
    if (!sameJson(checked, relationType)) {
      draft.apply({
        op: 'replace',
        collection: { name: 'relationTypes', package: id },
        item: checked,
      });
    }
  }
  for (const component of stored().components) afterComponentChange(draft, before, component.id);
  for (const relationType of stored().relationTypes) {
    afterRelationTypeChange(draft, before, relationType.id);
  }
  const catalog = imagesIn(draft.state);
  for (const component of stored().components) {
    const image = component.appearance?.image;
    if (typeof image !== 'object') continue;
    if (!catalog.image(image.image)) {
      reject(
        'unknown-image',
        `The component "${component.name}" cannot show the image "${image.image}": no package in use defines it.`,
        [component.id],
      );
    }
  }
}
