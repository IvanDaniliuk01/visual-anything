/**
 * Commands on packages and their definitions: components and relation types. A definition is created
 * whole, once, with an id the program makes unless one is given; it is then changed trait by trait,
 * so that the app and Claude never undo each other's changes by sending an older copy. Every value is
 * checked, and a change never silently rewrites another definition or a view: a rename carries along
 * only what names the renamed attribute.
 */
import type {
  AttributeDefinition,
  Component,
  Element,
  Id,
  PackageFile,
  Relation,
  RelationType,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { RESERVED_PACKAGE_IDS, builtinPackage } from '../builtin';
import type { Definitions } from '../definitions';
import { changedExternalIds, checkedExternalIds } from '../external-ids';
import { isId } from '../ids';
import { indexModel } from '../model-index';
import type { PackageProperties } from '../operations';
import type { Problem } from '../problems';
import {
  allUsers,
  cappedWarnings,
  choiceWarnings,
  containmentCycles,
  limitWarnings,
  usersOfDefinition,
} from '../rules';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { compact, count, reject, requireName, sameJson, type Draft } from './draft';
import { putRelationTypesLeftOut } from './scopes';
import {
  checkedAttribution,
  checkedLicense,
  checkedPackageAbout,
  checkedPackageDescription,
  checkedVersion,
} from './package-properties';
import {
  changedAppearance,
  changedAttributes,
  changedRelationAppearance,
  checkDetailResolves,
  checkedAppearanceOrNone,
  checkedAttributeDefinitions,
  checkedLimit,
  checkedLimits,
  checkedRelationAppearance,
} from './traits';
import type {
  CreatePackageCommand,
  DefineComponentCommand,
  DefineRelationTypeCommand,
  RemoveComponentCommand,
  RemoveRelationTypeCommand,
  UpdateComponentCommand,
  UpdatePackageCommand,
  UpdateRelationTypeCommand,
} from './types';

export function createPackage(draft: Draft, command: CreatePackageCommand): string {
  const { id } = command.package;
  const name = requireName(command.package.name, 'A package');
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
    reject('id-taken', `A package with the id "${id}" already exists.`, [id]);
  }
  const created: PackageFile = compact({
    id,
    name,
    ...checkedPackageAbout(command.package),
    components: [],
    relationTypes: [],
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'packages' },
    index: draft.state.packages.length,
    item: created,
  });
  draft.apply({
    op: 'set-project',
    project: { ...draft.state.project, packages: [...draft.state.project.packages, id] },
  });
  draft.created.push(id);
  return `Create the package "${name}"`;
}

export function updatePackage(draft: Draft, command: UpdatePackageCommand): string {
  const file = draft.ownPackage(command.id);
  const changes = changesOf(
    command.changes,
    ['name', 'description', 'version', 'license', 'attribution'],
    `the package "${file.name}"`,
  );
  const properties: Partial<PackageFile> = { ...file };
  delete properties.components;
  delete properties.relationTypes;
  const next = { ...(properties as PackageProperties) };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A package');
  const checks = {
    description: checkedPackageDescription,
    version: checkedVersion,
    license: checkedLicense,
    attribution: checkedAttribution,
  } as const;
  for (const key of ['description', 'version', 'license', 'attribution'] as const) {
    const change = changes[key];
    if (change === null) delete next[key];
    else if (change !== undefined) next[key] = checks[key](change);
  }
  if (!sameJson(next, properties)) {
    draft.apply({ op: 'set-package', package: file.id, properties: next });
  }
  return onlyChange(changes, 'name')
    ? `Rename the package "${file.name}" to "${next.name}"`
    : `Edit the package "${next.name}"`;
}

export function defineComponent(draft: Draft, command: DefineComponentCommand): string {
  const file = draft.ownPackage(command.package);
  const before = draft.state;
  const component = checkedComponent(draft, file, command.component);
  const exists = file.components.some((each) => each.id === component.id);
  if (exists && command.createOnly === true) {
    reject('id-taken', `The package "${file.id}" already has the component "${component.id}".`, [
      component.id,
    ]);
  }
  draft.apply(
    exists
      ? { op: 'replace', collection: { name: 'components', package: file.id }, item: component }
      : {
          op: 'insert',
          collection: { name: 'components', package: file.id },
          index: file.components.length,
          item: component,
        },
  );
  afterComponentChange(draft, before, component.id);
  if (!exists) draft.created.push(component.id);
  return `${exists ? 'Redefine' : 'Define'} the component "${component.name}"`;
}

export function defineRelationType(draft: Draft, command: DefineRelationTypeCommand): string {
  const file = draft.ownPackage(command.package);
  const before = draft.state;
  const relationType = checkedRelationType(draft, file, command.relationType);
  const exists = file.relationTypes.some((each) => each.id === relationType.id);
  if (exists && command.createOnly === true) {
    reject(
      'id-taken',
      `The package "${file.id}" already has the relation type "${relationType.id}".`,
      [relationType.id],
    );
  }
  draft.apply(
    exists
      ? {
          op: 'replace',
          collection: { name: 'relationTypes', package: file.id },
          item: relationType,
        }
      : {
          op: 'insert',
          collection: { name: 'relationTypes', package: file.id },
          index: file.relationTypes.length,
          item: relationType,
        },
  );
  afterRelationTypeChange(draft, before, relationType.id);
  if (!exists) draft.created.push(relationType.id);
  return `${exists ? 'Redefine' : 'Define'} the relation type "${relationType.name}"`;
}

export function updateComponent(draft: Draft, command: UpdateComponentCommand): string {
  const defined = draft.definitions.components.get(command.id);
  if (!defined) {
    reject(
      'unknown-component',
      `No package in use defines the component "${String(command.id)}".`,
      [command.id],
    );
  }
  const file = draft.ownPackage(defined.package);
  const current = defined.definition;
  const of = `the component "${current.name}"`;
  const changes = changesOf(
    command.changes,
    ['name', 'description', 'derivesFrom', 'appearance', 'attributes', 'openAttributes', 'ids'],
    of,
  );
  const before = draft.state;
  const next: Component = { ...current };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A component');
  setDescription(next, changes.description, of);
  if (changes.derivesFrom !== undefined) {
    next.derivesFrom = checkedParent(draft, current.id, changes.derivesFrom, 'component');
  }
  if (changes.appearance !== undefined) {
    const appearance = changedAppearance(current.appearance, changes.appearance, of);
    if (appearance === undefined) delete next.appearance;
    else next.appearance = appearance;
  }
  if (changes.openAttributes === null) delete next.openAttributes;
  else if (changes.openAttributes !== undefined) {
    next.openAttributes = checkedOpenAttributes(changes.openAttributes, of);
  }
  setExternalIds(next, current, changes.ids, of);
  let renamed: { from: string; to: string }[] = [];
  if (changes.attributes !== undefined) {
    const chain = draft.definitions.component(current.id)?.attributes ?? [];
    const result = changedAttributes(current.attributes ?? [], chain, changes.attributes, of);
    setAttributes(next, result.attributes);
    renamed = result.renamed;
  }
  const removed = removedNames(current.attributes, next.attributes, renamed);
  for (const rename of renamed) renameInDetail(next, rename);
  const fixes = renamed.length > 0 ? componentRenameFixes(draft, current.id, renamed) : undefined;

  if (!sameJson(next, current)) {
    draft.apply({
      op: 'replace',
      collection: { name: 'components', package: file.id },
      item: next,
    });
  }
  if (fixes) applyFixes(draft, fixes);
  if (removed.length > 0) checkRemovedAttributesUnused(draft, current.id, removed);
  afterComponentChange(draft, before, current.id, {
    detail: isRecord(changes.appearance) && changes.appearance.detail !== undefined,
    chain: changes.attributes !== undefined || changes.derivesFrom !== undefined,
  });
  if (onlyChange(changes, 'ids')) {
    return `Change the external identifiers of the component "${next.name}"`;
  }
  return onlyChange(changes, 'name')
    ? `Rename the component "${current.name}" to "${next.name}"`
    : `Edit the component "${next.name}"`;
}

export function updateRelationType(draft: Draft, command: UpdateRelationTypeCommand): string {
  const defined = draft.definitions.relationTypes.get(command.id);
  if (!defined) {
    reject(
      'unknown-relation-type',
      `No package in use defines the relation type "${String(command.id)}".`,
      [command.id],
    );
  }
  const file = draft.ownPackage(defined.package);
  const current = defined.definition;
  const of = `the relation type "${current.name}"`;
  const changes = changesOf(
    command.changes,
    [
      'name',
      'description',
      'derivesFrom',
      'direction',
      'nests',
      'appearance',
      'attributes',
      'limits',
      'ids',
    ],
    of,
  );
  const before = draft.state;
  const next: RelationType = { ...current };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A relation type');
  setDescription(next, changes.description, of);
  if (changes.derivesFrom !== undefined) {
    next.derivesFrom = checkedParent(draft, current.id, changes.derivesFrom, 'relation type');
  }
  if (changes.direction === null) delete next.direction;
  else if (changes.direction !== undefined)
    next.direction = checkedDirection(changes.direction, of);
  if (changes.nests === null) delete next.nests;
  else if (changes.nests !== undefined) next.nests = checkedNests(changes.nests, of);
  if (changes.appearance !== undefined) {
    const appearance = changedRelationAppearance(current.appearance, changes.appearance, of);
    if (appearance === undefined) delete next.appearance;
    else next.appearance = appearance;
  }
  if (changes.limits !== undefined) {
    const limits = changedLimits(draft.definitions, current.limits, changes.limits, of);
    if (limits === undefined) delete next.limits;
    else next.limits = limits;
  }
  setExternalIds(next, current, changes.ids, of);
  let renamed: { from: string; to: string }[] = [];
  if (changes.attributes !== undefined) {
    const chain = draft.definitions.relationType(current.id)?.attributes ?? [];
    const result = changedAttributes(current.attributes ?? [], chain, changes.attributes, of);
    setAttributes(next, result.attributes);
    renamed = result.renamed;
  }
  const fixes =
    renamed.length > 0 ? relationTypeRenameFixes(draft, current.id, renamed) : undefined;

  if (!sameJson(next, current)) {
    draft.apply({
      op: 'replace',
      collection: { name: 'relationTypes', package: file.id },
      item: next,
    });
  }
  if (fixes) applyFixes(draft, fixes);
  afterRelationTypeChange(draft, before, current.id);
  if (onlyChange(changes, 'ids')) {
    return `Change the external identifiers of the relation type "${next.name}"`;
  }
  return onlyChange(changes, 'name')
    ? `Rename the relation type "${current.name}" to "${next.name}"`
    : `Edit the relation type "${next.name}"`;
}

export function removeComponent(draft: Draft, command: RemoveComponentCommand): string {
  const defined = draft.definitions.components.get(command.id);
  if (!defined) {
    reject(
      'unknown-component',
      `No package in use defines the component "${String(command.id)}".`,
      [command.id],
    );
  }
  draft.ownPackage(defined.package);
  const users = usersOfDefinition(draft.state, command.id);
  const ids = allUsers(users);
  if (ids.length > 0) {
    reject(
      'in-use',
      `The component "${defined.definition.name}" cannot be removed: ${describeUsers(users)} use it.`,
      ids,
    );
  }
  draft.apply({
    op: 'remove',
    collection: { name: 'components', package: defined.package },
    key: command.id,
  });
  return `Remove the component "${defined.definition.name}"`;
}

export function removeRelationType(draft: Draft, command: RemoveRelationTypeCommand): string {
  const defined = draft.definitions.relationTypes.get(command.id);
  if (!defined) {
    reject(
      'unknown-relation-type',
      `No package in use defines the relation type "${String(command.id)}".`,
      [command.id],
    );
  }
  draft.ownPackage(defined.package);
  const users = usersOfDefinition(draft.state, command.id);
  const ids = allUsers(users);
  if (ids.length > 0) {
    reject(
      'in-use',
      `The relation type "${defined.definition.name}" cannot be removed: ${describeUsers(users)} use it.`,
      ids,
    );
  }
  // It leaves every list of relation types a view leaves out, in the same action (ADR 0064).
  for (const view of draft.state.views) {
    const list = view.relationTypesLeftOut ?? [];
    if (!list.some((each) => each.relationType === command.id)) continue;
    putRelationTypesLeftOut(
      draft,
      view,
      list.filter((each) => each.relationType !== command.id),
    );
  }
  draft.apply({
    op: 'remove',
    collection: { name: 'relationTypes', package: defined.package },
    key: command.id,
  });
  return `Remove the relation type "${defined.definition.name}"`;
}

// Checking whole definitions ----------------------------------------------------------------------

/** A component a command defines whole, checked, with an id made from its name when it has none. */
export function checkedComponent(draft: Draft, file: PackageFile, value: unknown): Component {
  const given = definitionObject(value, 'component', [
    'id',
    'name',
    'derivesFrom',
    'description',
    'ids',
    'attributes',
    'openAttributes',
    'appearance',
  ]);
  const name = requireName(given.name, 'A component');
  const id = checkedDefinitionId(draft, file, given.id, name, 'component');
  const of = `the component "${name}"`;
  const description = checkedDescription(given.description, of);
  const stored = file.components.find((each) => each.id === id)?.appearance;
  return compact({
    id,
    name,
    derivesFrom: checkedParent(draft, id, given.derivesFrom, 'component'),
    description,
    ids: given.ids === undefined ? undefined : checkedExternalIds(given.ids, of),
    attributes:
      given.attributes === undefined
        ? undefined
        : checkedAttributeDefinitions(given.attributes, of),
    openAttributes:
      given.openAttributes === undefined
        ? undefined
        : checkedOpenAttributes(given.openAttributes, of),
    appearance:
      given.appearance === undefined
        ? undefined
        : checkedAppearanceOrNone(given.appearance, of, stored),
  });
}

/** A relation type a command defines whole, checked, with an id made from its name when it has none. */
export function checkedRelationType(draft: Draft, file: PackageFile, value: unknown): RelationType {
  const given = definitionObject(value, 'relation type', [
    'id',
    'name',
    'derivesFrom',
    'description',
    'direction',
    'nests',
    'ids',
    'attributes',
    'appearance',
    'limits',
  ]);
  const name = requireName(given.name, 'A relation type');
  const id = checkedDefinitionId(draft, file, given.id, name, 'relation type');
  const of = `the relation type "${name}"`;
  const stored = file.relationTypes.find((each) => each.id === id)?.appearance;
  return compact({
    id,
    name,
    derivesFrom: checkedParent(draft, id, given.derivesFrom, 'relation type'),
    description: checkedDescription(given.description, of),
    ids: given.ids === undefined ? undefined : checkedExternalIds(given.ids, of),
    direction: given.direction === undefined ? undefined : checkedDirection(given.direction, of),
    nests: given.nests === undefined ? undefined : checkedNests(given.nests, of),
    attributes:
      given.attributes === undefined
        ? undefined
        : checkedAttributeDefinitions(given.attributes, of),
    appearance:
      given.appearance === undefined
        ? undefined
        : checkedRelationAppearance(given.appearance, of, stored),
    limits: checkedLimits(given.limits, draft.definitions, of),
  });
}

function definitionObject(
  value: unknown,
  noun: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `A ${noun} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) reject('invalid-command', `A ${noun} has no "${key}".`);
  }
  return value as Record<string, unknown>;
}

/** The id a definition gets: the one given, checked, or one the program makes from its name. */
function checkedDefinitionId(
  draft: Draft,
  file: PackageFile,
  given: unknown,
  name: string,
  noun: 'component' | 'relation type',
): Id {
  if (given === undefined) return draft.newDefinitionId(file.id, name);
  if (!isId(given)) reject('invalid-id', `${JSON.stringify(given)} is not a valid id.`);
  if (!given.startsWith(`${file.id}.`)) {
    reject(
      'id-outside-package',
      `The ${noun} "${given}" must start with "${file.id}.", the id of its package.`,
      [given],
    );
  }
  const definitions = draft.definitions;
  const elsewhere =
    noun === 'component' ? definitions.components.get(given) : definitions.relationTypes.get(given);
  if (elsewhere && elsewhere.package !== file.id) {
    reject('defined-twice', `The package "${elsewhere.package}" already defines "${given}".`, [
      given,
    ]);
  }
  return given;
}

/** What a definition derives from: a definition in use, or Essence or "relates to", never itself. */
function checkedParent(
  draft: Draft,
  id: Id,
  parent: unknown,
  noun: 'component' | 'relation type',
): Id {
  const definitions = draft.definitions;
  const builtIn = noun === 'component' ? ESSENCE_ID : RELATES_TO_ID;
  if (typeof parent !== 'string') {
    reject('invalid-command', `A ${noun} names what it derives from by its id.`, [id]);
  }
  if (parent === id) {
    reject('derivation-cycle', `The ${noun} "${id}" cannot derive from itself.`, [id]);
  }
  const known =
    parent === builtIn ||
    (noun === 'component'
      ? definitions.components.has(parent)
      : definitions.relationTypes.has(parent));
  if (!known) {
    reject(
      'unknown-parent',
      `The ${noun} "${id}" derives from "${parent}", which no package in use defines.`,
      [id],
    );
  }
  return parent;
}

function checkedDescription(value: unknown, of: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') reject('invalid-command', `The description of ${of} is text.`);
  return value;
}

function checkedDirection(value: unknown, of: string): 'directed' | 'undirected' {
  if (value !== 'directed' && value !== 'undirected') {
    reject('invalid-command', `The direction of ${of} is "directed" or "undirected".`);
  }
  return value;
}

/** Whether a component has open attributes (ADR 0105): true or false. */
function checkedOpenAttributes(value: unknown, of: string): boolean {
  if (typeof value !== 'boolean') {
    reject(
      'invalid-command',
      `Whether ${of} takes attributes it does not define is true or false.`,
    );
  }
  return value;
}

function checkedNests(value: unknown, of: string): boolean {
  if (typeof value !== 'boolean')
    reject('invalid-command', `Whether ${of} nests is true or false.`);
  return value;
}

/** The changes of an update command, as an object with only the keys it may have. */
function changesOf<K extends string>(
  value: unknown,
  keys: readonly K[],
  of: string,
): Partial<Record<K, unknown>> & Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `The changes to ${of} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!(keys as readonly string[]).includes(key)) {
      reject('invalid-command', `${capitalized(of)} has no "${key}" to change.`);
    }
  }
  return value as Partial<Record<K, unknown>> & Record<string, unknown>;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether the only change a command makes is to one key. */
function onlyChange(changes: Record<string, unknown>, key: string): boolean {
  const named = Object.entries(changes).filter(([, value]) => value !== undefined);
  return named.length === 1 && named[0]?.[0] === key;
}

/** Changes a definition's external identifiers, when the changes name them (ADR 0056). */
function setExternalIds(
  next: { ids?: Component['ids'] },
  current: { ids?: Component['ids'] },
  changes: unknown,
  of: string,
): void {
  if (changes === undefined) return;
  const ids = changedExternalIds(current.ids, changes, of);
  if (ids === undefined) delete next.ids;
  else next.ids = ids;
}

function setDescription(definition: { description?: string }, value: unknown, of: string): void {
  if (value === null) delete definition.description;
  else if (value !== undefined) definition.description = checkedDescription(value, of);
}

function setAttributes(
  definition: { attributes?: AttributeDefinition[] },
  attributes: AttributeDefinition[],
): void {
  if (attributes.length === 0) delete definition.attributes;
  else definition.attributes = attributes;
}

/** A relation type's limits after changes, end by end: a list or `any` sets it, `null` inherits it. */
function changedLimits(
  definitions: Definitions,
  own: RelationType['limits'],
  changes: unknown,
  of: string,
): RelationType['limits'] {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    reject('invalid-command', `The changes to the limits of ${of} must be an object.`);
  }
  const next: Record<string, unknown> = { ...own };
  for (const [end, value] of Object.entries(changes)) {
    if (end !== 'from' && end !== 'to') {
      reject('invalid-command', `Limits are set for the "from" and "to" ends, not "${end}".`);
    }
    if (value === undefined) continue;
    if (value === null) delete next[end];
    else next[end] = checkedLimit(value, end, definitions, of);
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

// What follows a change to a definition -----------------------------------------------------------

/** The definitions that derive from one, directly or not. */
function descendantsOf(
  definitions: Definitions,
  id: Id,
  kind: 'component' | 'relation type',
): Id[] {
  const found: Id[] = [];
  const seen = new Set<Id>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as Id;
    const children =
      kind === 'component'
        ? definitions.componentsDerivedFrom(current)
        : definitions.relationTypesDerivedFrom(current);
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/**
 * After a component is defined or changed: what it derives from forms no cycle; its own detail and
 * that of every component derived from it still name attributes they have; and the relations and
 * values it now affects are warned about, at most 20 of each kind.
 */
export function afterComponentChange(
  draft: Draft,
  before: ProjectSnapshot,
  id: Id,
  changed: { detail: boolean; chain: boolean } = { detail: true, chain: true },
): void {
  const definitions = draft.definitions;
  rejectCycle(definitions, id);
  // A detail is checked again only when it, or what it can name, changes: a problem a file already
  // had, which opening it only warns about, does not block an unrelated change such as a fill.
  const checked = changed.chain
    ? [id, ...descendantsOf(definitions, id, 'component')]
    : changed.detail
      ? [id]
      : [];
  for (const each of checked) {
    const defined = definitions.components.get(each);
    const resolved = definitions.component(each);
    if (!defined || !resolved) continue;
    checkDetailResolves(
      defined.definition.appearance,
      resolved.attributes,
      undefined,
      definitions,
      `the component "${defined.definition.name}"`,
    );
  }
  const old = definitionsIn(before);
  if (!old.components.has(id)) return;
  const affected = (definitions_: Definitions, element: Element) =>
    definitions_.componentDerives(element.component, id);
  const elements = [draft.state.model.world, ...draft.state.model.elements].filter(
    (element) => affected(definitions, element) || affected(old, element),
  );
  // Limits change for the relations on elements whose lineage changed.
  const index = draft.index;
  const lineageChanged = elements.filter(
    (element) =>
      !sameJson(
        old.component(element.component)?.lineage,
        definitions.component(element.component)?.lineage,
      ),
  );
  const relations = new Map<Id, Relation>();
  for (const element of lineageChanged) {
    for (const relation of index.relationsOn(element.id)) relations.set(relation.id, relation);
  }
  warnLimits(draft, [...relations.values()]);
  warnChoices(
    draft,
    elements.map((element) => ({
      item: element,
      before: old.component(element.component)?.attributes ?? [],
      after: definitions.component(element.component)?.attributes ?? [],
    })),
  );
}

/**
 * After a relation type is defined or changed: what it derives from forms no cycle; nesting
 * relations still nest without a cycle; no relation type a view nests by stops nesting; and the
 * relations whose limits or choices changed are warned about, at most 20 of each kind.
 */
export function afterRelationTypeChange(draft: Draft, before: ProjectSnapshot, id: Id): void {
  const definitions = draft.definitions;
  const old = definitionsIn(before);
  rejectCycle(definitions, id);
  if (!sameSet(old.nestingRelationTypes, definitions.nestingRelationTypes)) {
    checkNestingStillHolds(draft);
    const stopped = new Set(
      [...old.nestingRelationTypes].filter((type) => !definitions.nestingRelationTypes.has(type)),
    );
    const views = draft.state.views.filter((view) =>
      view.nestingRelationTypes.some((type) => stopped.has(type)),
    );
    if (views.length > 0) {
      const names = [...stopped]
        .filter((type) => views.some((view) => view.nestingRelationTypes.includes(type)))
        .map((type) => `"${old.relationType(type)?.name ?? type}"`);
      reject(
        'in-use',
        `${names.join(' and ')} cannot stop nesting while ${views.map((view) => `"${view.name}"`).join(', ')} ${views.length === 1 ? 'nests' : 'nest'} by it; change the view first.`,
        views.map((view) => view.id),
      );
    }
  }
  if (!old.relationTypes.has(id)) return;
  const relations = draft.state.model.relations.filter(
    (relation) =>
      definitions.relationTypeDerives(relation.relationType, id) ||
      old.relationTypeDerives(relation.relationType, id),
  );
  warnLimits(
    draft,
    relations.filter(
      (relation) =>
        !sameJson(
          old.relationType(relation.relationType)?.limits,
          definitions.relationType(relation.relationType)?.limits,
        ),
    ),
  );
  warnChoices(
    draft,
    relations.map((relation) => ({
      item: relation,
      before: old.relationType(relation.relationType)?.attributes ?? [],
      after: definitions.relationType(relation.relationType)?.attributes ?? [],
    })),
  );
}

function rejectCycle(definitions: Definitions, id: Id): void {
  const cycle = definitions.problems.find(
    (each) => each.code === 'derivation-cycle' && each.subjects?.includes(id),
  );
  if (cycle) reject('derivation-cycle', cycle.message, cycle.subjects);
}

function sameSet(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  return a.size === b.size && [...a].every((each) => b.has(each));
}

function warnLimits(draft: Draft, relations: readonly Relation[]): void {
  const warnings = relations.flatMap((relation) =>
    limitWarnings(relation, draft.index, draft.definitions),
  );
  draft.warnings.push(
    ...cappedWarnings(
      warnings,
      'limit-broken',
      (rest) => `…and ${rest} more ${rest === 1 ? 'relation breaks' : 'relations break'} limits.`,
    ),
  );
}

/** Warns about values outside the choices of the attributes whose choices changed. */
function warnChoices(
  draft: Draft,
  items: readonly {
    item: { id: Id; name?: string; attributes?: Element['attributes'] };
    before: readonly AttributeDefinition[];
    after: readonly AttributeDefinition[];
  }[],
): void {
  const warnings: Problem[] = [];
  for (const { item, before, after } of items) {
    const changed = after.filter(
      (attribute) =>
        attribute.choices !== undefined &&
        !sameJson(before.find((each) => each.name === attribute.name)?.choices, attribute.choices),
    );
    if (changed.length > 0) warnings.push(...choiceWarnings(item, changed));
  }
  draft.warnings.push(
    ...cappedWarnings(
      warnings,
      'choice-broken',
      (rest) =>
        `…and ${rest} more ${rest === 1 ? 'value is' : 'values are'} outside their choices.`,
    ),
  );
}

/**
 * After a relation type changes, its relations and those of the types deriving from it must still
 * keep the nesting rules: they place elements inside elements, and containment forms no cycle.
 */
function checkNestingStillHolds(draft: Draft): void {
  const definitions = draft.definitions;
  const index = indexModel(draft.state.model, definitions.nestingRelationTypes);
  for (const relation of draft.state.model.relations) {
    if (!definitions.nestingRelationTypes.has(relation.relationType)) continue;
    if (!index.element(relation.from) || !index.element(relation.to)) {
      reject(
        'nesting-end-not-element',
        `The relation "${relation.id}" would nest, but one of its ends is a relation.`,
        [relation.id],
      );
    }
    if (relation.from === index.world.id) {
      reject('world-not-allowed', 'World cannot sit inside anything.', [relation.id]);
    }
  }
  const elements = [index.world.id, ...draft.state.model.elements.map((element) => element.id)];
  const [cycle] = containmentCycles(index, elements);
  if (cycle) {
    reject('containment-cycle', 'The change would make containment form a cycle.', cycle);
  }
}

// Renaming and removing attributes ----------------------------------------------------------------

/** The replacements a rename makes outside the definition renamed. */
interface Fixes {
  elements: Map<Id, Element>;
  relations: Map<Id, Relation>;
  components: Map<Id, { package: Id; item: Component }>;
}

function applyFixes(draft: Draft, fixes: Fixes): void {
  for (const { package: packageId, item } of fixes.components.values()) {
    draft.apply({ op: 'replace', collection: { name: 'components', package: packageId }, item });
  }
  for (const element of fixes.elements.values()) {
    if (element.id === draft.state.model.world.id) draft.apply({ op: 'set-world', world: element });
    else draft.apply({ op: 'replace', collection: { name: 'elements' }, item: element });
  }
  for (const relation of fixes.relations.values()) {
    draft.apply({ op: 'replace', collection: { name: 'relations' }, item: relation });
  }
}

/**
 * Whether a definition whose lineage is given gets `name` from `id`: `id` is in it, and no
 * definition nearer than `id` defines the name itself.
 */
function getsFrom(
  lineage: readonly Id[],
  id: Id,
  name: string,
  ownAttributes: (definition: Id) => readonly AttributeDefinition[] | undefined,
): boolean {
  const at = lineage.indexOf(id);
  if (at === -1) return false;
  return lineage
    .slice(0, at)
    .every((nearer) => !(ownAttributes(nearer) ?? []).some((each) => each.name === name));
}

/** Renames an attribute in the detail rules and attribute badges of an appearance, in place. */
function renameInDetail(
  holder: { appearance?: Component['appearance'] },
  { from, to }: { from: string; to: string },
): boolean {
  const detail = holder.appearance?.detail;
  if (detail === undefined || holder.appearance === undefined) return false;
  const names = detail.attributes?.includes(from);
  const badges = detail.badges?.some(
    (badge) => badge.when === 'attribute' && badge.attribute === from,
  );
  if (!names && !badges) return false;
  holder.appearance = {
    ...holder.appearance,
    detail: {
      ...detail,
      ...(detail.attributes === undefined
        ? {}
        : { attributes: detail.attributes.map((name) => (name === from ? to : name)) }),
      ...(detail.badges === undefined
        ? {}
        : {
            badges: detail.badges.map((badge) =>
              badge.when === 'attribute' && badge.attribute === from
                ? { ...badge, attribute: to }
                : badge,
            ),
          }),
    },
  };
  return true;
}

/** Renames an attribute value of an element or relation; `undefined` when it holds none. */
function renamedValues(
  attributes: Element['attributes'],
  { from, to }: { from: string; to: string },
): Element['attributes'] | undefined {
  if (attributes === undefined || !Object.hasOwn(attributes, from)) return undefined;
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key === from ? to : key, value]),
  );
}

/**
 * What renaming a component's attributes changes elsewhere: the values of the elements that get the
 * attribute from it, and the details and badges, theirs and those of the components derived from it,
 * that name it. Refused when the new name is taken there.
 */
function componentRenameFixes(
  draft: Draft,
  id: Id,
  renames: readonly { from: string; to: string }[],
): Fixes {
  const definitions = draft.definitions;
  const own = (definition: Id) => definitions.components.get(definition)?.definition.attributes;
  const fixes: Fixes = { elements: new Map(), relations: new Map(), components: new Map() };
  const descendants = descendantsOf(definitions, id, 'component');
  for (const rename of renames) {
    for (const each of descendants) {
      const defined = definitions.components.get(each);
      const lineage = definitions.component(each)?.lineage ?? [];
      if (!defined || !getsFrom(lineage, id, rename.from, own)) continue;
      if ((defined.definition.attributes ?? []).some((attribute) => attribute.name === rename.to)) {
        reject(
          'name-taken',
          `The component "${defined.definition.name}" already defines "${rename.to}".`,
          [each],
        );
      }
      const item = { ...(fixes.components.get(each)?.item ?? defined.definition) };
      if (renameInDetail(item, rename))
        fixes.components.set(each, { package: defined.package, item });
    }
    for (const element of [draft.state.model.world, ...draft.state.model.elements]) {
      const lineage = definitions.component(element.component)?.lineage ?? [];
      if (!getsFrom(lineage, id, rename.from, own)) continue;
      const item: Element = { ...(fixes.elements.get(element.id) ?? element) };
      if (item.attributes !== undefined && Object.hasOwn(item.attributes, rename.to)) {
        reject('name-taken', `"${element.name}" already holds a value for "${rename.to}".`, [
          element.id,
        ]);
      }
      const values = renamedValues(item.attributes, rename);
      const detailed = renameInDetail(item, rename);
      if (values !== undefined) item.attributes = values;
      if (values !== undefined || detailed) fixes.elements.set(element.id, item);
    }
  }
  return fixes;
}

/** What renaming a relation type's attributes changes elsewhere: the values of its relations. */
function relationTypeRenameFixes(
  draft: Draft,
  id: Id,
  renames: readonly { from: string; to: string }[],
): Fixes {
  const definitions = draft.definitions;
  const own = (definition: Id) => definitions.relationTypes.get(definition)?.definition.attributes;
  const fixes: Fixes = { elements: new Map(), relations: new Map(), components: new Map() };
  for (const each of descendantsOf(definitions, id, 'relation type')) {
    const defined = definitions.relationTypes.get(each);
    for (const rename of renames) {
      const lineage = definitions.relationType(each)?.lineage ?? [];
      if (
        defined &&
        getsFrom(lineage, id, rename.from, own) &&
        (defined.definition.attributes ?? []).some((attribute) => attribute.name === rename.to)
      ) {
        reject(
          'name-taken',
          `The relation type "${defined.definition.name}" already defines "${rename.to}".`,
          [each],
        );
      }
    }
  }
  for (const rename of renames) {
    for (const relation of draft.state.model.relations) {
      const lineage = definitions.relationType(relation.relationType)?.lineage ?? [];
      if (!getsFrom(lineage, id, rename.from, own)) continue;
      const item: Relation = { ...(fixes.relations.get(relation.id) ?? relation) };
      if (item.attributes !== undefined && Object.hasOwn(item.attributes, rename.to)) {
        reject(
          'name-taken',
          `The relation "${relation.name ?? relation.id}" already holds a value for "${rename.to}".`,
          [relation.id],
        );
      }
      const values = renamedValues(item.attributes, rename);
      if (values === undefined) continue;
      item.attributes = values;
      fixes.relations.set(relation.id, item);
    }
  }
  return fixes;
}

/** The names a definition stopped defining, renames aside. */
function removedNames(
  before: readonly AttributeDefinition[] | undefined,
  after: readonly AttributeDefinition[] | undefined,
  renamed: readonly { from: string; to: string }[],
): string[] {
  const kept = new Set((after ?? []).map((attribute) => attribute.name));
  const renamedFrom = new Set(renamed.map((rename) => rename.from));
  return (before ?? [])
    .map((attribute) => attribute.name)
    .filter((name) => !kept.has(name) && !renamedFrom.has(name));
}

/**
 * Refuses removing attributes that a detail rule or a badge still names, of the component, of one
 * derived from it, or of an element's own appearance, when the chain no longer has them.
 */
function checkRemovedAttributesUnused(draft: Draft, id: Id, names: readonly string[]): void {
  const definitions = draft.definitions;
  const names_ = new Set(names);
  const users: Id[] = [];
  const stillHas = (componentId: Id, name: string) =>
    (definitions.component(componentId)?.attributes ?? []).some((each) => each.name === name);
  const named = (appearance: Component['appearance']) => [
    ...(appearance?.detail?.attributes ?? []),
    ...(appearance?.detail?.badges ?? []).flatMap((badge) =>
      badge.when === 'attribute' ? [badge.attribute] : [],
    ),
  ];
  for (const each of [id, ...descendantsOf(definitions, id, 'component')]) {
    const appearance = definitions.components.get(each)?.definition.appearance;
    if (named(appearance).some((name) => names_.has(name) && !stillHas(each, name))) {
      users.push(each);
    }
  }
  for (const element of [draft.state.model.world, ...draft.state.model.elements]) {
    if (!definitions.componentDerives(element.component, id)) continue;
    if (
      named(element.appearance).some(
        (name) => names_.has(name) && !stillHas(element.component, name),
      )
    ) {
      users.push(element.id);
    }
  }
  if (users.length > 0) {
    reject(
      'in-use',
      `${names.map((name) => `"${name}"`).join(', ')} cannot be removed: the detail of ${count(users.length, 'component or element', 'components or elements')} writes it.`,
      users,
    );
  }
}

export function describeUsers(users: ReturnType<typeof usersOfDefinition>): string {
  const parts: string[] = [];
  if (users.elements.length > 0) parts.push(count(users.elements.length, 'element'));
  if (users.relations.length > 0) parts.push(count(users.relations.length, 'relation'));
  if (users.derived.length > 0) parts.push(count(users.derived.length, 'derived definition'));
  if (users.limits.length > 0) parts.push(count(users.limits.length, 'limit'));
  if (users.badges.length > 0) parts.push(count(users.badges.length, 'badge'));
  if (users.views.length > 0) parts.push(count(users.views.length, 'view'));
  return parts.join(', ');
}
