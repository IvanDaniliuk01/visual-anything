/**
 * The components and relation types of the packages in use, with what each one inherits. A component
 * derives from exactly one other and inherits everything it does not redefine, up to Essence; a relation
 * type does the same up to "relates to". Essence and "relates to" are built in and belong to no package.
 */
import type {
  Appearance,
  AttributeDefinition,
  Component,
  Id,
  PackageFile,
  RelationAppearance,
  RelationType,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { ESSENCE, RELATES_TO } from './builtin/essence-and-relates-to';
import { problem, type Problem } from './problems';

/**
 * How an element's shapes are drawn, with nothing left out but the image they show, which
 * `imageShownBy` in `images/` works out.
 */
export type ResolvedAppearance = Required<Omit<Appearance, 'image'>>;

/** How a relation is drawn, with nothing left out. */
export type ResolvedRelationAppearance = Required<RelationAppearance>;

/** A component with everything it inherits. */
export interface ResolvedComponent {
  id: Id;
  name: string;
  description?: string;
  /** The package that defines it; absent for Essence. */
  package?: Id;
  /** Its own id and the ids it derives from, nearest first, ending with Essence when the chain is whole. */
  lineage: readonly Id[];
  appearance: ResolvedAppearance;
  /** Every attribute it has: inherited ones first, each redefinition in the place of what it redefines. */
  attributes: readonly AttributeDefinition[];
}

/** A relation type with everything it inherits. */
export interface ResolvedRelationType {
  id: Id;
  name: string;
  description?: string;
  /** The package that defines it; absent for "relates to". */
  package?: Id;
  /** Its own id and the ids it derives from, nearest first, ending with "relates to" when whole. */
  lineage: readonly Id[];
  direction: 'directed' | 'undirected';
  nests: boolean;
  appearance: ResolvedRelationAppearance;
  attributes: readonly AttributeDefinition[];
  /** What its relations may connect; a missing list sets no limit. */
  limits: { from?: readonly Id[]; to?: readonly Id[] };
}

/** A definition and the package it comes from. */
export interface Defined<T> {
  definition: T;
  package: Id;
}

/** The definitions of a set of packages. */
export interface Definitions {
  /** The component with this id, with what it inherits; `undefined` when no package defines it. */
  component(id: Id): ResolvedComponent | undefined;
  /** The relation type with this id, with what it inherits; `undefined` when no package defines it. */
  relationType(id: Id): ResolvedRelationType | undefined;
  /** Whether a component is `ancestor` itself or derives from it, directly or not. */
  componentDerives(id: Id, ancestor: Id): boolean;
  /** Whether a relation type is `ancestor` itself or derives from it, directly or not. */
  relationTypeDerives(id: Id, ancestor: Id): boolean;
  /** The components that derive directly from this one. */
  componentsDerivedFrom(id: Id): readonly Id[];
  /** The relation types that derive directly from this one. */
  relationTypesDerivedFrom(id: Id): readonly Id[];
  /** Every relation type whose relations nest. */
  readonly nestingRelationTypes: ReadonlySet<Id>;
  /** Every component the packages define. */
  readonly components: ReadonlyMap<Id, Defined<Component>>;
  /** Every relation type the packages define. */
  readonly relationTypes: ReadonlyMap<Id, Defined<RelationType>>;
  /** What is wrong with the definitions: unknown parents, derivation cycles, ids defined twice. */
  readonly problems: readonly Problem[];
}

const cache = new WeakMap<readonly PackageFile[], Definitions>();

/** The definitions of the given packages. Repeated calls with the same array share the result. */
export function definitionsOf(packages: readonly PackageFile[]): Definitions {
  let definitions = cache.get(packages);
  if (!definitions) {
    definitions = buildDefinitions(packages);
    cache.set(packages, definitions);
  }
  return definitions;
}

/**
 * How an element's shapes are drawn: whatever its own appearance sets, which is a particularity, and
 * its component's appearance for the rest. An unknown component is drawn like Essence.
 */
export function appearanceOf(
  element: { component: Id; appearance?: Appearance },
  definitions: Definitions,
): ResolvedAppearance {
  const inherited = definitions.component(element.component)?.appearance ?? ESSENCE.appearance;
  const own = element.appearance;
  return {
    shape: own?.shape ?? inherited.shape,
    fill: own?.fill ?? inherited.fill,
    stroke: own?.stroke ?? inherited.stroke,
    width: own?.width ?? inherited.width,
    height: own?.height ?? inherited.height,
  };
}

/** The component with this id; for an id no package defines, one named by the id that looks like Essence. */
export function componentOrEssence(definitions: Definitions, id: Id): ResolvedComponent {
  return definitions.component(id) ?? { ...RESOLVED_ESSENCE, id, name: id, lineage: [id] };
}

/** The relation type with this id; for an id no package defines, one named by the id that behaves like "relates to". */
export function relationTypeOrRelatesTo(definitions: Definitions, id: Id): ResolvedRelationType {
  return definitions.relationType(id) ?? { ...RESOLVED_RELATES_TO, id, name: id, lineage: [id] };
}

function buildDefinitions(packages: readonly PackageFile[]): Definitions {
  const problems: Problem[] = [];
  const components = new Map<Id, Defined<Component>>();
  const relationTypes = new Map<Id, Defined<RelationType>>();

  for (const file of packages) {
    for (const component of file.components) {
      collect(components, component, file.id, ESSENCE_ID, 'component', problems);
    }
    for (const relationType of file.relationTypes) {
      collect(relationTypes, relationType, file.id, RELATES_TO_ID, 'relation type', problems);
    }
  }

  const componentChains = new Map<Id, Chain<Component>>();
  const relationTypeChains = new Map<Id, Chain<RelationType>>();
  const chainOfComponent = (id: Id) => chainOf(id, components, ESSENCE_ID, componentChains);
  const chainOfRelationType = (id: Id) =>
    chainOf(id, relationTypes, RELATES_TO_ID, relationTypeChains);

  reportChainProblems(components.keys(), chainOfComponent, 'component', problems);
  reportChainProblems(relationTypes.keys(), chainOfRelationType, 'relation type', problems);

  const resolvedComponents = new Map<Id, ResolvedComponent>();
  const resolvedRelationTypes = new Map<Id, ResolvedRelationType>();

  const component = (id: Id): ResolvedComponent | undefined => {
    if (id === ESSENCE_ID) return RESOLVED_ESSENCE;
    let resolved = resolvedComponents.get(id);
    if (!resolved && components.has(id)) {
      resolved = resolveComponent(id, chainOfComponent(id), components);
      resolvedComponents.set(id, resolved);
    }
    return resolved;
  };

  const relationType = (id: Id): ResolvedRelationType | undefined => {
    if (id === RELATES_TO_ID) return RESOLVED_RELATES_TO;
    let resolved = resolvedRelationTypes.get(id);
    if (!resolved && relationTypes.has(id)) {
      resolved = resolveRelationType(id, chainOfRelationType(id), relationTypes);
      resolvedRelationTypes.set(id, resolved);
    }
    return resolved;
  };

  const nestingRelationTypes = new Set<Id>();
  for (const id of relationTypes.keys()) {
    if (relationType(id)?.nests) nestingRelationTypes.add(id);
  }

  const componentChildren = childrenOf(components);
  const relationTypeChildren = childrenOf(relationTypes);

  return {
    component,
    relationType,
    componentDerives: (id, ancestor) => component(id)?.lineage.includes(ancestor) ?? false,
    relationTypeDerives: (id, ancestor) => relationType(id)?.lineage.includes(ancestor) ?? false,
    componentsDerivedFrom: (id) => componentChildren.get(id) ?? [],
    relationTypesDerivedFrom: (id) => relationTypeChildren.get(id) ?? [],
    nestingRelationTypes,
    components,
    relationTypes,
    problems,
  };
}

const RESOLVED_ESSENCE: ResolvedComponent = {
  id: ESSENCE.id,
  name: ESSENCE.name,
  description: ESSENCE.description,
  lineage: [ESSENCE.id],
  appearance: ESSENCE.appearance,
  attributes: [],
};

const RESOLVED_RELATES_TO: ResolvedRelationType = {
  id: RELATES_TO.id,
  name: RELATES_TO.name,
  description: RELATES_TO.description,
  lineage: [RELATES_TO.id],
  direction: RELATES_TO.direction,
  nests: RELATES_TO.nests,
  appearance: RELATES_TO.appearance,
  attributes: [],
  limits: {},
};

/** A definition followed by the ones it derives from, nearest first, and how the chain ends. */
interface Chain<T> {
  definitions: T[];
  /** `built-in` when the chain reaches Essence or "relates to"; otherwise where it broke off. */
  end: { kind: 'built-in' } | { kind: 'unknown-parent'; parent: Id } | { kind: 'cycle'; at: Id };
}

function collect<T extends { id: Id }>(
  byId: Map<Id, Defined<T>>,
  definition: T,
  packageId: Id,
  builtInId: Id,
  noun: string,
  problems: Problem[],
): void {
  if (definition.id === builtInId) {
    problems.push(
      problem(
        'defined-twice',
        `The ${noun} "${builtInId}" is built in; package "${packageId}" cannot define it.`,
        [builtInId],
      ),
    );
    return;
  }
  const first = byId.get(definition.id);
  if (first) {
    problems.push(
      problem(
        'defined-twice',
        `The ${noun} "${definition.id}" is defined by package "${first.package}" and again by "${packageId}".`,
        [definition.id],
      ),
    );
    return;
  }
  if (!definition.id.startsWith(`${packageId}.`)) {
    problems.push(
      problem(
        'id-outside-package',
        `The ${noun} "${definition.id}" of package "${packageId}" should start with "${packageId}.".`,
        [definition.id],
      ),
    );
  }
  byId.set(definition.id, { definition, package: packageId });
}

function chainOf<T extends { id: Id; derivesFrom: Id }>(
  id: Id,
  byId: ReadonlyMap<Id, Defined<T>>,
  builtInId: Id,
  memo: Map<Id, Chain<T>>,
): Chain<T> {
  const known = memo.get(id);
  if (known) return known;
  const definitions: T[] = [];
  const seen = new Set<Id>();
  let current = id;
  let end: Chain<T>['end'];
  for (;;) {
    if (current === builtInId) {
      end = { kind: 'built-in' };
      break;
    }
    if (seen.has(current)) {
      end = { kind: 'cycle', at: current };
      break;
    }
    const defined = byId.get(current);
    if (!defined) {
      end = { kind: 'unknown-parent', parent: current };
      break;
    }
    seen.add(current);
    definitions.push(defined.definition);
    current = defined.definition.derivesFrom;
  }
  const chain = { definitions, end };
  memo.set(id, chain);
  return chain;
}

function reportChainProblems<T extends { id: Id; derivesFrom: Id }>(
  ids: Iterable<Id>,
  chainOfId: (id: Id) => Chain<T>,
  noun: string,
  problems: Problem[],
): void {
  const reportedCycles = new Set<string>();
  for (const id of ids) {
    const chain = chainOfId(id);
    if (chain.end.kind === 'unknown-parent' && chain.definitions.length === 1) {
      problems.push(
        problem(
          'unknown-parent',
          `The ${noun} "${id}" derives from "${chain.end.parent}", which no package in use defines.`,
          [id],
        ),
      );
    } else if (chain.end.kind === 'cycle') {
      const at = chain.end.at;
      const start = chain.definitions.findIndex((definition) => definition.id === at);
      const members = chain.definitions.slice(start).map((definition) => definition.id);
      const key = [...members].sort().join(' ');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        problems.push(
          problem(
            'derivation-cycle',
            `The ${noun}s ${members.map((member) => `"${member}"`).join(', ')} derive from each other in a cycle.`,
            members,
          ),
        );
      }
    }
  }
}

function lineageOf<T extends { id: Id }>(chain: Chain<T>, builtInId: Id): Id[] {
  const ids = chain.definitions.map((definition) => definition.id);
  return chain.end.kind === 'built-in' ? [...ids, builtInId] : ids;
}

function resolveComponent(
  id: Id,
  chain: Chain<Component>,
  components: ReadonlyMap<Id, Defined<Component>>,
): ResolvedComponent {
  const [own] = chain.definitions;
  const appearances = chain.definitions.map((definition) => definition.appearance);
  const description = own?.description;
  const packageId = components.get(id)?.package;
  return {
    id,
    name: own?.name ?? id,
    ...(description === undefined ? {} : { description }),
    ...(packageId === undefined ? {} : { package: packageId }),
    lineage: lineageOf(chain, ESSENCE_ID),
    appearance: {
      shape: nearest(appearances, 'shape') ?? ESSENCE.appearance.shape,
      fill: nearest(appearances, 'fill') ?? ESSENCE.appearance.fill,
      stroke: nearest(appearances, 'stroke') ?? ESSENCE.appearance.stroke,
      width: nearest(appearances, 'width') ?? ESSENCE.appearance.width,
      height: nearest(appearances, 'height') ?? ESSENCE.appearance.height,
    },
    attributes: mergedAttributes(chain.definitions),
  };
}

function resolveRelationType(
  id: Id,
  chain: Chain<RelationType>,
  relationTypes: ReadonlyMap<Id, Defined<RelationType>>,
): ResolvedRelationType {
  const [own] = chain.definitions;
  const appearances = chain.definitions.map((definition) => definition.appearance);
  const limits = chain.definitions.map((definition) => definition.limits);
  const from = nearest(limits, 'from');
  const to = nearest(limits, 'to');
  const description = own?.description;
  const packageId = relationTypes.get(id)?.package;
  return {
    id,
    name: own?.name ?? id,
    ...(description === undefined ? {} : { description }),
    ...(packageId === undefined ? {} : { package: packageId }),
    lineage: lineageOf(chain, RELATES_TO_ID),
    direction: nearest(chain.definitions, 'direction') ?? RELATES_TO.direction,
    nests: nearest(chain.definitions, 'nests') ?? RELATES_TO.nests,
    appearance: {
      stroke: nearest(appearances, 'stroke') ?? RELATES_TO.appearance.stroke,
      width: nearest(appearances, 'width') ?? RELATES_TO.appearance.width,
      dash: nearest(appearances, 'dash') ?? RELATES_TO.appearance.dash,
    },
    attributes: mergedAttributes(chain.definitions),
    limits: { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) },
  };
}

/** The value the nearest member of a chain gives to a trait, if any does. */
function nearest<T, K extends keyof T>(
  chain: readonly (T | undefined)[],
  key: K,
): NonNullable<T[K]> | undefined {
  for (const traits of chain) {
    const value = traits?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/**
 * The attributes of a chain: those nearest Essence or "relates to" first, a redefinition replacing
 * in place.
 */
function mergedAttributes(
  chain: readonly { attributes?: AttributeDefinition[] }[],
): AttributeDefinition[] {
  const byName = new Map<string, AttributeDefinition>();
  for (const definition of [...chain].reverse()) {
    for (const attribute of definition.attributes ?? []) byName.set(attribute.name, attribute);
  }
  return [...byName.values()];
}

function childrenOf<T extends { derivesFrom: Id }>(
  byId: ReadonlyMap<Id, Defined<T>>,
): Map<Id, Id[]> {
  const children = new Map<Id, Id[]>();
  for (const [id, { definition }] of byId) {
    const list = children.get(definition.derivesFrom) ?? [];
    list.push(id);
    children.set(definition.derivesFrom, list);
  }
  return children;
}
