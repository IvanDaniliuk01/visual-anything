/**
 * What a view shows of the model through its scope (ADR-0040): the elements its rules take, plus
 * those it adds, less those it leaves out; World always; and a relation while both its ends show. A
 * view without a scope shows the whole model.
 */
import type {
  Element,
  Id,
  JsonValue,
  Relation,
  Scope,
  ScopeRule,
  ViewFile,
} from '@visual-anything/schema';
import { meetsCondition } from './conditions';
import { nestingTypesInView } from './containers';
import { componentOrEssence, relationTypeOrRelatesTo, type Definitions } from './definitions';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';

/** What a view shows, worked out once for each state of the project and the view. */
export interface ShownByScope {
  /** Whether the view has a scope; without one, it shows the whole model. */
  readonly scoped: boolean;
  /** Whether the view shows this element; World always. */
  element(id: Id): boolean;
  /** Whether the view shows this relation: both its ends show, a relation end through its own ends. */
  relation(id: Id): boolean;
  /** The elements it shows, World included, in model order. */
  readonly elements: readonly Id[];
}

const WHOLE: ShownByScope = {
  scoped: false,
  element: () => true,
  relation: () => true,
  elements: [],
};

const cache = new WeakMap<ViewFile, { state: ProjectSnapshot; shown: ShownByScope }>();

/** What a view shows of the model: everything without a scope, otherwise what its scope gives. */
export function shownByScope(state: ProjectSnapshot, view: ViewFile): ShownByScope {
  const scope = view.scope;
  if (scope === undefined) {
    return {
      ...WHOLE,
      elements: [state.model.world.id, ...state.model.elements.map((element) => element.id)],
    };
  }
  const cached = cache.get(view);
  if (cached && sameInputs(cached.state, state)) return cached.shown;
  const shown = evaluate(state, view, scope);
  cache.set(view, { state, shown });
  return shown;
}

/** Whether two states hold the same model, definitions and project, which is all a scope reads. */
function sameInputs(a: ProjectSnapshot, b: ProjectSnapshot): boolean {
  return a.model === b.model && a.packages === b.packages && a.project === b.project;
}

/** Whether an element meets one rule of a scope, in a view. */
export type RuleTest = (element: Element) => boolean;

function evaluate(state: ProjectSnapshot, view: ViewFile, scope: Scope): ShownByScope {
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const tests = (rules: readonly ScopeRule[] | undefined) =>
    (rules ?? []).map((rule) => ruleTest(state, view, definitions, rule));
  const include = tests(scope.include);
  const exclude = tests(scope.exclude);
  const added = new Set(scope.added ?? []);
  const leftOut = new Set(scope.leftOut ?? []);
  const worldId = state.model.world.id;

  const shownElements = new Set<Id>([worldId]);
  for (const element of state.model.elements) {
    const byRules =
      (include.length === 0 || include.some((test) => test(element))) &&
      !exclude.some((test) => test(element));
    if ((byRules || added.has(element.id)) && !leftOut.has(element.id)) {
      shownElements.add(element.id);
    }
  }

  const relationShown = new Map<Id, boolean>();
  const relation = (id: Id, depth = 0): boolean => {
    const known = relationShown.get(id);
    if (known !== undefined) return known;
    const found = index.relation(id);
    // A chain of relations on relations deeper than this, or a cycle, shows nothing.
    if (!found || depth > 64) return false;
    const end = (end: Id) =>
      index.element(end) ? shownElements.has(end) : relation(end, depth + 1);
    const shows = end(found.from) && end(found.to);
    relationShown.set(id, shows);
    return shows;
  };

  const elements = [worldId, ...state.model.elements.map((element) => element.id)].filter((id) =>
    shownElements.has(id),
  );
  return {
    scoped: true,
    element: (id) => shownElements.has(id),
    relation: (id) => relation(id),
    elements,
  };
}

/** How one rule tests an element. */
function ruleTest(
  state: ProjectSnapshot,
  view: ViewFile,
  definitions: Definitions,
  rule: ScopeRule,
): RuleTest {
  switch (rule.kind) {
    case 'component':
      return (element) =>
        rule.exactly === true
          ? element.component === rule.component
          : componentOrEssence(definitions, element.component).lineage.includes(rule.component);
    case 'relation-type': {
      const ends = new Set<Id>();
      for (const relation of state.model.relations) {
        if (!takesRelationType(definitions, relation, rule.relationType, rule.exactly === true)) {
          continue;
        }
        ends.add(relation.from);
        ends.add(relation.to);
      }
      return (element) => ends.has(element.id);
    }
    case 'contents': {
      const inside = contentsTo(state, view, rule.container, rule.depth);
      return (element) => inside.has(element.id);
    }
    case 'attribute': {
      const wanted = rule.value ?? '';
      return (element) =>
        meetsCondition(attributeValue(definitions, element, rule.attribute), rule.test, wanted);
    }
  }
}

function takesRelationType(
  definitions: Definitions,
  relation: Relation,
  relationType: Id,
  exactly: boolean,
): boolean {
  if (exactly) return relation.relationType === relationType;
  return relationTypeOrRelatesTo(definitions, relation.relationType).lineage.includes(relationType);
}

/**
 * A container and what sits inside it through the view's nesting relation types, `depth` levels
 * down, or every level without it.
 */
function contentsTo(
  state: ProjectSnapshot,
  view: ViewFile,
  container: Id,
  depth: number | undefined,
): Set<Id> {
  const types = new Set(nestingTypesInView(state, view));
  const inside = new Map<Id, Id[]>();
  for (const relation of state.model.relations) {
    if (!types.has(relation.relationType) || relation.from === relation.to) continue;
    const list = inside.get(relation.to);
    if (list) list.push(relation.from);
    else inside.set(relation.to, [relation.from]);
  }
  const found = new Set<Id>([container]);
  let level = [container];
  for (let down = 1; level.length > 0 && (depth === undefined || down <= depth); down++) {
    const next: Id[] = [];
    for (const id of level) {
      for (const content of inside.get(id) ?? []) {
        if (found.has(content)) continue;
        found.add(content);
        next.push(content);
      }
    }
    level = next;
  }
  return found;
}

/** An element's value for an attribute: its own, or else the default its component's chain gives. */
function attributeValue(
  definitions: Definitions,
  element: Element,
  name: string,
): JsonValue | undefined {
  if (element.attributes && Object.hasOwn(element.attributes, name)) {
    return element.attributes[name];
  }
  return componentOrEssence(definitions, element.component).attributes.find(
    (attribute) => attribute.name === name,
  )?.default;
}
