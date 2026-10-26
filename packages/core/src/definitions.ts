/**
 * The components and relation types of the packages in use, with what each one inherits. A component
 * derives from exactly one other and inherits everything it does not redefine, up to Essence; a relation
 * type does the same up to "relates to". Essence and "relates to" are built in and belong to no package.
 *
 * A project can give the definitions it cannot change, those of built-in packages, Essence and "relates
 * to", a project appearance (ADR-0034). Each trait then comes from the element's or relation's own
 * appearance first; then from the nearest definition in the chain that sets it, a built-in one counting
 * with its project appearance over its own traits; then from Essence or "relates to", with theirs.
 * Built-in colors take their dark shades in the dark theme while they come through the definition
 * (ADR-0033).
 */
import type {
  Appearance,
  AttributeDefinition,
  Color,
  Component,
  Id,
  PackageFile,
  ProjectAppearances,
  RelationAppearance,
  RelationType,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import {
  resolveAppearance,
  resolveAppearanceWithOrigins,
  withOwnOrigins,
  type AppearanceMember,
  type ResolvedAppearance,
  type TraitOrigin,
  type TraitPath,
} from './appearance';
import { builtinPackage } from './builtin';
import { darkShadeOf } from './builtin/dark';
import { ESSENCE, RELATES_TO } from './builtin/essence-and-relates-to';
import { CANVAS_BACKGROUNDS, MINIMUM_MARK_CONTRAST, contrastRatio } from './colors';
import type { ThemeName } from './preferences';
import { problem, type Problem } from './problems';

export type { ResolvedAppearance } from './appearance';

/**
 * How a relation is drawn, with nothing left out but its route's style, which "relates to" leaves to
 * the view (ADR 0069).
 */
export type ResolvedRelationAppearance = Required<Omit<RelationAppearance, 'route'>> &
  Pick<RelationAppearance, 'route'>;

/** A trait of how a relation is drawn. */
export type RelationAppearanceTrait = keyof RelationAppearance;

/** Every trait of how a relation is drawn, in the order the inspector shows them. */
export const RELATION_APPEARANCE_TRAITS: readonly RelationAppearanceTrait[] = [
  'stroke',
  'width',
  'dash',
  'route',
] satisfies (keyof Required<RelationAppearance>)[];

/** The fill and stroke an element's shapes are drawn in. */
export interface ShapeColors {
  fill: Color;
  stroke: Color;
}

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
  /** Where each trait of its appearance comes from. */
  origins: Readonly<Record<TraitPath, TraitOrigin>>;
  /**
   * The fill and stroke the dark theme draws its elements in, when they set neither: built-in colors
   * in their dark shades, every color the project sets as stored, and a built-in fill in its light
   * value beside a stored stroke under 3:1 on the dark canvas.
   */
  darkColors: Readonly<ShapeColors>;
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
  /** Where each trait of its appearance comes from. */
  origins: Readonly<Record<RelationAppearanceTrait, TraitOrigin>>;
  /** The stroke the dark theme draws its relations in, when they set none. */
  darkStroke: Color;
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

/** The definitions of a set of packages, plain and with each set of project appearances. */
interface CacheEntry {
  plain?: Definitions;
  byAppearances: WeakMap<ProjectAppearances, Definitions>;
}

const cache = new WeakMap<readonly PackageFile[], CacheEntry>();

/**
 * The definitions of the given packages, with the project appearances given to the definitions the
 * project cannot change; without them, as the packages define them. Repeated calls with the same
 * arrays and objects share the result. Use `definitionsIn(project)` for an open project.
 */
export function definitionsOf(
  packages: readonly PackageFile[],
  appearances?: ProjectAppearances,
): Definitions {
  let entry = cache.get(packages);
  if (!entry) {
    entry = { byAppearances: new WeakMap() };
    cache.set(packages, entry);
  }
  if (appearances === undefined) {
    entry.plain ??= buildDefinitions(packages, undefined);
    return entry.plain;
  }
  let definitions = entry.byAppearances.get(appearances);
  if (!definitions) {
    definitions = buildDefinitions(packages, appearances);
    entry.byAppearances.set(appearances, definitions);
  }
  return definitions;
}

/** An element, as far as how it is drawn goes. */
export interface Drawn {
  component: Id;
  appearance?: Appearance;
}

/** A relation, as far as how it is drawn goes. */
export interface DrawnRelation {
  relationType: Id;
  appearance?: RelationAppearance;
}

/**
 * How an element's shapes are drawn: whatever its own appearance sets, which is a particularity, and
 * its component's appearance for the rest. An unknown component is drawn like Essence.
 */
export function appearanceOf(element: Drawn, definitions: Definitions): ResolvedAppearance {
  const inherited = (definitions.component(element.component) ?? essenceOf(definitions)).appearance;
  return resolveAppearance([element.appearance], inherited);
}

function essenceOf(definitions: Definitions): ResolvedComponent {
  return definitions.component(ESSENCE_ID) as ResolvedComponent;
}

/** Where each trait of an element's appearance comes from: its own appearance, or a definition. */
export function appearanceOriginsOf(
  element: Drawn,
  definitions: Definitions,
): Readonly<Record<TraitPath, TraitOrigin>> {
  return withOwnOrigins(
    componentOrEssence(definitions, element.component).origins,
    element.appearance,
  );
}

/**
 * The fill and stroke the dark theme draws an element's shapes in. Built-in colors take their dark
 * shades while nothing in the project sets them; every color the project sets is drawn as stored;
 * and a built-in fill keeps its light value beside a stored stroke under 3:1 on the dark canvas, so
 * that the shape keeps the pair the light theme shows instead of vanishing (ADR-0033).
 */
export function darkColorsOf(element: Drawn, definitions: Definitions): ShapeColors {
  const component = componentOrEssence(definitions, element.component);
  const own = element.appearance;
  if (own?.fill === undefined && own?.stroke === undefined) return component.darkColors;
  const light = appearanceOf(element, definitions);
  const origins = appearanceOriginsOf(element, definitions);
  return darkPair(
    { light: light.fill, shade: shadeOf('component', origins.fill, 'fill') },
    { light: light.stroke, shade: shadeOf('component', origins.stroke, 'stroke') },
  );
}

/** The fill and stroke an element's shapes are drawn in, in a theme. */
export function drawnColorsOf(
  element: Drawn,
  definitions: Definitions,
  theme: ThemeName,
): ShapeColors {
  if (theme === 'dark') return darkColorsOf(element, definitions);
  const { fill, stroke } = appearanceOf(element, definitions);
  return { fill, stroke };
}

/**
 * How a relation is drawn: whatever its own appearance sets, which is a particularity, and its
 * relation type's appearance for the rest. An unknown relation type is drawn like "relates to".
 */
export function relationAppearanceOf(
  relation: DrawnRelation,
  definitions: Definitions,
): ResolvedRelationAppearance {
  const inherited = relationTypeOrRelatesTo(definitions, relation.relationType).appearance;
  const own = relation.appearance;
  if (own === undefined) return inherited;
  const route = own.route ?? inherited.route;
  return {
    stroke: own.stroke ?? inherited.stroke,
    width: own.width ?? inherited.width,
    dash: own.dash ?? inherited.dash,
    ...(route === undefined ? {} : { route }),
  };
}

/** Where each trait of a relation's appearance comes from: its own appearance, or a relation type. */
export function relationAppearanceOriginsOf(
  relation: DrawnRelation,
  definitions: Definitions,
): Readonly<Record<RelationAppearanceTrait, TraitOrigin>> {
  const inherited = relationTypeOrRelatesTo(definitions, relation.relationType).origins;
  const own = relation.appearance;
  if (own === undefined) return inherited;
  return {
    stroke: own.stroke === undefined ? inherited.stroke : { kind: 'own' },
    width: own.width === undefined ? inherited.width : { kind: 'own' },
    dash: own.dash === undefined ? inherited.dash : { kind: 'own' },
    route: own.route === undefined ? inherited.route : { kind: 'own' },
  };
}

/** The stroke the dark theme draws a relation in: its own, or its relation type's dark stroke. */
export function relationDarkStrokeOf(relation: DrawnRelation, definitions: Definitions): Color {
  return (
    relation.appearance?.stroke ??
    relationTypeOrRelatesTo(definitions, relation.relationType).darkStroke
  );
}

/** How a relation is drawn in a theme: its appearance, with the stroke that theme draws. */
export function drawnRelationAppearanceOf(
  relation: DrawnRelation,
  definitions: Definitions,
  theme: ThemeName,
): ResolvedRelationAppearance {
  const appearance = relationAppearanceOf(relation, definitions);
  return theme === 'dark'
    ? { ...appearance, stroke: relationDarkStrokeOf(relation, definitions) }
    : appearance;
}

/** The component with this id; for an id no package defines, one named by the id that looks like Essence. */
export function componentOrEssence(definitions: Definitions, id: Id): ResolvedComponent {
  return (
    definitions.component(id) ?? {
      ...(definitions.component(ESSENCE_ID) as ResolvedComponent),
      id,
      name: id,
      lineage: [id],
    }
  );
}

/** The relation type with this id; for an id no package defines, one named by the id that behaves like "relates to". */
export function relationTypeOrRelatesTo(definitions: Definitions, id: Id): ResolvedRelationType {
  return (
    definitions.relationType(id) ?? {
      ...(definitions.relationType(RELATES_TO_ID) as ResolvedRelationType),
      id,
      name: id,
      lineage: [id],
    }
  );
}

/**
 * Whether a definition is one the project cannot change: Essence, "relates to", or one of a built-in
 * package. A project appearance applies only to these.
 */
export function isBuiltInDefinition(
  definitions: Definitions,
  kind: 'component' | 'relation-type',
  id: Id,
): boolean {
  if (id === (kind === 'component' ? ESSENCE_ID : RELATES_TO_ID)) return true;
  const defined =
    kind === 'component' ? definitions.components.get(id) : definitions.relationTypes.get(id);
  return defined !== undefined && builtinPackage(defined.package) !== undefined;
}

/** The dark shade a trait takes: only while it comes through a built-in definition that has one. */
function shadeOf(
  kind: 'component' | 'relation-type',
  origin: TraitOrigin,
  trait: 'fill' | 'stroke',
): Color | undefined {
  return origin.kind === 'definition' && origin.via === 'definition' && origin.builtIn
    ? darkShadeOf(kind, origin.id, trait)
    : undefined;
}

/**
 * The dark theme's fill and stroke from each one's light value and dark shade, if it takes one: a
 * stroke drawn in its light value, as every stored color is, keeps a built-in fill in its light value
 * too when it is under 3:1 on the dark canvas.
 */
function darkPair(
  fill: { light: Color; shade: Color | undefined },
  stroke: { light: Color; shade: Color | undefined },
): ShapeColors {
  const darkStroke = stroke.shade ?? stroke.light;
  const keepsLight =
    stroke.shade === undefined &&
    contrastRatio(darkStroke, CANVAS_BACKGROUNDS.dark) < MINIMUM_MARK_CONTRAST;
  return { fill: keepsLight ? fill.light : (fill.shade ?? fill.light), stroke: darkStroke };
}

function buildDefinitions(
  packages: readonly PackageFile[],
  appearances: ProjectAppearances | undefined,
): Definitions {
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
  const entries = entriesOf(appearances);
  const essence = resolveEssence(entries);
  const relatesTo = resolveRelatesTo(entries);

  const component = (id: Id): ResolvedComponent | undefined => {
    if (id === ESSENCE_ID) return essence;
    let resolved = resolvedComponents.get(id);
    if (!resolved && components.has(id)) {
      resolved = resolveComponent(id, chainOfComponent(id), components, entries);
      resolvedComponents.set(id, resolved);
    }
    return resolved;
  };

  const relationType = (id: Id): ResolvedRelationType | undefined => {
    if (id === RELATES_TO_ID) return relatesTo;
    let resolved = resolvedRelationTypes.get(id);
    if (!resolved && relationTypes.has(id)) {
      resolved = resolveRelationType(id, chainOfRelationType(id), relationTypes, entries);
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

/** The project appearances, looked up by own key only, since ids such as `constructor` are valid. */
interface Entries {
  component(id: Id): Appearance | undefined;
  relationType(id: Id): RelationAppearance | undefined;
}

function entriesOf(appearances: ProjectAppearances | undefined): Entries {
  const lookup =
    <T>(map: Readonly<Record<Id, T>> | undefined) =>
    (id: Id): T | undefined =>
      map !== undefined && Object.hasOwn(map, id) ? map[id] : undefined;
  return {
    component: lookup(appearances?.components),
    relationType: lookup(appearances?.relationTypes),
  };
}

/** Where a trait comes from when a built-in definition, or the project appearance given to it, sets it. */
function builtInOrigin(id: Id, via: 'definition' | 'project'): TraitOrigin {
  return { kind: 'definition', id, via, builtIn: true };
}

/**
 * The members of a chain one definition stands for, nearest first: a built-in definition's project
 * appearance, then its own traits.
 */
function membersOf<T>(
  id: Id,
  appearance: T | undefined,
  builtIn: boolean,
  entry: T | undefined,
): { appearance: T | undefined; origin: TraitOrigin }[] {
  const own = {
    appearance,
    origin: { kind: 'definition', id, via: 'definition', builtIn } satisfies TraitOrigin,
  };
  return builtIn ? [...projectMember(id, entry), own] : [own];
}

/** The member a project appearance given to a built-in definition stands for, if there is one. */
function projectMember<T>(
  id: Id,
  entry: T | undefined,
): { appearance: T | undefined; origin: TraitOrigin }[] {
  return entry === undefined ? [] : [{ appearance: entry, origin: builtInOrigin(id, 'project') }];
}

/** Essence, with the project appearance given to it. */
function resolveEssence(entries: Entries): ResolvedComponent {
  const { appearance, origins } = resolveAppearanceWithOrigins(
    projectMember(ESSENCE_ID, entries.component(ESSENCE_ID)),
    ESSENCE.appearance,
    builtInOrigin(ESSENCE_ID, 'definition'),
  );
  return {
    id: ESSENCE.id,
    name: ESSENCE.name,
    description: ESSENCE.description,
    lineage: [ESSENCE.id],
    appearance,
    origins,
    darkColors: darkColorsFrom(appearance, origins),
    attributes: [],
  };
}

/** "Relates to", with the project appearance given to it. */
function resolveRelatesTo(entries: Entries): ResolvedRelationType {
  const { appearance, origins } = resolveRelationAppearance(
    projectMember(RELATES_TO_ID, entries.relationType(RELATES_TO_ID)),
  );
  return {
    id: RELATES_TO.id,
    name: RELATES_TO.name,
    description: RELATES_TO.description,
    lineage: [RELATES_TO.id],
    direction: RELATES_TO.direction,
    nests: RELATES_TO.nests,
    appearance,
    origins,
    darkStroke: shadeOf('relation-type', origins.stroke, 'stroke') ?? appearance.stroke,
    attributes: [],
    limits: {},
  };
}

/** The dark theme's fill and stroke for an appearance worked out with its origins. */
function darkColorsFrom(
  appearance: ResolvedAppearance,
  origins: Readonly<Record<TraitPath, TraitOrigin>>,
): ShapeColors {
  return darkPair(
    { light: appearance.fill, shade: shadeOf('component', origins.fill, 'fill') },
    { light: appearance.stroke, shade: shadeOf('component', origins.stroke, 'stroke') },
  );
}

/**
 * How a relation type's relations are drawn, worked out from its members nearest first over "relates
 * to", with its project appearance, and where each trait comes from.
 */
function resolveRelationAppearance(
  members: readonly { appearance: RelationAppearance | undefined; origin: TraitOrigin }[],
): {
  appearance: ResolvedRelationAppearance;
  origins: Readonly<Record<RelationAppearanceTrait, TraitOrigin>>;
} {
  const base = builtInOrigin(RELATES_TO_ID, 'definition');
  const first = <K extends RelationAppearanceTrait>(trait: K) =>
    members.find((member) => {
      const value = member.appearance?.[trait];
      return value !== undefined && value !== null;
    });
  const stroke = first('stroke');
  const width = first('width');
  const dash = first('dash');
  const route = first('route');
  const style = route?.appearance?.route;
  return {
    appearance: {
      stroke: stroke?.appearance?.stroke ?? RELATES_TO.appearance.stroke,
      width: width?.appearance?.width ?? RELATES_TO.appearance.width,
      dash: dash?.appearance?.dash ?? RELATES_TO.appearance.dash,
      ...(style === undefined ? {} : { route: style }),
    },
    origins: {
      stroke: stroke?.origin ?? base,
      width: width?.origin ?? base,
      dash: dash?.origin ?? base,
      route: route?.origin ?? base,
    },
  };
}

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

/** Whether a definition of the map comes from a built-in package. */
function fromBuiltIn<T>(byId: ReadonlyMap<Id, Defined<T>>, id: Id): boolean {
  const defined = byId.get(id);
  return defined !== undefined && builtinPackage(defined.package) !== undefined;
}

function resolveComponent(
  id: Id,
  chain: Chain<Component>,
  components: ReadonlyMap<Id, Defined<Component>>,
  entries: Entries,
): ResolvedComponent {
  const [own] = chain.definitions;
  const members: AppearanceMember[] = [
    ...chain.definitions.flatMap((definition) =>
      membersOf(
        definition.id,
        definition.appearance,
        fromBuiltIn(components, definition.id),
        entries.component(definition.id),
      ),
    ),
    ...projectMember(ESSENCE_ID, entries.component(ESSENCE_ID)),
  ];
  const { appearance, origins } = resolveAppearanceWithOrigins(
    members,
    ESSENCE.appearance,
    builtInOrigin(ESSENCE_ID, 'definition'),
  );
  const description = own?.description;
  const packageId = components.get(id)?.package;
  return {
    id,
    name: own?.name ?? id,
    ...(description === undefined ? {} : { description }),
    ...(packageId === undefined ? {} : { package: packageId }),
    lineage: lineageOf(chain, ESSENCE_ID),
    appearance,
    origins,
    darkColors: darkColorsFrom(appearance, origins),
    attributes: mergedAttributes(chain.definitions),
  };
}

function resolveRelationType(
  id: Id,
  chain: Chain<RelationType>,
  relationTypes: ReadonlyMap<Id, Defined<RelationType>>,
  entries: Entries,
): ResolvedRelationType {
  const [own] = chain.definitions;
  const resolved = resolveRelationAppearance([
    ...chain.definitions.flatMap((definition) =>
      membersOf(
        definition.id,
        definition.appearance,
        fromBuiltIn(relationTypes, definition.id),
        entries.relationType(definition.id),
      ),
    ),
    ...projectMember(RELATES_TO_ID, entries.relationType(RELATES_TO_ID)),
  ]);
  // `any` lifts whatever limit is inherited: the end has none.
  const limits = chain.definitions.map((definition) => definition.limits);
  const lifted = (limit: readonly Id[] | 'any' | undefined) =>
    limit === 'any' ? undefined : limit;
  const from = lifted(nearest(limits, 'from'));
  const to = lifted(nearest(limits, 'to'));
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
    appearance: resolved.appearance,
    origins: resolved.origins,
    darkStroke:
      shadeOf('relation-type', resolved.origins.stroke, 'stroke') ?? resolved.appearance.stroke,
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
