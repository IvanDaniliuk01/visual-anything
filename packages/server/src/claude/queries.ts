/**
 * What Claude reads of a project: a summary, the definitions in use, elements and relations found by
 * component, attribute, container or name, one element or relation with everything around it, a view
 * with its positions and the order it draws each container's shapes in, and a scenario with its
 * broken steps and its decisions. Pure functions over a project, returning plain JSON for the read
 * tools.
 */
import {
  adaptedForDark,
  folderTree,
  brokenStepsOf,
  builtinPackage,
  combinationsOf,
  definitionsIn,
  drawingOf,
  isBrokenTourStep,
  isColor,
  destinationKind,
  destinationsOf,
  externalIdQuery,
  matchesExternalId,
  isOutside,
  modelIndexOf,
  nestingTypesInView,
  sameColor,
  scenarioTimeline,
  showsPart,
  shownByScope,
  stackingOrderOf,
  type ProjectSnapshot,
  mediaFileName,
  isVideo,
  pictureName,
  picturesOf,
  linkCardsOf,
  linkHost,
} from '@visual-anything/core';
import type {
  AttributeDefinition,
  Element,
  Id,
  JsonValue,
  Relation,
} from '@visual-anything/schema';
import { readDecisions } from './decision-edits';
import { elementExplorable, explorableShapesAnswer } from './explorable-reads';
import { appearanceRead } from './geometry-brief';
import { handRoutesOn, routedByHandAnswer, viewsRoutingByHand } from './hand-routes';
import { UNDEFINED_ATTRIBUTES_NOTE, undefinedAttributesOf } from './undefined-attributes';

/**
 * What the dark canvas draws for the colors an appearance stores, where the project's drawing
 * defaults adapt stored colors there and it draws another (ADR 0087): `darkCanvas`, by trait. The
 * appearance itself stays as stored; nothing when every color is drawn as stored.
 */
function darkCanvasOf(
  state: ProjectSnapshot,
  appearance: { fill?: unknown; stroke?: unknown; image?: unknown } | undefined,
): { darkCanvas?: Record<string, string> } {
  if (appearance === undefined) return {};
  if (drawingOf(state).colors.storedColorsInDark !== 'adapted') return {};
  const image = appearance.image;
  const tint =
    typeof image === 'object' && image !== null ? (image as { tint?: unknown }).tint : undefined;
  const drawn: Record<string, string> = {};
  for (const [trait, color] of [
    ['fill', appearance.fill],
    ['stroke', appearance.stroke],
    ['tint', tint],
  ] as const) {
    if (!isColor(color)) continue;
    const adapted = adaptedForDark(color);
    if (!sameColor(adapted, color)) drawn[trait] = adapted;
  }
  return Object.keys(drawn).length === 0 ? {} : { darkCanvas: drawn };
}

/** How many ways a scenario plays that read_scenario counts before it says "or more". */
const WAYS_COUNTED = 1000;

/** The most items one query returns. */
export const MAX_RESULTS = 500;

/** How many items a query returns when it is not told. */
export const DEFAULT_RESULTS = 100;

/** The project in brief. */
export function summarizeProject(state: ProjectSnapshot) {
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const relationIds = new Set(state.model.relations.map((relation) => relation.id));
  const topLevel = state.model.elements.filter(
    (element) => index.containersOf(element.id).length === 0,
  );
  return {
    name: state.project.name,
    ...(state.project.description === undefined ? {} : { description: state.project.description }),
    world: { id: state.model.world.id, name: state.model.world.name },
    packages: state.packages.map((file) => ({
      id: file.id,
      name: file.name,
      builtIn: builtinPackage(file.id) !== undefined,
      components: file.components.length,
      relationTypes: file.relationTypes.length,
    })),
    counts: {
      elements: state.model.elements.length,
      relations: state.model.relations.length,
      views: state.views.length,
      scenarios: state.scenarios.length,
    },
    nestingRelationTypes: [...definitions.nestingRelationTypes],
    // How the person's view list files them (ADR 0101), every view in it, when the project has folders.
    ...(state.project.viewFolders === undefined
      ? {}
      : { viewFolders: folderTree(state.project, state.views) }),
    views: state.views.map((view) => ({
      id: view.id,
      name: view.name,
      perspective: view.perspective.name,
      nestingRelationTypes: nestingTypesInView(state, view),
      positions: view.positions.length,
      // How it draws its automatic routes, when not orthogonal (ADR 0069).
      ...(view.routeStyle === undefined ? {} : { routeStyle: view.routeStyle }),
    })),
    scenarios: state.scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      view: scenario.view,
      steps: scenario.steps.length,
      brokenSteps: scenario.steps.filter((step) =>
        step.relations.some((relation) => !relationIds.has(relation)),
      ).length,
    })),
    // Tours (ADR 0058): a step that names what was deleted is kept, flagged as broken.
    tours: state.tours.map((tour) => ({
      id: tour.id,
      name: tour.name,
      steps: tour.steps.length,
      brokenSteps: tour.steps.filter((step) => isBrokenTourStep(state, step)).length,
    })),
    directlyInWorld: {
      total: topLevel.length,
      elements: topLevel.slice(0, DEFAULT_RESULTS).map((element) => brief(element)),
    },
  };
}

/**
 * The components and relation types in use, each with what it inherits; free geometry in brief
 * unless `fullGeometry`.
 */
export function listDefinitions(
  state: ProjectSnapshot,
  filter: { package?: Id; fullGeometry?: boolean } = {},
) {
  const definitions = definitionsIn(state);
  const inPackage = (pkg: Id | undefined) => filter.package === undefined || pkg === filter.package;
  const components = [
    ...(filter.package === undefined ? ['essence'] : []),
    ...[...definitions.components].filter(([, each]) => inPackage(each.package)).map(([id]) => id),
  ].flatMap((id) => {
    const resolved = definitions.component(id);
    if (!resolved) return [];
    const own = definitions.components.get(id);
    return [
      {
        id,
        name: resolved.name,
        package: resolved.package ?? null,
        derivesFrom: own?.definition.derivesFrom ?? null,
        ...(resolved.description === undefined ? {} : { description: resolved.description }),
        ...(own?.definition.ids === undefined ? {} : { ids: own.definition.ids }),
        attributes: [...resolved.attributes],
        // Its elements may carry attributes it does not define, on purpose (ADR 0105).
        ...(resolved.openAttributes ? { openAttributes: true } : {}),
        appearance: appearanceRead(resolved.appearance, filter.fullGeometry),
      },
    ];
  });
  const relationTypes = [
    ...(filter.package === undefined ? ['relates-to'] : []),
    ...[...definitions.relationTypes]
      .filter(([, each]) => inPackage(each.package))
      .map(([id]) => id),
  ].flatMap((id) => {
    const resolved = definitions.relationType(id);
    if (!resolved) return [];
    const own = definitions.relationTypes.get(id);
    return [
      {
        id,
        name: resolved.name,
        package: resolved.package ?? null,
        derivesFrom: own?.definition.derivesFrom ?? null,
        ...(resolved.description === undefined ? {} : { description: resolved.description }),
        ...(own?.definition.ids === undefined ? {} : { ids: own.definition.ids }),
        direction: resolved.direction,
        nests: resolved.nests,
        limits: resolved.limits,
        attributes: [...resolved.attributes],
        // Stroke, width, dash, and route when its automatic routes are not left to the view.
        appearance: resolved.appearance,
      },
    ];
  });
  return { components, relationTypes };
}

/** What to find elements by; every filter given must hold. */
export interface ElementFilter {
  /** Created from this component, or from one deriving from it unless `exactComponent`. */
  component?: Id;
  exactComponent?: boolean;
  /**
   * Holding this attribute, with this value when `equals` is given. A name `id:<scheme>`, as
   * `id:uberon`, asks for an external identifier in that scheme instead (ADR 0056).
   */
  attribute?: { name: string; equals?: JsonValue };
  /** Inside this container: directly, or at any depth with `deep`. World's id finds what has none. */
  container?: Id;
  deep?: boolean;
  /** Whose name holds this text, whatever its case. */
  nameContains?: string;
  limit?: number;
  offset?: number;
}

/** Elements found by component, attribute, container or name, in model order. */
export function findElements(state: ProjectSnapshot, filter: ElementFilter = {}) {
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const worldId = state.model.world.id;
  const name = filter.nameContains?.toLowerCase();
  const externalId =
    filter.attribute === undefined ? undefined : externalIdQuery(filter.attribute.name);
  const insideDeep = (id: Id, container: Id): boolean => {
    const seen = new Set<Id>();
    const stack = [...index.containersOf(id)];
    while (stack.length > 0) {
      const next = stack.pop() as Id;
      if (next === container) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...index.containersOf(next));
    }
    return false;
  };
  const matches = state.model.elements.filter((element) => {
    if (filter.component !== undefined) {
      const fits = filter.exactComponent
        ? element.component === filter.component
        : definitions.componentDerives(element.component, filter.component);
      if (!fits) return false;
    }
    if (externalId !== undefined) {
      const { equals } = filter.attribute ?? {};
      if (equals !== undefined && typeof equals !== 'string') return false;
      if (!matchesExternalId(element, externalId.scheme, equals)) return false;
    } else if (filter.attribute !== undefined) {
      const values = element.attributes ?? {};
      if (!Object.hasOwn(values, filter.attribute.name)) return false;
      const { equals } = filter.attribute;
      if (equals !== undefined && !sameJson(values[filter.attribute.name], equals)) return false;
    }
    if (filter.container !== undefined) {
      const containers = index.containersOf(element.id);
      if (filter.container === worldId) {
        if (containers.length > 0) return false;
      } else if (
        filter.deep
          ? !insideDeep(element.id, filter.container)
          : !containers.includes(filter.container)
      ) {
        return false;
      }
    }
    if (name !== undefined && !element.name.toLowerCase().includes(name)) return false;
    return true;
  });
  const { offset, limit } = page(filter);
  return {
    total: matches.length,
    offset,
    elements: matches.slice(offset, offset + limit).map((element) => ({
      ...brief(element),
      containers: [...index.containersOf(element.id)],
      ...(element.ids === undefined ? {} : { ids: element.ids }),
      ...(element.attributes === undefined ? {} : { attributes: element.attributes }),
    })),
  };
}

/** What to find relations by; every filter given must hold. */
export interface RelationFilter {
  /** Of this relation type, or of one deriving from it unless `exactType`. */
  relationType?: Id;
  exactType?: boolean;
  from?: Id;
  to?: Id;
  /** Ending on this element or relation, at either end. */
  touching?: Id;
  nameContains?: string;
  limit?: number;
  offset?: number;
}

/** Relations found by relation type, ends or name, in model order. */
export function findRelations(state: ProjectSnapshot, filter: RelationFilter = {}) {
  const definitions = definitionsIn(state);
  const name = filter.nameContains?.toLowerCase();
  const matches = state.model.relations.filter((relation) => {
    if (filter.relationType !== undefined) {
      const fits = filter.exactType
        ? relation.relationType === filter.relationType
        : definitions.relationTypeDerives(relation.relationType, filter.relationType);
      if (!fits) return false;
    }
    if (filter.from !== undefined && relation.from !== filter.from) return false;
    if (filter.to !== undefined && relation.to !== filter.to) return false;
    if (
      filter.touching !== undefined &&
      relation.from !== filter.touching &&
      relation.to !== filter.touching
    ) {
      return false;
    }
    if (name !== undefined && !(relation.name ?? '').toLowerCase().includes(name)) return false;
    return true;
  });
  const { offset, limit } = page(filter);
  return {
    total: matches.length,
    offset,
    relations: matches.slice(offset, offset + limit).map((relation) => ({
      ...relationBrief(relation),
      fromName: endName(relation.from, state),
      toName: endName(relation.to, state),
    })),
  };
}

/**
 * One element or relation, with what surrounds it; `undefined` for an id the model lacks. Its free
 * geometry comes in brief unless `fullGeometry`.
 */
export function describeItem(
  state: ProjectSnapshot,
  id: Id,
  options: { fullGeometry?: boolean } = {},
) {
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);
  const element = index.element(id);
  if (element) {
    const component = definitions.component(element.component);
    const relations = index.relationsOn(id);
    const containers = relations.filter(
      (relation) =>
        relation.from === id &&
        definitions.nestingRelationTypes.has(relation.relationType) &&
        index.element(relation.to) !== undefined,
    );
    return {
      kind: 'element' as const,
      ...brief(element),
      componentName: component?.name ?? element.component,
      // Its component takes attributes it does not define, on purpose (ADR 0105).
      ...(component?.openAttributes === true ? { openAttributes: true } : {}),
      ...(element.description === undefined ? {} : { description: element.description }),
      ...(element.ids === undefined ? {} : { ids: element.ids }),
      attributes: element.attributes ?? {},
      attributeDefinitions: [...(component?.attributes ?? [])],
      // What it carries that its component does not define: particularities, kept (M3d).
      ...undefinedOf(state, element),
      ...describedDestinations(element, component?.attributes ?? []),
      ...(element.appearance === undefined
        ? {}
        : { appearance: appearanceRead(element.appearance, options.fullGeometry) }),
      ...darkCanvasOf(state, element.appearance),
      // The explorable it shows, and the explorable shapes bound to it (ADR 0107).
      ...elementExplorable(state, element),
      containers: containers.map((relation) => ({
        id: relation.to,
        name: endName(relation.to, state),
        relation: relation.id,
        relationType: relation.relationType,
      })),
      contents: index
        .contentsOf(id)
        .map((content) => ({ id: content, name: endName(content, state) })),
      relationsFrom: relations
        .filter((relation) => relation.from === id)
        .map((relation) => ({ ...relationBrief(relation), toName: endName(relation.to, state) })),
      relationsTo: relations
        .filter((relation) => relation.to === id && relation.from !== id)
        .map((relation) => ({
          ...relationBrief(relation),
          fromName: endName(relation.from, state),
        })),
      inViews: state.views
        .filter((view) => view.positions.some((position) => position.element === id))
        .map((view) => view.id),
      // The relations on it that views route by hand, which reset_route sends back (ADR 0039).
      ...nonEmpty('relationsRoutedByHand', handRoutesOn(state, id)),
    };
  }
  const relation = index.relation(id);
  if (relation) {
    const type = definitions.relationType(relation.relationType);
    return {
      kind: 'relation' as const,
      ...relationBrief(relation),
      relationTypeName: type?.name ?? relation.relationType,
      direction: type?.direction ?? 'undirected',
      nests: type?.nests ?? false,
      fromName: endName(relation.from, state),
      toName: endName(relation.to, state),
      ...(relation.description === undefined ? {} : { description: relation.description }),
      attributes: relation.attributes ?? {},
      ...describedDestinations(relation, type?.attributes ?? []),
      // Its own appearance, a particularity: stroke, width, dash and route (ADR-0035, ADR 0069).
      ...(relation.appearance === undefined ? {} : { appearance: relation.appearance }),
      ...darkCanvasOf(state, relation.appearance),
      relationsOnIt: index.relationsOn(id).map(relationBrief),
      // The views that route it by hand, which reset_route sends back to automatic (ADR 0039).
      ...nonEmpty('routedByHandIn', viewsRoutingByHand(state, id)),
      inScenarios: state.scenarios.flatMap((scenario) =>
        scenario.steps
          .filter((step) => step.relations.includes(id))
          .map((step) => ({ scenario: scenario.id, step: step.id })),
      ),
    };
  }
  return undefined;
}

/** `{ [key]: list }`, or nothing for an empty list. */
function nonEmpty<T>(key: string, list: readonly T[]): Record<string, readonly T[]> {
  return list.length === 0 ? {} : { [key]: list };
}

/** The attributes an element carries that its component does not define, with what they mean. */
function undefinedOf(state: ProjectSnapshot, element: Element) {
  const names = undefinedAttributesOf(state, element);
  return names.length === 0
    ? {}
    : { undefinedAttributes: names, undefinedAttributesNote: UNDEFINED_ATTRIBUTES_NOTE };
}

/**
 * A view: what it is, the nesting relation types that arrange it, its positions, its free shapes and,
 * for World and every container with shapes inside it in this view, the order it draws them in, back
 * to front, with live ids only. `undefined` for a view the project lacks.
 */
export function readView(state: ProjectSnapshot, viewId: Id) {
  const view = state.views.find((each) => each.id === viewId);
  if (!view) return undefined;
  const worldId = state.model.world.id;
  const arrangedBy = nestingTypesInView(state, view);
  const types = new Set(arrangedBy);
  const containers = new Set<Id>();
  for (const relation of state.model.relations) {
    if (types.has(relation.relationType) && relation.from !== relation.to)
      containers.add(relation.to);
  }
  const stacking = [
    {
      container: worldId,
      name: state.model.world.name,
      backToFront: stackingOrderOf(state, viewId),
    },
    ...state.model.elements
      .filter((element) => containers.has(element.id))
      .map((element) => ({
        container: element.id,
        name: element.name,
        backToFront: stackingOrderOf(state, viewId, element.id),
      }))
      .filter((each) => each.backToFront.length > 0),
  ];
  const { collapsed, routes, routeStyle, scope, relationTypesLeftOut } = view;
  return {
    id: view.id,
    name: view.name,
    ...(view.description === undefined ? {} : { description: view.description }),
    perspective: view.perspective,
    nestingRelationTypes: view.nestingRelationTypes,
    arrangedBy,
    // How much of the model it shows, through its scope when it has one (ADR-0040).
    shows: shownCounts(state, view),
    ...(scope === undefined ? {} : { scope }),
    // The relation types whose relations it does not draw (ADR 0064).
    ...(relationTypesLeftOut === undefined ? {} : { relationTypesLeftOut }),
    positions: view.positions,
    freeShapes: view.freeShapes,
    // Its pictures, by name and size, and the file each shows (ADR 0098).
    ...picturesAnswer(view),
    ...linksAnswer(view),
    // Its explorable shapes, each with the explorable it shows and the element it reads (ADR 0107).
    ...explorableShapesAnswer(state, view),
    stacking,
    ...(collapsed === undefined ? {} : { collapsed }),
    // The routes chosen by hand, by relation; every other relation is routed automatically.
    ...(routes === undefined ? {} : { routes }),
    // The same relations by name, with what to do when one runs astray (M3d).
    ...routedByHandAnswer(state, view),
    // The style of the automatic routes its relations' appearances leave to it (ADR 0069).
    ...(routeStyle === undefined ? {} : { routeStyle }),
    // How it reads many lines, when not as by default (ADR 0080, section 5).
    ...(view.rows === undefined ? {} : { rows: view.rows }),
    ...(view.selectionFadesLines === undefined
      ? {}
      : { selectionFadesLines: view.selectionFadesLines }),
  };
}

/**
 * How much of the model a view shows: its elements and relations out of the model's, World left out,
 * and whether that is the whole model or what its scope gives (ADR-0040), less the relations of the
 * relation types it leaves out (ADR 0064).
 */
export function shownCounts(state: ProjectSnapshot, view: ProjectSnapshot['views'][number]) {
  const { elements, relations } = state.model;
  if (!showsPart(view)) {
    return {
      whole: true,
      elements: elements.length,
      ofElements: elements.length,
      relations: relations.length,
      ofRelations: relations.length,
    };
  }
  const shown = shownByScope(state, view);
  return {
    whole: false,
    elements: shown.elements.length - 1,
    ofElements: elements.length,
    relations: relations.filter((relation) => shown.relation(relation.id)).length,
    ofRelations: relations.length,
  };
}

/** A scenario, each step with its relations and whether it is broken; `undefined` when missing. */
export function readScenario(state: ProjectSnapshot, scenarioId: Id) {
  const scenario = state.scenarios.find((each) => each.id === scenarioId);
  if (!scenario) return undefined;
  const index = modelIndexOf(state);
  const timeline = scenarioTimeline(state, scenario);
  const aggregated = timeline.entries.flatMap((entry) =>
    entry.kind === 'aggregated'
      ? [
          {
            steps: Array.from({ length: entry.count }, (_, at) => entry.first + at + 1),
            container: entry.container,
            containerName: index.element(entry.container)?.name ?? entry.container,
          },
        ]
      : [],
  );
  const broken = brokenStepsOf(state, scenario);
  const outside = timeline.entries.filter(isOutside).map((entry) => entry.first + 1);
  // Its decisions (ADR 0078): each alternative with the steps it holds, and where each step sits.
  const decisions = readDecisions(scenario, new Set(broken.map((each) => each.index + 1)));
  const within = decisions?.ok ? decisions.within : undefined;
  const ways = combinationsOf(scenario, WAYS_COUNTED);
  return {
    id: scenario.id,
    name: scenario.name,
    ...(scenario.description === undefined ? {} : { description: scenario.description }),
    view: scenario.view,
    ...(decisions === undefined
      ? {}
      : decisions.ok
        ? {
            decisions: decisions.decisions,
            waysToPlay: ways >= WAYS_COUNTED ? `${WAYS_COUNTED} or more` : ways,
          }
        : {
            decisionsProblem: `${decisions.message} It plays every step in order until they hold together, and every change of its steps is refused meanwhile: update_scenario's remove-decisions takes them away, keeping every step.`,
          }),
    steps: scenario.steps.map((step, at) => {
      const relations = step.relations.map((id) => {
        const relation = index.relation(id);
        return relation
          ? {
              ...relationBrief(relation),
              fromName: endName(relation.from, state),
              toName: endName(relation.to, state),
            }
          : { id, missing: true };
      });
      return {
        number: at + 1,
        id: step.id,
        description: step.description,
        relations,
        broken: relations.some((relation) => 'missing' in relation),
        ...(step.dataIn === undefined ? {} : { dataIn: step.dataIn }),
        ...(step.dataOut === undefined ? {} : { dataOut: step.dataOut }),
        ...(within?.has(at) ? { within: within.get(at) } : {}),
      };
    }),
    brokenSteps: broken.map((each) => ({
      number: each.index + 1,
      step: each.step,
      missing: each.missing,
      ...(within?.has(each.index) ? { within: within.get(each.index) } : {}),
    })),
    // How it plays over its view now, each decision playing its default: consecutive steps inside a
    // collapsed container play as one, and a step whose relations the view's scope shows none of
    // plays outside the view (ADR-0040).
    playsAs: {
      steps: timeline.entries.length,
      aggregated,
      ...(outside.length === 0 ? {} : { outsideTheView: outside }),
    },
  };
}

/** Whether an id names an element, World included, a relation, a view or a free shape of a view. */
export function idKind(
  state: ProjectSnapshot,
  id: Id,
): 'element' | 'relation' | 'free-shape' | undefined {
  const index = modelIndexOf(state);
  if (index.element(id)) return 'element';
  if (index.relation(id)) return 'relation';
  if (state.views.some((view) => view.freeShapes.some((shape) => shape.id === id))) {
    return 'free-shape';
  }
  return undefined;
}

/**
 * The destinations an element or a relation has (ADR 0056), each with what it opens; nothing when it
 * has none. Values of destination attributes that are not destinations are left out: they open nothing.
 */
function describedDestinations(
  item: { attributes?: Element['attributes'] },
  attributes: readonly AttributeDefinition[],
) {
  const found = destinationsOf(item, attributes);
  if (found.length === 0) return {};
  return {
    destinations: found.map(({ attribute, destination, own }) => ({
      attribute,
      opens: destinationKind(destination),
      destination,
      ...(own ? {} : { fromDefault: true }),
    })),
  };
}

function brief(element: Element) {
  return { id: element.id, name: element.name, component: element.component };
}

function relationBrief(relation: Relation) {
  return {
    id: relation.id,
    relationType: relation.relationType,
    from: relation.from,
    to: relation.to,
    ...(relation.name === undefined ? {} : { name: relation.name }),
  };
}

/** The name of a relation's end: an element's, a relation's own, or its id. */
function endName(id: Id, state: ProjectSnapshot): string {
  const index = modelIndexOf(state);
  return index.element(id)?.name ?? index.relation(id)?.name ?? id;
}

function page(filter: { limit?: number; offset?: number }): { offset: number; limit: number } {
  const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? DEFAULT_RESULTS)), MAX_RESULTS);
  const offset = Math.max(0, Math.floor(filter.offset ?? 0));
  return { offset, limit };
}

function sameJson(a: JsonValue | undefined, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A view's link cards as read_view lists them (ADR 0098, stage 3): their address and host, title,
 * description, place, size and picture's file; nothing when it has none.
 */
function linksAnswer(view: ProjectSnapshot['views'][number]) {
  const cards = linkCardsOf(view);
  if (cards.length === 0) return {};
  return {
    links: cards.map((card) => ({
      id: card.id,
      url: card.url,
      host: linkHost(card.url),
      title: card.title,
      ...(card.description === undefined ? {} : { description: card.description }),
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
      ...(card.picture === undefined ? {} : { picture: `media/${mediaFileName(card.picture)}` }),
    })),
  };
}

/** A view's pictures as read_view lists them, by name and size (ADR 0098); nothing when it has none. */
function picturesAnswer(view: ProjectSnapshot['views'][number]) {
  const pictures = picturesOf(view);
  if (pictures.length === 0) return {};
  return {
    pictures: pictures.map((picture) => ({
      id: picture.id,
      name: pictureName(picture),
      x: picture.x,
      y: picture.y,
      width: picture.width,
      height: picture.height,
      file: `media/${mediaFileName(picture.media)}`,
      format: picture.media.format,
      ownSize: { width: picture.media.width, height: picture.media.height },
      // A video (ADR 0098, stage 2), with the file of its poster when it has one.
      ...(isVideo(picture)
        ? {
            video: true,
            ...(picture.poster ? { poster: `media/${mediaFileName(picture.poster)}` } : {}),
          }
        : {}),
    })),
  };
}
