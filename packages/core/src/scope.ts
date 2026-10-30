/**
 * What a view shows of the model through its scope (ADR-0040): the elements its rules take, plus
 * those it adds, less those it leaves out; World always; and a relation while both its ends show. A
 * view without a scope shows the whole model. A view also leaves out the relations of the relation
 * types it lists in `relationTypesLeftOut` (ADR 0064), but for those it nests by, and the relations
 * that end on them; it shows every element still.
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
  /**
   * Whether the view shows this relation: both its ends show, a relation end through its own ends,
   * and no relation type the view leaves out takes it, or a relation it ends on (ADR 0064).
   */
  relation(id: Id): boolean;
  /**
   * Whether the scope alone shows this relation, whatever relation types the view leaves out: what
   * tells a relation that leaves the view from one the view leaves out by its type.
   */
  relationByScope(id: Id): boolean;
  /** The elements it shows, World included, in model order. */
  readonly elements: readonly Id[];
}

const WHOLE: ShownByScope = {
  scoped: false,
  element: () => true,
  relation: () => true,
  relationByScope: () => true,
  elements: [],
};

const cache = new WeakMap<ViewFile, { state: ProjectSnapshot; shown: ShownByScope }>();

/**
 * What a view shows of the model: everything without a scope, otherwise what its scope gives; less
 * the relations of the relation types it leaves out.
 */
export function shownByScope(state: ProjectSnapshot, view: ViewFile): ShownByScope {
  const scope = view.scope;
  if (scope === undefined && !leavesOutRelationTypes(view)) {
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

/** Whether a view lists relation types it leaves out (ADR 0064). */
export function leavesOutRelationTypes(view: Pick<ViewFile, 'relationTypesLeftOut'>): boolean {
  return (view.relationTypesLeftOut?.length ?? 0) > 0;
}

/**
 * Whether a view shows less than the whole model and all its relations: it has a scope, or it leaves
 * out relation types.
 */
export function showsPart(view: Pick<ViewFile, 'scope' | 'relationTypesLeftOut'>): boolean {
  return view.scope !== undefined || leavesOutRelationTypes(view);
}

/** Which relation types a view leaves out (ADR 0064): those whose relations it does not draw. */
export interface LeftOutTypes {
  /** Whether it leaves out any. */
  readonly any: boolean;
  /** Whether it leaves out the relations of this relation type. */
  has(relationType: Id): boolean;
}

const NONE_LEFT_OUT: LeftOutTypes = { any: false, has: () => false };

const leftOutCache = new WeakMap<
  ViewFile,
  {
    packages: ProjectSnapshot['packages'];
    project: ProjectSnapshot['project'];
    types: LeftOutTypes;
  }
>();

/**
 * Which relation types a view leaves out: each it lists, with every relation type derived from it
 * unless `exactly`, but for the relation types it nests by, which draw containment, not lines.
 */
export function relationTypesLeftOutBy(state: ProjectSnapshot, view: ViewFile): LeftOutTypes {
  const listed = view.relationTypesLeftOut;
  if (listed === undefined || listed.length === 0) return NONE_LEFT_OUT;
  const cached = leftOutCache.get(view);
  if (cached && cached.packages === state.packages && cached.project === state.project) {
    return cached.types;
  }
  const definitions = definitionsIn(state);
  const nesting = new Set(nestingTypesInView(state, view));
  const exactly = new Set(
    listed.filter((each) => each.exactly === true).map((each) => each.relationType),
  );
  const withDerived = listed
    .filter((each) => each.exactly !== true)
    .map((each) => each.relationType);
  const known = new Map<Id, boolean>();
  const types: LeftOutTypes = {
    any: true,
    has: (relationType) => {
      let left = known.get(relationType);
      if (left === undefined) {
        const lineage = relationTypeOrRelatesTo(definitions, relationType).lineage;
        left =
          !nesting.has(relationType) &&
          (exactly.has(relationType) || withDerived.some((each) => lineage.includes(each)));
        known.set(relationType, left);
      }
      return left;
    },
  };
  leftOutCache.set(view, { packages: state.packages, project: state.project, types });
  return types;
}

/** Whether two states hold the same model, definitions and project, which is all a scope reads. */
function sameInputs(a: ProjectSnapshot, b: ProjectSnapshot): boolean {
  return a.model === b.model && a.packages === b.packages && a.project === b.project;
}

/** Whether an element meets one rule of a scope, in a view. */
export type RuleTest = (element: Element) => boolean;

function evaluate(state: ProjectSnapshot, view: ViewFile, scope: Scope | undefined): ShownByScope {
  const index = modelIndexOf(state);
  const worldId = state.model.world.id;
  const all = [worldId, ...state.model.elements.map((element) => element.id)];
  let shownElements: Set<Id> | undefined;
  if (scope !== undefined) {
    const definitions = definitionsIn(state);
    const tests = (rules: readonly ScopeRule[] | undefined) =>
      (rules ?? []).map((rule) => ruleTest(state, view, definitions, rule));
    const include = tests(scope.include);
    const exclude = tests(scope.exclude);
    const added = new Set(scope.added ?? []);
    const leftOut = new Set(scope.leftOut ?? []);
    const shown = new Set<Id>([worldId]);
    for (const element of state.model.elements) {
      const byRules =
        (include.length === 0 || include.some((test) => test(element))) &&
        !exclude.some((test) => test(element));
      if ((byRules || added.has(element.id)) && !leftOut.has(element.id)) shown.add(element.id);
    }
    shownElements = shown;
  }
  const elementShown = (id: Id) => shownElements === undefined || shownElements.has(id);
  const leftOutTypes = relationTypesLeftOutBy(state, view);

  /** Whether relations show, through the relations they end on: by the scope alone, or in the view. */
  const relationTest = (byType: boolean): ((id: Id) => boolean) => {
    const known = new Map<Id, boolean>();
    const relation = (id: Id, depth: number): boolean => {
      const kept = known.get(id);
      if (kept !== undefined) return kept;
      const found = index.relation(id);
      // A chain of relations on relations deeper than this, or a cycle, shows nothing.
      if (!found || depth > 64) return false;
      const end = (end: Id) => (index.element(end) ? elementShown(end) : relation(end, depth + 1));
      const shows =
        !(byType && leftOutTypes.has(found.relationType)) && end(found.from) && end(found.to);
      known.set(id, shows);
      return shows;
    };
    return (id) => relation(id, 0);
  };
  const relationByScope = shownElements === undefined ? () => true : relationTest(false);
  const relation = leftOutTypes.any ? relationTest(true) : relationByScope;

  return {
    scoped: scope !== undefined,
    element: elementShown,
    relation,
    relationByScope,
    elements: shownElements === undefined ? all : all.filter((id) => elementShown(id)),
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
        meetsCondition(
          attributeValue(definitions, element, rule.attribute),
          rule.test,
          wanted,
          componentOrEssence(definitions, element.component).attributes.find(
            (attribute) => attribute.name === rule.attribute,
          )?.format,
        );
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
