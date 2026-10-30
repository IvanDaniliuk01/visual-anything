/**
 * Layout's stability (ADR 0080, "Layout quality, held by tests", and its clarification of Stage 3), on
 * the fixture shaped like the user's data model and on random views of tables in schemas:
 * - Layout twice moves nothing: a second Layout of a view leaves its file as the first left it, byte
 *   for byte;
 * - when a table joins a schema of a view laid out, laying it out (the automatic layout of new shapes,
 *   ADR 0065) moves at most 10% of the shapes placed already, and one at least; those it moves, it
 *   moves aside by the least that clears the schema it grew, no further than the schema grew plus 40
 *   (ADR 0080, section 4).
 * Layout runs here as the canvas runs it (`useLayout`): the run, a second run when the view draws
 * lines the first was not given (`settle.ts`), and the action that stores the places.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ShapePosition, ViewFile } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadDataModel } from '../../test/dataModel';
import { tablesProject, VIEW, type TableSpec } from '../../test/tables';
import { buildSceneAfresh } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput, type LayoutScope } from './input';
import { inputAfter } from './settle';

const elk = new ELK();
const base = loadDataModel();

function apply(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

function viewOf(project: ProjectSnapshot, id: Id): ViewFile {
  return project.views.find((view) => view.id === id) as ViewFile;
}

/** Lays out `scope` of a view as the canvas does, and stores what it gives. */
async function laidOut(
  project: ProjectSnapshot,
  viewId: Id,
  scope: LayoutScope = { kind: 'view' },
): Promise<ProjectSnapshot> {
  const scene = buildSceneAfresh(project, viewId);
  const input = layoutInput(scene, project, scope);
  if (!input) return project;
  let result = await layOut(input, elk);
  const again = inputAfter(project, viewId, scene, scope, input, result.shapes);
  if (again) result = await layOut(again, elk);
  const action = layoutCommand(project, viewId, scene, scope, result.shapes);
  return action ? apply(project, action.command) : project;
}

/** Places the shapes of `elements` that the view shows and has no place for, as a new shape is. */
async function placedNew(
  project: ProjectSnapshot,
  viewId: Id,
  elements: ReadonlySet<Id>,
): Promise<ProjectSnapshot> {
  const scene = buildSceneAfresh(project, viewId);
  const keys = new Set(
    scene.shapes.filter((shape) => elements.has(shape.element)).map((shape) => shape.key),
  );
  return laidOut(project, viewId, { kind: 'new', keys });
}

/** How many of the places `before` stores `after` changes, and by how far on average and at most. */
function movedBetween(
  before: ViewFile,
  after: ViewFile,
): { moved: number; of: number; mean: number; most: number } {
  const key = (place: ShapePosition) => `${place.element} ${place.container ?? ''}`;
  const now = new Map(after.positions.map((place) => [key(place), place]));
  let moved = 0;
  let distance = 0;
  let most = 0;
  for (const place of before.positions) {
    const then = now.get(key(place));
    if (!then || (then.x === place.x && then.y === place.y)) continue;
    moved += 1;
    const away = Math.hypot(then.x - place.x, then.y - place.y);
    distance += away;
    most = Math.max(most, away);
  }
  return { moved, of: before.positions.length, mean: moved === 0 ? 0 : distance / moved, most };
}

/** How far a schema's shape grew, across or down, whichever is more, between two projects. */
function grewBy(before: ProjectSnapshot, after: ProjectSnapshot, viewId: Id, schema: Id): number {
  const rectOf = (project: ProjectSnapshot) =>
    buildSceneAfresh(project, viewId).shapes.find((shape) => shape.element === schema)?.rect;
  const then = rectOf(before);
  const now = rectOf(after);
  if (!then || !now) return 0;
  return Math.max(now.width - then.width, now.height - then.height, 0);
}

/**
 * What adding a table may move: 10% of the shapes placed, and one at least, each aside by no more than
 * the schema grew, the gap of 40 and a step of 8.
 */
function expectFewMoved(change: { moved: number; of: number; most: number }, grew: number) {
  expect(change.moved).toBeLessThanOrEqual(Math.max(1, Math.floor(change.of / 10)));
  expect(change.most).toBeLessThanOrEqual(grew + 48);
}

/** A table of `columns` columns in `schema`, whose first columns refer to `references`. */
function withTable(
  project: ProjectSnapshot,
  id: Id,
  schema: Id,
  columns: number,
  references: readonly Id[],
  component = 'sql.table',
): ProjectSnapshot {
  const commands: Command[] = [
    {
      type: 'create-element',
      element: { id, component, name: id },
      containers: [{ container: schema, relationType: 'systems.is-part-of' }],
    },
  ];
  for (let at = 0; at < Math.max(columns, references.length); at++) {
    commands.push({
      type: 'create-element',
      element: { id: `${id}-c${at}`, component: 'data-modeling.column', name: `c${at}` },
      containers: [{ container: id, relationType: 'data-modeling.is-column-of' }],
    });
  }
  references.forEach((to, at) => {
    commands.push({
      type: 'create-relation',
      relation: {
        id: `${id}-r${at}`,
        relationType: 'data-modeling.references',
        from: `${id}-c${at}`,
        to,
      },
    });
  });
  return apply(project, { type: 'batch', label: `Add ${id}`, commands });
}

function expanded(view: Id, only?: (id: Id) => boolean): ProjectSnapshot {
  const collapsed = viewOf(base, view).collapsed ?? [];
  return apply(base, {
    type: 'set-collapsed',
    view,
    elements: only ? collapsed.filter(only) : [...collapsed],
    collapsed: false,
  });
}

function unpinned(project: ProjectSnapshot, view: Id): ProjectSnapshot {
  const pinned = viewOf(project, view).positions.filter((each) => each.pinned === true);
  return apply(project, {
    type: 'set-positions',
    view,
    positions: pinned.map((each) => ({ ...each, pinned: false })),
  });
}

/**
 * The fixture's views as the quality tests open them, each with a schema a table may join and two
 * columns the view shows for it to refer to.
 */
const cases: {
  name: string;
  view: Id;
  project: () => ProjectSnapshot;
  schema: Id;
  references: Id[];
}[] = [
  {
    name: 'schema-view',
    view: 'schema-view',
    project: () => base,
    schema: 'schema-e',
    references: ['column-0457', 'column-0234'],
  },
  {
    name: 'overview expanded',
    view: 'overview',
    project: () => expanded('overview'),
    schema: 'schema-e',
    references: ['column-0457', 'column-0234'],
  },
  {
    name: 'overview expanded, unpinned',
    view: 'overview',
    project: () => unpinned(expanded('overview'), 'overview'),
    schema: 'schema-e',
    references: ['column-0457', 'column-0234'],
  },
  {
    name: 'processing with its tables open',
    view: 'processing',
    project: () => expanded('processing', (id) => id.startsWith('table-')),
    schema: 'schema-e',
    references: ['column-0457'],
  },
];

describe("Layout's stability on the fixture (ADR 0080, Stage 3)", () => {
  it.each(cases)(
    '$name: Layout twice moves nothing',
    async ({ view, project }) => {
      const once = await laidOut(project(), view);
      const twice = await laidOut(once, view);
      expect(JSON.stringify(viewOf(twice, view))).toBe(JSON.stringify(viewOf(once, view)));
    },
    120_000,
  );

  it.each(cases)(
    '$name: a table that joins a schema moves few shapes',
    async ({ view, project, schema, references }) => {
      const once = await laidOut(project(), view);
      const joined = withTable(once, 'table-joins', schema, 3, references);
      const placed = await placedNew(
        joined,
        view,
        new Set(['table-joins', 'table-joins-c0', 'table-joins-c1', 'table-joins-c2']),
      );
      expectFewMoved(
        movedBetween(viewOf(once, view), viewOf(placed, view)),
        grewBy(once, placed, view, schema),
      );
    },
    120_000,
  );
});

/** A random view of tables in schemas, related by references between their columns. */
interface RandomView {
  schemas: number;
  tables: { schema: number; columns: number; at: { x: number; y: number } | null }[];
  references: { from: [number, number]; to: [number, number] }[];
}

const randomView: fc.Arbitrary<RandomView> = fc.integer({ min: 1, max: 3 }).chain((schemas) =>
  fc
    .array(
      fc.record({
        schema: fc.integer({ min: 0, max: schemas - 1 }),
        columns: fc.integer({ min: 1, max: 5 }),
        // Some tables have no place yet; the rest stand on a coarse grid, where they may touch.
        at: fc.option(
          fc.record({
            x: fc.integer({ min: 0, max: 6 }).map((x) => 24 + x * 320),
            y: fc.integer({ min: 0, max: 6 }).map((y) => 56 + y * 160),
          }),
          { freq: 4 },
        ),
      }),
      { minLength: 10, maxLength: 24 },
    )
    .chain((tables) =>
      fc
        .array(
          fc.record({
            from: fc.tuple(fc.nat(tables.length - 1), fc.nat(4)),
            to: fc.tuple(fc.nat(tables.length - 1), fc.nat(4)),
          }),
          { minLength: 4, maxLength: tables.length * 2 },
        )
        .map((references) => ({ schemas, tables, references })),
    ),
);

function randomProject(spec: RandomView): ProjectSnapshot {
  const columnId = (table: number, column: number) => {
    const columns = spec.tables[table]?.columns ?? 1;
    return `t${table}-c${column % columns}`;
  };
  const tables: TableSpec[] = spec.tables.map((table, at) => ({
    id: `t${at}`,
    in: `s${table.schema}`,
    ...(table.at ? { at: table.at } : {}),
    columns: Array.from({ length: table.columns }, (_, column) => ({
      id: `t${at}-c${column}`,
      ...(column === 0 ? { primaryKey: true } : {}),
    })),
  }));
  const seen = new Set<string>();
  const references: { id: string; from: string; to: string }[] = [];
  spec.references.forEach((reference, at) => {
    const from = columnId(...reference.from);
    const to = columnId(...reference.to);
    if (reference.from[0] === reference.to[0] || seen.has(`${from} ${to}`)) return;
    seen.add(`${from} ${to}`);
    references.push({ id: `r${at}`, from, to });
  });
  return tablesProject({
    elements: Array.from({ length: spec.schemas }, (_, at) => ({
      id: `s${at}`,
      component: 'systems.box',
      name: `schema_${at}`,
    })),
    positions: Array.from({ length: spec.schemas }, (_, at) => ({
      element: `s${at}`,
      x: at * 2400,
      y: 0,
    })),
    tables,
    references,
  });
}

/** A table that joins a schema of a random view, with a column referring to up to two others. */
const joining = fc.record({
  schema: fc.nat(2),
  references: fc.array(fc.tuple(fc.nat(23), fc.nat(4)), { maxLength: 2 }),
});

describe("Layout's stability on random views (ADR 0080, Stage 3)", () => {
  it('Layout twice moves nothing', async () => {
    await fc.assert(
      fc.asyncProperty(randomView, async (spec) => {
        const once = await laidOut(randomProject(spec), VIEW);
        const twice = await laidOut(once, VIEW);
        expect(JSON.stringify(viewOf(twice, VIEW))).toBe(JSON.stringify(viewOf(once, VIEW)));
      }),
      { numRuns: 20 },
    );
  }, 300_000);

  it('a table that joins a schema moves at most 10% of the shapes placed, aside by the least', async () => {
    await fc.assert(
      fc.asyncProperty(randomView, joining, async (spec, join) => {
        const once = await laidOut(randomProject(spec), VIEW);
        const schema = `s${join.schema % spec.schemas}`;
        const references = join.references.map(([table, column]) => {
          const at = table % spec.tables.length;
          return `t${at}-c${column % (spec.tables[at]?.columns ?? 1)}`;
        });
        const joined = withTable(
          once,
          'joins',
          schema,
          3,
          [...new Set(references)],
          'data-modeling.table',
        );
        const placed = await placedNew(
          joined,
          VIEW,
          new Set(['joins', 'joins-c0', 'joins-c1', 'joins-c2']),
        );
        expectFewMoved(
          movedBetween(viewOf(once, VIEW), viewOf(placed, VIEW)),
          grewBy(once, placed, VIEW, schema),
        );
      }),
      { numRuns: 20 },
    );
  }, 300_000);
});
