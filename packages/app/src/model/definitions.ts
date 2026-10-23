/**
 * The components and relation types of the packages in use, with what each one inherits resolved. A
 * component derives from exactly one other and inherits everything it does not redefine, up to Essence;
 * a relation type does the same up to "relates to". Both of those are built in and are in no package.
 */
import type {
  Appearance,
  Component,
  Element,
  Id,
  PackageFile,
  RelationAppearance,
  RelationType,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';

export type ShapeKind = NonNullable<Appearance['shape']>;
export type Dash = NonNullable<RelationAppearance['dash']>;
export type Direction = NonNullable<RelationType['direction']>;

/** How an element's shapes are drawn, with nothing left out. */
export type ResolvedAppearance = Required<Appearance>;

/** How a relation is drawn, with nothing left out. */
export type ResolvedRelationAppearance = Required<RelationAppearance>;

/** A component with everything it inherits. */
export interface ResolvedComponent {
  id: Id;
  name: string;
  appearance: ResolvedAppearance;
}

/** A relation type with everything it inherits. */
export interface ResolvedRelationType {
  id: Id;
  name: string;
  direction: Direction;
  nests: boolean;
  appearance: ResolvedRelationAppearance;
}

export interface Definitions {
  /** The component with this id; an unknown id is named by itself and drawn like Essence. */
  component(id: Id): ResolvedComponent;
  /** The relation type with this id; an unknown id is named by itself and behaves like "relates to". */
  relationType(id: Id): ResolvedRelationType;
}

/** Essence: the component every other component ultimately derives from. */
const ESSENCE: ResolvedComponent = {
  id: ESSENCE_ID,
  name: 'Essence',
  appearance: { shape: 'rectangle', fill: '#FFFFFF', stroke: '#52606D', width: 160, height: 72 },
};

/** "Relates to": the relation type every other relation type ultimately derives from. */
const RELATES_TO: ResolvedRelationType = {
  id: RELATES_TO_ID,
  name: 'relates to',
  direction: 'undirected',
  nests: false,
  appearance: { stroke: '#52606D', width: 2, dash: 'solid' },
};

/** Resolves the components and relation types of the given packages. */
export function resolveDefinitions(packages: readonly PackageFile[]): Definitions {
  const components = new Map<Id, Component>();
  const relationTypes = new Map<Id, RelationType>();
  for (const file of packages) {
    for (const component of file.components) components.set(component.id, component);
    for (const relationType of file.relationTypes) relationTypes.set(relationType.id, relationType);
  }

  const resolvedComponents = new Map<Id, ResolvedComponent>();
  const resolvedRelationTypes = new Map<Id, ResolvedRelationType>();

  return {
    component(id) {
      let resolved = resolvedComponents.get(id);
      if (!resolved) {
        const chain = lineage(id, components);
        const appearances = chain.map((component) => component.appearance);
        resolved = {
          id,
          name: chain[0]?.name ?? (id === ESSENCE_ID ? ESSENCE.name : id),
          appearance: {
            shape: inherited(appearances, 'shape') ?? ESSENCE.appearance.shape,
            fill: inherited(appearances, 'fill') ?? ESSENCE.appearance.fill,
            stroke: inherited(appearances, 'stroke') ?? ESSENCE.appearance.stroke,
            width: inherited(appearances, 'width') ?? ESSENCE.appearance.width,
            height: inherited(appearances, 'height') ?? ESSENCE.appearance.height,
          },
        };
        resolvedComponents.set(id, resolved);
      }
      return resolved;
    },

    relationType(id) {
      let resolved = resolvedRelationTypes.get(id);
      if (!resolved) {
        const chain = lineage(id, relationTypes);
        const appearances = chain.map((relationType) => relationType.appearance);
        resolved = {
          id,
          name: chain[0]?.name ?? (id === RELATES_TO_ID ? RELATES_TO.name : id),
          direction: inherited(chain, 'direction') ?? RELATES_TO.direction,
          nests: inherited(chain, 'nests') ?? RELATES_TO.nests,
          appearance: {
            stroke: inherited(appearances, 'stroke') ?? RELATES_TO.appearance.stroke,
            width: inherited(appearances, 'width') ?? RELATES_TO.appearance.width,
            dash: inherited(appearances, 'dash') ?? RELATES_TO.appearance.dash,
          },
        };
        resolvedRelationTypes.set(id, resolved);
      }
      return resolved;
    },
  };
}

/**
 * How an element's shapes are drawn: whatever its own appearance sets, which is a particularity, and
 * its component's appearance for the rest.
 */
export function appearanceOf(element: Element, definitions: Definitions): ResolvedAppearance {
  const inheritedAppearance = definitions.component(element.component).appearance;
  const own = element.appearance;
  return {
    shape: own?.shape ?? inheritedAppearance.shape,
    fill: own?.fill ?? inheritedAppearance.fill,
    stroke: own?.stroke ?? inheritedAppearance.stroke,
    width: own?.width ?? inheritedAppearance.width,
    height: own?.height ?? inheritedAppearance.height,
  };
}

/**
 * The definition with this id followed by the ones it derives from, nearest first. It ends before the
 * built-in definition the chain leads to, which is in no package, and stops at a cycle.
 */
function lineage<T extends { id: Id; derivesFrom: Id }>(id: Id, byId: ReadonlyMap<Id, T>): T[] {
  const chain: T[] = [];
  const seen = new Set<Id>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = byId.get(current.derivesFrom);
  }
  return chain;
}

/** The value the nearest definition in a chain gives to a trait, if any does. */
function inherited<T, K extends keyof T>(
  chain: readonly (T | undefined)[],
  key: K,
): T[K] | undefined {
  for (const traits of chain) {
    const value = traits?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}
