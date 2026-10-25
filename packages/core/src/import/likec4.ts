/**
 * The LikeC4 reader (ADR-0042, R36): the model `likec4 export json` writes, the `LikeC4ModelData` of
 * one project or a list of them, becomes a plan.
 *
 * - **Elements:** the model's elements, of the kinds its specification names, each inside the element
 *   its name extends (`shop.api` inside `shop`); elements imported from other projects too.
 * - **Deployment:** deployment nodes as elements of kinds `deploymentNode <kind>`, and each deployed
 *   instance as an element inside its node with a relation to the element it is an instance of.
 * - **Relations:** the model's relations and the deployment's.
 * - **Views:** each view shows the elements its nodes stand for, where a layouted model places them,
 *   at six tenths of LikeC4's size, with an edge's control points as bend points.
 *
 * Groups, the order of a dynamic view's steps and edges drawn between the containers of a relation's
 * ends are left out and reported: a view here shows a relation where both its ends show.
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
  quote,
  reading,
  refuse,
  suggestionFor,
  webAddress,
  type ImportRead,
  type ReadOptions,
} from './reading';
import { coordinate, placesInView, type Box } from './view-places';

/** How much smaller than LikeC4 draws them an imported view's shapes are. */
const SCALE = 0.6;
/** The most attributes an element keeps from its metadata. */
const MAX_METADATA = 100;
/** The kind a relation has when its model gives it none, as LikeC4 writes such a relation. */
const PLAIN_RELATION = '->';
/** The kind of a deployed instance, and of its relation to the element it is an instance of. */
const INSTANCE = 'instanceOf';

/** Reads a LikeC4 model, as `likec4 export json` writes it. */
export function readLikeC4(text: string, source: string, options?: ReadOptions): ImportRead {
  return reading(() => planOf(parseJson(text), source, options));
}

/** Reads a LikeC4 model already parsed from JSON, so that a file is parsed once to tell its format. */
export function readLikeC4Json(parsed: unknown, source: string, options?: ReadOptions): ImportRead {
  return reading(() => planOf(parsed, source, options));
}

/** The components the built-in packages and the C4 starter package offer for a kind, best first. */
function elementSuggestions(kind: string, shape: string | undefined): Id[] {
  if (shape === 'person' || /actor|person|user|customer|human/i.test(kind)) {
    return ['c4.person', 'systems.person'];
  }
  if (
    shape === 'storage' ||
    shape === 'cylinder' ||
    /database|\bdb\b|storage|store|table|bucket/i.test(kind)
  ) {
    return ['systems.database', 'c4.container'];
  }
  if (/system/i.test(kind)) return ['c4.software-system', 'systems.system'];
  if (/component/i.test(kind)) return ['c4.component', 'systems.box'];
  if (/container|app|service|api|backend|frontend|\bui\b|queue/i.test(kind)) {
    return ['c4.container', 'systems.service'];
  }
  return ['systems.box'];
}

const RELATION_SUGGESTIONS: Id[] = ['c4.uses', 'systems.communicates-with', 'relates-to'];

/** The longest name, such as `shop.backend.api`, that an element of a model may have. */
export const MAX_LIKEC4_NAME = 256;
/** How many levels deep a name may nest an element, counted by its dots. */
export const MAX_LIKEC4_DEPTH = 32;

/** A name as the model writes it, refused past the length and the depth a name may have. */
function checkedName(name: string): string {
  let dots = 0;
  for (
    let at = name.indexOf('.');
    at !== -1 && dots <= MAX_LIKEC4_DEPTH;
    at = name.indexOf('.', at + 1)
  ) {
    dots += 1;
  }
  if (name.length > MAX_LIKEC4_NAME || dots > MAX_LIKEC4_DEPTH) {
    refuse(
      `The LikeC4 model holds a name over ${MAX_LIKEC4_NAME} characters or ${MAX_LIKEC4_DEPTH} levels deep: "${quote(name)}".`,
    );
  }
  return name;
}

/**
 * Refuses a model past the elements and relations an import brings, by counting the records' keys
 * before any element is read, so that nothing later works on more than an import may bring.
 */
function refusePastLimits(
  json: JsonReader,
  datas: readonly JsonObject[],
  projectIds: ReadonlySet<string>,
): void {
  let elementCount = 0;
  let relationCount = 0;
  const keysOf = (value: unknown, path: string) => {
    const object = json.objectOr(value, path);
    return object === undefined ? 0 : Object.keys(object).length;
  };
  for (const data of datas) {
    elementCount += keysOf(own(data, 'elements'), 'elements');
    for (const [project, list] of ownEntries(json.objectOr(own(data, 'imports'), 'imports'))) {
      if (!projectIds.has(project)) elementCount += json.list(list, `imports.${project}`).length;
    }
    const deployments = json.objectOr(own(data, 'deployments'), 'deployments');
    elementCount += keysOf(own(deployments, 'elements'), 'deployments.elements');
    relationCount += keysOf(own(data, 'relations'), 'relations');
    relationCount += keysOf(own(deployments, 'relations'), 'deployments.relations');
  }
  if (elementCount > IMPORT_LIMITS.elements) {
    refuse(
      `The file holds ${elementCount.toLocaleString('en')} elements; an import brings at most ${IMPORT_LIMITS.elements.toLocaleString('en')}.`,
    );
  }
  if (relationCount > IMPORT_LIMITS.relations) {
    refuse(
      `The file holds ${relationCount.toLocaleString('en')} relations, those that put one thing inside another included; an import brings at most ${IMPORT_LIMITS.relations.toLocaleString('en')}.`,
    );
  }
}

/**
 * Where each element sits: inside the longest name its own name extends, among those the model
 * holds. A model holds each name's own parent, so a name is looked up once; when one is missing, what
 * each missing name leads to is kept, so that no name further out is looked up twice.
 */
function parentsByName(names: readonly string[]): Map<string, string> {
  const held = new Set(names);
  const nearest = new Map<string, string | null>();
  const parents = new Map<string, string>();
  for (const name of names) {
    const dot = name.lastIndexOf('.');
    if (dot <= 0) continue;
    const chain: string[] = [];
    let found: string | null = null;
    for (let at = name.slice(0, dot); ;) {
      if (held.has(at)) {
        found = at;
        break;
      }
      const known = nearest.get(at);
      if (known !== undefined) {
        found = known;
        break;
      }
      chain.push(at);
      const next = at.lastIndexOf('.');
      if (next <= 0) break;
      at = at.slice(0, next);
    }
    for (const each of chain) nearest.set(each, found);
    if (found !== null) parents.set(name, found);
  }
  return parents;
}

function planOf(parsed: unknown, source: string, options: ReadOptions | undefined): ImportPlan {
  const json = new JsonReader('LikeC4 model', 'LikeC4');
  const projects = Array.isArray(parsed) ? parsed : [parsed];
  const datas = projects.map((project, at) =>
    json.object(project, Array.isArray(parsed) ? `[${at}]` : '(the file)'),
  );
  if (datas.length === 0 || datas.some((data) => !json.isObject(own(data, 'elements')))) {
    refuse('The file is not a LikeC4 model: it has no elements.');
  }

  const unmatched = new Unmatched();
  const elementHints = new Map<string, Id[]>();
  const relationHints = new Map<string, Id[]>();
  const elementKinds = new KindCounter((kind) =>
    suggestionFor(elementHints.get(kind) ?? [], options),
  );
  const relationKinds = new KindCounter((kind) =>
    suggestionFor(relationHints.get(kind) ?? [], options),
  );
  const elements: PlannedElement[] = [];
  const relations: PlannedRelation[] = [];
  const containment: { element: string; container: string }[] = [];
  const containerOf = new Map<string, string>();
  const views: PlannedView[] = [];
  const keys = new Set<string>();
  const projectIds: string[] = datas.map(
    (data, at) => json.textOr(own(data, 'projectId'), 'projectId') ?? `project-${at + 1}`,
  );
  const projectIdSet = new Set(projectIds);
  refusePastLimits(json, datas, projectIdSet);

  // The model's elements, those each project imports from projects the file does not hold too.
  interface Logical {
    key: string;
    title: string | undefined;
    kind: string;
  }
  const logical = new Map<string, Logical>();
  const elementKey = (project: string, name: string) => `e:${project}/${name}`;
  const addElement = (
    project: string,
    name: string,
    object: JsonObject,
    path: string,
    specification: JsonObject | undefined,
  ) => {
    const key = elementKey(project, name);
    if (keys.has(key)) refuse(`The LikeC4 model holds the element "${name}" twice.`);
    keys.add(key);
    const kind = json.text(own(object, 'kind'), `${path}.kind`);
    const title = json.textOr(own(object, 'title'), `${path}.title`);
    const specified = json.objectOr(
      own(json.objectOr(own(specification, 'elements'), 'specification.elements'), kind),
      `specification.elements.${kind}`,
    );
    const shape =
      json.textOr(
        own(json.objectOr(own(object, 'style'), `${path}.style`), 'shape'),
        `${path}.style.shape`,
      ) ??
      json.textOr(
        own(
          json.objectOr(own(specified, 'style'), `specification.elements.${kind}.style`),
          'shape',
        ),
        `specification.elements.${kind}.style.shape`,
      );
    if (!elementHints.has(kind)) elementHints.set(kind, elementSuggestions(kind, shape));
    const kindKey = elementKinds.add(kind);
    logical.set(key, { key, title, kind });
    const description =
      textOf(json, own(object, 'description'), `${path}.description`) ??
      textOf(json, own(object, 'summary'), `${path}.summary`);
    const attributes = attributesFrom(attributesOf(json, object, path, unmatched));
    elements.push({
      key,
      sourceId: name,
      name: nameFrom(title, name.slice(name.lastIndexOf('.') + 1), unmatched),
      kind: kindKey,
      ...(description === undefined ? {} : { description }),
      ...(attributes === undefined ? {} : { attributes }),
    });
  };
  const nested = (project: string, names: readonly string[]) => {
    for (const [name, parent] of parentsByName(names)) {
      const element = elementKey(project, name);
      const container = elementKey(project, parent);
      containment.push({ element, container });
      containerOf.set(element, container);
    }
  };
  datas.forEach((data, at) => {
    const project = projectIds[at] as string;
    const specification = json.objectOr(own(data, 'specification'), 'specification');
    const record = json.object(own(data, 'elements'), 'elements');
    const names: string[] = [];
    for (const [name, value] of ownEntries(record)) {
      const object = json.object(value, `elements.${name}`);
      const id = checkedName(json.textOr(own(object, 'id'), `elements.${name}.id`) ?? name);
      addElement(project, id, object, `elements.${name}`, specification);
      names.push(id);
    }
    nested(project, names);
  });
  datas.forEach((data) => {
    const specification = json.objectOr(own(data, 'specification'), 'specification');
    const imports = json.objectOr(own(data, 'imports'), 'imports');
    for (const [project, list] of ownEntries(imports)) {
      if (projectIdSet.has(project)) continue;
      const names: string[] = [];
      json.list(list, `imports.${project}`).forEach((value, at) => {
        const path = `imports.${project}[${at}]`;
        const object = json.object(value, path);
        const name = checkedName(json.text(own(object, 'id'), `${path}.id`));
        if (keys.has(elementKey(project, name))) return;
        addElement(project, name, object, path, specification);
        names.push(name);
      });
      nested(project, names);
    }
  });

  // Deployment nodes and instances.
  const deploymentKey = (project: string, name: string) => `d:${project}/${name}`;
  const instances: { key: string; of: string; project: string }[] = [];
  datas.forEach((data, at) => {
    const project = projectIds[at] as string;
    const deployments = json.objectOr(own(data, 'deployments'), 'deployments');
    const record = json.objectOr(own(deployments, 'elements'), 'deployments.elements');
    const names: string[] = [];
    for (const [entry, value] of ownEntries(record)) {
      const path = `deployments.elements.${entry}`;
      const object = json.object(value, path);
      const name = checkedName(json.textOr(own(object, 'id'), `${path}.id`) ?? entry);
      const key = deploymentKey(project, name);
      if (keys.has(key)) refuse(`The LikeC4 model holds the deployment element "${name}" twice.`);
      keys.add(key);
      names.push(name);
      const element = json.textOr(own(object, 'element'), `${path}.element`);
      const title = json.textOr(own(object, 'title'), `${path}.title`);
      let kindName: string;
      if (element !== undefined) {
        kindName = INSTANCE;
        const of = logical.get(elementKey(project, element));
        if (!elementHints.has(INSTANCE))
          elementHints.set(INSTANCE, ['c4.container', 'systems.service']);
        instances.push({ key, of: element, project });
        const description = textOf(json, own(object, 'description'), `${path}.description`);
        const attributes = attributesFrom(attributesOf(json, object, path, unmatched));
        elements.push({
          key,
          sourceId: name,
          name: nameFrom(title ?? of?.title, name.slice(name.lastIndexOf('.') + 1), unmatched),
          kind: elementKinds.add(kindName),
          ...(description === undefined ? {} : { description }),
          ...(attributes === undefined ? {} : { attributes }),
        });
        continue;
      }
      const kind = json.text(own(object, 'kind'), `${path}.kind`);
      kindName = `deploymentNode ${kind}`;
      if (!elementHints.has(kindName))
        elementHints.set(kindName, ['c4.deployment-node', 'systems.box']);
      const description = textOf(json, own(object, 'description'), `${path}.description`);
      const attributes = attributesFrom(attributesOf(json, object, path, unmatched));
      elements.push({
        key,
        sourceId: name,
        name: nameFrom(title, name.slice(name.lastIndexOf('.') + 1), unmatched),
        kind: elementKinds.add(kindName),
        ...(description === undefined ? {} : { description }),
        ...(attributes === undefined ? {} : { attributes }),
      });
    }
    for (const [name, parent] of parentsByName(names)) {
      const element = deploymentKey(project, name);
      const container = deploymentKey(project, parent);
      containment.push({ element, container });
      containerOf.set(element, container);
    }
  });

  // Relations: the model's, the deployment's, and each instance's to what it is an instance of.
  const relationKeys = new Map<string, { key: string; from: string; to: string }>();
  const modelEnd = (value: unknown, path: string, project: string): string | undefined => {
    if (typeof value === 'string') return elementKey(project, value);
    const reference = json.object(value, path);
    const model = json.text(own(reference, 'model'), `${path}.model`);
    const from = json.textOr(own(reference, 'project'), `${path}.project`) ?? project;
    return elementKey(from, model);
  };
  const deploymentEnd = (value: unknown, path: string, project: string): string => {
    if (typeof value === 'string') return deploymentKey(project, value);
    const reference = json.object(value, path);
    return deploymentKey(project, json.text(own(reference, 'deployment'), `${path}.deployment`));
  };
  const addRelation = (
    project: string,
    prefix: string,
    entry: string,
    value: unknown,
    path: string,
    end: (value: unknown, path: string, project: string) => string | undefined,
  ) => {
    const object = json.object(value, path);
    const id = json.textOr(own(object, 'id'), `${path}.id`) ?? entry;
    const from = end(own(object, 'source'), `${path}.source`, project);
    const to = end(own(object, 'target'), `${path}.target`, project);
    const title = json.textOr(own(object, 'title'), `${path}.title`);
    const missing = [from, to].find((key) => key === undefined || !keys.has(key));
    if (missing !== undefined || from === undefined || to === undefined) {
      unmatched.add(
        title || id,
        `It ends on "${(missing ?? '').replace(/^[ed]:[^/]*\//, '')}", which the model does not hold.`,
      );
      return;
    }
    const kindName = json.textOr(own(object, 'kind'), `${path}.kind`) ?? PLAIN_RELATION;
    if (!relationHints.has(kindName)) relationHints.set(kindName, RELATION_SUGGESTIONS);
    const key = `${prefix}:${project}/${id}`;
    if (relationKeys.has(key)) refuse(`The LikeC4 model holds the relation "${id}" twice.`);
    relationKeys.set(key, { key, from, to });
    const name = descriptionFrom(title);
    const attributes = attributesFrom(attributesOf(json, object, path, unmatched));
    relations.push({
      key,
      sourceId: id,
      from,
      to,
      kind: relationKinds.add(kindName),
      ...(name === undefined ? {} : { name: nameFrom(name, kindName, unmatched) }),
      ...(attributes === undefined ? {} : { attributes }),
    });
  };
  datas.forEach((data, at) => {
    const project = projectIds[at] as string;
    for (const [entry, value] of ownEntries(json.objectOr(own(data, 'relations'), 'relations'))) {
      addRelation(project, 'r', entry, value, `relations.${entry}`, modelEnd);
    }
    const deployments = json.objectOr(own(data, 'deployments'), 'deployments');
    for (const [entry, value] of ownEntries(
      json.objectOr(own(deployments, 'relations'), 'deployments.relations'),
    )) {
      const path = `deployments.relations.${entry}`;
      const object = json.object(value, path);
      for (const side of ['source', 'target'] as const) {
        const reference = own(object, side);
        if (json.isObject(reference) && own(reference, 'element') !== undefined) {
          unmatched.add(
            json.textOr(own(object, 'title'), `${path}.title`) || entry,
            'It ends inside a deployed element, so it ends on the deployed element.',
          );
          break;
        }
      }
      addRelation(project, 'dr', entry, value, path, deploymentEnd);
    }
  });
  for (const instance of instances) {
    const of = elementKey(instance.project, instance.of);
    if (!keys.has(of)) {
      unmatched.add(instance.of, `It ends on "${instance.of}", which the model does not hold.`);
      continue;
    }
    if (!relationHints.has(INSTANCE)) relationHints.set(INSTANCE, ['relates-to']);
    relations.push({
      key: `instance:${instance.key}`,
      from: instance.key,
      to: of,
      kind: relationKinds.add(INSTANCE),
    });
  }

  // Views, within the views an import brings and the shapes they show in all.
  let shapesLeft = IMPORT_LIMITS.places;
  datas.forEach((data, at) => {
    const project = projectIds[at] as string;
    for (const [entry, value] of ownEntries(json.objectOr(own(data, 'views'), 'views'))) {
      const path = `views.${entry}`;
      const view = json.object(value, path);
      const id = json.textOr(own(view, 'id'), `${path}.id`) ?? entry;
      const name = nameFrom(json.textOr(own(view, 'title'), `${path}.title`) ?? id, id, unmatched);
      if (views.length >= IMPORT_LIMITS.views) {
        unmatched.add(
          name,
          `The view is left out: an import brings at most ${IMPORT_LIMITS.views.toLocaleString('en')} views.`,
        );
        continue;
      }
      const shows: string[] = [];
      const showing = new Set<string>();
      const boxes = new Map<string, Box>();
      json.list(own(view, 'nodes'), `${path}.nodes`).forEach((item, index) => {
        const nodePath = `${path}.nodes[${index}]`;
        const node = json.object(item, nodePath);
        const nodeId = json.text(own(node, 'id'), `${nodePath}.id`);
        const kind = json.textOr(own(node, 'kind'), `${nodePath}.kind`);
        const deploymentRef = json.textOr(own(node, 'deploymentRef'), `${nodePath}.deploymentRef`);
        const modelRefValue = own(node, 'modelRef');
        const modelRef = typeof modelRefValue === 'string' ? modelRefValue : undefined;
        let key: string | undefined;
        if (deploymentRef !== undefined) key = deploymentKey(project, deploymentRef);
        else if (modelRef !== undefined) key = elementKey(project, modelRef);
        else if (kind === '@group') {
          unmatched.add(
            json.textOr(own(node, 'title'), `${nodePath}.title`) || nodeId,
            'Groups are left out; what they hold sits in the view without them.',
          );
          return;
        } else key = elementKey(project, nodeId);
        if (!keys.has(key)) {
          unmatched.add(
            nodeId,
            `The view "${name}" shows "${nodeId}", which the model does not hold.`,
          );
          return;
        }
        if (showing.has(key)) return;
        showing.add(key);
        shows.push(key);
        const x = json.numberOr(own(node, 'x'), `${nodePath}.x`);
        const y = json.numberOr(own(node, 'y'), `${nodePath}.y`);
        if (x === undefined || y === undefined) return;
        const width = json.numberOr(own(node, 'width'), `${nodePath}.width`);
        const height = json.numberOr(own(node, 'height'), `${nodePath}.height`);
        boxes.set(key, {
          x: x * SCALE,
          y: y * SCALE,
          ...(width === undefined ? {} : { width: width * SCALE }),
          ...(height === undefined ? {} : { height: height * SCALE }),
        });
      });
      if (shows.length > shapesLeft) {
        unmatched.add(
          name,
          `The view is left out: the views would show over ${IMPORT_LIMITS.places.toLocaleString('en')} shapes in all.`,
        );
        continue;
      }
      shapesLeft -= shows.length;
      const routed = new Set<string>();
      const dynamic = json.textOr(own(view, '_type'), `${path}._type`) === 'dynamic';
      const bendPoints: { relation: string; points: Point[] }[] = [];
      json.list(own(view, 'edges'), `${path}.edges`).forEach((item, index) => {
        const edgePath = `${path}.edges[${index}]`;
        const edge = json.object(item, edgePath);
        const label =
          json.textOr(own(edge, 'label'), `${edgePath}.label`) ||
          json.text(own(edge, 'id'), `${edgePath}.id`);
        const ids = json
          .list(own(edge, 'relations'), `${edgePath}.relations`)
          .map((each, place) => json.text(each, `${edgePath}.relations[${place}]`));
        if (ids.length === 0) {
          unmatched.add(label, 'A step that no relation of the model stands for is left out.');
          return;
        }
        const points: Point[] = [];
        json
          .list(own(edge, 'controlPoints'), `${edgePath}.controlPoints`)
          .forEach((point, place) => {
            const pointPath = `${edgePath}.controlPoints[${place}]`;
            const object = json.object(point, pointPath);
            points.push({
              x: coordinate((json.numberOr(own(object, 'x'), `${pointPath}.x`) ?? 0) * SCALE),
              y: coordinate((json.numberOr(own(object, 'y'), `${pointPath}.y`) ?? 0) * SCALE),
            });
          });
        let between = false;
        for (const relationId of ids) {
          const relation =
            relationKeys.get(`r:${project}/${relationId}`) ??
            relationKeys.get(`dr:${project}/${relationId}`);
          if (relation === undefined) continue;
          if (!showing.has(relation.from) || !showing.has(relation.to)) {
            between = true;
            continue;
          }
          if (points.length === 0 || routed.has(relation.key)) continue;
          routed.add(relation.key);
          if (points.length > MAX_BEND_POINTS) {
            unmatched.add(
              label,
              `Its ${points.length} bend points are left out: a route bends at most ${MAX_BEND_POINTS} times.`,
            );
            continue;
          }
          bendPoints.push({ relation: relation.key, points });
        }
        if (between) {
          unmatched.add(
            label,
            'It is drawn between containers of its ends; it shows in views that show its ends.',
          );
        }
      });
      if (dynamic) {
        unmatched.add(
          name,
          'The order of its steps is left out; a scenario can be recorded over the view.',
        );
      }
      const positions = placesInView(shows, containerOf, boxes, false);
      views.push({
        key: `v:${project}/${id}`,
        name,
        shows,
        ...(positions.length === 0 ? {} : { positions }),
        ...(bendPoints.length === 0 ? {} : { bendPoints }),
      });
    }
  });

  return {
    format: 'likec4',
    source,
    elements,
    relations,
    containment,
    views,
    kinds: { elements: elementKinds.list(), relations: relationKinds.list() },
    unmatched: unmatched.list(),
  };
}

/** A description LikeC4 writes as text, as `{ txt }` or as `{ md }`, kept as the text it is. */
function textOf(json: JsonReader, value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return descriptionFrom(value);
  const object = json.object(value, path);
  return descriptionFrom(
    json.textOr(own(object, 'txt'), `${path}.txt`) ?? json.textOr(own(object, 'md'), `${path}.md`),
  );
}

/** What an element or relation keeps as attributes: its technology, tags, web links and metadata. */
function attributesOf(
  json: JsonReader,
  object: JsonObject,
  path: string,
  unmatched: Unmatched,
): Map<string, JsonValue> {
  const attributes = new Map<string, JsonValue>();
  const technology = descriptionFrom(json.textOr(own(object, 'technology'), `${path}.technology`));
  if (technology !== undefined) attributes.set('technology', technology);
  const tags = json
    .list(own(object, 'tags'), `${path}.tags`)
    .map((tag, at) => json.text(tag, `${path}.tags[${at}]`));
  if (tags.length > 0) attributes.set('tags', tags);
  const links: string[] = [];
  json.list(own(object, 'links'), `${path}.links`).forEach((link, at) => {
    const linkPath = `${path}.links[${at}]`;
    const url =
      typeof link === 'string'
        ? link
        : json.text(own(json.object(link, linkPath), 'url'), `${linkPath}.url`);
    const address = webAddress(url);
    if (address !== undefined) links.push(address);
    else unmatched.add(url, 'A link that is not a web address is left out.');
  });
  if (links.length > 0) attributes.set('links', links);
  let count = 0;
  for (const [name, value] of ownEntries(
    json.objectOr(own(object, 'metadata'), `${path}.metadata`),
  )) {
    if (count >= MAX_METADATA) break;
    if (attributes.has(name)) continue;
    const valuePath = `${path}.metadata.${name}`;
    const kept = Array.isArray(value)
      ? value.map((each, at) => json.text(each, `${valuePath}[${at}]`))
      : json.text(value, valuePath);
    attributes.set(name, kept);
    count += 1;
  }
  return attributes;
}
