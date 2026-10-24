/**
 * The rules of the model: containment never forms a cycle, relation type limits only warn, and
 * deleting anything also deletes the relations that end on it.
 */
import type { Id, ScenarioFile, ViewFile } from '@visual-anything/schema';
import type { Definitions } from './definitions';
import type { ModelIndex } from './model-index';
import { problem, type Problem } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { modelIndexOf, definitionsIn } from './state';

/** Whether placing `content` inside `container` would make containment form a cycle. */
export function wouldFormCycle(index: ModelIndex, content: Id, container: Id): boolean {
  // A cycle forms when the container already sits inside the content, directly or not.
  const stack = [container];
  const seen = new Set<Id>();
  while (stack.length > 0) {
    const id = stack.pop() as Id;
    if (id === content) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...index.containersOf(id));
  }
  return false;
}

/** The containment cycles in a model, each as the elements that contain each other. */
export function containmentCycles(index: ModelIndex, elements: readonly Id[]): Id[][] {
  const cycles: Id[][] = [];
  const state = new Map<Id, 'open' | 'done'>();
  const path: Id[] = [];
  const visit = (id: Id): void => {
    state.set(id, 'open');
    path.push(id);
    for (const container of index.containersOf(id)) {
      const seen = state.get(container);
      if (seen === 'open') cycles.push(path.slice(path.indexOf(container)));
      else if (seen === undefined) visit(container);
    }
    path.pop();
    state.set(id, 'done');
  };
  for (const id of elements) if (!state.has(id)) visit(id);
  return cycles;
}

/** The warnings a relation earns by breaking the limits of its relation type. */
export function limitWarnings(
  relation: { relationType: Id; from: Id; to: Id },
  index: ModelIndex,
  definitions: Definitions,
): Problem[] {
  const type = definitions.relationType(relation.relationType);
  if (!type) return [];
  const warnings: Problem[] = [];
  for (const end of ['from', 'to'] as const) {
    const allowed = type.limits[end];
    const id = relation[end];
    if (!allowed || keepsWithin(id, allowed, index, definitions)) continue;
    const names = allowed.map((ancestor) => `"${definitionName(ancestor, definitions)}"`);
    warnings.push(
      problem(
        'limit-broken',
        `"${type.name}" expects its ${end} end to be ${names.join(' or ')}, but "${endName(id, index)}" is not.`,
        [id],
      ),
    );
  }
  return warnings;
}

function keepsWithin(
  id: Id,
  allowed: readonly Id[],
  index: ModelIndex,
  definitions: Definitions,
): boolean {
  const element = index.element(id);
  if (element) {
    return allowed.some((ancestor) => definitions.componentDerives(element.component, ancestor));
  }
  const relation = index.relation(id);
  if (relation) {
    return allowed.some((ancestor) =>
      definitions.relationTypeDerives(relation.relationType, ancestor),
    );
  }
  return true;
}

function definitionName(id: Id, definitions: Definitions): string {
  return definitions.component(id)?.name ?? definitions.relationType(id)?.name ?? id;
}

/** The name of an element or relation, to show in messages. */
export function endName(id: Id, index: ModelIndex): string {
  const element = index.element(id);
  if (element) return element.name;
  const relation = index.relation(id);
  return relation?.name ?? id;
}

/** What a deletion asks for. */
export interface DeleteTargets {
  elements?: readonly Id[];
  relations?: readonly Id[];
}

/** A view position that a deletion removes. */
export interface RemovedPosition {
  view: Id;
  element: Id;
  container?: Id;
}

/** Everything a deletion would remove or break, shown before anything is deleted. */
export interface DeletePreview {
  /** The elements that would be deleted, in model order. */
  elements: Id[];
  /** The relations that would be deleted, in model order: those asked for and those that cascade. */
  relations: Id[];
  /** The relations deleted only because they end on something deleted. */
  cascaded: Id[];
  /** The view positions that would go, because their element or its container is deleted. */
  positions: RemovedPosition[];
  /** The scenario steps that would become broken steps. They are kept so they can be fixed. */
  brokenSteps: { scenario: Id; step: Id }[];
  /** Why the deletion cannot be done; when there is any, nothing is deleted. */
  problems: Problem[];
}

/** Previews a deletion: what it removes, what cascades, and what breaks. */
export function previewDelete(state: ProjectSnapshot, targets: DeleteTargets): DeletePreview {
  const index = modelIndexOf(state);
  const problems: Problem[] = [];
  const askedElements = new Set<Id>();
  const askedRelations = new Set<Id>();

  for (const id of targets.elements ?? []) {
    if (id === index.world.id) {
      problems.push(problem('world-not-allowed', 'World cannot be deleted.', [id]));
    } else if (!index.element(id)) {
      problems.push(problem('unknown-element', `There is no element "${id}".`, [id]));
    } else {
      askedElements.add(id);
    }
  }
  for (const id of targets.relations ?? []) {
    if (index.relation(id)) askedRelations.add(id);
    else problems.push(problem('unknown-relation', `There is no relation "${id}".`, [id]));
  }

  const relations = new Set(askedRelations);
  const queue: Id[] = [...askedElements, ...askedRelations];
  while (queue.length > 0) {
    const id = queue.pop() as Id;
    for (const relation of index.relationsOn(id)) {
      if (!relations.has(relation.id)) {
        relations.add(relation.id);
        queue.push(relation.id);
      }
    }
  }

  const elementIds = state.model.elements
    .map((element) => element.id)
    .filter((id) => askedElements.has(id));
  const relationIds = state.model.relations
    .map((relation) => relation.id)
    .filter((id) => relations.has(id));

  return {
    elements: elementIds,
    relations: relationIds,
    cascaded: relationIds.filter((id) => !askedRelations.has(id)),
    positions: removedPositions(state.views, askedElements),
    brokenSteps: brokenSteps(state.scenarios, relations),
    problems,
  };
}

function removedPositions(
  views: readonly ViewFile[],
  elements: ReadonlySet<Id>,
): RemovedPosition[] {
  const removed: RemovedPosition[] = [];
  for (const view of views) {
    for (const position of view.positions) {
      const containerGoes = position.container !== undefined && elements.has(position.container);
      if (elements.has(position.element) || containerGoes) {
        removed.push({
          view: view.id,
          element: position.element,
          ...(position.container === undefined ? {} : { container: position.container }),
        });
      }
    }
  }
  return removed;
}

function brokenSteps(
  scenarios: readonly ScenarioFile[],
  relations: ReadonlySet<Id>,
): { scenario: Id; step: Id }[] {
  const broken: { scenario: Id; step: Id }[] = [];
  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      if (step.relations.some((id) => relations.has(id))) {
        broken.push({ scenario: scenario.id, step: step.id });
      }
    }
  }
  return broken;
}

/**
 * What keeps a package from being dropped from the project: the elements and relations created from
 * its definitions, and the definitions of other packages that derive from them.
 */
export function packageUsers(state: ProjectSnapshot, packageId: Id): Id[] {
  const definitions = definitionsIn(state);
  const users: Id[] = [];
  const definedHere = (defined: { package: Id } | undefined) => defined?.package === packageId;
  for (const element of [state.model.world, ...state.model.elements]) {
    if (definedHere(definitions.components.get(element.component))) users.push(element.id);
  }
  for (const relation of state.model.relations) {
    if (definedHere(definitions.relationTypes.get(relation.relationType))) users.push(relation.id);
  }
  for (const [id, defined] of definitions.components) {
    const parent = definitions.components.get(defined.definition.derivesFrom);
    if (defined.package !== packageId && definedHere(parent)) users.push(id);
  }
  for (const [id, defined] of definitions.relationTypes) {
    const parent = definitions.relationTypes.get(defined.definition.derivesFrom);
    if (defined.package !== packageId && definedHere(parent)) users.push(id);
  }
  return users;
}
