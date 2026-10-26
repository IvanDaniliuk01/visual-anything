import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { ShapePosition } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { untranslatedParts } from '../i18n/translate';
import { loadSample } from '../test/sample';
import { usersAndOrders, VIEW as TABLES } from '../test/tables';
import type { Rect } from './geometry';
import { indexScene } from './hit';
import {
  MIN_SIDE,
  handlePoint,
  handlesFor,
  holdsOf,
  keepsProportions,
  resizeCommand,
  resizeNoteCommand,
  resizedRect,
  sizeTakenBy,
  type HandleName,
} from './resize';
import { buildScene, type ElementShape } from './scene';

const START = { x: 100, y: 100, width: 160, height: 80 };
const VIEW = 'system-overview';

describe('resizing a rectangle', () => {
  it('moves only the sides a handle holds', () => {
    expect(resizedRect(START, 'e', { x: 40, y: 13 })).toEqual({ ...START, width: 200 });
    expect(resizedRect(START, 'w', { x: 40, y: 13 })).toEqual({ ...START, x: 140, width: 120 });
    expect(resizedRect(START, 's', { x: 40, y: 20 })).toEqual({ ...START, height: 100 });
    expect(resizedRect(START, 'n', { x: 40, y: 20 })).toEqual({ ...START, y: 120, height: 60 });
    expect(resizedRect(START, 'se', { x: 40, y: 20 })).toEqual({
      ...START,
      width: 200,
      height: 100,
    });
    expect(resizedRect(START, 'nw', { x: -20, y: -10 })).toEqual({
      x: 80,
      y: 90,
      width: 180,
      height: 90,
    });
  });

  it('keeps its proportions when asked, from a corner and from a side', () => {
    expect(resizedRect(START, 'se', { x: 80, y: 0 }, { proportional: true })).toEqual({
      ...START,
      width: 240,
      height: 120,
    });
    // From a side, the other axis grows around its middle.
    expect(resizedRect(START, 'e', { x: 80, y: 0 }, { proportional: true })).toEqual({
      x: 100,
      y: 80,
      width: 240,
      height: 120,
    });
  });

  it('resizes from its middle when asked', () => {
    expect(resizedRect(START, 'e', { x: 20, y: 0 }, { fromMiddle: true })).toEqual({
      ...START,
      x: 80,
      width: 200,
    });
    expect(resizedRect(START, 'nw', { x: 10, y: 10 }, { fromMiddle: true })).toEqual({
      x: 110,
      y: 110,
      width: 140,
      height: 60,
    });
  });

  it('never goes below 16 units a side, nor flips over', () => {
    expect(resizedRect(START, 'e', { x: -500, y: 0 })).toEqual({ ...START, width: MIN_SIDE });
    expect(resizedRect(START, 'w', { x: 500, y: 0 })).toEqual({
      ...START,
      x: 260 - MIN_SIDE,
      width: MIN_SIDE,
    });
  });

  it('never cuts what it holds', () => {
    const holds = { x: 120, y: 130, width: 100, height: 30 };
    expect(resizedRect(START, 'e', { x: -500, y: 0 }, { holds })).toEqual({
      ...START,
      width: 120,
    });
    expect(resizedRect(START, 'nw', { x: 500, y: 500 }, { holds })).toEqual({
      x: 120,
      y: 130,
      width: 140,
      height: 50,
    });
    expect(resizedRect(START, 'e', { x: -500, y: 0 }, { holds, fromMiddle: true })).toEqual({
      x: 120,
      y: 100,
      width: 120,
      height: 80,
    });
  });

  it('puts the sides it moves where the snapping says', () => {
    const grid = (value: number) => Math.round(value / 8) * 8;
    // 297 lands on 296.
    expect(resizedRect(START, 'e', { x: 37, y: 0 }, { snap: { x: grid } })).toEqual({
      ...START,
      width: 196,
    });
    expect(resizedRect(START, 'sw', { x: -13, y: 5 }, { snap: { x: grid, y: grid } })).toEqual({
      x: 88,
      y: 100,
      width: 172,
      height: 84,
    });
  });

  const handle = fc.constantFrom<HandleName>('nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w');
  const start = fc.record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -1000, max: 1000 }),
    width: fc.integer({ min: MIN_SIDE, max: 800 }),
    height: fc.integer({ min: MIN_SIDE, max: 800 }),
  });
  const delta = fc.record({
    x: fc.integer({ min: -1200, max: 1200 }),
    y: fc.integer({ min: -1200, max: 1200 }),
  });

  it('keeps every side at 16 units or more, in whole units, and what it holds inside', () => {
    fc.assert(
      fc.property(
        start,
        handle,
        delta,
        fc.boolean(),
        fc.boolean(),
        fc.option(
          fc.record({
            dx: fc.integer({ min: 0, max: 100 }),
            dy: fc.integer({ min: 0, max: 100 }),
            width: fc.integer({ min: 0, max: 100 }),
            height: fc.integer({ min: 0, max: 100 }),
          }),
          { nil: undefined },
        ),
        (rect, name, by, proportional, fromMiddle, inner) => {
          // What it holds lies inside it, as contents do.
          const holds =
            inner &&
            ({
              x: rect.x + Math.min(inner.dx, rect.width),
              y: rect.y + Math.min(inner.dy, rect.height),
              width: Math.min(inner.width, rect.width - Math.min(inner.dx, rect.width)),
              height: Math.min(inner.height, rect.height - Math.min(inner.dy, rect.height)),
            } satisfies Rect);
          const result = resizedRect(rect, name, by, {
            proportional,
            fromMiddle,
            ...(holds ? { holds } : {}),
          });
          expect(result.width).toBeGreaterThanOrEqual(MIN_SIDE);
          expect(result.height).toBeGreaterThanOrEqual(MIN_SIDE);
          for (const value of [result.x, result.y, result.width, result.height]) {
            expect(Number.isInteger(value)).toBe(true);
          }
          if (holds) {
            expect(result.x).toBeLessThanOrEqual(holds.x);
            expect(result.y).toBeLessThanOrEqual(holds.y);
            expect(result.x + result.width).toBeGreaterThanOrEqual(holds.x + holds.width);
            expect(result.y + result.height).toBeGreaterThanOrEqual(holds.y + holds.height);
          }
        },
      ),
    );
  });

  it('keeps the opposite sides where they were, and the proportions when asked', () => {
    fc.assert(
      fc.property(start, handle, delta, (rect, name, by) => {
        const free = resizedRect(rect, name, by);
        if (name.includes('e')) expect(free.x).toBe(rect.x);
        if (name.includes('w')) expect(free.x + free.width).toBe(rect.x + rect.width);
        if (name.includes('s')) expect(free.y).toBe(rect.y);
        if (name.includes('n')) expect(free.y + free.height).toBe(rect.y + rect.height);
        if (name === 'e' || name === 'w')
          expect([free.y, free.height]).toEqual([rect.y, rect.height]);
        if (name === 'n' || name === 's')
          expect([free.x, free.width]).toEqual([rect.x, rect.width]);
        const kept = resizedRect(rect, name, by, { proportional: true });
        // Within the two units each side may be rounded out by, its two sides each by one.
        const ratio = rect.width / rect.height;
        expect(Math.abs(kept.width / kept.height - ratio)).toBeLessThanOrEqual(
          (2 + 2 * ratio) / (kept.height - 2) + 1e-9,
        );
      }),
    );
  });
});

describe('the handles', () => {
  it('are eight around a shape, or the two on its sides for a width alone', () => {
    expect(handlesFor('both')).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    expect(handlesFor('width')).toEqual(['e', 'w']);
    expect(handlePoint(START, 'nw')).toEqual({ x: 100, y: 100 });
    expect(handlePoint(START, 'e')).toEqual({ x: 260, y: 140 });
    expect(handlePoint(START, 's')).toEqual({ x: 180, y: 180 });
  });
});

const sample = loadSample();
const indexed = indexScene(buildScene(sample, VIEW));
const shape = (key: string): ElementShape => {
  const found = indexed.byKey.get(key);
  if (!found) throw new Error(key);
  return found;
};

function after(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function positionsOf(command: Command | undefined): ShapePosition[] {
  if (command?.type === 'set-positions') return command.positions;
  if (command?.type === 'batch') return command.commands.flatMap(positionsOf);
  return [];
}

describe('which shapes take a size', () => {
  it('a shape of its own does, a table only its width, and a row, a collapsed container and an anchored part none', () => {
    expect(sizeTakenBy(shape('patient'))).toBe('both');
    expect(sizeTakenBy(shape('clinic-booking'))).toBe('both');
    const tables = indexScene(buildScene(usersAndOrders(), TABLES));
    const table = tables.byElement.get('users')?.[0];
    const row = tables.byElement.get('users-email')?.[0];
    expect(table && sizeTakenBy(table)).toBe('width');
    expect(row && sizeTakenBy(row)).toBeUndefined();
    expect(
      sizeTakenBy({ ...shape('clinic-booking/scheduling'), collapsed: { contents: 3 } }),
    ).toBeUndefined();
    expect(
      sizeTakenBy({
        ...shape('patient'),
        part: { image: 'heart', part: 'aorta', color: '#AA0000', inDrawing: true },
      }),
    ).toBeUndefined();
    // An overlay draws it at another size than it is stored at (ADR 0055).
    expect(sizeTakenBy({ ...shape('patient'), laidOut: shape('patient').rect })).toBeUndefined();
  });

  it('keeps the proportions of free geometry that keeps them', () => {
    expect(keepsProportions(shape('patient'))).toBe(false);
  });

  it('holds no less than the box around what it holds, rows and anchored parts aside', () => {
    const holds = holdsOf(indexed, shape('clinic-booking'));
    const contents = indexed.contentsOf.get('clinic-booking') ?? [];
    expect(holds).toEqual({
      x: Math.min(...contents.map((each) => each.extent.x)),
      y: Math.min(...contents.map((each) => each.extent.y)),
      width:
        Math.max(...contents.map((each) => each.extent.x + each.extent.width)) -
        Math.min(...contents.map((each) => each.extent.x)),
      height:
        Math.max(...contents.map((each) => each.extent.y + each.extent.height)) -
        Math.min(...contents.map((each) => each.extent.y)),
    });
    expect(holdsOf(indexed, shape('patient'))).toBeUndefined();
  });
});

describe('the command a resize sends', () => {
  it('stores the size and place, pinned, as one action named after the shape', () => {
    const patient = shape('patient');
    const command = resizeCommand(indexed, sample, VIEW, patient, {
      ...patient.rect,
      x: patient.rect.x - 24,
      width: patient.rect.width + 24,
    });
    expect(command).toMatchObject({ type: 'batch', label: 'Resize "Patient"' });
    expect(positionsOf(command)).toEqual([
      {
        element: 'patient',
        x: patient.offset.x - 24,
        y: patient.offset.y,
        width: patient.rect.width + 24,
        pinned: true,
      },
    ]);
    const drawn = buildScene(after(sample, command!), VIEW).shapes.find(
      (each) => each.key === 'patient',
    );
    expect(drawn?.rect).toEqual({
      ...patient.rect,
      x: patient.rect.x - 24,
      width: patient.rect.width + 24,
    });
  });

  it('sends nothing when the size and place stay', () => {
    expect(resizeCommand(indexed, sample, VIEW, shape('patient'), shape('patient').rect)).toBe(
      undefined,
    );
  });

  it('keeps what a container holds in its place on the canvas when its top left corner moves', () => {
    const clinic = shape('clinic-booking');
    const command = resizeCommand(indexed, sample, VIEW, clinic, {
      x: clinic.rect.x - 40,
      y: clinic.rect.y - 16,
      width: clinic.rect.width + 40,
      height: clinic.rect.height + 16,
    });
    const state = after(sample, command!);
    const before = buildScene(sample, VIEW);
    const now = buildScene(state, VIEW);
    for (const key of ['clinic-booking/whatsapp', 'clinic-booking/scheduling/appointments-db']) {
      expect(now.shapes.find((each) => each.key === key)?.rect).toEqual(
        before.shapes.find((each) => each.key === key)?.rect,
      );
    }
    expect(now.shapes.find((each) => each.key === 'clinic-booking')?.rect).toMatchObject({
      x: clinic.rect.x - 40,
      y: clinic.rect.y - 16,
    });
    // What sat where the stand-in row put it, unpinned, stays unpinned where it was drawn.
    const whatsapp = positionsOf(command).find((each) => each.element === 'whatsapp');
    expect(whatsapp).not.toHaveProperty('pinned');
  });

  it('keeps the bend points kept relative to a container where they are on the canvas', () => {
    const routed = after(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'whatsapp-to-agent',
      bendPoints: [{ x: 220, y: 300 }],
      container: 'clinic-booking',
    });
    const lineOf = (project: ProjectSnapshot) =>
      buildScene(project, VIEW).relations.find((each) => each.relation === 'whatsapp-to-agent');
    const before = lineOf(routed)?.hand?.bendPoints;
    expect(before).toHaveLength(1);
    const index = indexScene(buildScene(routed, VIEW));
    const clinic = index.byKey.get('clinic-booking')!;
    const command = resizeCommand(index, routed, VIEW, clinic, {
      ...clinic.rect,
      x: clinic.rect.x - 64,
      width: clinic.rect.width + 64,
    });
    expect(lineOf(after(routed, command!))?.hand?.bendPoints).toEqual(before);
  });

  it('resizes a table’s width only', () => {
    const project = usersAndOrders();
    const tables = indexScene(buildScene(project, TABLES));
    const table = tables.byElement.get('users')![0]!;
    const command = resizeCommand(tables, project, TABLES, table, {
      ...table.rect,
      width: table.rect.width + 80,
      height: table.rect.height + 80,
    });
    const [stored] = positionsOf(command);
    expect(stored).toMatchObject({ element: 'users', width: table.rect.width + 80 });
    expect(stored).not.toHaveProperty('height');
  });

  it('resizes a note as one action', () => {
    const view = {
      ...sample.views.find((each) => each.id === VIEW)!,
      freeShapes: [
        { kind: 'note' as const, id: 'n', x: 0, y: 0, width: 224, height: 88, text: 'Hi' },
      ],
    };
    const command = resizeNoteCommand(view, 'n', { x: -8, y: 0, width: 232, height: 96 });
    expect(command).toEqual({
      type: 'batch',
      label: 'Resize a note',
      commands: [
        {
          type: 'update-free-shape',
          view: VIEW,
          shape: { kind: 'note', id: 'n', x: -8, y: 0, width: 232, height: 96, text: 'Hi' },
        },
      ],
    });
    expect(resizeNoteCommand(view, 'n', { x: 0, y: 0, width: 224, height: 88 })).toBeUndefined();
  });

  it('is named in Spanish through its template', () => {
    expect(untranslatedParts('es', 'Resize "Patient"')).toEqual([]);
    expect(untranslatedParts('es', 'Resize a note')).toEqual([]);
  });
});

describe('resizing the heart of the beyond-boxes sample', () => {
  const beyond = loadSample('beyond-boxes');
  const scene = buildScene(beyond, 'heart');
  const heart = scene.shapes.find((each) => each.key === 'heart')!;
  const parts = scene.shapes.filter((each) => each.part?.inDrawing === true);

  it('scales its picture and its anchored parts with the size it stores', () => {
    expect(heart.picture).toBeDefined();
    expect(sizeTakenBy(heart)).toBe('both');
    // Anchored parts have no size of their own, and take no part in what it must hold.
    expect(parts.every((each) => sizeTakenBy(each) === undefined)).toBe(true);
    const index = indexScene(scene);
    const command = resizeCommand(index, beyond, 'heart', heart, {
      ...heart.rect,
      width: Math.round(heart.rect.width * 1.5),
      height: Math.round(heart.rect.height * 1.5),
    });
    const stored = positionsOf(command).find((each) => each.element === 'heart');
    expect(stored).toMatchObject({ width: Math.round(heart.rect.width * 1.5), pinned: true });
    const now = buildScene(after(beyond, command!), 'heart');
    const grown = now.shapes.find((each) => each.key === 'heart')!;
    expect(grown.picture!.scale).toBeGreaterThan(heart.picture!.scale * 1.3);
    const [first] = parts;
    const moved = now.shapes.find((each) => each.key === first!.key)!;
    expect(moved.rect.width).toBeGreaterThan(first!.rect.width * 1.3);
  });

  it('cannot be smaller than what it holds below its picture', () => {
    const index = indexScene(scene);
    const holds = holdsOf(index, heart);
    const others = (index.contentsOf.get('heart') ?? []).filter(
      (each) => each.part?.inDrawing !== true,
    );
    expect(others.length).toBeGreaterThan(0);
    expect(holds).toBeDefined();
    const shrunk = resizedRect(heart.rect, 'se', { x: -5000, y: -5000 }, { holds: holds! });
    for (const other of others) {
      expect(shrunk.y + shrunk.height).toBeGreaterThanOrEqual(other.extent.y + other.extent.height);
    }
  });
});
