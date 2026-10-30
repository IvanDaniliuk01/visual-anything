/**
 * What an import brings in, before it changes anything (ADR-0042). A reader turns a file into a plan;
 * the person maps the plan's kinds to components and relation types; and `planToCommand` turns the
 * plan and the mapping into one batch command, labelled with the file's name, so that one undo takes
 * back the whole import. Readers live beside this file, one for each format, and never run, fetch or
 * follow anything in what they read.
 */
import {
  ESSENCE_ID,
  RELATES_TO_ID,
  type Attributes,
  type ExternalIds,
  type Id,
  type Point,
} from '@visual-anything/schema';
import { Draft } from '../commands/draft';
import { componentOrEssence, relationTypeOrRelatesTo } from '../definitions';
import { escapeEmphasis } from '../text/emphasis';
import type { BatchCommand, Command } from '../commands/types';
import { freshId, isId, randomIds, slug, type IdGenerator } from '../ids';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';

/** The most an import brings in, and the most a compressed file inflates to (ADR-0042). */
export const IMPORT_LIMITS = Object.freeze({
  elements: 20_000,
  /** Relations, those that put an element inside another included. */
  relations: 50_000,
  views: 500,
  /** Positions and bend points, over every view. */
  places: 200_000,
  inflatedBytes: 32 * 1024 * 1024,
});

/** What a mapping chose for a kind: its own entry only, never one an object inherits. */
function chosen(choices: Readonly<Record<string, Id>>, kind: string): Id | undefined {
  return Object.hasOwn(choices, kind) ? choices[kind] : undefined;
}

/** Each pair of what sits inside what once, in the order the plan gives them. */
function distinctContainment(plan: ImportPlan): ImportPlan['containment'] {
  const seen = new Set<string>();
  return plan.containment.filter(({ element, container }) => {
    const key = JSON.stringify([element, container]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What a file holds, as a reader read it, with keys of its own that the plan's parts refer by. */
export interface ImportPlan {
  /** The format the reader recognized, such as `mermaid-flowchart`, `csv` or `drawio`. */
  format: string;
  /** The file's name, or what the person called pasted text; the import's action is named after it. */
  source: string;
  elements: PlannedElement[];
  relations: PlannedRelation[];
  /** Which planned element sits inside which, through the nesting relation type the mapping gives. */
  containment: { element: string; container: string }[];
  views: PlannedView[];
  /**
   * The kinds the file uses, each with how many things use it and a suggested component or relation
   * type, for the mapping dialog to offer: node shapes, classes and styles for elements; edge kinds
   * for relations.
   */
  kinds: { elements: PlannedKind[]; relations: PlannedKind[] };
  /** What matched nothing, quoted as the file writes it, with why; reported before and after. */
  unmatched: { text: string; why: string }[];
}

/** An element the import creates, or, with `existing`, updates. */
export interface PlannedElement {
  key: string;
  /** The file's own id for it, kept as the element's id when it is a valid id that is free. */
  sourceId?: string;
  name: string;
  /** The kind the mapping maps to a component. */
  kind: string;
  description?: string;
  attributes?: Attributes;
  /**
   * What it is in other catalogs, by scheme (ADR 0056). `matchByExternalIds` checks them, fills in
   * the schemes the file lacks from crosswalks, and matches the element that shares one.
   */
  ids?: ExternalIds;
  /**
   * An element of the project this row of the file matched, by a key such as its id: its name and
   * attribute values are updated, and nothing else of it changes. Importing again uses it.
   */
  existing?: Id;
}

/**
 * A relation the import creates, between planned elements, or relations, by their keys; or, with
 * `existing`, updates.
 */
export interface PlannedRelation {
  key: string;
  sourceId?: string;
  from: string;
  to: string;
  /** The kind the mapping maps to a relation type. */
  kind: string;
  name?: string;
  description?: string;
  attributes?: Attributes;
  /**
   * A relation of the project this row of the file matched: its name, description and attribute
   * values are updated, and nothing else of it changes, its ends and relation type included.
   * Importing again uses it.
   */
  existing?: Id;
}

/** A view the import creates: a page of a draw.io file, a Structurizr view. */
export interface PlannedView {
  key: string;
  name: string;
  description?: string;
  /** The elements it shows, when it shows only some: by keys; absent, it shows the whole model. */
  shows?: string[];
  /** Where its shapes sit, from the file's own layout; pinned, as placed by hand. */
  positions?: PlannedPosition[];
  /** The points relations bend at, on the canvas, from the file's own routes. */
  bendPoints?: { relation: string; points: Point[] }[];
}

/** Where a planned element's shape sits in a planned view, relative to its container's shape. */
export interface PlannedPosition {
  element: string;
  container?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** One kind of thing a file uses, for the mapping dialog. */
export interface PlannedKind {
  kind: string;
  /** How the file names it, to show the person. */
  label: string;
  count: number;
  /** A component or relation type that suits it, from the built-in mappings. */
  suggested?: Id;
}

/** What the person chose: a component for each element kind, a relation type for each relation kind. */
export interface ImportMapping {
  elements: Readonly<Record<string, Id>>;
  relations: Readonly<Record<string, Id>>;
  /** The nesting relation type that puts planned elements inside their containers. */
  nesting?: Id;
}

/** The batch an import becomes, with the ids it gives each planned part; or why it cannot be one. */
export type PlannedCommand =
  | {
      ok: true;
      command: BatchCommand;
      /** The id each planned element, relation and view gets, by its key. */
      ids: ReadonlyMap<string, Id>;
      /** What the command leaves out of the plan, and why, for the report after the import. */
      notes: string[];
    }
  | { ok: false; problems: string[] };

/**
 * The one batch command that applies a plan with a mapping: its views first, then its elements,
 * containment, relations, and each view's scope, positions and bend points. Ids from the file are
 * kept where they are valid and free; others are made from names. Nothing is applied here: the
 * caller sends the command, which the core checks as any other.
 */
export function planToCommand(
  state: ProjectSnapshot,
  plan: ImportPlan,
  mapping: ImportMapping,
  generate: IdGenerator = randomIds(),
): PlannedCommand {
  const problems = planProblems(state, plan, mapping);
  if (problems.length > 0) return { ok: false, problems };

  const taken = new Draft(state, generate);
  const used = new Set<Id>();
  const idFor = (sourceId: string | undefined, base: string): Id => {
    if (
      sourceId !== undefined &&
      isId(sourceId) &&
      !used.has(sourceId) &&
      !taken.isTaken(sourceId)
    ) {
      used.add(sourceId);
      return sourceId;
    }
    const id = freshId(
      generate,
      slug(base, 'imported'),
      (each) => used.has(each) || taken.isTaken(each),
    );
    used.add(id);
    return id;
  };
  const ids = new Map<string, Id>();
  for (const element of plan.elements) {
    ids.set(element.key, element.existing ?? idFor(element.sourceId, element.name));
  }
  for (const relation of plan.relations) {
    ids.set(
      relation.key,
      relation.existing ??
        idFor(relation.sourceId, relation.name ?? `${relation.from}-${relation.to}`),
    );
  }
  for (const view of plan.views) ids.set(view.key, idFor(undefined, view.name));
  const idOf = (key: string) => ids.get(key) as Id;

  const commands: Command[] = [];
  const notes: string[] = [];
  const nesting = mapping.nesting;
  const definitions = definitionsIn(state);
  // Rows stand in the model's order and take no position (ADR 0023).
  const componentOfKey = new Map<string, Id>();
  const index = modelIndexOf(state);
  for (const element of plan.elements) {
    const component =
      element.existing === undefined
        ? chosen(mapping.elements, element.kind)
        : index.element(element.existing)?.component;
    if (component !== undefined) componentOfKey.set(element.key, component);
  }
  // Outside text is written as text (ADR 0082): a description, and the value of an attribute that
  // takes text emphasis, are escaped so that they read back as the file wrote them.
  const text = (description: string | undefined) =>
    description === undefined ? {} : { description: escapeEmphasis(description) };
  const valuesAsText = (
    attributes: Attributes | undefined,
    defined: readonly { name: string; format?: 'plain' | 'emphasis' }[],
  ): { attributes?: Attributes } => {
    if (!attributes) return {};
    const emphasised = new Set(
      defined.filter((each) => each.format === 'emphasis').map((each) => each.name),
    );
    if (emphasised.size === 0) return { attributes };
    return {
      attributes: Object.fromEntries(
        Object.entries(attributes).map(([name, value]) => [
          name,
          emphasised.has(name) && typeof value === 'string' ? escapeEmphasis(value) : value,
        ]),
      ),
    };
  };
  const elementValues = (component: Id | undefined, attributes: Attributes | undefined) =>
    valuesAsText(
      attributes,
      component === undefined ? [] : componentOrEssence(definitions, component).attributes,
    );
  const relationValues = (relationType: Id | undefined, attributes: Attributes | undefined) =>
    valuesAsText(
      attributes,
      relationType === undefined
        ? []
        : relationTypeOrRelatesTo(definitions, relationType).attributes,
    );
  const drawsRows = (key: string | undefined) => {
    const component = key === undefined ? undefined : componentOfKey.get(key);
    return (
      component !== undefined &&
      componentOrEssence(definitions, component).appearance.contentsAsRows === true
    );
  };
  for (const view of plan.views) {
    commands.push({
      type: 'create-view',
      view: {
        id: idOf(view.key),
        name: view.name,
        ...text(view.description),
        perspective: { name: view.name },
        ...(nesting === undefined ? {} : { nestingRelationTypes: [nesting] }),
      },
    });
  }
  for (const element of plan.elements) {
    if (element.existing !== undefined) {
      commands.push({
        type: 'update-element',
        id: element.existing,
        changes: {
          name: element.name,
          ...elementValues(componentOfKey.get(element.key), element.attributes),
          ...(element.ids ? { ids: element.ids } : {}),
        },
      });
      continue;
    }
    commands.push({
      type: 'create-element',
      element: {
        id: idOf(element.key),
        component: chosen(mapping.elements, element.kind) as Id,
        name: element.name,
        ...text(element.description),
        ...elementValues(componentOfKey.get(element.key), element.attributes),
        ...(element.ids ? { ids: element.ids } : {}),
      },
    });
  }
  if (nesting !== undefined) {
    for (const { element, container } of distinctContainment(plan)) {
      commands.push({
        type: 'create-relation',
        relation: { relationType: nesting, from: idOf(element), to: idOf(container) },
      });
    }
  }
  for (const relation of plan.relations) {
    if (relation.existing !== undefined) {
      commands.push({
        type: 'update-relation',
        id: relation.existing,
        changes: {
          ...(relation.name === undefined ? {} : { name: relation.name }),
          ...text(relation.description),
          ...relationValues(index.relation(relation.existing)?.relationType, relation.attributes),
        },
      });
      continue;
    }
    commands.push({
      type: 'create-relation',
      relation: {
        id: idOf(relation.key),
        relationType: chosen(mapping.relations, relation.kind) as Id,
        from: idOf(relation.from),
        to: idOf(relation.to),
        ...(relation.name === undefined ? {} : { name: relation.name }),
        ...text(relation.description),
        ...relationValues(chosen(mapping.relations, relation.kind), relation.attributes),
      },
    });
  }
  const worldId = state.model.world.id;
  const kindOfRelation = new Map(plan.relations.map((each) => [each.key, each.kind]));
  for (const view of plan.views) {
    const viewId = idOf(view.key);
    if (view.shows !== undefined) {
      // Only what it shows: every element derives from Essence, so excluding it leaves only what is
      // added (ADR 0040).
      const shows = [...new Set(view.shows.map(idOf))];
      commands.push({
        type: 'set-scope',
        view: viewId,
        scope: {
          exclude: [{ kind: 'component', component: ESSENCE_ID }],
          ...(shows.length > 0 ? { added: shows } : {}),
        },
      });
    }
    const placed = (view.positions ?? []).filter((position) => !drawsRows(position.container));
    const rows = (view.positions?.length ?? 0) - placed.length;
    if (rows > 0) {
      notes.push(
        `${rows === 1 ? '1 position' : `${rows} positions`} in "${view.name}" left out: rows take their place from their table.`,
      );
    }
    if (placed.length > 0) {
      commands.push({
        type: 'set-positions',
        view: viewId,
        positions: placed.map((position) => ({
          element: idOf(position.element),
          ...(position.container === undefined ? {} : { container: idOf(position.container) }),
          x: position.x,
          y: position.y,
          ...(position.width === undefined ? {} : { width: position.width }),
          ...(position.height === undefined ? {} : { height: position.height }),
          pinned: true,
        })),
      });
    }
    for (const { relation, points } of view.bendPoints ?? []) {
      if (points.length === 0) continue;
      // A relation that puts one thing inside another is drawn as nesting, not as a line.
      const kind = kindOfRelation.get(relation);
      if (
        kind !== undefined &&
        nesting !== undefined &&
        chosen(mapping.relations, kind) === nesting
      ) {
        notes.push(
          `The bend points of a relation in "${view.name}" left out: it puts one thing inside another.`,
        );
        continue;
      }
      commands.push({
        type: 'set-route',
        view: viewId,
        relation: idOf(relation),
        bendPoints: points,
        container: worldId,
      });
    }
  }
  return {
    ok: true,
    command: { type: 'batch', label: `Import "${plan.source}"`, commands },
    ids,
    notes,
  };
}

/** Why a plan and a mapping cannot become a command: limits, keys and kinds left unmapped. */
export function planProblems(
  state: ProjectSnapshot,
  plan: ImportPlan,
  mapping: ImportMapping,
): string[] {
  const problems: string[] = [];
  if (plan.elements.length > IMPORT_LIMITS.elements) {
    problems.push(
      `The file holds ${plan.elements.length.toLocaleString('en')} elements; an import brings at most ${IMPORT_LIMITS.elements.toLocaleString('en')}.`,
    );
  }
  const relations = plan.relations.length + distinctContainment(plan).length;
  if (relations > IMPORT_LIMITS.relations) {
    problems.push(
      `The file holds ${relations.toLocaleString('en')} relations, those that put one thing inside another included; an import brings at most ${IMPORT_LIMITS.relations.toLocaleString('en')}.`,
    );
  }
  if (plan.views.length > IMPORT_LIMITS.views) {
    problems.push(
      `The file holds ${plan.views.length.toLocaleString('en')} views; an import brings at most ${IMPORT_LIMITS.views.toLocaleString('en')}.`,
    );
  }
  const places = plan.views.reduce(
    (sum, view) =>
      sum +
      (view.positions?.length ?? 0) +
      (view.bendPoints ?? []).reduce((points, each) => points + each.points.length, 0),
    0,
  );
  if (places > IMPORT_LIMITS.places) {
    problems.push(
      `The file holds ${places.toLocaleString('en')} positions and bend points; an import brings at most ${IMPORT_LIMITS.places.toLocaleString('en')}.`,
    );
  }
  const definitions = definitionsIn(state);
  const keys = new Set<string>();
  const once = (key: string) => {
    if (keys.has(key)) problems.push(`The plan uses the key "${key}" twice.`);
    keys.add(key);
  };
  for (const element of plan.elements) once(element.key);
  for (const relation of plan.relations) once(relation.key);
  for (const view of plan.views) once(view.key);
  const known = (key: string) => keys.has(key);
  const index = modelIndexOf(state);
  for (const element of plan.elements) {
    if (element.existing !== undefined) {
      if (index.element(element.existing) === undefined) {
        problems.push(`The plan updates "${element.existing}", which the project does not hold.`);
      }
      continue;
    }
    const component = chosen(mapping.elements, element.kind);
    if (component === undefined) {
      problems.push(`No component is chosen for "${element.kind}".`);
    } else if (!definitions.components.has(component) && component !== ESSENCE_ID) {
      problems.push(`No package in use defines the component "${component}".`);
    }
  }
  for (const relation of plan.relations) {
    if (relation.existing !== undefined) {
      if (index.relation(relation.existing) === undefined) {
        problems.push(`The plan updates "${relation.existing}", which the project does not hold.`);
      }
      continue;
    }
    const type = chosen(mapping.relations, relation.kind);
    if (type === undefined) problems.push(`No relation type is chosen for "${relation.kind}".`);
    else if (!definitions.relationTypes.has(type) && type !== RELATES_TO_ID) {
      problems.push(`No package in use defines the relation type "${type}".`);
    }
    if (!known(relation.from) || !known(relation.to)) {
      problems.push(`The relation "${relation.key}" ends on something the plan does not hold.`);
    }
  }
  if (plan.containment.length > 0 && mapping.nesting === undefined) {
    problems.push('No relation type that nests is chosen for what sits inside what.');
  }
  if (mapping.nesting !== undefined && !definitions.nestingRelationTypes.has(mapping.nesting)) {
    problems.push(`The relation type "${mapping.nesting}" does not nest.`);
  }
  for (const { element, container } of plan.containment) {
    if (!known(element) || !known(container)) {
      problems.push(`"${element}" sits inside "${container}", which the plan does not hold.`);
    }
  }
  return [...new Set(problems)];
}
