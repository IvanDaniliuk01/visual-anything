/**
 * Exploring a view without changing it: filters hide shapes by component, relation type or attribute,
 * and focus mode dims, or with isolate hides, everything the selection does not reach within some
 * degrees, in a direction. Nothing here moves a shape or changes the project: it only works out the
 * emphasis the canvas draws (`editor/emphasis.ts`), by the keys the scene uses: an element shape's
 * key, a relation's id, a free shape's id.
 *
 * Two rules keep the drawing honest (ADR-0025):
 * - a relation is shown only while both its ends are, so no line ends in empty canvas;
 * - a container that holds a shape still shown is kept, dimmed, so that nothing shown seems to sit
 *   outside its container, as ADR-0021 asks of the canvas.
 */
import {
  componentOrEssence,
  definitionsOf,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  AttributeDefinition,
  Attributes,
  Id,
  JsonValue,
  Relation,
  ViewFile,
} from '@visual-anything/schema';
import type { Emphasis } from '../editor/emphasis';
import { t } from '../i18n';
import type { ElementShape, Scene } from './scene';

/** How an attribute's value is tested. */
export type AttributeTest = 'is' | 'is-not' | 'contains' | 'below' | 'above' | 'set' | 'unset';

/** The tests, in the order the filters offer them, with how they read in English. */
export const ATTRIBUTE_TESTS: readonly { test: AttributeTest; name: string }[] = [
  { test: 'is', name: 'is' },
  { test: 'is-not', name: 'is not' },
  { test: 'contains', name: 'contains' },
  { test: 'below', name: 'is less than' },
  { test: 'above', name: 'is more than' },
  { test: 'set', name: 'has a value' },
  { test: 'unset', name: 'has no value' },
];

/** A condition on an attribute that elements, or relations, must meet to stay shown. */
export interface AttributeCondition {
  of: 'elements' | 'relations';
  attribute: string;
  test: AttributeTest;
  /** What the value is compared with, as typed; `set` and `unset` do not use it. */
  value: string;
}

/** What the filters hide: components and relation types by id, and what fails a condition. */
export interface Filters {
  /** The components whose elements are hidden: the component each one is created from. */
  components: ReadonlySet<Id>;
  /** The relation types whose relations are hidden. */
  relationTypes: ReadonlySet<Id>;
  /** Conditions that every element, or every relation, must meet to stay shown. */
  conditions: readonly AttributeCondition[];
}

export const NO_FILTERS: Filters = {
  components: new Set(),
  relationTypes: new Set(),
  conditions: [],
};

/** Which way focus follows relations: from what it reached to what they point to, back, or both. */
export type FocusDirection = 'both' | 'outgoing' | 'incoming';

/** How far focus reaches, and what it does with the rest. */
export interface FocusSettings {
  /** How many relations away it reaches; `ALL_DEGREES` for as far as relations go. */
  degrees: number;
  direction: FocusDirection;
  /** Hides what it does not reach, instead of dimming it. */
  isolate: boolean;
}

/** As many degrees as there are: everything the selection reaches, however far. */
export const ALL_DEGREES = Number.POSITIVE_INFINITY;

/** What focus starts from: elements and relations, as the selection holds them. */
export interface FocusTargets {
  elements: ReadonlySet<Id>;
  relations: ReadonlySet<Id>;
}

/** Whether a condition can be tested: it names an attribute, and a value when its test needs one. */
export function isComplete(condition: AttributeCondition): boolean {
  if (condition.attribute.trim() === '') return false;
  return condition.test === 'set' || condition.test === 'unset' || condition.value.trim() !== '';
}

/** Whether filters hide anything at all. */
export function isFiltering(filters: Filters): boolean {
  return (
    filters.components.size > 0 ||
    filters.relationTypes.size > 0 ||
    filters.conditions.some(isComplete)
  );
}

/** What filters do with a shape, by its index. */
const HIDDEN = 0;
const SHOWN = 1;
/** Kept, dimmed, only because it holds a shape still shown. */
const KEPT = 2;

/** What filters hide and dim in a scene, and how many element shapes and relations they hide. */
export interface FilterResult {
  hidden: Set<string>;
  /** The containers kept only because they hold a shape still shown. */
  dimmed: Set<string>;
  hiddenShapes: number;
  hiddenRelations: number;
}

/**
 * What the filters hide in a scene. An element's shapes are hidden when its component is, or when it
 * fails a condition on elements; a container that holds a shape still shown is kept, dimmed. A
 * relation is hidden when its relation type is, when it fails a condition on relations, or when
 * either end is hidden or kept only for what it holds. Free shapes are never hidden.
 */
export function applyFilters(
  scene: Scene,
  project: ProjectSnapshot,
  filters: Filters,
): FilterResult {
  const hidden = new Set<string>();
  const dimmed = new Set<string>();
  if (!isFiltering(filters)) return { hidden, dimmed, hiddenShapes: 0, hiddenRelations: 0 };
  const definitions = definitionsOf(project.packages);
  const index = modelIndexOf(project);
  const conditions = filters.conditions.filter(isComplete);
  const onElements = conditions.filter((condition) => condition.of === 'elements');
  const onRelations = conditions.filter((condition) => condition.of === 'relations');
  const componentDefaults = defaultsBy((id) => definitions.component(id)?.attributes);
  const typeDefaults = defaultsBy((id) => definitions.relationType(id)?.attributes);

  const keptElements = new Map<Id, boolean>();
  const keeps = (element: Id): boolean => {
    let kept = keptElements.get(element);
    if (kept === undefined) {
      const found = index.element(element);
      kept =
        found !== undefined &&
        !filters.components.has(found.component) &&
        meetsAll(onElements, found.attributes, componentDefaults(found.component));
      keptElements.set(element, kept);
    }
    return kept;
  };

  const { containerAt, drawn } = exploreIndexOf(scene, project);
  const { shapes } = scene;
  // Each shape, by its index: hidden, shown, or kept for what it holds.
  const state = new Uint8Array(shapes.length);
  shapes.forEach((shape, at) => {
    if (keeps(shape.element)) state[at] = SHOWN;
  });
  // The containers of what stays shown stay too, dimmed.
  for (let at = 0; at < shapes.length; at++) {
    if (state[at] !== SHOWN) continue;
    for (let up = containerAt[at] as number; up >= 0 && state[up] === HIDDEN;) {
      state[up] = KEPT;
      up = containerAt[up] as number;
    }
  }
  let hiddenShapes = 0;
  shapes.forEach((shape, at) => {
    if (state[at] === KEPT) {
      dimmed.add(shape.key);
    } else if (state[at] === HIDDEN) {
      hidden.add(shape.key);
      hiddenShapes += 1;
    }
  });

  const shownRelations = new Map<Id, boolean>();
  const endShown = (end: Id): boolean => (drawn.has(end) ? shows(end) : keeps(end));
  const shows = (id: Id): boolean => {
    const known = shownRelations.get(id);
    if (known !== undefined) return known;
    // A relation the scene draws never ends, through others, on itself; this only guards the walk.
    shownRelations.set(id, false);
    const relation = drawn.get(id)?.relation;
    const shown =
      relation === undefined ||
      (!filters.relationTypes.has(relation.relationType) &&
        meetsAll(onRelations, relation.attributes, typeDefaults(relation.relationType)) &&
        endShown(relation.from) &&
        endShown(relation.to));
    shownRelations.set(id, shown);
    return shown;
  };
  let hiddenRelations = 0;
  for (const line of scene.relations) {
    if (shows(line.relation)) continue;
    hidden.add(line.relation);
    hiddenRelations += 1;
  }
  return { hidden, dimmed, hiddenShapes, hiddenRelations };
}

/** The emphasis of the filters; undefined while they hide nothing. */
export function filterEmphasis(result: FilterResult): Emphasis | undefined {
  if (result.hidden.size === 0 && result.dimmed.size === 0) return undefined;
  return {
    ...(result.hidden.size > 0 ? { hidden: result.hidden } : {}),
    ...(result.dimmed.size > 0 ? { dimmed: result.dimmed } : {}),
  };
}

/** Whether a value meets a test: text without minding case or the spaces around it, numbers as numbers. */
export function meetsCondition(
  value: JsonValue | undefined,
  test: AttributeTest,
  wanted: string,
): boolean {
  const present = value !== undefined && value !== null && value !== '';
  switch (test) {
    case 'set':
      return present;
    case 'unset':
      return !present;
    case 'is':
      return present && equals(value, wanted);
    case 'is-not':
      return !present || !equals(value, wanted);
    case 'contains':
      return present && textOf(value).toLowerCase().includes(wanted.trim().toLowerCase());
    case 'below':
    case 'above': {
      const number = value === undefined ? undefined : numberOf(value);
      const limit = numberOf(wanted);
      if (number === undefined || limit === undefined) return false;
      return test === 'below' ? number < limit : number > limit;
    }
  }
}

/**
 * The elements and relations that focus reaches from its targets: those the view draws, then, degree
 * by degree, along the relations the filters leave, the far end of each relation in the chosen
 * direction. A relation with no direction leads both ways. A relation reached, or focused on, leads
 * to its own ends as well, so a relation selected brings its ends one degree away. Relations between
 * two things reached are reached too, though the walk did not go along them.
 */
export function reachedFrom(
  scene: Scene,
  project: ProjectSnapshot,
  targets: FocusTargets,
  settings: FocusSettings,
  hidden?: ReadonlySet<string>,
): { elements: Set<Id>; relations: Set<Id> } {
  const { shapesOf, drawn, incident } = exploreIndexOf(scene, project);
  const outgoing = settings.direction !== 'incoming';
  const incoming = settings.direction !== 'outgoing';
  const elements = new Set<Id>();
  const relations = new Set<Id>();
  const isReached = (id: Id) => elements.has(id) || relations.has(id);
  const shown = (id: Id) => {
    for (const at of shapesOf.get(id) ?? []) {
      if (!hidden?.has((scene.shapes[at] as ElementShape).key)) return true;
    }
    return false;
  };
  // Reaches an element with a shape the filters leave, or a relation they leave; false when it was
  // reached already or cannot be.
  const reach = (id: Id): boolean => {
    if (drawn.has(id)) {
      if (relations.has(id) || hidden?.has(id)) return false;
      relations.add(id);
      return true;
    }
    if (elements.has(id) || !shown(id)) return false;
    elements.add(id);
    return true;
  };

  let frontier = [...targets.elements, ...targets.relations].filter(reach);
  for (let degree = 0; degree < settings.degrees && frontier.length > 0; degree++) {
    const next: Id[] = [];
    const go = (id: Id) => {
      if (reach(id)) next.push(id);
    };
    for (const id of frontier) {
      for (const via of incident.get(id) ?? []) {
        const { relation, undirected } = drawn.get(via) as DrawnRelation;
        const forward = relation.from === id && (outgoing || undirected);
        const backward = relation.to === id && (incoming || undirected);
        if (!forward && !backward) continue;
        if (hidden?.has(via)) continue;
        go(via);
        if (forward) go(relation.to);
        if (backward) go(relation.from);
      }
      // A relation leads to its own ends too.
      const own = drawn.get(id);
      if (own) {
        if (outgoing || own.undirected) go(own.relation.to);
        if (incoming || own.undirected) go(own.relation.from);
      }
    }
    frontier = next;
  }

  // The relations between two things reached, and those that end on them, come too.
  const pending = [...elements, ...relations];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const via of incident.get(id) ?? []) {
      if (relations.has(via) || hidden?.has(via)) continue;
      const { relation } = drawn.get(via) as DrawnRelation;
      if (isReached(relation.from === id ? relation.to : relation.from)) {
        relations.add(via);
        pending.push(via);
      }
    }
  }
  return { elements, relations };
}

/**
 * What focus dims, or with isolate hides: every element shape, relation and free shape it does not
 * reach, but what the filters already hide. Isolating keeps the containers of what it reaches,
 * dimmed. Undefined while it reaches nothing the view draws.
 */
export function focusEmphasis(
  scene: Scene,
  project: ProjectSnapshot,
  targets: FocusTargets,
  settings: FocusSettings,
  hidden?: ReadonlySet<string>,
): Emphasis | undefined {
  const reached = reachedFrom(scene, project, targets, settings, hidden);
  if (reached.elements.size === 0 && reached.relations.size === 0) return undefined;
  const { shapes } = scene;
  // Isolating keeps the containers of what it reaches, by their index.
  const kept = new Uint8Array(shapes.length);
  if (settings.isolate) {
    const { shapesOf, containerAt } = exploreIndexOf(scene, project);
    for (const element of reached.elements) {
      for (const at of shapesOf.get(element) ?? []) {
        for (let up = containerAt[at] as number; up >= 0 && kept[up] === 0;) {
          kept[up] = 1;
          up = containerAt[up] as number;
        }
      }
    }
  }
  const outside = new Set<string>();
  const dimmed = new Set<string>();
  const leaveOut = (key: string) => {
    if (!hidden?.has(key)) outside.add(key);
  };
  shapes.forEach((shape, at) => {
    if (reached.elements.has(shape.element) || hidden?.has(shape.key)) return;
    if (kept[at] === 1) dimmed.add(shape.key);
    else outside.add(shape.key);
  });
  for (const line of scene.relations) {
    if (!reached.relations.has(line.relation)) leaveOut(line.relation);
  }
  for (const note of scene.notes) leaveOut(note.id);
  for (const arrow of scene.arrows) leaveOut(arrow.id);
  if (!settings.isolate) return outside.size > 0 ? { dimmed: outside } : undefined;
  return {
    ...(outside.size > 0 ? { hidden: outside } : {}),
    ...(dimmed.size > 0 ? { dimmed } : {}),
  };
}

/** One of the components or relation types a view draws, with how many it draws. */
export interface FilterChoice {
  id: Id;
  name: string;
  count: number;
}

/** What the filters can choose from in a view. */
export interface FilterChoices {
  /** The components its elements are created from, by name. */
  components: FilterChoice[];
  /** The relation types of the relations it draws, by name. */
  relationTypes: FilterChoice[];
  /** The attributes its elements and relations have, defined by their chains or their own, by name. */
  attributes: { elements: string[]; relations: string[] };
}

/** The components, relation types and attributes a view draws, for the filters to offer. */
export function filterChoices(scene: Scene, project: ProjectSnapshot): FilterChoices {
  const definitions = definitionsOf(project.packages);
  const index = modelIndexOf(project);
  const components = new Map<Id, number>();
  const elementAttributes = new Set<string>();
  const seen = new Set<Id>();
  for (const shape of scene.shapes) {
    if (seen.has(shape.element)) continue;
    seen.add(shape.element);
    const element = index.element(shape.element);
    if (!element) continue;
    components.set(element.component, (components.get(element.component) ?? 0) + 1);
    for (const name of Object.keys(element.attributes ?? {})) elementAttributes.add(name);
  }
  for (const id of components.keys()) {
    for (const each of definitions.component(id)?.attributes ?? [])
      elementAttributes.add(each.name);
  }
  const relationTypes = new Map<Id, number>();
  const relationAttributes = new Set<string>();
  for (const line of scene.relations) {
    const relation = index.relation(line.relation);
    if (!relation) continue;
    relationTypes.set(relation.relationType, (relationTypes.get(relation.relationType) ?? 0) + 1);
    for (const name of Object.keys(relation.attributes ?? {})) relationAttributes.add(name);
  }
  for (const id of relationTypes.keys()) {
    for (const each of definitions.relationType(id)?.attributes ?? []) {
      relationAttributes.add(each.name);
    }
  }
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const names = (set: Set<string>) => [...set].sort((a, b) => byName({ name: a }, { name: b }));
  return {
    components: [...components]
      .map(([id, count]) => ({ id, name: componentOrEssence(definitions, id).name, count }))
      .sort(byName),
    relationTypes: [...relationTypes]
      .map(([id, count]) => ({ id, name: relationTypeOrRelatesTo(definitions, id).name, count }))
      .sort(byName),
    attributes: { elements: names(elementAttributes), relations: names(relationAttributes) },
  };
}

/**
 * How the perspective switcher names a view: by its perspective, then by its own name when that says
 * more. In v0.1 every view shows the whole model, so every view is one of the same part of it.
 */
export function perspectiveOption(view: Pick<ViewFile, 'name' | 'perspective'>): string {
  const perspective = view.perspective.name;
  return perspective.trim().toLowerCase() === view.name.trim().toLowerCase()
    ? perspective
    : `${perspective} — ${view.name}`;
}

/** One end of a relation, as following it goes there: an element's shape, or a relation's line. */
export interface FollowedEnd {
  /** The element or relation at that end. */
  id: Id;
  kind: 'element' | 'relation';
  name: string;
  /** The key of the shape to show: the element's first shown shape, or the relation's id. */
  key: string;
}

/**
 * The two ends of a relation the view draws, as following it reaches them: an element through its
 * first shape the emphasis does not hide, a relation through its line. An end the view does not draw,
 * or hides, is left out.
 */
export function endsOf(
  scene: Scene,
  project: ProjectSnapshot,
  relationId: Id,
  hidden?: ReadonlySet<string>,
): { from?: FollowedEnd; to?: FollowedEnd } {
  const { shapesOf, drawn } = exploreIndexOf(scene, project);
  const relation = drawn.get(relationId)?.relation;
  if (!relation) return {};
  const endOf = (id: Id): FollowedEnd | undefined => {
    const line = drawn.get(id);
    if (line) {
      if (hidden?.has(id)) return undefined;
      return { id, kind: 'relation', name: line.relation.name ?? t('the relation'), key: id };
    }
    const shape = (shapesOf.get(id) ?? [])
      .map((at) => scene.shapes[at] as ElementShape)
      .find((each) => !hidden?.has(each.key));
    if (!shape) return undefined;
    return { id, kind: 'element', name: shape.name, key: shape.key };
  };
  const from = endOf(relation.from);
  const to = endOf(relation.to);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** A relation the scene draws, as it is in the model, and whether it has no direction. */
interface DrawnRelation {
  relation: Relation;
  undirected: boolean;
}

/** What exploring a scene looks up again and again: worked out once for each scene. */
interface ExploreIndex {
  /** The indexes in `scene.shapes` of each element's shapes, in containment order. */
  shapesOf: ReadonlyMap<Id, readonly number[]>;
  /** The index of the container shape each shape sits in, by its index; -1 directly in World. */
  containerAt: Int32Array;
  /** The relations the scene draws, by id. */
  drawn: ReadonlyMap<Id, DrawnRelation>;
  /** The relations the scene draws that have an end on each element or relation, by its id. */
  incident: ReadonlyMap<Id, readonly Id[]>;
}

const exploreIndexes = new WeakMap<
  Scene,
  { model: ProjectSnapshot['model']; packages: ProjectSnapshot['packages']; index: ExploreIndex }
>();

/** The explore index of a scene of a project; the same one while neither changes. */
function exploreIndexOf(scene: Scene, project: ProjectSnapshot): ExploreIndex {
  const cached = exploreIndexes.get(scene);
  if (cached?.model === project.model && cached.packages === project.packages) return cached.index;
  const definitions = definitionsOf(project.packages);
  const model = modelIndexOf(project);
  const shapesOf = new Map<Id, number[]>();
  const atKey = new Map<string, number>();
  scene.shapes.forEach((shape, at) => {
    append(shapesOf, shape.element, at);
    atKey.set(shape.key, at);
  });
  const containerAt = new Int32Array(scene.shapes.length);
  scene.shapes.forEach((shape, at) => {
    const container = shape.containerShape;
    containerAt[at] = container === undefined ? -1 : (atKey.get(container) ?? -1);
  });
  const drawn = new Map<Id, DrawnRelation>();
  const incident = new Map<Id, Id[]>();
  for (const line of scene.relations) {
    const relation = model.relation(line.relation);
    if (!relation) continue;
    const undirected =
      relationTypeOrRelatesTo(definitions, relation.relationType).direction === 'undirected';
    drawn.set(relation.id, { relation, undirected });
    append(incident, relation.from, relation.id);
    if (relation.to !== relation.from) append(incident, relation.to, relation.id);
  }
  const index: ExploreIndex = { shapesOf, containerAt, drawn, incident };
  exploreIndexes.set(scene, { model: project.model, packages: project.packages, index });
  return index;
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Whether attributes meet every condition, with a definition's default for a value not set. */
function meetsAll(
  conditions: readonly AttributeCondition[],
  own: Attributes | undefined,
  defaults: ReadonlyMap<string, JsonValue>,
): boolean {
  return conditions.every((condition) => {
    const value =
      own && Object.hasOwn(own, condition.attribute)
        ? own[condition.attribute]
        : defaults.get(condition.attribute);
    return meetsCondition(value, condition.test, condition.value);
  });
}

/** The defaults a definition's chain gives its attributes, worked out once for each definition. */
function defaultsBy(
  attributesOf: (id: Id) => readonly AttributeDefinition[] | undefined,
): (id: Id) => ReadonlyMap<string, JsonValue> {
  const known = new Map<Id, Map<string, JsonValue>>();
  return (id) => {
    let defaults = known.get(id);
    if (!defaults) {
      defaults = new Map();
      for (const definition of attributesOf(id) ?? []) {
        if (definition.default !== undefined) defaults.set(definition.name, definition.default);
      }
      known.set(id, defaults);
    }
    return defaults;
  };
}

function equals(value: JsonValue, wanted: string): boolean {
  const number = numberOf(value);
  const other = numberOf(wanted);
  if (number !== undefined && other !== undefined) return number === other;
  return textOf(value).trim().toLowerCase() === wanted.trim().toLowerCase();
}

function textOf(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function numberOf(value: JsonValue | string): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
