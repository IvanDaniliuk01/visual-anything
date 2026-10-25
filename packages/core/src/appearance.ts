/**
 * Appearances: how the shapes of a component's elements, or of one element, look. Every trait is
 * inherited from the nearest definition that sets it, each part of the detail on its own, up to
 * Essence; whatever an element's own appearance sets is a particularity. The scene, the outline, the
 * inspector and Claude's read tools all work an appearance out, and what a shape writes, here.
 */
import type {
  Appearance,
  AttributeDefinition,
  Attributes,
  Badge,
  Color,
  ConnectionPoint,
  DetailRules,
  Id,
  JsonValue,
  Relation,
} from '@visual-anything/schema';
import { ESSENCE_ID } from '@visual-anything/schema';
import { ESSENCE } from './builtin/essence-and-relates-to';
import type { Definitions } from './definitions';

/** What a shape writes under its element's name, with every part worked out. */
export interface ResolvedDetail {
  componentName: boolean;
  attributes: readonly string[];
  badges: readonly Badge[];
}

/** How an element's shapes are drawn, with every trait worked out. */
export interface ResolvedAppearance {
  shape: NonNullable<Appearance['shape']>;
  fill: Color;
  stroke: Color;
  width: number;
  height: number;
  detail: ResolvedDetail;
  contentsAsRows: boolean;
  /** Empty when relations attach anywhere on the border. */
  connectionPoints: readonly ConnectionPoint[];
}

/**
 * A list of the members of `T`, which compiles only while it names every one of them: adding a key
 * to `Appearance` without listing it below is an error here.
 */
function listingEvery<T>() {
  return <const L extends readonly T[]>(
    list: L &
      ([Exclude<T, L[number]>] extends [never] ? unknown : { missing: Exclude<T, L[number]> }),
  ): L => list;
}

/** Every trait of an appearance, in the order the component editor shows them. */
export const APPEARANCE_TRAITS = listingEvery<keyof Appearance>()([
  'shape',
  'fill',
  'stroke',
  'width',
  'height',
  'detail',
  'contentsAsRows',
  'connectionPoints',
]);

/** A trait of an appearance. */
export type AppearanceTrait = (typeof APPEARANCE_TRAITS)[number];

/** A trait, or one part of the detail, each of which is inherited on its own. */
export type TraitPath =
  | Exclude<AppearanceTrait, 'detail'>
  | 'detail.componentName'
  | 'detail.attributes'
  | 'detail.badges';

/** Every trait path, in the order the component editor shows them. */
export const TRAIT_PATHS: readonly TraitPath[] = [
  'shape',
  'fill',
  'stroke',
  'width',
  'height',
  'detail.componentName',
  'detail.attributes',
  'detail.badges',
  'contentsAsRows',
  'connectionPoints',
];

/** The value the nearest member of a chain sets for a key, if one does. */
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
 * An appearance worked out from a chain, nearest first, over `base`: each trait from the nearest
 * member that sets it, each part of the detail on its own. An empty list of connection points is set:
 * it has relations attach anywhere on the border, whatever is inherited.
 */
export function resolveAppearance(
  chain: readonly (Appearance | undefined)[],
  base: ResolvedAppearance,
): ResolvedAppearance {
  const details = chain.map((each) => each?.detail);
  return {
    shape: nearest(chain, 'shape') ?? base.shape,
    fill: nearest(chain, 'fill') ?? base.fill,
    stroke: nearest(chain, 'stroke') ?? base.stroke,
    width: nearest(chain, 'width') ?? base.width,
    height: nearest(chain, 'height') ?? base.height,
    detail: {
      componentName: nearest(details, 'componentName') ?? base.detail.componentName,
      attributes: nearest(details, 'attributes') ?? base.detail.attributes,
      badges: nearest(details, 'badges') ?? base.detail.badges,
    },
    contentsAsRows: nearest(chain, 'contentsAsRows') ?? base.contentsAsRows,
    connectionPoints: nearest(chain, 'connectionPoints') ?? base.connectionPoints,
  };
}

/**
 * Where a trait comes from: `own` for an element's own appearance, otherwise the id of the definition
 * that sets it, which is `essence` for Essence.
 */
export type TraitSource = Id;

/**
 * Where a trait's value comes from, as the inspector and Claude say it: the element's or relation's
 * own appearance, or a definition, either through the definition itself or through the project
 * appearance the project gives it. `builtIn` is true for Essence, "relates to" and the definitions of
 * built-in packages, whose colors take their dark shades while they come through the definition.
 */
export type TraitOrigin =
  { kind: 'own' } | { kind: 'definition'; id: Id; via: 'definition' | 'project'; builtIn: boolean };

/** One appearance an appearance is worked out from, and where its traits come from. */
export interface AppearanceMember {
  appearance: Appearance | undefined;
  origin: TraitOrigin;
}

/** The value an appearance gives a trait path, such as `detail.badges`; `undefined` when it sets none. */
export function traitValue(appearance: Appearance | undefined, path: TraitPath): unknown {
  const [trait, part] = path.split('.') as [AppearanceTrait, keyof DetailRules | undefined];
  const value = part === undefined ? appearance?.[trait] : appearance?.detail?.[part];
  return value === null ? undefined : value;
}

/**
 * An appearance worked out from its members, nearest first, over `base`, and where each trait comes
 * from: the first member that sets it, or `baseOrigin` when none does.
 */
export function resolveAppearanceWithOrigins(
  members: readonly AppearanceMember[],
  base: ResolvedAppearance,
  baseOrigin: TraitOrigin,
): { appearance: ResolvedAppearance; origins: Readonly<Record<TraitPath, TraitOrigin>> } {
  const appearance = resolveAppearance(
    members.map((member) => member.appearance),
    base,
  );
  const origins = Object.fromEntries(
    TRAIT_PATHS.map((path) => [
      path,
      members.find((member) => traitValue(member.appearance, path) !== undefined)?.origin ??
        baseOrigin,
    ]),
  ) as Record<TraitPath, TraitOrigin>;
  return { appearance, origins };
}

/** Origins with the traits an element's own appearance sets as its own. */
export function withOwnOrigins(
  origins: Readonly<Record<TraitPath, TraitOrigin>>,
  own: Appearance | undefined,
): Readonly<Record<TraitPath, TraitOrigin>> {
  if (own === undefined) return origins;
  return Object.fromEntries(
    TRAIT_PATHS.map((path) => [
      path,
      traitValue(own, path) === undefined ? origins[path] : { kind: 'own' },
    ]),
  ) as Record<TraitPath, TraitOrigin>;
}

/** Where every trait of a component, or of one element, comes from, and where each attribute does. */
export interface TraitSources {
  traits: Readonly<Record<TraitPath, TraitSource>>;
  /** The same, saying also whether a project appearance sets it and whether it is built in. */
  origins: Readonly<Record<TraitPath, TraitOrigin>>;
  /** For each attribute the component has, the nearest definition that defines it. */
  attributes: ReadonlyMap<string, Id>;
}

/**
 * Where each trait of a component comes from, and each of its attributes: `own` for what `own`, an
 * element's own appearance, sets; otherwise the id of the nearest definition that sets it, itself or
 * through the project appearance given to it, or Essence. The component editor shows them as "its
 * own", "from Database" or "from Essence".
 */
export function traitSources(
  definitions: Definitions,
  componentId: Id,
  own?: Appearance,
): TraitSources {
  const component = definitions.component(componentId) ?? definitions.component(ESSENCE_ID);
  const origins = withOwnOrigins(component?.origins ?? ESSENCE_ORIGINS, own);
  const traits = Object.fromEntries(
    TRAIT_PATHS.map((path) => {
      const origin = origins[path];
      return [path, origin.kind === 'own' ? 'own' : origin.id];
    }),
  ) as Record<TraitPath, TraitSource>;
  const lineage = (definitions.component(componentId)?.lineage ?? []).filter(
    (id) => id !== ESSENCE_ID,
  );
  const chain = lineage.flatMap((id) => {
    const definition = definitions.components.get(id)?.definition;
    return definition === undefined ? [] : [{ id, definition }];
  });
  const attributes = new Map<string, Id>();
  for (const name of (definitions.component(componentId)?.attributes ?? []).map((a) => a.name)) {
    const definer = chain.find(({ definition }) =>
      (definition.attributes ?? []).some((attribute) => attribute.name === name),
    );
    if (definer !== undefined) attributes.set(name, definer.id);
  }
  return { traits, origins, attributes };
}

/** Every trait as Essence gives it, when nothing nearer sets it. */
const ESSENCE_ORIGINS = Object.fromEntries(
  TRAIT_PATHS.map((path) => [
    path,
    { kind: 'definition', id: ESSENCE_ID, via: 'definition', builtIn: true },
  ]),
) as Record<TraitPath, TraitOrigin>;

/** Whether a value fits an attribute type. */
export function valueFitsType(value: JsonValue, type: AttributeDefinition['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
      return true;
  }
}

/** Something created from a component, as far as its attributes and its look go. */
export interface Typed {
  component: Id;
  attributes?: Attributes;
  appearance?: Appearance;
}

/**
 * An element's value for an attribute: its own, otherwise the default its component gives (the one
 * the nearest definition of the attribute gives), otherwise `undefined`.
 */
export function attributeValue(
  element: Typed,
  name: string,
  definitions: Definitions,
): JsonValue | undefined {
  const own = element.attributes;
  if (own !== undefined && Object.hasOwn(own, name)) return own[name];
  return attributeDefinitionOf(element, name, definitions)?.default;
}

/** The definition an element's component gives an attribute, if any. */
function attributeDefinitionOf(
  element: Typed,
  name: string,
  definitions: Definitions,
): AttributeDefinition | undefined {
  return definitions
    .component(element.component)
    ?.attributes.find((attribute) => attribute.name === name);
}

/** One part of what a shape writes under its element's name. */
export type DetailPart =
  | { kind: 'component-name'; text: string }
  | { kind: 'attribute'; attribute: string; text: string }
  | { kind: 'badge'; text: string };

/** How long JSON written in a detail may be, "…" included. */
const JSON_LENGTH = 40;

/**
 * What a shape of an element writes under its name, part by part: its component's name if its detail
 * says so, then the values of the attributes it shows, then the badges whose condition holds.
 * `startedTypes` are the relation types of the relations the element is the `from` end of.
 *
 * A string is written as it is, a number in decimal followed by its unit, a boolean as the
 * attribute's name while it is true, and JSON compactly, cut to 40 characters; an attribute without a
 * value, an empty string and null write nothing.
 */
export function detailParts(
  element: Typed,
  definitions: Definitions,
  startedTypes: ReadonlySet<Id>,
): DetailPart[] {
  const component = definitions.component(element.component);
  const detail = resolveAppearance(
    [element.appearance],
    (component ?? definitions.component(ESSENCE_ID))?.appearance ?? ESSENCE.appearance,
  ).detail;
  const parts: DetailPart[] = [];
  if (detail.componentName) {
    parts.push({ kind: 'component-name', text: component?.name ?? element.component });
  }
  for (const name of detail.attributes) {
    const value = attributeValue(element, name, definitions);
    const unit = attributeDefinitionOf(element, name, definitions)?.unit;
    const text = valueText(name, value, unit);
    if (text !== undefined) parts.push({ kind: 'attribute', attribute: name, text });
  }
  for (const badge of detail.badges) {
    const holds =
      badge.when === 'attribute'
        ? attributeValue(element, badge.attribute, definitions) === true
        : [...startedTypes].some((type) =>
            definitions.relationTypeDerives(type, badge.relationType),
          );
    if (holds) parts.push({ kind: 'badge', text: badge.text });
  }
  return parts;
}

/** What a shape writes for one attribute's value; `undefined` when it writes nothing. */
function valueText(
  name: string,
  value: JsonValue | undefined,
  unit: string | undefined,
): string | undefined {
  if (value === undefined || value === null || value === '' || value === false) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return unit === undefined ? String(value) : `${value} ${unit}`;
  if (value === true) return name;
  const json = JSON.stringify(value);
  return json.length > JSON_LENGTH ? `${json.slice(0, JSON_LENGTH - 1)}…` : json;
}

/** The parts of a detail on one line, joined by " · "; empty when there are none. */
export function detailText(parts: readonly DetailPart[]): string {
  return parts.map((part) => part.text).join(' · ');
}

/**
 * For each element or relation that is the `from` end of relations, the relation types of those
 * relations, in model order: what from-end badges are worked out from.
 */
export function startedTypesByElement(relations: readonly Relation[]): Map<Id, Set<Id>> {
  const started = new Map<Id, Set<Id>>();
  for (const relation of relations) {
    const types = started.get(relation.from);
    if (types === undefined) started.set(relation.from, new Set([relation.relationType]));
    else types.add(relation.relationType);
  }
  return started;
}
