/**
 * A scene built after an edit, from the scene before it, must equal one built from nothing, field by
 * field: whatever an edit leaves alone is kept, and nothing it changes is.
 */
import {
  DATA_MODELING,
  applyOperations,
  definitionsOf,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Note, ScopeRule, ShapePosition, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { FRAME, ORGANS_ID, TRIANGLE, beyondBoxes } from '../test/beyond';
import { ARM_ID, withSolids } from '../test/solids';
import { CARD_FACE, COLUMN_FACE, SYSTEM_FACE, TABLE_FACE, withFaces } from '../test/faces';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import { collapsedIn, setCollapsedCommand } from './collapse';
import { addToViewCommand, leaveOutCommand } from './scope';
import { hitAt, indexScene, indexSceneAfresh, shapesAt, type IndexedScene } from './hit';
import { drawnBoundsOf, nameTagOf } from './nameTags';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';

const VIEW = 'system-overview';

/**
 * The sample, with the Reminder service in the Clinic booking system too, so that it has a copy in
 * each container, relations between relations, and a second note.
 */
function richSample(): ProjectSnapshot {
  const sample = withWovenRelations(loadSample(), 1);
  return {
    ...sample,
    model: {
      ...sample.model,
      relations: [
        ...sample.model.relations,
        {
          id: 'reminders-in-clinic',
          relationType: 'systems.is-part-of',
          from: 'reminder-service',
          to: 'clinic-booking',
        },
      ],
    },
    views: sample.views.map((view) =>
      view.id === VIEW
        ? {
            ...view,
            freeShapes: [
              ...view.freeShapes,
              {
                kind: 'note',
                id: 'second-note',
                x: 900,
                y: 600,
                width: 200,
                height: 60,
                text: 'Hi',
              },
              { kind: 'arrow', id: 'pointer', from: { x: 0, y: 700 }, to: { x: 120, y: 700 } },
            ],
          }
        : view,
    ),
  };
}

/** Two tables of the Data modeling package, with their columns, side by side in one view. */
function tables(): ProjectSnapshot {
  const columns = [
    { id: 'users-id', table: 'users', type: 'uuid', primaryKey: true },
    { id: 'users-org', table: 'users', type: 'uuid' },
    { id: 'users-name', table: 'users', type: 'text' },
    { id: 'orgs-id', table: 'orgs', type: 'uuid', primaryKey: true },
    { id: 'orgs-owner', table: 'orgs', type: 'uuid' },
  ];
  return {
    project: { schemaVersion: 1, name: 'Tables', packages: ['data-modeling'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'users', component: 'data-modeling.table', name: 'users' },
        { id: 'orgs', component: 'data-modeling.table', name: 'orgs' },
        ...columns.map(({ id, type, primaryKey }) => ({
          id,
          component: 'data-modeling.column',
          name: id,
          attributes: { type, ...(primaryKey ? { primaryKey } : {}) },
        })),
      ],
      relations: columns.map(({ id, table }) => ({
        id: `${id}-in`,
        relationType: 'data-modeling.is-column-of',
        from: id,
        to: table,
      })),
    },
    packages: [DATA_MODELING],
    views: [
      {
        id: VIEW,
        name: 'Tables',
        perspective: { name: 'Schema' },
        nestingRelationTypes: ['data-modeling.is-column-of'],
        positions: [
          { element: 'users', x: 0, y: 0 },
          { element: 'orgs', x: 500, y: 0 },
        ],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

/** What an edit does, by numbers that pick its targets in the project as it is then. */
type Edit =
  | { kind: 'drag'; shape: number; dx: number; dy: number }
  | { kind: 'resize'; shape: number; width: number; height: number }
  | { kind: 'layout'; seed: number }
  | { kind: 'forget'; shape: number }
  | { kind: 'move-note'; dx: number; dy: number }
  | { kind: 'rename'; element: number; name: string }
  | { kind: 'attribute'; element: number; value: number }
  | { kind: 'recolor'; element: number; fill: number }
  | { kind: 'resize-component'; element: number; width: number }
  | { kind: 'relate'; from: number; to: number; type: number }
  | { kind: 'unrelate'; relation: number }
  | { kind: 'rename-relation'; relation: number; name: string }
  | { kind: 'collapse'; element: number }
  | { kind: 'restack'; shape: number; front: boolean }
  | { kind: 'take-out'; shape: number }
  // What the view's scope shows (ADR-0040).
  | { kind: 'leave-out'; element: number }
  | { kind: 'add-back'; element: number }
  | { kind: 'scope'; element: number; rule: number }
  // The relation types the view leaves out (ADR 0064): one more, or none.
  | { kind: 'leave-out-type'; type: number; exactly: boolean }
  // Beyond boxes (ADR 0066, ADR 0067, ADR 0069): an element's part and geometry, the view's
  // automatic style, and a picture shown with its parts.
  | { kind: 'part'; element: number; part: number }
  | { kind: 'geometry'; element: number; which: number }
  | { kind: 'route-style'; style: number }
  | { kind: 'picture'; element: number; which: number }
  // Solids (ADR 0075): a solid shown, placed, turned or taken away, and a solid's part.
  | { kind: 'solid'; element: number; which: number }
  | { kind: 'solid-part'; element: number; part: number }
  | { kind: 'undo' };

const small = fc.integer({ min: -300, max: 300 });
const pick = fc.nat({ max: 1000 });
const edit: fc.Arbitrary<Edit> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant('drag'), shape: pick, dx: small, dy: small }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('resize'),
      shape: pick,
      width: fc.integer({ min: 40, max: 900 }),
      height: fc.integer({ min: 40, max: 600 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('layout'), seed: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('forget'), shape: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('move-note'), dx: small, dy: small }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('rename'),
      element: pick,
      name: fc.string({ minLength: 1, maxLength: 12 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('attribute'), element: pick, value: pick }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('recolor'), element: pick, fill: pick }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('resize-component'),
      element: pick,
      width: fc.integer({ min: 60, max: 400 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({ kind: fc.constant('relate'), from: pick, to: pick, type: pick }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('unrelate'), relation: pick }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('rename-relation'),
      relation: pick,
      name: fc.string({ minLength: 1, maxLength: 8 }),
    }),
  },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('collapse'), element: pick }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('restack'), shape: pick, front: fc.boolean() }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('take-out'), shape: pick }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('leave-out'), element: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('add-back'), element: pick }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('scope'), element: pick, rule: fc.nat({ max: 3 }) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('leave-out-type'),
      type: pick,
      exactly: fc.boolean(),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('part'), element: pick, part: pick }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('geometry'), element: pick, which: pick }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('route-style'), style: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('picture'), element: pick, which: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('solid'), element: pick, which: pick }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('solid-part'), element: pick, part: pick }),
  },
  { weight: 2, arbitrary: fc.constant({ kind: 'undo' as const }) },
);

/** The relation types a project's packages define that do not nest, which edits relate by. */
function relationTypesOf(project: ProjectSnapshot): string[] {
  const definitions = definitionsOf(project.packages);
  return [...definitions.relationTypes.keys()].filter(
    (id) => definitions.relationType(id)?.nests === false,
  );
}

function at<T>(list: readonly T[], number: number): T | undefined {
  return list.length === 0 ? undefined : list[number % list.length];
}

function viewIn(project: ProjectSnapshot): ViewFile {
  return project.views.find((view) => view.id === VIEW) as ViewFile;
}

function positionOf(shape: ElementShape, x: number, y: number, pinned: boolean): ShapePosition {
  return {
    element: shape.element,
    ...(shape.container === undefined ? {} : { container: shape.container }),
    x,
    y,
    ...shape.storedSize,
    ...(pinned ? { pinned: true } : {}),
  };
}

/** The command an edit sends, as the canvas or the inspector would; undefined when it has no target. */
function commandOf(edit: Edit, project: ProjectSnapshot, scene: Scene): Command | undefined {
  const { elements, relations } = project.model;
  switch (edit.kind) {
    case 'drag': {
      const shape = at(scene.shapes, edit.shape);
      return (
        shape && {
          type: 'set-positions',
          view: VIEW,
          positions: [positionOf(shape, shape.offset.x + edit.dx, shape.offset.y + edit.dy, true)],
        }
      );
    }
    case 'resize': {
      const shape = at(scene.shapes, edit.shape);
      return (
        shape && {
          type: 'set-positions',
          view: VIEW,
          positions: [
            {
              ...positionOf(shape, shape.offset.x, shape.offset.y, true),
              width: edit.width,
              height: edit.height,
            },
          ],
        }
      );
    }
    case 'layout': {
      const seen = new Set<string>();
      const positions = scene.shapes.flatMap((shape, index) => {
        const key = `${shape.element} ${shape.container ?? ''}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const step = (edit.seed + index * 7) % 5;
        return [positionOf(shape, 24 + step * 40, 48 + index * 8, false)];
      });
      return positions.length > 0 ? { type: 'set-positions', view: VIEW, positions } : undefined;
    }
    case 'forget': {
      const shape = at(scene.shapes, edit.shape);
      return (
        shape && {
          type: 'remove-positions',
          view: VIEW,
          positions: [
            { element: shape.element, ...(shape.container ? { container: shape.container } : {}) },
          ],
        }
      );
    }
    case 'move-note': {
      const note = viewIn(project).freeShapes.find((shape): shape is Note => shape.kind === 'note');
      return (
        note && {
          type: 'update-free-shape',
          view: VIEW,
          shape: { ...note, x: note.x + edit.dx, y: note.y + edit.dy },
        }
      );
    }
    case 'rename': {
      const element = at(elements, edit.element);
      return element && { type: 'update-element', id: element.id, changes: { name: edit.name } };
    }
    case 'attribute': {
      const element = at(elements, edit.element);
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { attributes: { load: edit.value, primaryKey: edit.value % 2 === 0 } },
        }
      );
    }
    case 'recolor': {
      const element = at(elements, edit.element);
      const fill = `#${(edit.fill * 9973).toString(16).padStart(6, '0').slice(-6).toUpperCase()}`;
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { appearance: { ...element.appearance, fill } },
        }
      );
    }
    case 'resize-component': {
      const element = at(elements, edit.element);
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { appearance: { ...element.appearance, width: edit.width } },
        }
      );
    }
    case 'relate': {
      const ends = [...elements.map((each) => each.id), ...relations.map((each) => each.id)];
      const from = at(ends, edit.from);
      const to = at(ends, edit.to + 1);
      const relationType = at(relationTypesOf(project), edit.type) as string;
      return from && to && from !== to
        ? { type: 'create-relation', relation: { relationType, from, to } }
        : undefined;
    }
    case 'unrelate': {
      const relation = at(relations, edit.relation);
      return relation && { type: 'delete', relations: [relation.id] };
    }
    case 'rename-relation': {
      const relation = at(relations, edit.relation);
      return relation && { type: 'update-relation', id: relation.id, changes: { name: edit.name } };
    }
    case 'restack': {
      const shape = at(scene.shapes, edit.shape);
      return (
        shape && {
          type: 'restack',
          view: VIEW,
          moves: [
            {
              shape: {
                element: shape.element,
                ...(shape.container ? { container: shape.container } : {}),
              },
              to: edit.front ? 'front' : 'back',
            },
          ],
        }
      );
    }
    case 'take-out': {
      const shape = at(
        scene.shapes.filter((each) => each.container !== undefined),
        edit.shape,
      );
      return (
        shape && {
          type: 'change-container',
          view: VIEW,
          shapes: [{ element: shape.element, from: shape.container }],
        }
      );
    }
    case 'collapse': {
      // A container drawn expanded collapses, and one drawn collapsed expands, as its toggle does.
      const containers = scene.shapes.filter((shape) => shape.holdsContents || shape.collapsed);
      const shape = at(containers, edit.element);
      return (
        shape &&
        setCollapsedCommand(VIEW, [shape.element], !collapsedIn(viewIn(project)).has(shape.element))
      );
    }
    case 'leave-out': {
      const element = at(elements, edit.element);
      return element && leaveOutCommand(VIEW, [element.id]);
    }
    case 'add-back': {
      // One of those left out, as the inspector adds back, or else any element.
      const left = viewIn(project).scope?.leftOut ?? elements.map((each) => each.id);
      const element = at(left, edit.element);
      return element === undefined ? undefined : addToViewCommand(VIEW, [element]);
    }
    case 'scope': {
      const element = at(elements, edit.element);
      if (!element) return undefined;
      const rules: (ScopeRule[] | null)[] = [
        [{ kind: 'contents', container: element.id }],
        [{ kind: 'component', component: element.component }],
        [{ kind: 'contents', container: element.id, depth: 1 }],
        null,
      ];
      const include = rules[edit.rule % rules.length] ?? null;
      return { type: 'set-scope', view: VIEW, scope: include && { include } };
    }
    case 'leave-out-type': {
      // One more relation type, or, now and then, none at all.
      const listed = viewIn(project).relationTypesLeftOut ?? [];
      const type = at(relationTypesOf(project), edit.type);
      const others = listed.filter((each) => each.relationType !== type);
      const relationTypes =
        type === undefined || edit.type % 5 === 0
          ? []
          : [...others, { relationType: type, ...(edit.exactly ? { exactly: true } : {}) }];
      return { type: 'set-relation-types-left-out', view: VIEW, relationTypes };
    }
    case 'part': {
      const element = at(elements, edit.element);
      const names = ['left', 'right', 'ring', 'none-such'];
      const name = names[edit.part % names.length] as string;
      const choice = edit.part % 6;
      const part =
        choice === 5 ? 'none' : choice === 4 ? { part: name, image: ORGANS_ID } : { part: name };
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { appearance: { ...element.appearance, part } },
        }
      );
    }
    case 'geometry': {
      const element = at(elements, edit.element);
      const geometry = [FRAME, TRIANGLE, 'none' as const][edit.which % 3];
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { appearance: { ...element.appearance, geometry } },
        }
      );
    }
    case 'route-style': {
      const routeStyle = (['straight', 'curved', null] as const)[edit.style % 3] ?? null;
      return { type: 'update-view', id: VIEW, changes: { routeStyle } };
    }
    case 'picture': {
      const element = at(elements, edit.element);
      const placement = (['parts', 'icon', 'drawing'] as const)[edit.which % 3];
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: {
            appearance: { ...element.appearance, image: { image: ORGANS_ID, placement } },
          },
        }
      );
    }
    case 'solid': {
      const element = at(elements, edit.element);
      const choices = [
        { solid: ARM_ID, placement: 'parts' as const },
        { solid: ARM_ID, placement: 'icon' as const },
        { solid: ARM_ID, placement: 'drawing' as const, lighting: 'flat' as const },
        { solid: ARM_ID, placement: 'parts' as const, camera: { azimuth: -60, elevation: 45 } },
        'none' as const,
      ];
      const solid = choices[edit.which % choices.length];
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { appearance: { ...element.appearance, solid } },
        }
      );
    }
    case 'solid-part': {
      const element = at(elements, edit.element);
      const names = ['base', 'link', 'wrist', 'tip', 'gripper', 'none-such'];
      const name = names[edit.part % names.length] as string;
      const part = edit.part % 4 === 3 ? { part: name, solid: ARM_ID } : { part: name };
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { appearance: { ...element.appearance, part } },
        }
      );
    }
    case 'undo':
      return undefined;
  }
}

function run(start: ProjectSnapshot, edits: readonly Edit[]): void {
  let project = start;
  let scene = buildScene(project, VIEW);
  const undos: ProjectSnapshot[] = [];
  for (const each of edits) {
    if (each.kind === 'undo') {
      project = undos.pop() ?? project;
    } else {
      const command = commandOf(each, project, scene);
      const outcome = command && executeCommand(project, command);
      if (!outcome?.ok) continue;
      undos.push(project);
      // As the app gets a change: the local program's operations, applied to its own copy.
      project = applyOperations(project, outcome.operations).state;
    }
    const before = scene;
    scene = buildScene(project, VIEW);
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
    // What did not change is the same object, so that the index and the tiles keep it.
    const keys = new Map(before.shapes.map((shape) => [shape.key, shape]));
    for (const shape of scene.shapes) {
      const was = keys.get(shape.key);
      if (was && was !== shape) expect(was).not.toEqual(shape);
    }
    // The index made from the scene before it equals one made from nothing.
    const indexed = indexScene(scene);
    expect([...indexed.bands]).toEqual(freshBands(scene));
    sameIndex(indexed, indexSceneAfresh(scene));
  }
}

/** Two indexes of one scene find the same things, in the same order. */
function sameIndex(indexed: IndexedScene, fresh: IndexedScene): void {
  const { scene } = indexed;
  expect([...indexed.bands]).toEqual([...fresh.bands]);
  expect([...indexed.rankOf]).toEqual([...fresh.rankOf]);
  expect(indexed.drawing).toEqual(fresh.drawing);
  expect([...indexed.byKey.entries()]).toEqual([...fresh.byKey.entries()]);
  expect([...indexed.byElement.entries()]).toEqual([...fresh.byElement.entries()]);
  expect([...indexed.contentsOf.entries()]).toEqual([...fresh.contentsOf.entries()]);
  const bounds = scene.bounds;
  if (!bounds) return;
  expect(indexed.shapes.query(bounds)).toEqual(fresh.shapes.query(bounds));
  expect(indexed.relations.query(bounds)).toEqual(fresh.relations.query(bounds));
  // A grid of points over the scene finds the same shapes and lines.
  for (let x = bounds.x; x <= bounds.x + bounds.width; x += bounds.width / 7) {
    for (let y = bounds.y; y <= bounds.y + bounds.height; y += bounds.height / 7) {
      const point = { x, y };
      expect(hitAt(indexed, point, 12)).toEqual(hitAt(fresh, point, 12));
      expect(shapesAt(indexed, point).map((shape) => shape.key)).toEqual(
        shapesAt(fresh, point).map((shape) => shape.key),
      );
    }
  }
}

/**
 * Each shape's band, worked out from nothing as `indexScene` defines it: by what each shape draws,
 * its rectangle with its name tag.
 */
function freshBands(scene: Scene): number[] {
  const drawing = scene.drawing ?? scene.shapes.map((_, index) => index);
  const bands = new Array<number>(scene.shapes.length).fill(0);
  const drawn: number[] = [];
  for (const index of drawing) {
    const rect = drawnBoundsOf(scene.shapes[index] as ElementShape);
    let highest = -1;
    for (const other of drawn) {
      const them = drawnBoundsOf(scene.shapes[other] as ElementShape);
      const overlap =
        rect.x < them.x + them.width &&
        them.x < rect.x + rect.width &&
        rect.y < them.y + them.height &&
        them.y < rect.y + rect.height;
      if (overlap) highest = Math.max(highest, bands[other] as number);
    }
    bands[index] = highest + 1;
    drawn.push(index);
  }
  return bands;
}

describe('a scene built after an edit', () => {
  it('equals one built from nothing, after any sequence of edits', () => {
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 24 }), (edits) => {
        run(richSample(), edits);
      }),
      { numRuns: 60 },
    );
  }, 60_000);

  it('equals one built from nothing in a view of tables, whose columns badge their keys', () => {
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 16 }), (edits) => {
        run(tables(), edits);
      }),
      { numRuns: 40 },
    );
  }, 60_000);

  it('equals one built from nothing with faces, whose headers and heights they give (ADR 0083)', () => {
    const faced = withFaces(tables(), {
      'data-modeling.table': TABLE_FACE,
      'data-modeling.column': COLUMN_FACE,
    });
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 16 }), (edits) => {
        run(faced, edits);
      }),
      { numRuns: 25 },
    );
    const systems = withFaces(richSample(), {
      'systems.system': SYSTEM_FACE,
      'systems.service': CARD_FACE,
    });
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 16 }), (edits) => {
        run(systems, edits);
      }),
      { numRuns: 25 },
    );
  }, 120_000);

  it('equals one built from nothing in a view beyond boxes, with drawings with parts', () => {
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 20 }), (edits) => {
        run(beyondBoxes(VIEW), edits);
      }),
      { numRuns: 60 },
    );
  }, 60_000);

  it('equals one built from nothing beyond boxes, with faces that take the name tags’ place (ADR 0083)', () => {
    const named = withFaces(beyondBoxes(VIEW), {
      'anatomy.chamber': { markup: ['<b>{{name}}</b>'], style: [] },
    });
    // `loose`, a part drawn on its own whose name its ring cannot hold, hangs no tag with the face.
    const loose = buildScene(named, VIEW).shapes.find((shape) => shape.key === 'loose');
    expect(loose?.face).toBeDefined();
    expect(nameTagOf(loose as ElementShape)).toBeUndefined();
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 16 }), (edits) => {
        run(named, edits);
      }),
      { numRuns: 40 },
    );
  }, 120_000);

  it('equals one built from nothing in a view with solids, with drawings of their parts (ADR 0075)', () => {
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 20 }), (edits) => {
        run(withSolids(VIEW), edits);
      }),
      { numRuns: 60 },
    );
  }, 120_000);

  it('keeps a solid’s anchored parts at their points as their drawing moves and recolors', () => {
    run(withSolids(VIEW), [
      { kind: 'drag', shape: 0, dx: 37, dy: -11 },
      { kind: 'recolor', element: 1, fill: 5 },
      { kind: 'drag', shape: 0, dx: 0.1, dy: 0.2 },
      { kind: 'resize', shape: 0, width: 500, height: 420 },
      { kind: 'drag', shape: 0, dx: -3, dy: 7 },
      { kind: 'undo' },
      { kind: 'solid', element: 0, which: 3 },
      { kind: 'drag', shape: 0, dx: 5, dy: 5 },
    ] as Edit[]);
  });

  it('places a drawing’s icon alike after a drag as when built from nothing (seed 1775277967)', () => {
    run(beyondBoxes(VIEW), [
      { kind: 'picture', element: 132, which: 46 },
      { kind: 'unrelate', relation: 0 },
      { kind: 'drag', shape: 611, dx: 0, dy: 0 },
      { kind: 'geometry', element: 0, which: 0 },
    ] as Edit[]);
  });

  it('orders a drawing’s contents again when a resize takes its picture away (seed -36734158)', () => {
    run(beyondBoxes(VIEW), [
      { kind: 'take-out', shape: 1 },
      { kind: 'picture', element: 0, which: 64 },
      { kind: 'resize', shape: 0, width: 40, height: 40 },
    ] as Edit[]);
  });

  it('writes a column’s detail with its type and badges, again when a reference comes or goes', () => {
    const project = tables();
    const first = buildScene(project, VIEW);
    const detail = (scene: Scene, key: string) =>
      scene.shapes.find((shape) => shape.key === key)?.detail;
    expect(detail(first, 'users/users-id')).toBe('uuid · PK');
    expect(detail(first, 'users/users-org')).toBe('uuid');
    expect(detail(first, 'users')).toBe('');
    const referenced = executeCommand(project, {
      type: 'create-relation',
      relation: { relationType: 'data-modeling.references', from: 'users-org', to: 'orgs-id' },
    });
    if (!referenced.ok) throw new Error('The reference was refused.');
    const after = buildScene(referenced.state, VIEW);
    expect(detail(after, 'users/users-org')).toBe('uuid · FK');
    expect(after).toEqual(buildSceneAfresh(referenced.state, VIEW));
    const changed = after.shapes.filter((shape, at) => shape !== first.shapes[at]);
    expect(changed.map((shape) => shape.key)).toEqual(['users/users-org']);
  });

  it('keeps a shape that did not change the same object after a take-out is undone twice', () => {
    const big = syntheticProject({ elements: 240, perSystem: 8, overlap: 'stairs' });
    const view = big.views[0] as ViewFile;
    const project: ProjectSnapshot = { ...big, views: [{ ...view, id: VIEW }] };
    run(project, [
      { kind: 'drag', shape: 0, dx: 0, dy: 0 },
      { kind: 'take-out', shape: 0 },
      { kind: 'undo' },
      { kind: 'undo' },
    ]);
  });

  it('equals one built from nothing in a larger view with overlapping shapes, too', () => {
    const big = syntheticProject({ elements: 240, perSystem: 8, overlap: 'stairs' });
    const view = big.views[0] as ViewFile;
    const project: ProjectSnapshot = { ...big, views: [{ ...view, id: VIEW }] };
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 10 }), (edits) => {
        run(project, edits);
      }),
      { numRuns: 10 },
    );
  }, 60_000);
});
