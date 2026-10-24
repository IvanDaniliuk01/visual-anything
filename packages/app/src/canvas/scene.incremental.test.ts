/**
 * A scene built after an edit, from the scene before it, must equal one built from nothing, field by
 * field: whatever an edit leaves alone is kept, and nothing it changes is.
 */
import { applyOperations, executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, Note, ShapePosition, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import { collapsedIn } from './collapse';
import { hitAt, indexScene, indexSceneAfresh, shapesAt, type IndexedScene } from './hit';
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
              { kind: 'note', id: 'second-note', x: 900, y: 600, width: 200, height: 60, text: 'Hi' },
              { kind: 'arrow', id: 'pointer', from: { x: 0, y: 700 }, to: { x: 120, y: 700 } },
            ],
          }
        : view,
    ),
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
  | { kind: 'undo' };

const small = fc.integer({ min: -300, max: 300 });
const pick = fc.nat({ max: 1000 });
const edit: fc.Arbitrary<Edit> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('drag'), shape: pick, dx: small, dy: small }) },
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
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('attribute'), element: pick, value: pick }) },
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
  { weight: 2, arbitrary: fc.constant({ kind: 'undo' as const }) },
);

const RELATION_TYPES = ['systems.communicates-with', 'systems.reads-from', 'systems.writes-to'];

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
          changes: { attributes: { load: edit.value } },
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
      const relationType = at(RELATION_TYPES, edit.type) as string;
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
          shapes: [{ element: shape.element, from: shape.container as Id }],
        }
      );
    }
    case 'collapse':
    case 'undo':
      return undefined;
  }
}

/** Collapses or expands a container, as I1's `set-collapsed` writes it, until the core has it. */
function toggleCollapsed(project: ProjectSnapshot, scene: Scene, number: number): ProjectSnapshot {
  const containers = scene.shapes.filter((shape) => shape.holdsContents || shape.collapsed);
  const shape = at(containers, number);
  if (!shape) return project;
  const view = viewIn(project);
  const collapsed = new Set(collapsedIn(view));
  if (collapsed.has(shape.element)) collapsed.delete(shape.element);
  else collapsed.add(shape.element);
  const { collapsed: _, ...rest } = view as ViewFile & { collapsed?: Id[] };
  const next = collapsed.size === 0 ? rest : { ...rest, collapsed: [...collapsed].sort() };
  return {
    ...project,
    views: project.views.map((each) => (each.id === VIEW ? (next as ViewFile) : each)),
  };
}

function run(start: ProjectSnapshot, edits: readonly Edit[]): void {
  let project = start;
  let scene = buildScene(project, VIEW);
  const undos: ProjectSnapshot[] = [];
  for (const each of edits) {
    if (each.kind === 'collapse') {
      undos.push(project);
      project = toggleCollapsed(project, scene, each.element);
    } else if (each.kind === 'undo') {
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

/** Each shape's band, worked out from nothing as `indexScene` defines it. */
function freshBands(scene: Scene): number[] {
  const drawing = scene.drawing ?? scene.shapes.map((_, index) => index);
  const bands = new Array<number>(scene.shapes.length).fill(0);
  const drawn: number[] = [];
  for (const index of drawing) {
    const rect = (scene.shapes[index] as ElementShape).rect;
    let highest = -1;
    for (const other of drawn) {
      const them = (scene.shapes[other] as ElementShape).rect;
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
