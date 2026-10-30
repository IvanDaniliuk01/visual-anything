/**
 * Layout end to end, as the app runs it: the scene gives the input, ELK arranges it, the result
 * becomes one command, the core applies it, and the scene drawn afterwards shows what layout meant.
 */
import { SYSTEMS, executeCommand, positionKey, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, Note, Relation, ShapePosition, ViewFile } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import type { Rect } from '../geometry';
import { buildScene, CONTENTS_ORIGIN, type ElementShape, type Scene } from '../scene';
import { layoutCommand, type LayoutAction } from './command';
import { layOut } from './engine';
import { layoutInput, type LayoutScope } from './input';
import { LAYOUT_STEP } from './types';

const elk = new ELK();
const VIEW = 'system-overview';

/** Lays out a view of a project as the app does, and applies the result. */
async function lay(project: ProjectSnapshot, viewId: string, scope: LayoutScope) {
  const scene = buildScene(project, viewId);
  const input = layoutInput(scene, project, scope);
  if (!input) return { project, before: scene, after: scene, action: undefined };
  const result = await layOut(input, elk);
  const action = layoutCommand(project, viewId, scene, scope, result.shapes);
  if (!action) return { project, before: scene, after: scene, action };
  const outcome = executeCommand(project, action.command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return {
    project: outcome.state,
    before: scene,
    after: buildScene(outcome.state, viewId),
    action,
  };
}

function viewOf(project: ProjectSnapshot, id = VIEW): ViewFile {
  return project.views.find((view) => view.id === id) as ViewFile;
}

function shapeOf(scene: Scene, element: string): ElementShape {
  return scene.shapes.find((shape) => shape.element === element) as ElementShape;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** What layout must leave true in the scene it gives. */
function expectLaidOut(scene: Scene, action: LayoutAction | undefined, notes: readonly Rect[]) {
  if (!action) return;
  const byContainer = new Map<string, ElementShape[]>();
  for (const shape of scene.shapes) {
    const list = byContainer.get(shape.containerShape ?? '') ?? [];
    list.push(shape);
    byContainer.set(shape.containerShape ?? '', list);
  }
  for (const [container, shapes] of byContainer) {
    for (const [at, shape] of shapes.entries()) {
      if (!action.keys.has(shape.key)) continue;
      // Every shape layout moved sits on the step, inside its container's contents area.
      expect(Number.isInteger(shape.offset.x / LAYOUT_STEP)).toBe(true);
      expect(Number.isInteger(shape.offset.y / LAYOUT_STEP)).toBe(true);
      expect(shape.positioned).toBe('stored');
      if (container !== '') {
        expect(shape.offset.x).toBeGreaterThanOrEqual(CONTENTS_ORIGIN.x);
        expect(shape.offset.y).toBeGreaterThanOrEqual(CONTENTS_ORIGIN.y);
      } else {
        for (const note of notes) expect(overlaps(shape.rect, note)).toBe(false);
      }
      // ...and covers nothing beside it, which needs the sizes layout worked out to be the scene's.
      for (const [other, beside] of shapes.entries()) {
        if (other !== at) expect(overlaps(shape.rect, beside.rect)).toBe(false);
      }
    }
  }
}

describe('layout of the sample', () => {
  const sample = loadSample();
  const notes = viewOf(sample)
    .freeShapes.filter((shape): shape is Note => shape.kind === 'note')
    .map((note) => ({ x: note.x, y: note.y, width: note.width, height: note.height }));

  it('arranges every shape but the pinned one, in one action, unpinned, keeping stored sizes', async () => {
    const { project, before, after, action } = await lay(sample, VIEW, { kind: 'view' });
    expect(action?.command).toMatchObject({ type: 'batch', label: 'Lay out "System overview"' });
    expect(shapeOf(after, 'patient').rect).toEqual(shapeOf(before, 'patient').rect);
    const positions = viewOf(project).positions;
    const of = (element: string) => positions.find((each) => each.element === element);
    expect(of('patient')).toEqual({ element: 'patient', x: 40, y: 200, pinned: true });
    for (const position of positions.filter((each) => each.element !== 'patient')) {
      expect(position.pinned).toBeUndefined();
    }
    expect(of('clinic-booking')).toMatchObject({ width: 984, height: 480 });
    expect(of('scheduling')).toMatchObject({ width: 440, height: 384 });
    expectLaidOut(after, action, notes);
  });

  it('follows the relations: what the pinned patient talks to goes beside it, left to right', async () => {
    const { after } = await lay(sample, VIEW, { kind: 'view' });
    const patient = shapeOf(after, 'patient').rect;
    const clinic = shapeOf(after, 'clinic-booking').rect;
    expect(clinic.x).toBeGreaterThan(patient.x + patient.width);
    const whatsapp = shapeOf(after, 'whatsapp').rect;
    const agent = shapeOf(after, 'booking-agent').rect;
    expect(agent.x).toBeGreaterThan(whatsapp.x + whatsapp.width);
  });

  it('changes nothing when laid out again', async () => {
    const once = await lay(sample, VIEW, { kind: 'view' });
    const twice = await lay(once.project, VIEW, { kind: 'view' });
    expect(twice.action).toBeUndefined();
  });

  it('arranges only the contents of a container, which stays where it is', async () => {
    const { project, before, after, action } = await lay(sample, VIEW, {
      kind: 'contents',
      container: 'scheduling',
    });
    expect(action?.command).toMatchObject({ label: 'Lay out the contents of "Scheduling"' });
    const moved = viewOf(project).positions.filter(
      (each) =>
        !viewOf(sample).positions.some((old) => JSON.stringify(old) === JSON.stringify(each)),
    );
    expect(moved.map((each) => each.container)).toEqual(['scheduling', 'scheduling', 'scheduling']);
    expect(shapeOf(after, 'scheduling').offset).toEqual(shapeOf(before, 'scheduling').offset);
    expectLaidOut(after, action, notes);
  });

  it('places a new shape without a position among the others, moving nothing else', async () => {
    const created = executeCommand(sample, {
      type: 'create-element',
      element: { id: 'billing', component: 'systems.service', name: 'Billing' },
      containers: [{ container: 'clinic-booking', relationType: 'systems.is-part-of' }],
    });
    if (!created.ok) throw new Error('Not created.');
    const key = shapeOf(buildScene(created.state, VIEW), 'billing').key;
    const { project, after, action } = await lay(created.state, VIEW, {
      kind: 'new',
      keys: new Set([key]),
    });
    expect(action?.command).toMatchObject({
      label: 'Lay out "Billing" in "System overview"',
      commands: [{ type: 'set-positions', positions: [{ element: 'billing' }] }],
    });
    expect(viewOf(project).positions).toHaveLength(viewOf(sample).positions.length + 1);
    expectLaidOut(after, action, notes);
  });

  it('lays out a view whose shapes have no positions at all', async () => {
    const bare: ProjectSnapshot = {
      ...sample,
      views: sample.views.map((view) => ({ ...view, positions: [], freeShapes: [] })),
    };
    const scene = buildScene(bare, VIEW);
    const keys = new Set(scene.shapes.map((shape) => shape.key));
    const { after, action } = await lay(bare, VIEW, { kind: 'new', keys });
    expect(action?.moved).toBe(8);
    expectLaidOut(after, action, []);
    // The flow reads left to right, also across containers.
    expect(shapeOf(after, 'clinic-booking').rect.x).toBeGreaterThan(
      shapeOf(after, 'patient').rect.x + shapeOf(after, 'patient').rect.width,
    );
  });

  it('moves nothing whose position was stored, when asked to place new shapes', async () => {
    const key = shapeOf(buildScene(sample, VIEW), 'whatsapp').key;
    const { action } = await lay(sample, VIEW, { kind: 'new', keys: new Set([key]) });
    expect(action).toBeUndefined();
  });
});

/** A project with elements nested at random, related at random, in shapes kept, pinned or placed. */
const projects = fc
  .record({
    count: fc.integer({ min: 1, max: 10 }),
    seed: fc.array(fc.nat(1000), { minLength: 80, maxLength: 80 }),
  })
  .map(({ count, seed }) => {
    let next = 0;
    const pick = (n: number) => (seed[next++ % seed.length] as number) % n;
    const elements: Element[] = [];
    const relations: Relation[] = [];
    for (let at = 0; at < count; at++) {
      elements.push({
        id: `e${at}`,
        component: pick(3) === 0 ? 'systems.system' : 'systems.service',
        name: `E${at}`,
      });
      // Inside an earlier element, sometimes two, so that containment never cycles.
      const containers = at === 0 ? 0 : [0, 1, 1, 2][pick(4)];
      for (let each = 0; each < (containers ?? 0); each++) {
        const container = `e${pick(at)}`;
        if (relations.some((one) => one.from === `e${at}` && one.to === container)) continue;
        relations.push({
          id: `in-${at}-${each}`,
          relationType: 'systems.is-part-of',
          from: `e${at}`,
          to: container,
        });
      }
    }
    for (let each = 0; each < pick(count * 2 + 1); each++) {
      const from = pick(count);
      const to = pick(count);
      if (from !== to) {
        relations.push({
          id: `r${each}`,
          relationType: 'systems.communicates-with',
          from: `e${from}`,
          to: `e${to}`,
        });
      }
    }
    const view: ViewFile = {
      id: 'v',
      name: 'V',
      perspective: { name: 'Random' },
      nestingRelationTypes: ['systems.is-part-of'],
      positions: [],
      freeShapes:
        pick(2) === 0
          ? []
          : [
              {
                kind: 'note',
                id: 'n',
                x: pick(600),
                y: pick(600),
                width: 200,
                height: 80,
                text: 'Note',
              },
            ],
    };
    const bare: ProjectSnapshot = {
      project: { schemaVersion: 1, name: 'Random', packages: ['systems'] },
      model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
      packages: [SYSTEMS],
      views: [view],
      scenarios: [],
      tours: [],
      comments: [],
    };
    const positions = new Map<string, ShapePosition>();
    for (const shape of buildScene(bare, 'v').shapes) {
      const status = pick(3);
      if (status === 0) continue;
      const position: ShapePosition = {
        element: shape.element,
        ...(shape.container === undefined ? {} : { container: shape.container }),
        x: pick(1200) - 200,
        y: pick(900) - 100,
        ...(status === 2 ? { pinned: true } : {}),
      };
      positions.set(positionKey(position), position);
    }
    return { ...bare, views: [{ ...view, positions: [...positions.values()] }] };
  });

/**
 * The counterexample fast-check found on 2026-10-30 (seed -1300337465), shrunk: e3 has a copy in e0
 * and one in e1, inside e0, and its content e5 relates to e2. The copy in e0 is left out of the one
 * pass, and was packed at the size it had before e5 was placed, so a second Layout, finding it grown,
 * packed it otherwise (ADR 0080's clarification of Stage 3).
 */
function copiedContainer(): ProjectSnapshot {
  const elements: Element[] = Array.from({ length: 7 }, (_, at) => ({
    id: `e${at}`,
    component: 'systems.system',
    name: `E${at}`,
  }));
  const inside = (from: string, to: string): Relation => ({
    id: `in-${from}-${to}`,
    relationType: 'systems.is-part-of',
    from,
    to,
  });
  return {
    project: { schemaVersion: 1, name: 'Random', packages: ['systems'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements,
      relations: [
        inside('e1', 'e0'),
        inside('e2', 'e0'),
        inside('e3', 'e0'),
        inside('e3', 'e1'),
        inside('e4', 'e0'),
        inside('e5', 'e3'),
        { id: 'r1', relationType: 'systems.communicates-with', from: 'e5', to: 'e2' },
      ],
    },
    packages: [SYSTEMS],
    views: [
      {
        id: 'v',
        name: 'V',
        perspective: { name: 'Random' },
        nestingRelationTypes: ['systems.is-part-of'],
        positions: [{ element: 'e5', container: 'e3', x: -200, y: -100 }],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

describe('layout of random views', () => {
  it('keeps pinned shapes, covers nothing, stays on the step, and changes nothing when done again', async () => {
    await fc.assert(
      fc.asyncProperty(projects, async (project) => {
        const notes = viewOf(project, 'v')
          .freeShapes.filter((shape): shape is Note => shape.kind === 'note')
          .map((note) => ({ x: note.x, y: note.y, width: note.width, height: note.height }));
        const once = await lay(project, 'v', { kind: 'view' });
        const pinned = (each: ProjectSnapshot) =>
          viewOf(each, 'v').positions.filter((position) => position.pinned);
        expect(pinned(once.project)).toEqual(pinned(project));
        expectLaidOut(once.after, once.action, notes);
        const twice = await lay(once.project, 'v', { kind: 'view' });
        expect(twice.action).toBeUndefined();
      }),
      { numRuns: 15, examples: [[copiedContainer()]] },
    );
  }, 120_000);

  it('places every shape without a position, and moves no other but aside, right or down', async () => {
    await fc.assert(
      fc.asyncProperty(projects, async (project) => {
        const scene = buildScene(project, 'v');
        const keys = new Set(scene.shapes.map((shape) => shape.key));
        const {
          project: after,
          after: drawn,
          action,
        } = await lay(project, 'v', { kind: 'new', keys });
        const now = new Map(viewOf(after, 'v').positions.map((each) => [positionKey(each), each]));
        for (const position of viewOf(project, 'v').positions) {
          const kept = now.get(positionKey(position));
          // A pinned shape never moves; an unpinned one only moves aside for a container that grew,
          // right or down, keeping its size (ADR 0015's clarification of W48).
          if (position.pinned) expect(kept).toEqual(position);
          else {
            expect(kept?.x).toBeGreaterThanOrEqual(position.x);
            expect(kept?.y).toBeGreaterThanOrEqual(position.y);
            expect({ ...kept, x: position.x, y: position.y }).toEqual(position);
          }
        }
        expect(drawn.shapes.every((shape) => shape.positioned !== 'placed')).toBe(true);
        // What layout placed, as against what it moved aside, is laid out as any layout is.
        const placed = new Set(
          scene.shapes.filter((shape) => shape.positioned === 'placed').map((shape) => shape.key),
        );
        expectLaidOut(
          drawn,
          action && { ...action, keys: new Set([...action.keys].filter((key) => placed.has(key))) },
          scene.notes.map((note) => note.rect),
        );
      }),
      { numRuns: 15 },
    );
  }, 120_000);
});
