import { resolve } from 'node:path';
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { AttributeDefinition, Face, Id, ViewFile } from '@visual-anything/schema';
import type { ElkEngine } from '../canvas/layout/engine';
import { layOut } from '../canvas/layout/engine';
import { layoutCommand } from '../canvas/layout/command';
import { layoutInput } from '../canvas/layout/input';
import { keepRoutes, routedWithKept, type KeptRoutes } from '../canvas/layout/keptRoutes';
import { avoidRoutes } from '../canvas/routing/avoid';
import { avoidBatchOf } from '../canvas/routing/avoided';
import { buildSceneAfresh, type RelationLine, type Scene } from '../canvas/scene';
import { loadProjectFolder } from './sample';

/**
 * The layout fixture shaped like the user's PostgreSQL model (ADR 0080, "Layout quality"): a
 * database, 9 schemas, 73 tables with 1,088 columns, 19 database views, 17 functions and 32
 * triggers, with 163 references, in the model's order, and three of its views with their positions,
 * collapsed containers and scopes as the user kept them. Ids and names are generated; none of the
 * user's names, descriptions, attributes or overlays is kept. Its views stand for the user's:
 * - `schema-view` for `esquema-engine`: one schema's tables, in their database;
 * - `overview` for `overview`: the database by schemas, 22 containers collapsed, one schema pinned;
 * - `processing` for `procesamiento`: tables of five schemas, collapsed, with copies of the schemas in
 *   World, drawn with curves.
 */
export function loadDataModel(): ProjectSnapshot {
  return loadProjectFolder(resolve(import.meta.dirname, '../canvas/layout/fixtures/data-model'));
}

// ——— The fixture with faces (ADR 0083, F5) ——————————————————————————————————————————————————————

/**
 * A table's face, as Data modeling's draws one: a header with its name in bold and its schema under
 * it, muted, then its rows.
 */
export const FIXTURE_TABLE_FACE: Face = {
  markup: [
    '<header class="head">',
    '  <b>{{name}}</b>',
    '  <small if="schema">{{schema}}</small>',
    '</header>',
    '<rows/>',
  ],
  style: [
    '.head { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; }',
    'b { font-size: 13px; line-clamp: 1; }',
    'small { color: var(--text-muted); line-clamp: 1; }',
  ],
};

/** A column's face: its name in monospace, its type in italics and its PK and FK badges, on one line. */
export const FIXTURE_COLUMN_FACE: Face = {
  markup: ['<p><code>{{name}}</code> <i>{{type ?? "—"}}</i> <badges/></p>'],
  style: ['face { justify-content: center; padding: 0 8px; }', 'p { white-space: nowrap; }'],
};

/** The attribute a table and a database view write their schema in, in the fixture with faces. */
const SCHEMA: AttributeDefinition = {
  name: 'schema',
  type: 'string',
  description: 'The schema it belongs to, as its header writes it.',
};

/**
 * The fixture with faces like Data modeling's on its tables and database views, which derive from
 * Data modeling's Table, and on its columns, through the project's appearances of those built-in
 * components, beside the width it gives tables. Its tables and views gain a `schema` attribute,
 * defined by its own package's components and holding the name of the schema each is part of, which
 * their headers write.
 */
export function withDataModelFaces(project: ProjectSnapshot): ProjectSnapshot {
  const names = new Map(project.model.elements.map((element) => [element.id, element.name]));
  const schemaOf = new Map<Id, string>();
  for (const relation of project.model.relations) {
    if (relation.relationType !== 'systems.is-part-of') continue;
    const schema = names.get(relation.to);
    if (relation.to.startsWith('schema-') && schema !== undefined) {
      schemaOf.set(relation.from, schema);
    }
  }
  const schemed = new Set(['sql.table', 'sql.view']);
  const components = project.project.appearances?.components ?? {};
  return {
    ...project,
    project: {
      ...project.project,
      appearances: {
        ...project.project.appearances,
        components: {
          ...components,
          'data-modeling.table': {
            ...components['data-modeling.table'],
            face: FIXTURE_TABLE_FACE,
          },
          'data-modeling.column': {
            ...components['data-modeling.column'],
            face: FIXTURE_COLUMN_FACE,
          },
        },
      },
    },
    packages: project.packages.map((file) =>
      file.id !== 'sql'
        ? file
        : {
            ...file,
            components: file.components.map((component) =>
              schemed.has(component.id)
                ? { ...component, attributes: [...(component.attributes ?? []), SCHEMA] }
                : component,
            ),
          },
    ),
    model: {
      ...project.model,
      elements: project.model.elements.map((element) => {
        const schema = schemaOf.get(element.id);
        return schema === undefined || !schemed.has(element.component)
          ? element
          : { ...element, attributes: { ...element.attributes, schema } };
      }),
    },
  };
}

// ——— Laying the fixture out, as the quality tests do ——————————————————————————————————————————————

/** A command applied, or the test fails with its problems. */
export function applied(project: ProjectSnapshot, command: Command) {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done;
}

export function viewIn(project: ProjectSnapshot, id: Id): ViewFile {
  return project.views.find((view) => view.id === id) as ViewFile;
}

/**
 * The project with every shape the view pins unpinned, as the view's inspector offers when pinned
 * shapes keep the one-pass layout from placing what they hold (ADR 0080, Stage 0b).
 */
function unpinned(project: ProjectSnapshot, viewId: Id): ProjectSnapshot {
  const pinned = viewIn(project, viewId).positions.filter((each) => each.pinned === true);
  return applied(project, {
    type: 'set-positions',
    view: viewId,
    positions: pinned.map((each) => ({ ...each, pinned: false })),
  }).state;
}

/** The three views ADR 0080 holds, as the research opened them, from the fixture `base`. */
export function fixtureCases(
  base: ProjectSnapshot,
): { name: string; view: Id; project: ProjectSnapshot }[] {
  const overview = viewIn(base, 'overview');
  const processing = viewIn(base, 'processing');
  const opened = applied(base, {
    type: 'set-collapsed',
    view: 'overview',
    elements: [...(overview.collapsed ?? [])],
    collapsed: false,
  }).state;
  return [
    { name: 'schema-view', view: 'schema-view', project: base },
    { name: 'overview expanded', view: 'overview', project: opened },
    {
      name: 'overview expanded, unpinned',
      view: 'overview',
      project: unpinned(opened, 'overview'),
    },
    {
      name: 'processing with its tables open',
      view: 'processing',
      project: applied(base, {
        type: 'set-collapsed',
        view: 'processing',
        elements: (processing.collapsed ?? []).filter((id) => id.startsWith('table-')),
        collapsed: false,
      }).state,
    },
  ];
}

/** Lays out a view as Layout does, and draws it as the canvas does right after. */
export async function laidOutView(project: ProjectSnapshot, viewId: Id, elk: ElkEngine) {
  const before = buildSceneAfresh(project, viewId);
  const input = layoutInput(before, project, { kind: 'view' });
  if (!input) throw new Error('Nothing to lay out.');
  const result = await layOut(input, elk);
  const action = layoutCommand(project, viewId, before, { kind: 'view' }, result.shapes);
  if (!action) throw new Error('The layout moved nothing.');
  const after = applied(project, action.command).state;
  const built = buildSceneAfresh(after, viewId);
  const kept = keepRoutes(built, result.routes);
  return { before, after, built, result, scene: routedWithKept(built, kept), kept };
}

/**
 * How many of the lines the router is given it gives up on, keeping their lane routes: those not
 * drawn along ELK's kept routes.
 */
export function gaveUpOn(scene: Scene, kept: KeptRoutes | undefined): number {
  const batch = avoidBatchOf(scene);
  return avoidRoutes(batch.shapes, batch.lines).filter(
    (each, at) => each.gaveUp && !kept?.routes.has((batch.drawn[at] as RelationLine).relation),
  ).length;
}
