/**
 * What a hook of package code is given (ADR 0054): a copy of the element and of what lies around it,
 * as plain data, which the sandbox freezes before the code sees it. Only through `model:read` can the
 * code read more, through a {@link ModelReader}.
 */
import type {
  AttributeDefinition,
  Attributes,
  Element,
  Id,
  JsonValue,
  Relation,
} from '@visual-anything/schema';
import { componentOrEssence, relationTypeOrRelatesTo, type Definitions } from '../definitions';
import type { ModelIndex } from '../model-index';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { CODE_LIMITS } from './limits';

/** An element as package code sees it. */
export interface CodeElement {
  id: Id;
  name: string;
  component: Id;
  description?: string;
  /** Its own values, then its component's defaults for the attributes it does not set. */
  attributes: Attributes;
}

/** A relation as package code sees it. */
export interface CodeRelation {
  id: Id;
  relationType: Id;
  from: Id;
  to: Id;
  name?: string;
  /** Its own values, then its relation type's defaults. */
  attributes: Attributes;
}

/** The other end of one of the element's relations. */
export interface CodeEnd {
  id: Id;
  kind: 'element' | 'relation';
  name: string;
  /** For an element. */
  component?: Id;
  /** For a relation. */
  relationType?: Id;
}

/** A container or one of the contents of the element, one level away. */
export interface CodeNeighbor {
  id: Id;
  name: string;
  component: Id;
}

/** What lies around the element. */
export interface HookContext {
  /** Its component, and the ones it derives from, nearest first. */
  component: { id: Id; name: string; package?: Id; lineage: Id[] };
  /** The relations that end on it, at either end, in model order: at most 500. */
  relations: CodeRelation[];
  /** The other ends of those relations, each once. */
  ends: CodeEnd[];
  /** Its containers and its contents, one level away: at most 500 each. */
  containers: CodeNeighbor[];
  contents: CodeNeighbor[];
  /** For `draw`: the view it is drawn in. */
  view?: Id;
  /** For `draw`: the scale the view is drawn at, 1 at 100%. */
  scale?: number;
}

/** What one call of a hook is given: `hook(element, context)`. */
export interface HookInput {
  element: CodeElement;
  context: HookContext;
}

/**
 * What a hook is given for an element; undefined when no element has the id. `draw` also gets the
 * view and the scale it is drawn at.
 */
export function hookInputOf(
  state: ProjectSnapshot,
  id: Id,
  drawn?: { view: Id; scale: number },
): HookInput | undefined {
  const index = modelIndexOf(state);
  const element = index.element(id);
  if (!element) return undefined;
  const definitions = definitionsIn(state);
  const component = componentOrEssence(definitions, element.component);
  const relations = index.relationsOn(id).slice(0, CODE_LIMITS.contextItems);
  const ends = new Map<Id, CodeEnd>();
  for (const relation of relations) {
    for (const end of [relation.from, relation.to]) {
      if (end === id || ends.has(end)) continue;
      const known = endOf(index, end);
      if (known) ends.set(end, known);
    }
  }
  const neighbor = (each: Id): CodeNeighbor[] => {
    const found = index.element(each);
    return found ? [{ id: found.id, name: found.name, component: found.component }] : [];
  };
  return {
    element: codeElementOf(element, definitions),
    context: {
      component: {
        id: component.id,
        name: component.name,
        ...(component.package === undefined ? {} : { package: component.package }),
        lineage: [...component.lineage],
      },
      relations: relations.map((relation) => codeRelationOf(relation, definitions)),
      ends: [...ends.values()],
      containers: index.containersOf(id).slice(0, CODE_LIMITS.contextItems).flatMap(neighbor),
      contents: index.contentsOf(id).slice(0, CODE_LIMITS.contextItems).flatMap(neighbor),
      ...(drawn === undefined ? {} : { view: drawn.view, scale: drawn.scale }),
    },
  };
}

/** How package code with `model:read` reads the whole model, read-only. */
export interface ModelReader {
  /** The element with this id, World included; null for any other id. */
  element(id: Id): CodeElement | null;
  /** The relation with this id; null for any other id. */
  relation(id: Id): CodeRelation | null;
  /** Every element's id, World first, or those created from a component or one derived from it. */
  elements(component?: Id): Id[];
  /** The ids of the relations that end on an element or a relation, at either end. */
  relationsOn(id: Id): Id[];
}

/** Reads a project's model for package code with `model:read`. */
export function modelReaderOf(state: ProjectSnapshot): ModelReader {
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);
  const all = [state.model.world, ...state.model.elements];
  return {
    element: (id) => {
      const found = typeof id === 'string' ? index.element(id) : undefined;
      return found ? codeElementOf(found, definitions) : null;
    },
    relation: (id) => {
      const found = typeof id === 'string' ? index.relation(id) : undefined;
      return found ? codeRelationOf(found, definitions) : null;
    },
    elements: (component) =>
      all
        .filter(
          (each) =>
            component === undefined || definitions.componentDerives(each.component, component),
        )
        .map((each) => each.id),
    relationsOn: (id) =>
      typeof id === 'string' ? index.relationsOn(id).map((each) => each.id) : [],
  };
}

function codeElementOf(element: Element, definitions: Definitions): CodeElement {
  const component = componentOrEssence(definitions, element.component);
  return {
    id: element.id,
    name: element.name,
    component: element.component,
    ...(element.description === undefined ? {} : { description: element.description }),
    attributes: valuesOf(element.attributes, component.attributes),
  };
}

function codeRelationOf(relation: Relation, definitions: Definitions): CodeRelation {
  const type = relationTypeOrRelatesTo(definitions, relation.relationType);
  return {
    id: relation.id,
    relationType: relation.relationType,
    from: relation.from,
    to: relation.to,
    ...(relation.name === undefined ? {} : { name: relation.name }),
    attributes: valuesOf(relation.attributes, type.attributes),
  };
}

function endOf(index: ModelIndex, id: Id): CodeEnd | undefined {
  const element = index.element(id);
  if (element) return { id, kind: 'element', name: element.name, component: element.component };
  const relation = index.relation(id);
  if (relation) {
    return {
      id,
      kind: 'relation',
      name: relation.name ?? relation.id,
      relationType: relation.relationType,
    };
  }
  return undefined;
}

/**
 * Own values, then defaults for the rest, as an object built with `Object.fromEntries`: a value named
 * `__proto__` is kept as data, never taken as what the object derives from.
 */
function valuesOf(
  own: Attributes | undefined,
  definitions: readonly AttributeDefinition[],
): Attributes {
  const entries: [string, JsonValue][] = [];
  const set = new Set<string>();
  for (const [name, value] of Object.entries(own ?? {})) {
    entries.push([name, value]);
    set.add(name);
  }
  for (const definition of definitions) {
    if (set.has(definition.name) || definition.default === undefined) continue;
    entries.push([definition.name, definition.default]);
    set.add(definition.name);
  }
  return Object.fromEntries(entries);
}
