/**
 * fast-check arbitraries for the contents of project files: valid ones, built from what the published
 * schema of each kind allows, and ways to bend them as a file edited by hand might be bent.
 */
import fc from 'fast-check';
import type {
  Appearance,
  AttributeDefinition,
  Attributes,
  Badge,
  Component,
  ConnectionPoint,
  DetailRules,
  Element,
  FreeShape,
  JsonValue,
  ModelFile,
  PackageFile,
  Perspective,
  Point,
  ProjectAppearances,
  ProjectFile,
  Relation,
  RelationAppearance,
  RelationType,
  RelationTypeLimits,
  ScenarioFile,
  ShapePosition,
  Step,
  ViewFile,
} from '../files';
import type { FileContentByKind, FileKind } from '../kinds';

/** Any text, with characters outside the Basic Multilingual Plane and lone surrogates. */
const text = fc.string({ unit: 'binary', maxLength: 12 });

/** A finite number. JSON writes -0 as 0, so it is left out. */
const finite = fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (n === 0 ? 0 : n));

/** Any JSON value, with keys of any text. */
export const anyJson = fc.anything({
  key: text,
  values: [fc.boolean(), finite, text, fc.constant(null)],
  maxDepth: 3,
  maxKeys: 4,
}) as fc.Arbitrary<JsonValue>;

const id = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/);
const ids = (minLength = 0) => fc.uniqueArray(id, { minLength, maxLength: 3 });
const name = fc.string({ unit: 'binary', minLength: 1, maxLength: 12 });
const color = fc.stringMatching(/^#[0-9a-fA-F]{6}$/);
const size = fc.double({ min: Number.MIN_VALUE, noNaN: true, noDefaultInfinity: true });
/** The width or height of an appearance: positive and at most 100,000. */
const appearanceSize = fc.double({ min: Number.MIN_VALUE, max: 100_000, noNaN: true });
const list = <T>(item: fc.Arbitrary<T>) => fc.array(item, { maxLength: 3 });
/** A short text of 1 to 4 characters, as a badge writes. */
const badgeText = fc.string({ unit: 'binary', minLength: 1, maxLength: 4 });

const attributes: fc.Arbitrary<Attributes> = fc.dictionary(text, anyJson, {
  maxKeys: 4,
  noNullPrototype: true,
});

const badge: fc.Arbitrary<Badge> = fc.oneof(
  fc.record(
    { when: fc.constant('attribute' as const), text: badgeText, attribute: text },
    { noNullPrototype: true },
  ),
  fc.record(
    { when: fc.constant('from-end' as const), text: badgeText, relationType: id },
    { noNullPrototype: true },
  ),
);

const detail: fc.Arbitrary<DetailRules> = fc.record(
  {
    componentName: fc.boolean(),
    attributes: fc.uniqueArray(text, { maxLength: 8 }),
    badges: fc.array(badge, { maxLength: 8 }),
  },
  { requiredKeys: [], noNullPrototype: true },
);

const connectionPoint: fc.Arbitrary<ConnectionPoint> = fc.record(
  {
    name: fc.string({ unit: 'binary', minLength: 1, maxLength: 32 }),
    side: fc.constantFrom('top', 'right', 'bottom', 'left'),
    at: fc.double({ min: 0, max: 1, noNaN: true }).map((n) => (n === 0 ? 0 : n)),
  },
  { noNullPrototype: true },
);

const appearance: fc.Arbitrary<Appearance> = fc.record(
  {
    shape: fc.constantFrom('rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person'),
    fill: color,
    stroke: color,
    width: appearanceSize,
    height: appearanceSize,
    detail,
    contentsAsRows: fc.boolean(),
    connectionPoints: fc.array(connectionPoint, { maxLength: 3 }),
  },
  { requiredKeys: [], noNullPrototype: true },
);

const relationAppearance: fc.Arbitrary<RelationAppearance> = fc.record(
  { stroke: color, width: size, dash: fc.constantFrom('solid', 'dashed', 'dotted') },
  { requiredKeys: [], noNullPrototype: true },
);

const element: fc.Arbitrary<Element> = fc.record(
  { id, component: id, name, description: text, attributes, appearance },
  { requiredKeys: ['id', 'component', 'name'], noNullPrototype: true },
);

const relation: fc.Arbitrary<Relation> = fc.record(
  {
    id,
    relationType: id,
    from: id,
    to: id,
    name,
    description: text,
    attributes,
    appearance: relationAppearance,
  },
  { requiredKeys: ['id', 'relationType', 'from', 'to'], noNullPrototype: true },
);

const model: fc.Arbitrary<ModelFile> = fc.record(
  { world: element, elements: list(element), relations: list(relation) },
  { noNullPrototype: true },
);

const attributeDefinition: fc.Arbitrary<AttributeDefinition> = fc.record(
  {
    name,
    type: fc.constantFrom('string', 'number', 'boolean', 'json'),
    default: anyJson,
    description: text,
    choices: fc.uniqueArray(text, { minLength: 1, maxLength: 4 }),
    unit: fc.string({ unit: 'binary', minLength: 1, maxLength: 16 }),
  },
  { requiredKeys: ['name', 'type'], noNullPrototype: true },
);

const component: fc.Arbitrary<Component> = fc.record(
  {
    id,
    name,
    derivesFrom: id,
    description: text,
    attributes: list(attributeDefinition),
    appearance,
  },
  { requiredKeys: ['id', 'name', 'derivesFrom'], noNullPrototype: true },
);

/** A limit for one end: a list of at least one id, or `any`. */
const limit = fc.oneof(ids(1), fc.constant('any' as const));

const limits: fc.Arbitrary<RelationTypeLimits> = fc.record(
  { from: limit, to: limit },
  { requiredKeys: [], noNullPrototype: true },
);

const relationType: fc.Arbitrary<RelationType> = fc.record(
  {
    id,
    name,
    derivesFrom: id,
    description: text,
    direction: fc.constantFrom('directed', 'undirected'),
    nests: fc.boolean(),
    attributes: list(attributeDefinition),
    appearance: relationAppearance,
    limits,
  },
  { requiredKeys: ['id', 'name', 'derivesFrom'], noNullPrototype: true },
);

const packageFile: fc.Arbitrary<PackageFile> = fc.record(
  { id, name, description: text, components: list(component), relationTypes: list(relationType) },
  { requiredKeys: ['id', 'name', 'components', 'relationTypes'], noNullPrototype: true },
);

/** Project appearances: never an empty map, and keyed by ids. */
const projectAppearances: fc.Arbitrary<ProjectAppearances> = fc
  .record(
    {
      components: fc.dictionary(id, appearance, { minKeys: 1, maxKeys: 3, noNullPrototype: true }),
      relationTypes: fc.dictionary(id, relationAppearance, {
        minKeys: 1,
        maxKeys: 3,
        noNullPrototype: true,
      }),
    },
    { requiredKeys: [], noNullPrototype: true },
  )
  .filter((each) => Object.keys(each).length > 0);

const project: fc.Arbitrary<ProjectFile> = fc.record(
  {
    schemaVersion: fc.constant(1 as const),
    name,
    description: text,
    packages: ids(),
    appearances: projectAppearances,
  },
  { requiredKeys: ['schemaVersion', 'name', 'packages'], noNullPrototype: true },
);

const perspective: fc.Arbitrary<Perspective> = fc.record(
  { name, description: text },
  { requiredKeys: ['name'], noNullPrototype: true },
);

const position: fc.Arbitrary<ShapePosition> = fc.record(
  {
    element: id,
    container: id,
    x: finite,
    y: finite,
    width: size,
    height: size,
    pinned: fc.boolean(),
  },
  { requiredKeys: ['element', 'x', 'y'], noNullPrototype: true },
);

const point: fc.Arbitrary<Point> = fc.record({ x: finite, y: finite }, { noNullPrototype: true });

const freeShape: fc.Arbitrary<FreeShape> = fc.oneof(
  fc.record(
    {
      kind: fc.constant('note' as const),
      id,
      x: finite,
      y: finite,
      width: size,
      height: size,
      text,
      fill: color,
      stroke: color,
    },
    {
      requiredKeys: ['kind', 'id', 'x', 'y', 'width', 'height', 'text'],
      noNullPrototype: true,
    },
  ),
  fc.record(
    { kind: fc.constant('arrow' as const), id, from: point, to: point, stroke: color },
    { requiredKeys: ['kind', 'id', 'from', 'to'], noNullPrototype: true },
  ),
);

/** A view's stacking order: never empty, and no list empty or with an id twice. */
const stackingOrder = fc.dictionary(id, fc.uniqueArray(id, { minLength: 1, maxLength: 4 }), {
  minKeys: 1,
  maxKeys: 3,
  noNullPrototype: true,
});

const view: fc.Arbitrary<ViewFile> = fc.record(
  {
    id,
    name,
    description: text,
    perspective,
    nestingRelationTypes: ids(),
    positions: list(position),
    freeShapes: list(freeShape),
    stackingOrder,
    collapsed: fc.uniqueArray(id, { minLength: 1, maxLength: 3 }).map((each) => each.sort()),
  },
  {
    requiredKeys: ['id', 'name', 'perspective', 'nestingRelationTypes', 'positions', 'freeShapes'],
    noNullPrototype: true,
  },
);

const step: fc.Arbitrary<Step> = fc.record(
  { id, description: text, relations: ids(1), dataIn: anyJson, dataOut: anyJson },
  { requiredKeys: ['id', 'description', 'relations'], noNullPrototype: true },
);

const scenario: fc.Arbitrary<ScenarioFile> = fc.record(
  { id, name, description: text, view: id, steps: list(step) },
  { requiredKeys: ['id', 'name', 'view', 'steps'], noNullPrototype: true },
);

/** The contents of each kind of project file, valid against the published schema of the kind. */
export const validContents: { [K in FileKind]: fc.Arbitrary<FileContentByKind[K]> } = {
  project,
  model,
  package: packageFile,
  view,
  scenario,
};

/** Keys a bent object may gain: keys that other objects of the files list, and any text. */
const strayKey = fc.oneof(
  fc.constantFrom('kind', 'id', 'from', 'x', 'name', 'attributes', 'zIndex', '__proto__'),
  text,
);

/**
 * Contents bent out of their schema, as a file edited by hand may be: some values replaced by JSON
 * values of any type, and some objects given keys their schema does not list.
 */
export function bent<T>(contents: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc
    .tuple(
      contents,
      fc.integer(),
      fc.array(anyJson, { minLength: 1, maxLength: 4 }),
      fc.array(strayKey, { minLength: 1, maxLength: 4 }),
    )
    .map(([value, seed, strays, keys]) => bend(value, seed, strays, keys));
}

/**
 * A copy of a value with some of the values inside it replaced by strays, and stray keys added to
 * some of its objects. Which ones is drawn from the seed; the value itself is never replaced.
 */
function bend(
  value: unknown,
  seed: number,
  strays: readonly JsonValue[],
  keys: readonly string[],
): unknown {
  const random = randomNumbers(seed);
  let drawn = 0;
  const draw = <T>(from: readonly T[]): T => from[drawn++ % from.length] as T;
  /** A value inside the copy: now and then a stray in its place. */
  const bendItem = (item: unknown): unknown => (random() < 0.1 ? draw(strays) : visit(item));
  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(bendItem);
    if (typeof current !== 'object' || current === null) return current;
    const entries: [string, unknown][] = Object.entries(current).map(([key, item]) => [
      key,
      bendItem(item),
    ]);
    if (random() < 0.3) entries.push([draw(keys), draw(strays)]);
    // Object.fromEntries creates "__proto__" as a key of its own, as JSON.parse does.
    return Object.fromEntries(entries);
  };
  return visit(value);
}

/** A deep copy of a value with the keys of each of its objects in an order drawn from the seed. */
export function shuffleKeys<T>(value: T, seed: number): T {
  const random = randomNumbers(seed);
  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(visit);
    if (typeof current !== 'object' || current === null) return current;
    const shuffled = Object.entries(current)
      .map((entry) => ({ entry, rank: random() }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ entry: [key, item] }) => [key, visit(item)]);
    return Object.fromEntries(shuffled);
  };
  return visit(value) as T;
}

/** A source of pseudo-random numbers in [0, 1) that the seed determines (mulberry32). */
function randomNumbers(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
