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
  CommentAnchor,
  CommentAuthor,
  CommentFile,
  Component,
  ConnectionPoint,
  DetailRules,
  Element,
  FreeShape,
  JsonValue,
  LevelOfDetail,
  LevelPart,
  ModelFile,
  Overlay,
  PackageFile,
  Perspective,
  Point,
  ProjectAppearances,
  ProjectFile,
  Relation,
  RelationAppearance,
  RelationType,
  RelationTypeLimits,
  SavedCondition,
  SavedTimeRange,
  SavedViewState,
  ScenarioFile,
  Scope,
  ScopeRule,
  ShapePosition,
  Step,
  ThreadComment,
  TourFile,
  TourStep,
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
/** A place on the canvas, at most ten million canvas units from its origin either way. */
const coordinate = fc
  .double({ min: -10_000_000, max: 10_000_000, noNaN: true })
  .map((n) => (n === 0 ? 0 : n));
/** The width or height of a shape on the canvas: positive and at most ten million. */
const canvasSize = fc.double({ min: Number.MIN_VALUE, max: 10_000_000, noNaN: true });
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

/** A scale of the canvas, from 0 to 8, as levels of detail start at (ADR 0055). */
const scale = fc.double({ min: 0, max: 8, noNaN: true }).map((n) => (n === 0 ? 0 : n));

/** A level of detail: a silhouette only, or some of the other parts, each once. */
const level: fc.Arbitrary<LevelOfDetail> = fc.record(
  {
    from: scale,
    shows: fc.oneof(
      fc.constant<LevelPart[]>(['silhouette']),
      fc.uniqueArray(fc.constantFrom<LevelPart>('name', 'detail', 'contents', 'image'), {
        minLength: 1,
        maxLength: 4,
      }),
    ),
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
    levels: fc.array(level, { maxLength: 3 }),
    expandFrom: fc.double({ min: Number.MIN_VALUE, max: 8, noNaN: true }),
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
    x: coordinate,
    y: coordinate,
    width: canvasSize,
    height: canvasSize,
    pinned: fc.boolean(),
  },
  { requiredKeys: ['element', 'x', 'y'], noNullPrototype: true },
);

const point: fc.Arbitrary<Point> = fc.record(
  { x: coordinate, y: coordinate },
  { noNullPrototype: true },
);

const freeShape: fc.Arbitrary<FreeShape> = fc.oneof(
  fc.record(
    {
      kind: fc.constant('note' as const),
      id,
      x: coordinate,
      y: coordinate,
      width: canvasSize,
      height: canvasSize,
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

/** A rule of a scope, of each kind (ADR 0040). */
const scopeRule: fc.Arbitrary<ScopeRule> = fc.oneof(
  fc.record(
    { kind: fc.constant('component' as const), component: id, exactly: fc.boolean() },
    { requiredKeys: ['kind', 'component'], noNullPrototype: true },
  ),
  fc.record(
    { kind: fc.constant('relation-type' as const), relationType: id, exactly: fc.boolean() },
    { requiredKeys: ['kind', 'relationType'], noNullPrototype: true },
  ),
  fc.record(
    {
      kind: fc.constant('contents' as const),
      container: id,
      depth: fc.integer({ min: 1, max: 1000 }),
    },
    { requiredKeys: ['kind', 'container'], noNullPrototype: true },
  ),
  fc.record(
    {
      kind: fc.constant('attribute' as const),
      attribute: name,
      test: fc.constantFrom('is', 'is-not', 'contains', 'below', 'above', 'set', 'unset' as const),
      value: text,
    },
    { requiredKeys: ['kind', 'attribute', 'test'], noNullPrototype: true },
  ),
);

/** A scope with at least one part; its id lists sorted and apart, as the commands keep them. */
const scope: fc.Arbitrary<Scope> = fc
  .record(
    {
      include: fc.array(scopeRule, { minLength: 1, maxLength: 3 }),
      exclude: fc.array(scopeRule, { minLength: 1, maxLength: 2 }),
      ids: fc.uniqueArray(id, { minLength: 1, maxLength: 4 }),
      split: fc.nat(4),
    },
    { requiredKeys: ['ids', 'split'], noNullPrototype: true },
  )
  .map(({ include, exclude, ids: named, split }) => {
    const added = named.slice(0, split).sort();
    const leftOut = named.slice(split).sort();
    return {
      ...(include ? { include } : {}),
      ...(exclude ? { exclude } : {}),
      ...(added.length > 0 ? { added } : {}),
      ...(leftOut.length > 0 ? { leftOut } : {}),
    };
  });

/** A value an overlay compares an attribute with. */
const caseValue = fc.oneof(text, finite.map(String), fc.boolean().map(String));
const legendLabel = fc.string({ unit: 'binary', minLength: 1, maxLength: 64 });

/** Stops of an overlay's range: two to four, at numbers in increasing order. */
const stopsOf = <T>(value: fc.Arbitrary<T>) =>
  fc
    .uniqueArray(finite, { minLength: 2, maxLength: 4 })
    .chain((ats) =>
      fc.tuple(...ats.sort((a, b) => a - b).map((at) => value.map((to) => ({ at, to })))),
    );

/** A mapping of one channel: values to what the channel takes, a range of numbers, or the value itself. */
function mappingOf<K extends string>(
  key: K,
  value: fc.Arbitrary<unknown>,
  ranged: boolean,
  passthrough: boolean,
): fc.Arbitrary<unknown> {
  const cases = fc.record(
    {
      kind: fc.constant('discrete' as const),
      cases: fc.array(
        fc.record(
          { value: caseValue, [key]: value, label: legendLabel },
          { requiredKeys: ['value', key], noNullPrototype: true },
        ),
        { minLength: 1, maxLength: 3 },
      ),
      otherwise: value,
    },
    { requiredKeys: ['kind', 'cases'], noNullPrototype: true },
  );
  const range = stopsOf(value).map((stops) => ({
    kind: 'continuous' as const,
    stops: stops.map(({ at, to }) => ({ at, [key]: to })),
  }));
  return fc.oneof(
    cases,
    ...(ranged ? [range] : []),
    ...(passthrough ? [fc.constant({ kind: 'passthrough' as const })] : []),
  );
}

const sizeFactor = fc.double({ min: 0.5, max: 2, noNaN: true });
const opacityValue = fc.double({ min: 0.1, max: 1, noNaN: true });
const overlayBadge = fc.string({ unit: 'binary', minLength: 1, maxLength: 12 });

/** An overlay of each channel (ADR 0055). */
const overlay: fc.Arbitrary<Overlay> = fc
  .record(
    {
      id,
      name: fc.string({ unit: 'binary', minLength: 1, maxLength: 64 }),
      of: fc.constantFrom('elements' as const, 'relations' as const),
      attribute: name,
      off: fc.boolean(),
      channelAndMapping: fc.oneof(
        mappingOf('color', color, true, true).map((mapping) => ({ channel: 'fill', mapping })),
        mappingOf('color', color, true, true).map((mapping) => ({ channel: 'stroke', mapping })),
        mappingOf('size', sizeFactor, true, false).map((mapping) => ({ channel: 'size', mapping })),
        mappingOf('text', overlayBadge, false, true).map((mapping) => ({
          channel: 'badge',
          mapping,
        })),
        mappingOf('opacity', opacityValue, true, false).map((mapping) => ({
          channel: 'opacity',
          mapping,
        })),
      ),
    },
    { requiredKeys: ['id', 'of', 'attribute', 'channelAndMapping'], noNullPrototype: true },
  )
  .map(({ channelAndMapping, ...rest }) => ({ ...rest, ...channelAndMapping }) as Overlay);

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
    scope,
    overlays: fc.array(overlay, { minLength: 1, maxLength: 3 }),
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

/** A text of 1 to `max` characters, with any characters, as a caption or a comment may hold. */
const filled = (max = 12) => fc.string({ unit: 'binary', minLength: 1, maxLength: max });
const someIds = fc.uniqueArray(id, { minLength: 1, maxLength: 3 });

const condition: fc.Arbitrary<SavedCondition> = fc.oneof(
  fc.record(
    {
      of: fc.constantFrom('elements' as const, 'relations' as const),
      attribute: filled(),
      test: fc.constantFrom('is' as const, 'is-not' as const, 'contains' as const),
      value: filled(),
    },
    { noNullPrototype: true },
  ),
  fc.record(
    {
      of: fc.constantFrom('elements' as const, 'relations' as const),
      attribute: filled(),
      test: fc.constantFrom('set' as const, 'unset' as const),
    },
    { noNullPrototype: true },
  ),
);

const timeRange: fc.Arbitrary<SavedTimeRange> = fc.record(
  {
    of: fc.constantFrom('elements' as const, 'relations' as const),
    attribute: filled(),
    until: filled(),
    kind: fc.constantFrom('number' as const, 'date' as const, 'time' as const),
    from: finite,
    to: finite,
  },
  { requiredKeys: ['of', 'attribute', 'kind', 'from', 'to'], noNullPrototype: true },
);

const viewState: fc.Arbitrary<SavedViewState> = fc.record(
  {
    view: id,
    camera: fc.record(
      {
        x: fc.double({ min: -1e9, max: 1e9, noNaN: true }).map((n) => (n === 0 ? 0 : n)),
        y: fc.double({ min: -1e9, max: 1e9, noNaN: true }).map((n) => (n === 0 ? 0 : n)),
        zoom: fc.double({ min: 0.001, max: 1000, noNaN: true }),
      },
      { noNullPrototype: true },
    ),
    select: someIds,
    filters: fc
      .record(
        {
          components: someIds,
          relationTypes: someIds,
          conditions: fc.array(condition, { minLength: 1, maxLength: 3 }),
          range: timeRange,
        },
        { requiredKeys: [], noNullPrototype: true },
      )
      .filter((filters) => Object.keys(filters).length > 0),
    focus: fc.record(
      {
        degrees: fc.oneof(fc.integer({ min: 1, max: 5 }), fc.constant('all' as const)),
        direction: fc.constantFrom('both' as const, 'outgoing' as const, 'incoming' as const),
        isolate: fc.boolean(),
        from: someIds,
      },
      { requiredKeys: ['degrees', 'direction'], noNullPrototype: true },
    ),
    scenario: id,
    step: id,
  },
  { requiredKeys: ['view'], noNullPrototype: true },
);

const tourStep: fc.Arbitrary<TourStep> = fc.record(
  {
    id,
    viewState,
    caption: fc.record(
      { title: filled(), text: filled() },
      { requiredKeys: ['title'], noNullPrototype: true },
    ),
    marks: someIds,
    play: fc.record(
      { scenario: id, from: id, to: id },
      { requiredKeys: ['scenario'], noNullPrototype: true },
    ),
    notes: filled(),
  },
  { requiredKeys: ['id', 'viewState', 'caption'], noNullPrototype: true },
);

const tour: fc.Arbitrary<TourFile> = fc.record(
  { id, name, description: text, steps: list(tourStep) },
  { requiredKeys: ['id', 'name', 'steps'], noNullPrototype: true },
);

const anchor: fc.Arbitrary<CommentAnchor> = fc.oneof(
  fc.record({ kind: fc.constant('element' as const), element: id }, { noNullPrototype: true }),
  fc.record({ kind: fc.constant('relation' as const), relation: id }, { noNullPrototype: true }),
  fc.record({ kind: fc.constant('view' as const), view: id }, { noNullPrototype: true }),
  fc.record(
    { kind: fc.constant('point' as const), view: id, x: coordinate, y: coordinate },
    { noNullPrototype: true },
  ),
);

/** A time as `Date.prototype.toISOString` writes it, between the years 1970 and 9999. */
const time = fc
  .integer({ min: 0, max: 253_402_300_799_999 })
  .map((ms) => new Date(ms).toISOString());

const author: fc.Arbitrary<CommentAuthor> = fc.oneof(
  fc.record(
    {
      kind: fc.constant('person' as const),
      name: filled(),
      email: fc.stringMatching(/^[a-z0-9.]{1,8}@[a-z0-9.]{1,8}$/),
    },
    { requiredKeys: ['kind', 'name'], noNullPrototype: true },
  ),
  fc.record({ kind: fc.constant('claude' as const) }, { noNullPrototype: true }),
);

const threadComment: fc.Arbitrary<ThreadComment> = fc.record(
  { id, author, time, edited: time, text: filled() },
  { requiredKeys: ['id', 'author', 'time', 'text'], noNullPrototype: true },
);

const thread: fc.Arbitrary<CommentFile> = fc.record(
  {
    id,
    anchor,
    resolved: fc.boolean(),
    comments: fc.array(threadComment, { minLength: 1, maxLength: 3 }),
  },
  { requiredKeys: ['id', 'anchor', 'comments'], noNullPrototype: true },
);

/** The contents of each kind of project file, valid against the published schema of the kind. */
export const validContents: { [K in FileKind]: fc.Arbitrary<FileContentByKind[K]> } = {
  project,
  model,
  package: packageFile,
  view,
  scenario,
  tour,
  comment: thread,
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
