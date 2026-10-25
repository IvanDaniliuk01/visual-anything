/**
 * What an import brings in, before it changes anything (ADR-0042). A reader turns a file into a plan;
 * the person maps the plan's kinds to components and relation types; and `planToCommand` turns the
 * plan and the mapping into one batch command, labelled with the file's name, so that one undo takes
 * back the whole import. Readers live beside this file, one for each format, and never run, fetch or
 * follow anything in what they read.
 */
import { ESSENCE_ID, type Attributes, type Id, type Point } from '@visual-anything/schema';
import { Draft } from '../commands/draft';
import type { BatchCommand, Command } from '../commands/types';
import { freshId, isId, randomIds, slug, type IdGenerator } from '../ids';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';

/** The most an import brings in, and the most a compressed file inflates to (ADR-0042). */
export const IMPORT_LIMITS = Object.freeze({
  elements: 20_000,
  relations: 50_000,
  inflatedBytes: 32 * 1024 * 1024,
});

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
   * An element of the project this row of the file matched, by a key such as its id: its name and
   * attribute values are updated, and nothing else of it changes. Importing again uses it.
   */
  existing?: Id;
}

/** A relation the import creates, between planned elements, or relations, by their keys. */
export interface PlannedRelation {
  key: string;
  sourceId?: string;
  from: string;
  to: string;
  /** The kind the mapping maps to a relation type. */
  kind: string;
  name?: string;
  attributes?: Attributes;
}

/** A view the import creates: a page of a draw.io file, a Structurizr view. */
export interface PlannedView {
  key: string;
  name: string;
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
      idFor(relation.sourceId, relation.name ?? `${relation.from}-${relation.to}`),
    );
  }
  for (const view of plan.views) ids.set(view.key, idFor(undefined, view.name));
  const idOf = (key: string) => ids.get(key) as Id;

  const commands: Command[] = [];
  const nesting = mapping.nesting;
  for (const view of plan.views) {
    commands.push({
      type: 'create-view',
      view: {
        id: idOf(view.key),
        name: view.name,
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
          ...(element.attributes ? { attributes: element.attributes } : {}),
        },
      });
      continue;
    }
    commands.push({
      type: 'create-element',
      element: {
        id: idOf(element.key),
        component: mapping.elements[element.kind] as Id,
        name: element.name,
        ...(element.description === undefined ? {} : { description: element.description }),
        ...(element.attributes ? { attributes: element.attributes } : {}),
      },
    });
  }
  if (nesting !== undefined) {
    for (const { element, container } of plan.containment) {
      commands.push({
        type: 'create-relation',
        relation: { relationType: nesting, from: idOf(element), to: idOf(container) },
      });
    }
  }
  for (const relation of plan.relations) {
    commands.push({
      type: 'create-relation',
      relation: {
        id: idOf(relation.key),
        relationType: mapping.relations[relation.kind] as Id,
        from: idOf(relation.from),
        to: idOf(relation.to),
        ...(relation.name === undefined ? {} : { name: relation.name }),
        ...(relation.attributes ? { attributes: relation.attributes } : {}),
      },
    });
  }
  const worldId = state.model.world.id;
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
    if (view.positions && view.positions.length > 0) {
      commands.push({
        type: 'set-positions',
        view: viewId,
        positions: view.positions.map((position) => ({
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
  if (plan.relations.length > IMPORT_LIMITS.relations) {
    problems.push(
      `The file holds ${plan.relations.length.toLocaleString('en')} relations; an import brings at most ${IMPORT_LIMITS.relations.toLocaleString('en')}.`,
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
  for (const element of plan.elements) {
    if (element.existing !== undefined) continue;
    const component = mapping.elements[element.kind];
    if (component === undefined) {
      problems.push(`No component is chosen for "${element.kind}".`);
    } else if (!definitions.components.has(component) && component !== ESSENCE_ID) {
      problems.push(`No package in use defines the component "${component}".`);
    }
  }
  for (const relation of plan.relations) {
    const type = mapping.relations[relation.kind];
    if (type === undefined) problems.push(`No relation type is chosen for "${relation.kind}".`);
    if (!known(relation.from) || !known(relation.to)) {
      problems.push(`The relation "${relation.key}" ends on something the plan does not hold.`);
    }
  }
  if (plan.containment.length > 0 && mapping.nesting === undefined) {
    problems.push('No relation type that nests is chosen for what sits inside what.');
  }
  for (const { element, container } of plan.containment) {
    if (!known(element) || !known(container)) {
      problems.push(`"${element}" sits inside "${container}", which the plan does not hold.`);
    }
  }
  return [...new Set(problems)];
}
