/**
 * The Structurizr reader (ADR-0042, R36): a workspace in JSON, as the Structurizr CLI's
 * `export -format json` writes it, becomes a plan.
 *
 * - **Elements:** people, software systems, containers, components, deployment nodes, infrastructure
 *   nodes, container and software system instances, and custom elements, of kinds named as
 *   Structurizr names them, with the shape their styles give when it is not a box.
 * - **Containment:** each container in its software system, each component in its container, and
 *   deployment nodes, infrastructure nodes and instances in their deployment node.
 * - **Relations:** every relationship of the model, implied ones included, and one from each instance
 *   to what it is an instance of.
 * - **Views:** each view shows what it includes, where its manual layout places it, at half the size
 *   Structurizr draws, with its relationships' vertices as bend points; a container drawn around
 *   others gets the box around them. Filtered views show what their base view shows that their tags
 *   keep.
 *
 * Workspace DSL is not read: the Structurizr CLI, which the person runs, exports it as JSON. Image
 * views, documentation and decisions are left out and reported; dynamic views keep their elements
 * and leave out the order of their steps.
 */
import type { Id, JsonValue, Point } from '@visual-anything/schema';
import { MAX_BEND_POINTS } from '../routes';
import { JsonReader, own, ownEntries, parseJson, type JsonObject } from './json-read';
import {
  IMPORT_LIMITS,
  type ImportPlan,
  type PlannedElement,
  type PlannedRelation,
  type PlannedView,
} from './plan';
import {
  KindCounter,
  Unmatched,
  attributesFrom,
  descriptionFrom,
  nameFrom,
  reading,
  refuse,
  suggestionFor,
  webAddress,
  type ImportRead,
  type ReadOptions,
} from './reading';
import { coordinate, placesInView, type Box } from './view-places';

/** How much smaller than Structurizr draws them an imported view's shapes are. */
const SCALE = 0.5;
/** Structurizr's size for an element whose styles give none. */
const DEFAULT_SIZE = { width: 450, height: 300 };
/** How deeply deployment nodes may nest. */
const MAX_DEPTH = 64;
/** The most attributes an element or relation keeps from its properties. */
const MAX_PROPERTIES = 100;

/** The tags every element or relationship of a type has, which say nothing more. */
const DEFAULT_TAGS = new Set([
  'Element',
  'Person',
  'Software System',
  'Container',
  'Component',
  'Deployment Node',
  'Infrastructure Node',
  'Container Instance',
  'Software System Instance',
  'Relationship',
]);

type ElementType =
  | 'Person'
  | 'Software System'
  | 'Container'
  | 'Component'
  | 'Deployment Node'
  | 'Infrastructure Node'
  | 'Container Instance'
  | 'Software System Instance'
  | 'Custom Element';

/** The view lists that hold views of elements, in the order they are read. */
const VIEW_LISTS = [
  'systemLandscapeViews',
  'systemContextViews',
  'containerViews',
  'componentViews',
  'dynamicViews',
  'deploymentViews',
  'customViews',
] as const;

/** Reads a Structurizr workspace in JSON. */
export function readStructurizr(text: string, source: string, options?: ReadOptions): ImportRead {
  return reading(() => planOf(parseJson(text), source, options));
}

/** An element as read, before it is planned. */
interface ReadElement {
  id: string;
  type: ElementType;
  name: string | undefined;
  tags: string[];
  parent: string | undefined;
  /** What an instance is an instance of. */
  instanceOf: string | undefined;
  object: JsonObject;
  path: string;
}

interface ReadRelationship {
  id: string;
  from: string;
  to: string;
  object: JsonObject;
  path: string;
}

/** A style, as the workspace's configuration gives it by tag. */
interface Style {
  shape?: string;
  width?: number;
  height?: number;
}

function tagsOf(json: JsonReader, value: unknown, path: string): string[] {
  const text = json.textOr(value, path);
  if (text === undefined) return [];
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

function planOf(parsed: unknown, source: string, options: ReadOptions | undefined): ImportPlan {
  const json = new JsonReader('workspace', 'Structurizr');
  const unmatched = new Unmatched();
  const root = json.object(parsed, '(the file)');
  const modelValue = own(root, 'model');
  if (!json.isObject(modelValue)) {
    refuse('The file is not a Structurizr workspace: it has no model.');
  }
  const model = modelValue;

  // Every element and relationship, by walking the model as Structurizr nests it.
  const elements: ReadElement[] = [];
  const relationships: ReadRelationship[] = [];
  const ids = new Set<string>();
  const take = (id: string) => {
    if (ids.has(id)) refuse(`The workspace holds the id "${id}" twice.`);
    ids.add(id);
  };
  const element = (
    value: unknown,
    path: string,
    type: ElementType,
    parent: string | undefined,
    instanceKey?: string,
  ): ReadElement => {
    const object = json.object(value, path);
    const id = json.text(own(object, 'id'), `${path}.id`);
    take(id);
    const name =
      instanceKey === undefined
        ? json.text(own(object, 'name'), `${path}.name`)
        : json.textOr(own(object, 'name'), `${path}.name`);
    const instanceOf =
      instanceKey === undefined
        ? undefined
        : json.text(own(object, instanceKey), `${path}.${instanceKey}`);
    const read: ReadElement = {
      id,
      type,
      name,
      tags: tagsOf(json, own(object, 'tags'), `${path}.tags`),
      parent,
      instanceOf,
      object,
      path,
    };
    elements.push(read);
    json.list(own(object, 'relationships'), `${path}.relationships`).forEach((each, at) => {
      const where = `${path}.relationships[${at}]`;
      const relationship = json.object(each, where);
      const relationshipId = json.text(own(relationship, 'id'), `${where}.id`);
      take(relationshipId);
      relationships.push({
        id: relationshipId,
        from: json.textOr(own(relationship, 'sourceId'), `${where}.sourceId`) ?? id,
        to: json.text(own(relationship, 'destinationId'), `${where}.destinationId`),
        object: relationship,
        path: where,
      });
    });
    return read;
  };
  const each = (value: unknown, path: string, visit: (item: unknown, path: string) => void) => {
    json.list(value, path).forEach((item, at) => visit(item, `${path}[${at}]`));
  };

  each(own(model, 'people'), 'model.people', (item, path) =>
    element(item, path, 'Person', undefined),
  );
  each(own(model, 'softwareSystems'), 'model.softwareSystems', (item, path) => {
    const system = element(item, path, 'Software System', undefined);
    each(own(system.object, 'containers'), `${path}.containers`, (inner, innerPath) => {
      const container = element(inner, innerPath, 'Container', system.id);
      each(own(container.object, 'components'), `${innerPath}.components`, (part, partPath) => {
        element(part, partPath, 'Component', container.id);
      });
    });
  });
  const deploymentNode = (
    value: unknown,
    path: string,
    parent: string | undefined,
    depth: number,
  ) => {
    if (depth > MAX_DEPTH) refuse(`The workspace nests deployment nodes over ${MAX_DEPTH} deep.`);
    const node = element(value, path, 'Deployment Node', parent);
    each(own(node.object, 'children'), `${path}.children`, (child, childPath) =>
      deploymentNode(child, childPath, node.id, depth + 1),
    );
    each(own(node.object, 'infrastructureNodes'), `${path}.infrastructureNodes`, (item, itemPath) =>
      element(item, itemPath, 'Infrastructure Node', node.id),
    );
    each(
      own(node.object, 'softwareSystemInstances'),
      `${path}.softwareSystemInstances`,
      (item, itemPath) =>
        element(item, itemPath, 'Software System Instance', node.id, 'softwareSystemId'),
    );
    each(own(node.object, 'containerInstances'), `${path}.containerInstances`, (item, itemPath) =>
      element(item, itemPath, 'Container Instance', node.id, 'containerId'),
    );
  };
  each(own(model, 'deploymentNodes'), 'model.deploymentNodes', (item, path) =>
    deploymentNode(item, path, undefined, 1),
  );
  each(own(model, 'customElements'), 'model.customElements', (item, path) =>
    element(item, path, 'Custom Element', undefined),
  );

  // Past the limits, the import would be refused; refusing now keeps every later step within them.
  if (elements.length > IMPORT_LIMITS.elements) {
    refuse(
      `The file holds ${elements.length.toLocaleString('en')} elements; an import brings at most ${IMPORT_LIMITS.elements.toLocaleString('en')}.`,
    );
  }
  const relationCount =
    relationships.length + elements.filter((read) => read.parent !== undefined).length;
  if (relationCount > IMPORT_LIMITS.relations) {
    refuse(
      `The file holds ${relationCount.toLocaleString('en')} relations, those that put one thing inside another included; an import brings at most ${IMPORT_LIMITS.relations.toLocaleString('en')}.`,
    );
  }

  // Styles by tag, for shapes and sizes.
  const viewsObject = json.objectOr(own(root, 'views'), 'views');
  const configuration = json.objectOr(own(viewsObject, 'configuration'), 'views.configuration');
  const styles = json.objectOr(own(configuration, 'styles'), 'views.configuration.styles');
  const styleByTag = new Map<string, Style>();
  each(own(styles, 'elements'), 'views.configuration.styles.elements', (item, path) => {
    const style = json.object(item, path);
    const tag = json.textOr(own(style, 'tag'), `${path}.tag`);
    if (tag === undefined) return;
    const known = styleByTag.get(tag) ?? {};
    const shape = json.textOr(own(style, 'shape'), `${path}.shape`);
    const width = json.numberOr(own(style, 'width'), `${path}.width`);
    const height = json.numberOr(own(style, 'height'), `${path}.height`);
    styleByTag.set(tag, {
      ...known,
      ...(shape === undefined ? {} : { shape }),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    });
  });
  const byId = new Map(elements.map((read) => [read.id, read]));
  const tagsWithLogical = (read: ReadElement): string[] => {
    const logical = read.instanceOf === undefined ? undefined : byId.get(read.instanceOf);
    return [...(logical?.tags ?? []), ...read.tags];
  };
  const styleCache = new Map<ReadElement, Style>();
  const styleOf = (read: ReadElement): Style => {
    const known = styleCache.get(read);
    if (known !== undefined) return known;
    const style: Style = {};
    for (const tag of tagsWithLogical(read)) {
      const found = styleByTag.get(tag);
      if (found === undefined) continue;
      if (found.shape !== undefined) style.shape = found.shape;
      if (found.width !== undefined) style.width = found.width;
      if (found.height !== undefined) style.height = found.height;
    }
    styleCache.set(read, style);
    return style;
  };

  // Elements and containment.
  const suggestions = new Map<string, Id[]>();
  const elementKinds = new KindCounter((kind) =>
    suggestionFor(suggestions.get(kind) ?? [], options),
  );
  const relationKinds = new KindCounter((kind) =>
    suggestionFor(suggestions.get(kind) ?? [], options),
  );
  const keyOf = (id: string) => `e:${id}`;
  const planned: PlannedElement[] = [];
  const containment: { element: string; container: string }[] = [];
  const containerOf = new Map<string, string>();
  for (const read of elements) {
    const { shape } = styleOf(read);
    const plainShape =
      shape === undefined || shape === 'Box' || (read.type === 'Person' && shape === 'Person');
    const kindName = plainShape ? read.type : `${read.type} (${shape})`;
    suggestions.set(kindName, elementSuggestions(read.type, shape));
    const kind = elementKinds.add(kindName);
    const logical = read.instanceOf === undefined ? undefined : byId.get(read.instanceOf);
    const description = descriptionFrom(
      json.textOr(own(read.object, 'description'), `${read.path}.description`) ??
        (logical === undefined
          ? undefined
          : json.textOr(own(logical.object, 'description'), `${logical.path}.description`)),
    );
    const attributes = attributesFrom(elementAttributes(json, read, unmatched));
    planned.push({
      key: keyOf(read.id),
      sourceId: read.id,
      name: nameFrom(read.name ?? logical?.name, read.type, unmatched),
      kind,
      ...(description === undefined ? {} : { description }),
      ...(attributes === undefined ? {} : { attributes }),
    });
    if (read.parent !== undefined) {
      containment.push({ element: keyOf(read.id), container: keyOf(read.parent) });
      containerOf.set(keyOf(read.id), keyOf(read.parent));
    }
  }

  // Relations: the model's relationships, then each instance to what it is an instance of.
  const relations: PlannedRelation[] = [];
  const plannedRelationships = new Map<string, ReadRelationship>();
  const relationshipKind = 'Relationship';
  for (const relationship of relationships) {
    const description = json.textOr(
      own(relationship.object, 'description'),
      `${relationship.path}.description`,
    );
    const missing = [relationship.from, relationship.to].find((end) => !byId.has(end));
    if (missing !== undefined) {
      unmatched.add(
        description || relationship.id,
        `It ends on "${missing}", which the workspace does not hold.`,
      );
      continue;
    }
    const tags = tagsOf(json, own(relationship.object, 'tags'), `${relationship.path}.tags`);
    const extra = tags.find((tag) => !DEFAULT_TAGS.has(tag));
    const kindName = extra === undefined ? relationshipKind : `${relationshipKind} (${extra})`;
    suggestions.set(kindName, ['c4.uses', 'systems.communicates-with', 'relates-to']);
    const kind = relationKinds.add(kindName);
    const attributes = attributesFrom(relationshipAttributes(json, relationship, tags, unmatched));
    const name = descriptionFrom(description);
    relations.push({
      key: `r:${relationship.id}`,
      sourceId: relationship.id,
      from: keyOf(relationship.from),
      to: keyOf(relationship.to),
      kind,
      ...(name === undefined ? {} : { name: nameFrom(name, kindName, unmatched) }),
      ...(attributes === undefined ? {} : { attributes }),
    });
    plannedRelationships.set(relationship.id, relationship);
  }
  for (const read of elements) {
    if (read.instanceOf === undefined) continue;
    const field = read.type === 'Container Instance' ? 'containerId' : 'softwareSystemId';
    if (!byId.has(read.instanceOf)) {
      unmatched.add(
        read.id,
        `It is an instance of "${read.instanceOf}", which the workspace does not hold.`,
      );
      continue;
    }
    suggestions.set(field, ['relates-to']);
    relations.push({
      key: `instance:${read.id}`,
      from: keyOf(read.id),
      to: keyOf(read.instanceOf),
      kind: relationKinds.add(field),
    });
  }

  // Views, within the views an import brings and the shapes they show in all.
  const views: PlannedView[] = [];
  interface ReadView {
    name: string;
    shows: string[];
    boxes: Map<string, Box> | undefined;
    listed: Set<string>;
    vertices: Map<string, Point[]>;
  }
  const byKey = new Map<string, ReadView>();
  const tagsById = new Map(elements.map((read) => [read.id, new Set(tagsWithLogical(read))]));
  // Each element's relationships, by their from end, so that a view looks only at what it shows.
  const outgoing = new Map<string, ReadRelationship[]>();
  for (const relationship of plannedRelationships.values()) {
    const list = outgoing.get(relationship.from);
    if (list) list.push(relationship);
    else outgoing.set(relationship.from, [relationship]);
  }
  let shapesLeft = IMPORT_LIMITS.places;
  const sizeOf = (read: ReadElement) => {
    const style = styleOf(read);
    return {
      width: style.width ?? DEFAULT_SIZE.width,
      height: style.height ?? DEFAULT_SIZE.height,
    };
  };
  /** Whether a view may be added: within the views an import brings and the shapes they show. */
  const room = (name: string, shapes: number): boolean => {
    if (views.length >= IMPORT_LIMITS.views) {
      unmatched.add(
        name,
        `The view is left out: an import brings at most ${IMPORT_LIMITS.views.toLocaleString('en')} views.`,
      );
      return false;
    }
    if (shapes > shapesLeft) {
      unmatched.add(
        name,
        `The view is left out: the views would show over ${IMPORT_LIMITS.places.toLocaleString('en')} shapes in all.`,
      );
      return false;
    }
    shapesLeft -= shapes;
    return true;
  };
  const addView = (read: ReadView) => {
    const shown = read.shows.map(keyOf);
    const positions =
      read.boxes === undefined ? [] : placesInView(shown, containerOf, read.boxes, true);
    const showing = new Set(read.shows);
    const bendPoints: { relation: string; points: Point[] }[] = [];
    let left = 0;
    for (const from of read.shows) {
      for (const relationship of outgoing.get(from) ?? []) {
        if (!showing.has(relationship.to)) continue;
        if (!read.listed.has(relationship.id)) {
          left += 1;
          continue;
        }
        const points = read.vertices.get(relationship.id);
        if (points === undefined || points.length === 0) continue;
        if (points.length > MAX_BEND_POINTS) {
          unmatched.add(
            relationship.id,
            `Its ${points.length} waypoints are left out: a route bends at most ${MAX_BEND_POINTS} times.`,
          );
          continue;
        }
        bendPoints.push({ relation: `r:${relationship.id}`, points });
      }
    }
    views.push({
      key: `view:${views.length + 1}`,
      name: read.name,
      shows: shown,
      ...(positions.length === 0 ? {} : { positions }),
      ...(bendPoints.length === 0 ? {} : { bendPoints }),
    });
    if (left > 0) {
      unmatched.add(
        read.name,
        left === 1
          ? 'A relationship between what the view shows is not in it, but a view shows every relation between what it shows.'
          : `${left.toLocaleString('en')} relationships between what the view shows are not in it, but a view shows every relation between what it shows.`,
      );
    }
  };
  let count = 0;
  for (const list of VIEW_LISTS) {
    each(own(viewsObject, list), `views.${list}`, (item, path) => {
      count += 1;
      const view = json.object(item, path);
      const key = json.textOr(own(view, 'key'), `${path}.key`) ?? `${list}-${count}`;
      const name = nameFrom(
        json.textOr(own(view, 'title'), `${path}.title`) ?? key,
        key,
        unmatched,
      );
      const shows: string[] = [];
      const shownIds = new Set<string>();
      const places: { id: string; x: number; y: number }[] = [];
      each(own(view, 'elements'), `${path}.elements`, (entry, entryPath) => {
        const placed = json.object(entry, entryPath);
        const id = json.text(own(placed, 'id'), `${entryPath}.id`);
        if (!byId.has(id)) {
          unmatched.add(id, `The view "${name}" shows "${id}", which the workspace does not hold.`);
          return;
        }
        if (shownIds.has(id)) return;
        shownIds.add(id);
        shows.push(id);
        places.push({
          id,
          x: json.numberOr(own(placed, 'x'), `${entryPath}.x`) ?? 0,
          y: json.numberOr(own(placed, 'y'), `${entryPath}.y`) ?? 0,
        });
      });
      const listed = new Set<string>();
      const vertices = new Map<string, Point[]>();
      each(own(view, 'relationships'), `${path}.relationships`, (entry, entryPath) => {
        const placed = json.object(entry, entryPath);
        const id = json.text(own(placed, 'id'), `${entryPath}.id`);
        listed.add(id);
        const points: Point[] = [];
        each(own(placed, 'vertices'), `${entryPath}.vertices`, (vertex, vertexPath) => {
          const point = json.object(vertex, vertexPath);
          points.push({
            x: coordinate((json.numberOr(own(point, 'x'), `${vertexPath}.x`) ?? 0) * SCALE),
            y: coordinate((json.numberOr(own(point, 'y'), `${vertexPath}.y`) ?? 0) * SCALE),
          });
        });
        if (points.length > 0) vertices.set(id, points);
      });
      const automatic = json.objectOr(own(view, 'automaticLayout'), `${path}.automaticLayout`);
      const laidOut =
        automatic === undefined && places.some((place) => place.x !== 0 || place.y !== 0);
      const boxes = laidOut
        ? new Map(
            places.map((place): [string, Box] => {
              const size = sizeOf(byId.get(place.id) as ReadElement);
              return [
                keyOf(place.id),
                {
                  x: place.x * SCALE,
                  y: place.y * SCALE,
                  width: size.width * SCALE,
                  height: size.height * SCALE,
                },
              ];
            }),
          )
        : undefined;
      const read: ReadView = {
        name,
        shows,
        boxes,
        listed,
        vertices: laidOut ? vertices : new Map<string, Point[]>(),
      };
      if (!byKey.has(key)) byKey.set(key, read);
      if (!room(name, shows.length)) return;
      addView(read);
      if (list === 'dynamicViews') {
        unmatched.add(
          name,
          'The order of its steps is left out; a scenario can be recorded over the view.',
        );
      }
    });
  }
  each(own(viewsObject, 'filteredViews'), 'views.filteredViews', (item, path) => {
    const view = json.object(item, path);
    const key = json.textOr(own(view, 'key'), `${path}.key`) ?? `filteredViews-${views.length + 1}`;
    const name = nameFrom(json.textOr(own(view, 'title'), `${path}.title`) ?? key, key, unmatched);
    const baseKey = json.text(own(view, 'baseViewKey'), `${path}.baseViewKey`);
    const base = byKey.get(baseKey);
    if (base === undefined) {
      unmatched.add(name, `Its base view "${baseKey}" is not in the workspace.`);
      return;
    }
    // Past the views an import brings, it is left out before anything is filtered.
    if (views.length >= IMPORT_LIMITS.views) {
      room(name, 0);
      return;
    }
    const include = (json.textOr(own(view, 'mode'), `${path}.mode`) ?? 'Include') === 'Include';
    const tags = new Set(
      json
        .list(own(view, 'tags'), `${path}.tags`)
        .map((tag, at) => json.text(tag, `${path}.tags[${at}]`)),
    );
    const shows: string[] = [];
    for (const id of base.shows) {
      const elementTags = tagsById.get(id) ?? new Set<string>();
      const [small, large] =
        elementTags.size <= tags.size ? [elementTags, tags] : [tags, elementTags];
      let has = false;
      for (const tag of small) {
        if (large.has(tag)) {
          has = true;
          break;
        }
      }
      if (has !== include) continue;
      shows.push(id);
      // Past what the views may still show, it is left out without filtering further.
      if (shows.length > shapesLeft) break;
    }
    if (!room(name, shows.length)) return;
    addView({ ...base, name, shows });
  });
  each(own(viewsObject, 'imageViews'), 'views.imageViews', (item, path) => {
    const view = json.object(item, path);
    const key = json.textOr(own(view, 'key'), `${path}.key`) ?? 'image';
    unmatched.add(
      json.textOr(own(view, 'title'), `${path}.title`) ?? key,
      'Image views are left out: images in imports are left out.',
    );
  });

  const documentation = json.objectOr(own(root, 'documentation'), 'documentation');
  const documented =
    json.list(own(documentation, 'sections'), 'documentation.sections').length > 0 ||
    json.list(own(documentation, 'decisions'), 'documentation.decisions').length > 0 ||
    elements.some((read) => json.isObject(own(read.object, 'documentation')));
  if (documented) unmatched.add('documentation', 'Documentation and decisions are left out.');

  return {
    format: 'structurizr',
    source,
    elements: planned,
    relations,
    containment,
    views,
    kinds: { elements: elementKinds.list(), relations: relationKinds.list() },
    unmatched: unmatched.list(),
  };
}

/** The components the built-in packages offer for an element's type and shape, best first. */
function elementSuggestions(type: ElementType, shape: string | undefined): Id[] {
  if (shape === 'Cylinder') return ['systems.database', 'c4.container'];
  if (shape === 'Person' || type === 'Person') return ['c4.person', 'systems.person'];
  switch (type) {
    case 'Software System':
    case 'Software System Instance':
      return ['c4.software-system', 'systems.system'];
    case 'Container':
    case 'Container Instance':
      return ['c4.container', 'systems.service'];
    case 'Component':
      return ['c4.component', 'systems.box'];
    case 'Deployment Node':
      return ['c4.deployment-node', 'systems.box'];
    default:
      return ['systems.box'];
  }
}

/** The tags a relationship or element has beyond its type's. */
function extraTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !DEFAULT_TAGS.has(tag));
}

/** What an element keeps as attributes: its technology, tags, location, group, address and properties. */
function elementAttributes(
  json: JsonReader,
  read: ReadElement,
  unmatched: Unmatched,
): Map<string, JsonValue> {
  const { object, path } = read;
  const attributes = new Map<string, JsonValue>();
  const text = (key: string) => json.textOr(own(object, key), `${path}.${key}`);
  const technology = descriptionFrom(text('technology'));
  if (technology !== undefined) attributes.set('technology', technology);
  const tags = extraTags(read.tags);
  if (tags.length > 0) attributes.set('tags', tags);
  const location = text('location');
  if (location !== undefined && location !== 'Unspecified') attributes.set('location', location);
  const group = descriptionFrom(text('group'));
  if (group !== undefined) attributes.set('group', group);
  addressInto(attributes, text('url'), unmatched);
  if (
    read.type === 'Deployment Node' ||
    read.type === 'Infrastructure Node' ||
    read.instanceOf !== undefined
  ) {
    const environment = descriptionFrom(text('environment'));
    if (environment !== undefined) attributes.set('environment', environment);
  }
  if (read.type === 'Deployment Node') {
    const instances = text('instances');
    if (instances !== undefined) attributes.set('instances', instances);
  }
  if (read.instanceOf !== undefined) {
    const instanceId = json.numberOr(own(object, 'instanceId'), `${path}.instanceId`);
    if (instanceId !== undefined) attributes.set('instanceId', instanceId);
  }
  propertiesInto(json, attributes, object, path);
  return attributes;
}

function relationshipAttributes(
  json: JsonReader,
  relationship: ReadRelationship,
  tags: readonly string[],
  unmatched: Unmatched,
): Map<string, JsonValue> {
  const { object, path } = relationship;
  const attributes = new Map<string, JsonValue>();
  const text = (key: string) => json.textOr(own(object, key), `${path}.${key}`);
  const technology = descriptionFrom(text('technology'));
  if (technology !== undefined) attributes.set('technology', technology);
  const extra = extraTags(tags);
  if (extra.length > 0) attributes.set('tags', extra);
  const style = text('interactionStyle');
  if (style !== undefined) attributes.set('interactionStyle', style);
  addressInto(attributes, text('url'), unmatched);
  propertiesInto(json, attributes, object, path);
  return attributes;
}

function addressInto(
  attributes: Map<string, JsonValue>,
  url: string | undefined,
  unmatched: Unmatched,
) {
  if (url === undefined || url.trim() === '') return;
  const address = webAddress(url);
  if (address !== undefined) attributes.set('url', address);
  else unmatched.add(url, 'A link that is not a web address is left out.');
}

/** A thing's properties, as text attributes, after what it keeps of its own, which they never replace. */
function propertiesInto(
  json: JsonReader,
  attributes: Map<string, JsonValue>,
  object: JsonObject,
  path: string,
): void {
  const properties = json.objectOr(own(object, 'properties'), `${path}.properties`);
  let count = 0;
  for (const [name, value] of ownEntries(properties)) {
    if (count >= MAX_PROPERTIES) break;
    if (attributes.has(name)) continue;
    const text = descriptionFrom(json.text(value, `${path}.properties.${name}`));
    if (text === undefined) continue;
    attributes.set(name, text);
    count += 1;
  }
}
