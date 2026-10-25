/**
 * The commands the component editor and the Components tab send, made by pure functions so that what
 * each gesture sends can be tested without the panels. Every creation is create-only, with an id the
 * app makes through the core's `definitionIdFor`, so that later commands of the same action can name
 * it and an id once removed never comes back.
 */
import {
  BUILTIN_PACKAGES,
  ID_PATTERN,
  RESERVED_PACKAGE_IDS,
  builtinPackage,
  definitionIdFor,
  definitionsIn,
  executeCommand,
  modelIndexOf,
  nestingTypesInView,
  randomIds,
  slug,
  type BatchCommand,
  type Command,
  type Definitions,
  type IdGenerator,
  type Problem,
  type ProjectSnapshot,
  type UpdateProjectCommand,
} from '@visual-anything/core';
import {
  ESSENCE_ID,
  RELATES_TO_ID,
  type Appearance,
  type Id,
  type PackageFile,
  type RelationType,
} from '@visual-anything/schema';

/** What the component editor edits besides packages: a component or a relation type. */
export type DefinitionKind = 'component' | 'relation-type';

/**
 * Whether an id is held by anything in the project: an element, a relation, a view, a scenario or a
 * step's relation, a package or a definition, Essence and "relates to" included. The core checks a
 * new id against the same.
 */
export function takenIn(project: ProjectSnapshot): (id: Id) => boolean {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const held = new Set<Id>([ESSENCE_ID, RELATES_TO_ID]);
  for (const view of project.views) held.add(view.id);
  for (const scenario of project.scenarios) {
    held.add(scenario.id);
    for (const step of scenario.steps) for (const relation of step.relations) held.add(relation);
  }
  for (const file of project.packages) held.add(file.id);
  return (id) =>
    held.has(id) ||
    index.has(id) ||
    definitions.components.has(id) ||
    definitions.relationTypes.has(id);
}

/** A new id for a component or relation type of a package, unused by anything in the project. */
export function newDefinitionId(
  project: ProjectSnapshot,
  packageId: Id,
  name: string,
  generate: IdGenerator = randomIds(),
): Id {
  return definitionIdFor(packageId, name, generate, takenIn(project));
}

/**
 * The first problem the core finds with a command when it runs on the app's own copy of the project;
 * `undefined` when the core accepts it. The local program's answer still decides.
 */
export function refusalOf(project: ProjectSnapshot, command: Command): Problem | undefined {
  const outcome = executeCommand(project, command);
  return outcome.ok ? undefined : outcome.problems[0];
}

/**
 * Whether a definition is built into Visual Anything, and so read-only: Essence, "relates to", or one
 * of a built-in package.
 */
export function isBuiltInDefinition(
  definitions: Definitions,
  kind: DefinitionKind,
  id: Id,
): boolean {
  if (id === (kind === 'component' ? ESSENCE_ID : RELATES_TO_ID)) return true;
  const defined =
    kind === 'component' ? definitions.components.get(id) : definitions.relationTypes.get(id);
  return defined !== undefined && builtinPackage(defined.package) !== undefined;
}

/** The built-in packages the project does not use yet, in the order Visual Anything lists them. */
export function unusedBuiltInPackages(project: ProjectSnapshot): PackageFile[] {
  const used = new Set(project.project.packages);
  return BUILTIN_PACKAGES.filter((file) => !used.has(file.id));
}

/**
 * The action that starts using a built-in package: the project lists it, and the open view, when
 * there is one, also nests by the package's nesting relation types, so that what is created from it
 * sits where it belongs. The view's list keeps only the relation types that exist and nest once the
 * package is in use, so an entry left from a package no longer used never makes it fail. `undefined`
 * for a package that is in use already or is not built in.
 */
export function startUsingPackageCommand(
  project: ProjectSnapshot,
  packageId: Id,
  viewId?: Id,
): BatchCommand | undefined {
  const builtin = builtinPackage(packageId);
  if (!builtin || project.project.packages.includes(packageId)) return undefined;
  const commands: Command[] = [
    { type: 'update-project', changes: { packages: [...project.project.packages, packageId] } },
  ];
  const view = project.views.find((each) => each.id === viewId);
  if (view) {
    const nesting = definitionsIn({
      ...project,
      packages: [...project.packages, builtin],
    }).nestingRelationTypes;
    const kept = [...new Set(view.nestingRelationTypes)].filter((id) => nesting.has(id));
    const added = builtin.relationTypes
      .map((relationType) => relationType.id)
      .filter((id) => nesting.has(id) && !kept.includes(id));
    if (added.length > 0) {
      commands.push({
        type: 'update-view',
        id: view.id,
        changes: { nestingRelationTypes: [...kept, ...added] },
      });
    }
  }
  return { type: 'batch', label: `Use the package "${builtin.name}"`, commands };
}

/**
 * The action that creates something from a built-in package the project may not use yet, as the
 * palette's "Not in use yet" does: it starts using the package, as `startUsingPackageCommand` does, then
 * sends what `make` builds on the project as it is once the package is in use, all as one action
 * labelled `label`. When the package is in use already, it is only what `make` builds.
 */
export function withPackageInUse(
  project: ProjectSnapshot,
  packageId: Id,
  viewId: Id | undefined,
  label: string,
  make: (state: ProjectSnapshot) => Command | undefined,
): Command | undefined {
  const use = startUsingPackageCommand(project, packageId, viewId);
  if (!use) return make(project);
  const outcome = executeCommand(project, use);
  if (!outcome.ok) return undefined;
  const then = make(outcome.state);
  if (!then) return undefined;
  return {
    type: 'batch',
    label,
    commands: [...use.commands, ...(then.type === 'batch' ? then.commands : [then])],
  };
}

/** The id the new-package form proposes for a name: made from it, and unused by anything. */
export function proposedPackageId(project: ProjectSnapshot, name: string): Id {
  const base = slug(name, 'package');
  const free = (id: Id) => packageIdProblem(project, id) === undefined;
  if (free(base)) return base;
  for (let count = 2; ; count++) {
    const id = `${base}-${count}`;
    if (free(id)) return id;
  }
}

/** Why an id cannot be a new package's, in words; `undefined` when it can. */
export function packageIdProblem(project: ProjectSnapshot, id: string): string | undefined {
  if (id === '') return 'A package needs an id.';
  if (!ID_PATTERN.test(id)) {
    return 'An id is letters, digits, dots, dashes and underscores, starting with a letter or a digit.';
  }
  const builtin = builtinPackage(id);
  if (builtin) {
    return `The id "${id}" is the built-in package ${builtin.name}’s. Give the package another one.`;
  }
  if (RESERVED_PACKAGE_IDS.has(id)) {
    return `Visual Anything keeps the id "${id}" for a package it plans to build in. Give the package another one.`;
  }
  if (project.packages.some((file) => file.id === id)) {
    return `The project already has the package "${id}".`;
  }
  if (takenIn(project)(id)) return `Something in the project already has the id "${id}".`;
  return undefined;
}

/** What a derived component or relation type is, where it goes, and what is created from it at once. */
export interface DeriveRequest {
  of: DefinitionKind;
  /** What it derives from: a definition in use, or Essence or "relates to". */
  base: Id;
  name: string;
  /** A package of the project's own, by id, or a new one created in the same action. */
  into: { package: Id } | { newPackage: { id: Id; name: string } };
  /** An element (for a component) or a relation (for a relation type) that it is used for at once. */
  useFor?: Id;
}

/**
 * The action that derives a component or a relation type: the package first when it is new, then the
 * definition, create-only, with the id the app made so that the rest of the action can name it, then
 * the element or relation it is used for. Deriving from Essence or "relates to" defines a new one.
 */
export function deriveCommand(
  project: ProjectSnapshot,
  request: DeriveRequest,
  generate: IdGenerator = randomIds(),
): { command: BatchCommand; id: Id } {
  const commands: Command[] = [];
  const packageId = 'package' in request.into ? request.into.package : request.into.newPackage.id;
  if ('newPackage' in request.into) {
    commands.push({ type: 'create-package', package: { ...request.into.newPackage } });
  }
  const id = newDefinitionId(project, packageId, request.name, generate);
  const definition = { id, name: request.name, derivesFrom: request.base };
  const component = request.of === 'component';
  commands.push(
    component
      ? { type: 'define-component', package: packageId, component: definition, createOnly: true }
      : {
          type: 'define-relation-type',
          package: packageId,
          relationType: definition,
          createOnly: true,
        },
  );
  if (request.useFor !== undefined) {
    commands.push(
      component
        ? { type: 'update-element', id: request.useFor, changes: { component: id } }
        : { type: 'update-relation', id: request.useFor, changes: { relationType: id } },
    );
  }
  const root = request.base === (component ? ESSENCE_ID : RELATES_TO_ID);
  const noun = component ? 'component' : 'relation type';
  return {
    command: {
      type: 'batch',
      label: `${root ? 'Define' : 'Derive'} the ${noun} "${request.name}"`,
      commands,
    },
    id,
  };
}

/**
 * The action that stops using a package: the views that nest by its relation types stop, as using it
 * made them, and the project then lists every other package it uses. The core still refuses it while
 * an element, a relation or another package's definition comes from the package.
 */
export function stopUsingPackageCommand(project: ProjectSnapshot, packageId: Id): Command {
  const file = project.packages.find((each) => each.id === packageId) ?? builtinPackage(packageId);
  const own = new Set((file?.relationTypes ?? []).map((relationType) => relationType.id));
  const views: Command[] = project.views
    .filter((view) => view.nestingRelationTypes.some((id) => own.has(id)))
    .map((view) => ({
      type: 'update-view',
      id: view.id,
      // Only what exists and nests stays listed, so that a stale entry never makes it fail.
      changes: {
        nestingRelationTypes: nestingTypesInView(project, view).filter((id) => !own.has(id)),
      },
    }));
  const stop: UpdateProjectCommand = {
    type: 'update-project',
    changes: { packages: project.project.packages.filter((id) => id !== packageId) },
  };
  if (views.length === 0) return stop;
  return {
    type: 'batch',
    label: `Stop using the package "${file?.name ?? packageId}"`,
    commands: [...views, stop],
  };
}

/** What uses a component or relation type, as the core counts it before removing one. */
export interface DefinitionUsers {
  /** The elements created from it, World included. */
  elements: Id[];
  /** The relations of it. */
  relations: Id[];
  /** The definitions that derive directly from it. */
  derived: Id[];
  /** The relation types whose own limits name it. */
  limits: Id[];
  /** The components, and the elements with an appearance of their own, that have a badge naming it. */
  badges: Id[];
  /** The views that nest by it. */
  views: Id[];
}

/**
 * What uses a definition: the elements created from it or the relations of it, the definitions
 * derived from it, the limits and badges that name it, and the views that nest by it. The core refuses
 * to remove a definition while any is left.
 */
export function usersOf(
  project: ProjectSnapshot,
  definitions: Definitions,
  id: Id,
): DefinitionUsers {
  const users: DefinitionUsers = {
    elements: [],
    relations: [],
    derived: [
      ...definitions.componentsDerivedFrom(id),
      ...definitions.relationTypesDerivedFrom(id),
    ],
    limits: [],
    badges: [],
    views: project.views.filter((view) => view.nestingRelationTypes.includes(id)).map((v) => v.id),
  };
  for (const element of [project.model.world, ...project.model.elements]) {
    if (element.component === id) users.elements.push(element.id);
    if (badgesName(element.appearance, id)) users.badges.push(element.id);
  }
  for (const relation of project.model.relations) {
    if (relation.relationType === id) users.relations.push(relation.id);
  }
  for (const [componentId, { definition }] of definitions.components) {
    if (badgesName(definition.appearance, id)) users.badges.push(componentId);
  }
  for (const [typeId, { definition }] of definitions.relationTypes) {
    if (limitsName(definition, id)) users.limits.push(typeId);
  }
  return users;
}

function badgesName(appearance: Appearance | undefined, id: Id): boolean {
  return (appearance?.detail?.badges ?? []).some(
    (badge) => badge.when === 'from-end' && badge.relationType === id,
  );
}

function limitsName(relationType: RelationType, id: Id): boolean {
  return [relationType.limits?.from, relationType.limits?.to].some(
    (limit) => Array.isArray(limit) && limit.includes(id),
  );
}
