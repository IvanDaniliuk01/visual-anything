/**
 * The rules of the model: containment never forms a cycle, relation type limits only warn, and
 * deleting anything also deletes the relations that end on it.
 */
import type {
  Appearance,
  AttributeDefinition,
  Attributes,
  Id,
  RelationType,
  ScenarioFile,
  TourFile,
  ViewFile,
} from '@visual-anything/schema';
import { nestingTypesInView } from './containers';
import { appearanceOf, type Definitions } from './definitions';
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
  /**
   * Free shapes deleted with them from the view the deletion is asked from, which only flag the tour
   * steps that select them there; without that view, they flag none.
   */
  freeShapes?: readonly Id[];
}

/** A view position that a deletion removes. */
export interface RemovedPosition {
  view: Id;
  element: Id;
  container?: Id;
}

/**
 * A route a deletion removes with its relation, in a view; or one that keeps its relation and loses
 * only its bend points, because the container they are relative to is deleted (ADR 0039).
 */
export interface RemovedRoute {
  view: Id;
  relation: Id;
  /** Only its bend points go; the relation stays, and so do its attachments and style. */
  bendPointsOnly?: true;
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
  /**
   * What would leave stacking lists, each once: every id of a list whose container is deleted, which
   * goes whole, and every deleted element in the other lists.
   */
  stacking: { view: Id; container: Id; element: Id }[];
  /** The scenario steps that would become broken steps. They are kept so they can be fixed. */
  brokenSteps: { scenario: Id; step: Id }[];
  /**
   * The tour steps that would name what is deleted, as what they select, mark or focus from (ADR
   * 0058), and those that select a free shape deleted from their view. They are kept, flagged, and
   * play without it.
   */
  brokenTourSteps: { tour: Id; step: Id }[];
  /** The deleted elements that views show collapsed, which leave those views' lists. */
  collapsed: { view: Id; element: Id }[];
  /** The deleted elements that a view's scope adds or leaves out by hand, which leave those lists (ADR 0040). */
  scopes: { view: Id; list: 'added' | 'leftOut'; element: Id }[];
  /**
   * The routes views keep that go with the deleted relations, and those that lose their bend points
   * because the container they are relative to is deleted, view by view.
   */
  routes: RemovedRoute[];
  /**
   * What the deleted elements hold, directly or not, through any nesting relation type, that the
   * deletion does not already remove, in model order. None of it goes unless the deletion names it:
   * the delete dialog offers to add the rows, checked, and the others, unchecked.
   */
  contents: HeldContent[];
  /** Why the deletion cannot be done; when there is any, nothing is deleted. */
  problems: Problem[];
}

/** An element that the elements of a deletion hold, and that the deletion keeps unless asked. */
export interface HeldContent {
  element: Id;
  /**
   * `rows`: the view the deletion is previewed in draws it as a row of a deleted element, or it sits,
   * directly or not, inside such a row, and nothing outside the deletion and its rows holds it.
   * `other`: everything else, such as an element also held elsewhere.
   */
  group: 'rows' | 'other';
  /** For an `other` element held outside the deletion, one container that keeps holding it. */
  elsewhere?: Id;
}

/**
 * Previews a deletion: what it removes, what cascades, what breaks, and what the deleted elements
 * hold. `view` is the view the deletion is asked from, which tells which contents are rows.
 */
export function previewDelete(
  state: ProjectSnapshot,
  targets: DeleteTargets,
  view?: Id,
): DeletePreview {
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
    stacking: removedStacking(state.views, askedElements),
    brokenSteps: brokenSteps(state.scenarios, relations),
    brokenTourSteps: brokenTourSteps(
      state.tours,
      new Set([...askedElements, ...relations]),
      view === undefined ? undefined : { view, ids: new Set(targets.freeShapes) },
    ),
    collapsed: state.views.flatMap((each) =>
      (each.collapsed ?? [])
        .filter((id) => askedElements.has(id))
        .map((element) => ({ view: each.id, element })),
    ),
    scopes: state.views.flatMap((each) =>
      (['added', 'leftOut'] as const).flatMap((list) =>
        (each.scope?.[list] ?? [])
          .filter((id) => askedElements.has(id))
          .map((element) => ({ view: each.id, list, element })),
      ),
    ),
    routes: removedRoutes(state.views, relations, askedElements),
    contents: heldContents(
      state,
      index,
      askedElements,
      state.views.find((each) => each.id === view),
    ),
    problems,
  };
}

/** What the elements of a deletion hold, directly or not, grouped into rows and others. */
function heldContents(
  state: ProjectSnapshot,
  index: ModelIndex,
  deleted: ReadonlySet<Id>,
  view: ViewFile | undefined,
): HeldContent[] {
  const held = new Set<Id>();
  const queue = [...deleted];
  while (queue.length > 0) {
    for (const content of index.contentsOf(queue.pop() as Id)) {
      if (deleted.has(content) || held.has(content)) continue;
      held.add(content);
      queue.push(content);
    }
  }
  if (held.size === 0) return [];
  const rows = new Set<Id>();
  if (view !== undefined) {
    const definitions = definitionsIn(state);
    const types = new Set(nestingTypesInView(state, view));
    const drawsRows = (id: Id) => {
      const element = index.element(id);
      return element !== undefined && appearanceOf(element, definitions).contentsAsRows;
    };
    for (const id of held) {
      const asRow = index
        .relationsOn(id)
        .some(
          (relation) =>
            relation.from === id &&
            deleted.has(relation.to) &&
            types.has(relation.relationType) &&
            drawsRows(relation.to),
        );
      if (asRow) rows.add(id);
    }
    // What a row holds goes with it, directly or not.
    const inside = [...rows];
    while (inside.length > 0) {
      for (const content of index.contentsOf(inside.pop() as Id)) {
        if (held.has(content) && !rows.has(content)) {
          rows.add(content);
          inside.push(content);
        }
      }
    }
    // A row that something outside the deletion and its rows also holds is not one to delete.
    for (let changed = true; changed;) {
      changed = false;
      for (const id of rows) {
        if (
          index
            .containersOf(id)
            .some((container) => !deleted.has(container) && !rows.has(container))
        ) {
          rows.delete(id);
          changed = true;
        }
      }
    }
  }
  return state.model.elements
    .filter((element) => held.has(element.id))
    .map((element) => {
      if (rows.has(element.id)) return { element: element.id, group: 'rows' as const };
      const elsewhere = index
        .containersOf(element.id)
        .find((container) => !deleted.has(container) && !rows.has(container));
      return {
        element: element.id,
        group: 'other' as const,
        ...(elsewhere === undefined ? {} : { elsewhere }),
      };
    });
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

function removedStacking(
  views: readonly ViewFile[],
  elements: ReadonlySet<Id>,
): { view: Id; container: Id; element: Id }[] {
  const removed: { view: Id; container: Id; element: Id }[] = [];
  for (const view of views) {
    for (const [container, list] of Object.entries(view.stackingOrder ?? {})) {
      const whole = elements.has(container);
      for (const element of list) {
        if (whole || elements.has(element)) removed.push({ view: view.id, container, element });
      }
    }
  }
  return removed;
}

function removedRoutes(
  views: readonly ViewFile[],
  relations: ReadonlySet<Id>,
  elements: ReadonlySet<Id>,
): RemovedRoute[] {
  const removed: RemovedRoute[] = [];
  for (const view of views) {
    for (const [relation, route] of Object.entries(view.routes ?? {})) {
      if (relations.has(relation)) {
        removed.push({ view: view.id, relation });
      } else if (
        route.bendPoints !== undefined &&
        route.container !== undefined &&
        elements.has(route.container)
      ) {
        removed.push({ view: view.id, relation, bendPointsOnly: true });
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
 * The tour steps that select, mark or focus from any of the deleted ids, and those that select one of
 * the free shapes deleted from their view.
 */
function brokenTourSteps(
  tours: readonly TourFile[],
  deleted: ReadonlySet<Id>,
  freeShapes: { view: Id; ids: ReadonlySet<Id> } | undefined,
): { tour: Id; step: Id }[] {
  const broken: { tour: Id; step: Id }[] = [];
  for (const tour of tours) {
    for (const step of tour.steps) {
      const { viewState } = step;
      const named = [
        ...(viewState.select ?? []),
        ...(step.marks ?? []),
        ...(viewState.focus?.from ?? []),
      ];
      const shapes = viewState.view === freeShapes?.view ? freeShapes.ids : undefined;
      if (
        named.some((id) => deleted.has(id)) ||
        (shapes !== undefined && (viewState.select ?? []).some((id) => shapes.has(id)))
      ) {
        broken.push({ tour: tour.id, step: step.id });
      }
    }
  }
  return broken;
}

/**
 * What keeps a package from being dropped from the project: the elements and relations created from
 * its definitions; the definitions of other packages that derive from them, or whose limits or
 * badges name them; the elements whose own appearance has a badge that names them; and the views
 * that nest by its relation types.
 */
export function packageUsers(state: ProjectSnapshot, packageId: Id): Id[] {
  const definitions = definitionsIn(state);
  const users: Id[] = [];
  const definedHere = (defined: { package: Id } | undefined) => defined?.package === packageId;
  const own = new Set<Id>(
    [...definitions.components, ...definitions.relationTypes]
      .filter(([, defined]) => defined.package === packageId)
      .map(([id]) => id),
  );
  for (const element of [state.model.world, ...state.model.elements]) {
    if (
      definedHere(definitions.components.get(element.component)) ||
      badgesName(element.appearance, own)
    ) {
      users.push(element.id);
    }
  }
  for (const relation of state.model.relations) {
    if (definedHere(definitions.relationTypes.get(relation.relationType))) users.push(relation.id);
  }
  for (const [id, defined] of definitions.components) {
    if (defined.package === packageId) continue;
    const parent = definitions.components.get(defined.definition.derivesFrom);
    if (definedHere(parent) || badgesName(defined.definition.appearance, own)) users.push(id);
  }
  for (const [id, defined] of definitions.relationTypes) {
    if (defined.package === packageId) continue;
    const parent = definitions.relationTypes.get(defined.definition.derivesFrom);
    if (definedHere(parent) || limitsName(defined.definition, own)) users.push(id);
  }
  for (const view of state.views) {
    if (view.nestingRelationTypes.some((type) => own.has(type))) users.push(view.id);
  }
  return users;
}

/** Whether an appearance has a from-end badge naming one of `ids`. */
function badgesName(appearance: Appearance | undefined, ids: ReadonlySet<Id>): boolean {
  return (appearance?.detail?.badges ?? []).some(
    (badge) => badge.when === 'from-end' && ids.has(badge.relationType),
  );
}

/** Whether a relation type's own limits name one of `ids`. */
function limitsName(relationType: RelationType, ids: ReadonlySet<Id>): boolean {
  return [relationType.limits?.from, relationType.limits?.to].some(
    (limit) => Array.isArray(limit) && limit.some((id) => ids.has(id)),
  );
}

/** What keeps a component or relation type from being removed. */
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
 * What keeps a definition from going: the elements created from it or the relations of it, the
 * definitions derived from it, the limits and badges that name it, and the views that nest by it.
 * Removing a definition is refused while any is left, because removing it would silently change
 * what they say: an emptied limit would allow anything.
 */
export function usersOfDefinition(state: ProjectSnapshot, id: Id): DefinitionUsers {
  const definitions = definitionsIn(state);
  const ids = new Set([id]);
  const users: DefinitionUsers = {
    elements: [],
    relations: [],
    derived: [
      ...definitions.componentsDerivedFrom(id),
      ...definitions.relationTypesDerivedFrom(id),
    ],
    limits: [],
    badges: [],
    views: state.views.filter((view) => view.nestingRelationTypes.includes(id)).map((v) => v.id),
  };
  for (const element of [state.model.world, ...state.model.elements]) {
    if (element.component === id) users.elements.push(element.id);
    if (badgesName(element.appearance, ids)) users.badges.push(element.id);
  }
  for (const relation of state.model.relations) {
    if (relation.relationType === id) users.relations.push(relation.id);
  }
  for (const [componentId, defined] of definitions.components) {
    if (badgesName(defined.definition.appearance, ids)) users.badges.push(componentId);
  }
  for (const [typeId, defined] of definitions.relationTypes) {
    if (limitsName(defined.definition, ids)) users.limits.push(typeId);
  }
  return users;
}

/** Every id among a definition's users. */
export function allUsers(users: DefinitionUsers): Id[] {
  return [
    ...users.elements,
    ...users.relations,
    ...users.derived,
    ...users.limits,
    ...users.badges,
    ...users.views,
  ];
}

/**
 * Warnings for the attribute values of an element or relation that are outside the choices its
 * definitions give, each in words.
 */
export function choiceWarnings(
  item: { id: Id; name?: string; attributes?: Attributes },
  attributes: readonly AttributeDefinition[],
): Problem[] {
  const warnings: Problem[] = [];
  const values = item.attributes ?? {};
  for (const attribute of attributes) {
    if (attribute.choices === undefined || !Object.hasOwn(values, attribute.name)) continue;
    const value = values[attribute.name];
    if (typeof value === 'string' && attribute.choices.includes(value)) continue;
    warnings.push(
      problem(
        'choice-broken',
        `"${item.name ?? item.id}" has ${JSON.stringify(value)} for "${attribute.name}", which is not one of its choices.`,
        [item.id],
      ),
    );
  }
  return warnings;
}

/** How many warnings of one kind an action or a check gives before a summary of the rest. */
export const WARNINGS_SHOWN = 20;

/**
 * At most 20 warnings, followed by one that sums up the rest, such as "…and 37 more relations break
 * limits", when there are more.
 */
export function cappedWarnings(
  warnings: readonly Problem[],
  code: Problem['code'],
  rest: (count: number) => string,
): Problem[] {
  if (warnings.length <= WARNINGS_SHOWN) return [...warnings];
  return [
    ...warnings.slice(0, WARNINGS_SHOWN),
    problem(code, rest(warnings.length - WARNINGS_SHOWN)),
  ];
}
