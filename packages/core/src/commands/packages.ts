/**
 * Commands on packages shared between projects (R39, ADR 0051): adding a copy of a package from
 * another project, keeping its ids, and updating one of the project's own packages to another
 * version of it. Each is one action. Everything the package holds is checked as defining it piece by
 * piece would check it, and its images are cleaned again: what comes from another project is never
 * trusted.
 */
import type {
  Capability,
  Component,
  Crosswalk,
  Id,
  ExplorableDefinition,
  ImageDefinition,
  PackageExtensions,
  PackageFile,
  RelationType,
  ScriptLibraryDefinition,
  SolidDefinition,
} from '@visual-anything/schema';
import { RESERVED_PACKAGE_IDS, builtinPackage } from '../builtin';
import { isId } from '../ids';
import { imagesIn } from '../images/catalog';
import { packageNeeds } from '../package-sharing';
import { problem } from '../problems';
import { allUsers, usersOfDefinition } from '../rules';
import { MAX_PACKAGE_SOLIDS, MAX_PACKAGE_SOLID_BYTES } from '../solids/caps';
import { solidUsers } from '../solids/catalog';
import type { ProjectSnapshot } from '../snapshot';
import {
  afterComponentChange,
  afterRelationTypeChange,
  checkedComponent,
  checkedRelationType,
  describeUsers,
} from './definitions';
import { checkedCapabilities, checkedPackageExtensions, linesOf } from './code';
import { compact, count, reject, requireName, sameJson, type Draft } from './draft';
import { checkImageCaps, cleanedImage } from './images';
import { checkedPackageAbout } from './package-properties';
import { checkedDefinition as checkedSolid } from './solids';
import { checkRemovedExplorables, packageExplorables, packageScriptLibraries } from './explorables';
import { explorablesIn } from '../explorables/catalog';
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
  const carried = carriedOf(given, name);
  const shared = sharedExplorables(draft.state, given, name);

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
      crosswalks: carried.crosswalks,
      images: images.length === 0 ? undefined : images,
      solids: carried.solids,
      explorables: shared.explorables,
      scriptLibraries: shared.scriptLibraries,
      code: carried.code,
      capabilities: carried.capabilities,
      extensions: carried.extensions,
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
  const carried = carriedOf(given, current.name);
  const shared = sharedExplorables(draft.state, given, current.name);
  // What the file holds beyond its definitions and images is the package's from now on too, its
  // code included: approved by its hash, code that changed asks for the person's approval again.
  const next: PackageFile = compact({
    id: current.id,
    name,
    ...about,
    components: given.components,
    relationTypes: given.relationTypes,
    crosswalks: carried.crosswalks,
    images: images.length === 0 ? undefined : images,
    solids: carried.solids,
    explorables: shared.explorables,
    scriptLibraries: shared.scriptLibraries,
    code: carried.code,
    capabilities: carried.capabilities,
    extensions: carried.extensions,
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
  checkRemovedSolids(draft, current, next);
  checkRemovedExplorables(draft, current, next);
  const had = new Set(definedIds(current));
  draft.created.push(...definedIds(next).filter((each) => !had.has(each)));
  return label;
}

/** The ids of what a package defines: definitions, images, solids, explorables and script libraries. */
function definedIds(file: PackageFile): Id[] {
  return [
    ...file.components,
    ...file.relationTypes,
    ...(file.images ?? []),
    ...(file.solids ?? []),
    ...(file.explorables ?? []),
    ...(file.scriptLibraries ?? []),
  ].map((each) => each.id);
}

/**
 * A package file's explorables and script libraries (ADR 0107), checked as defining them one by one
 * would check them (A10's review). Their files are not in it: texts live in `explorables/` and
 * libraries in `script-libraries/` beside the project.
 */
function sharedExplorables(
  state: ProjectSnapshot,
  given: PackageFile,
  name: string,
): { explorables?: ExplorableDefinition[]; scriptLibraries?: ScriptLibraryDefinition[] } {
  const scriptLibraries = packageScriptLibraries(state, given.id, given.scriptLibraries);
  const explorables = packageExplorables(
    state,
    given.id,
    name,
    given.explorables,
    scriptLibraries ?? [],
  );
  return compact({ explorables, scriptLibraries });
}

/** What a package file holds beyond its definitions and images, checked; each absent when it has none. */
interface Carried {
  crosswalks?: Crosswalk[];
  solids?: SolidDefinition[];
  code?: string[];
  capabilities?: Capability[];
  extensions?: PackageExtensions;
}

/**
 * The crosswalks, solids, code, capabilities and extensions of a package file, each checked as the
 * command that writes it checks it: `define-solid` for each solid, and `set-package-code` for the
 * code, whose capabilities and extensions go with it (ADR 0054, ADR 0089). A solid whose file the
 * project's folder does not hold draws its placeholder, and the local program warns of it as opening
 * does (ADR 0075).
 */
function carriedOf(given: PackageFile, name: string): Carried {
  const file: PackageFile = { ...given, name };
  const code = given.code === undefined ? undefined : linesOf(given.code, file);
  let capabilities =
    given.capabilities === undefined ? undefined : checkedCapabilities(given.capabilities);
  if (capabilities !== undefined && capabilities.length === 0) capabilities = undefined;
  const extensions =
    given.extensions === undefined ? undefined : checkedPackageExtensions(given.extensions, file);
  // Capabilities and what the code adds go with the code they were declared for.
  if (code === undefined && capabilities !== undefined) {
    reject('invalid-code', `The package "${name}" has no code to give capabilities to.`, [
      given.id,
    ]);
  }
  if (code === undefined && extensions !== undefined) {
    reject('invalid-code', `The package "${name}" has no code to add anything to the app.`, [
      given.id,
    ]);
  }
  const solids = given.solids?.map((each: unknown) => checkedSolid(each));
  if (solids !== undefined && solids.length > MAX_PACKAGE_SOLIDS) {
    reject('solid-too-large', `A package holds at most ${MAX_PACKAGE_SOLIDS} solids.`, [given.id]);
  }
  const bytes = (solids ?? []).reduce((sum, each) => sum + each.bytes, 0);
  if (bytes > MAX_PACKAGE_SOLID_BYTES) {
    reject(
      'solid-too-large',
      `The solids of "${name}" would name ${bytes} bytes of files, past ${MAX_PACKAGE_SOLID_BYTES}.`,
      [given.id],
    );
  }
  return compact({
    crosswalks: given.crosswalks === undefined ? undefined : checkedCrosswalks(given.crosswalks),
    solids: solids === undefined || solids.length === 0 ? undefined : solids,
    code,
    capabilities,
    extensions,
  });
}

const SCHEME = /^[a-z][a-z0-9_-]{0,31}$/;
/** An external identifier: 1 to 200 characters, none of them a control character. */
// eslint-disable-next-line no-control-regex
const EXTERNAL_ID = /^[^\x00-\x1f\x7f]{1,200}$/;
const CROSSWALK_KEYS: ReadonlySet<string> = new Set(['from', 'to', 'source', 'entries']);
const MAX_CROSSWALK_ENTRIES = 100_000;
const CROSSWALKS_PROBLEM =
  'A package’s crosswalks are a list of tables, each mapping identifiers of one scheme to those of another.';

/** A package's crosswalks (ADR 0056), checked as the package file's schema checks them. */
function checkedCrosswalks(value: unknown): Crosswalk[] {
  if (!Array.isArray(value)) reject('invalid-command', CROSSWALKS_PROBLEM);
  return (value as unknown[]).map((each) => {
    const table = crosswalkOf(each);
    if (table === undefined) reject('invalid-command', CROSSWALKS_PROBLEM);
    return table;
  });
}

/** One crosswalk, rebuilt from its parts; undefined when it is not one. */
function crosswalkOf(value: unknown): Crosswalk | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const table = value as Record<string, unknown>;
  if (Object.keys(table).some((key) => !CROSSWALK_KEYS.has(key))) return undefined;
  const { from, to, source, entries } = table;
  if (typeof from !== 'string' || typeof to !== 'string') return undefined;
  if (!SCHEME.test(from) || !SCHEME.test(to) || from === to) return undefined;
  if (source !== undefined && (typeof source !== 'string' || source.length > 2000)) {
    return undefined;
  }
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return undefined;
  const pairs = Object.entries(entries);
  if (pairs.length === 0 || pairs.length > MAX_CROSSWALK_ENTRIES) return undefined;
  const ok = pairs.every(
    ([key, mapped]) =>
      EXTERNAL_ID.test(key) && typeof mapped === 'string' && EXTERNAL_ID.test(mapped),
  );
  if (!ok) return undefined;
  return compact({
    from,
    to,
    source,
    entries: Object.fromEntries(pairs),
  });
}

/** Refuses an update that removes a solid something in the project still shows, as `remove-solid` does. */
function checkRemovedSolids(draft: Draft, current: PackageFile, next: PackageFile): void {
  const kept = new Set((next.solids ?? []).map((each) => each.id));
  for (const removed of current.solids ?? []) {
    if (kept.has(removed.id)) continue;
    const users = solidUsers(draft.state, removed.id);
    if (users.length > 0) {
      reject(
        'in-use',
        `The solid "${removed.name}" cannot be removed: ${count(users.length, 'component or element', 'components or elements')} show it.`,
        users,
      );
    }
  }
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

/** The keys a package file has. */
const PACKAGE_KEYS: readonly string[] = [
  'id',
  'name',
  'description',
  'version',
  'license',
  'attribution',
  'components',
  'relationTypes',
  'crosswalks',
  'images',
  'solids',
  'explorables',
  'scriptLibraries',
  'code',
  'capabilities',
  'extensions',
];

/** A package as a command gives it: an object with an id, a name and lists of definitions. */
function shapeOf(value: unknown, command: string): PackageFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${command} needs the package, as its file holds it.`);
  }
  const file = value as Partial<Record<keyof PackageFile, unknown>>;
  for (const key of Object.keys(file)) {
    if (!PACKAGE_KEYS.includes(key)) reject('invalid-command', `A package has no "${key}".`);
  }
  const lists = [file.components, file.relationTypes];
  if (lists.some((list) => !Array.isArray(list))) {
    reject('invalid-command', 'A package holds a list of components and one of relation types.');
  }
  if (file.images !== undefined && !Array.isArray(file.images)) {
    reject('invalid-command', 'A package’s images are a list.');
  }
  if (file.solids !== undefined && !Array.isArray(file.solids)) {
    reject('invalid-command', 'A package’s solids are a list.');
  }
  if (file.explorables !== undefined && !Array.isArray(file.explorables)) {
    reject('invalid-command', 'A package’s explorables are a list.');
  }
  if (file.scriptLibraries !== undefined && !Array.isArray(file.scriptLibraries)) {
    reject('invalid-command', 'A package’s script libraries are a list.');
  }
  for (const each of [
    ...(file.components as unknown[]),
    ...(file.relationTypes as unknown[]),
    ...((file.images as unknown[] | undefined) ?? []),
    ...((file.solids as unknown[] | undefined) ?? []),
    ...((file.explorables as unknown[] | undefined) ?? []),
    ...((file.scriptLibraries as unknown[] | undefined) ?? []),
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
  const ids = definedIds(file);
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
  const own = new Set<Id>(replaced === undefined ? [] : definedIds(replaced));
  // Explorables and script libraries are not in the index of definitions, so they are looked up too.
  const explorables = explorablesIn(draft.state);
  const taken = ids.filter(
    (id) =>
      !own.has(id) &&
      (draft.isTaken(id) || explorables.explorables.has(id) || explorables.scriptLibraries.has(id)),
  );
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
  // Each image is checked as define-image checks one, keys, name, source and license included, then
  // cleaned again: nothing from another project is taken as it comes.
  const images = (file.images ?? []).map((given: unknown) => {
    const { image, removed } = cleanedImage(given);
    if (removed.length > 0) {
      draft.warnings.push(
        problem(
          'image-cleaned',
          `Cleaning the image "${image.name}" removed: ${removed.join(', ')}.`,
          [image.id],
        ),
      );
    }
    return image;
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
