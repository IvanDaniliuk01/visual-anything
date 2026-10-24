import type { ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import type { Rect } from './geometry';
import {
  enclosedBy,
  hitAt,
  indexScene,
  outlying,
  overlapWithContents,
  shapesAt,
  type IndexedScene,
} from './hit';
import { buildScene, type ElementShape, type Scene } from './scene';
import { SpatialIndex, overlaps, rectBetween } from './spatial';

const sample = loadSample();
const indexed = indexScene(buildScene(sample, 'system-overview'));

/** An element shape drawn as a plain rectangle; its key says which shapes it sits in. */
function shapeAt(key: string, rect: Rect, extent: Rect = rect): ElementShape {
  const parts = key.split('/');
  const element = parts.at(-1) as string;
  return {
    key,
    element,
    ...(parts.length > 1
      ? { container: parts.at(-2), containerShape: parts.slice(0, -1).join('/') }
      : {}),
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: element,
    componentName: 'Box',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent,
    holdsContents: false,
  };
}

function sceneOf(shapes: ElementShape[], drawing?: number[]): Scene {
  return {
    shapes,
    ...(drawing ? { drawing } : {}),
    relations: [],
    notes: [],
    arrows: [],
    bounds: undefined,
  };
}

function bandsOf(scene: IndexedScene): Record<string, number> {
  return Object.fromEntries(
    scene.scene.shapes.map((shape, at) => [shape.key, scene.bands[at] as number]),
  );
}

/** The sample with an element "Calendar" added directly in World, over Scheduling and the API. */
function withCalendar(stackingOrder?: ViewFile['stackingOrder']): IndexedScene {
  const project: ProjectSnapshot = {
    ...sample,
    model: {
      ...sample.model,
      elements: [
        ...sample.model.elements,
        { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
      ],
    },
    views: sample.views.map((view) => ({
      ...view,
      positions: [
        ...view.positions,
        { element: 'calendar', x: 800, y: 260, width: 180, height: 300 },
      ],
      ...(stackingOrder ? { stackingOrder } : {}),
    })),
  };
  return indexScene(buildScene(project, 'system-overview'));
}

const keyAt = (
  scene: IndexedScene,
  x: number,
  y: number,
  exact?: (shape: ElementShape) => boolean,
) => {
  const hit = hitAt(scene, { x, y }, 4, exact);
  return hit?.kind === 'shape' ? hit.shape.key : hit?.kind;
};

describe('hitAt', () => {
  it('finds the shape drawn on top under a point', () => {
    // The Appointments API sits at (780, 204), 180 × 72, inside Scheduling inside Clinic booking.
    expect(hitAt(indexed, { x: 800, y: 220 }, 4)).toMatchObject({
      kind: 'shape',
      shape: { key: 'clinic-booking/scheduling/appointments-api' },
    });
    expect(hitAt(indexed, { x: 760, y: 120 }, 4)).toMatchObject({
      kind: 'shape',
      shape: { key: 'clinic-booking/scheduling' },
    });
  });

  it('finds a relation near its route before the shapes under it', () => {
    const line = indexed.scene.relations.find((each) => each.relation === 'patient-to-whatsapp');
    const point = line!.middle;
    expect(hitAt(indexed, { x: point.x, y: point.y + 3 }, 4)).toMatchObject({
      kind: 'relation',
      line: { relation: 'patient-to-whatsapp' },
    });
  });

  it('finds notes, and nothing on empty canvas', () => {
    expect(hitAt(indexed, { x: 250, y: 570 }, 4)).toMatchObject({
      kind: 'note',
      note: { id: 'calendar-note' },
    });
    expect(hitAt(indexed, { x: -500, y: -500 }, 4)).toBeUndefined();
  });

  it('finds a shape added directly in World over others, where it is drawn on top of them', () => {
    const scene = withCalendar();
    expect(bandsOf(scene).calendar).toBe(3);
    expect(keyAt(scene, 870, 300)).toBe('calendar');
    expect(keyAt(scene, 870, 540)).toBe('calendar');
  });

  it('finds a shape sent to the back only where nothing covers it', () => {
    const scene = withCalendar({ world: ['calendar'] });
    expect(bandsOf(scene).calendar).toBe(0);
    expect(keyAt(scene, 870, 300)).toBe('clinic-booking/scheduling');
    expect(keyAt(scene, 870, 266)).toBe('clinic-booking/scheduling/appointments-api');
    expect(keyAt(scene, 870, 540)).toBe('calendar');
  });

  it('goes through a cylinder’s corner to the shape behind it, unless it counts by its rectangle', () => {
    const scene = withCalendar();
    expect(keyAt(scene, 802, 262)).toBe('clinic-booking/scheduling/appointments-api');
    expect(keyAt(scene, 802, 262, (shape) => shape.element !== 'calendar')).toBe('calendar');
  });
});

describe('shapesAt', () => {
  it('lists the element shapes under a point, the one drawn on top first', () => {
    const scene = withCalendar();
    expect(shapesAt(scene, { x: 870, y: 270 }).map((shape) => shape.key)).toEqual([
      'calendar',
      'clinic-booking/scheduling/appointments-api',
      'clinic-booking/scheduling',
      'clinic-booking',
    ]);
    expect(shapesAt(indexed, { x: 250, y: 570 })).toEqual([]);
  });
});

describe('bands', () => {
  it('puts each shape one band above the shapes drawn before it that it overlaps', () => {
    expect(
      indexed.scene.shapes.map((shape) => indexed.bands[indexed.indexOfKey.get(shape.key)!]),
    ).toEqual([0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('keeps shapes that only touch in one band', () => {
    const shapes: ElementShape[] = [];
    for (let column = 0; column < 10; column++) {
      for (let row = 0; row < 10; row++) {
        shapes.push(
          shapeAt(`s${column}-${row}`, { x: column * 100, y: row * 50, width: 100, height: 50 }),
        );
      }
    }
    const grid = indexScene(sceneOf(shapes));
    expect(new Set(grid.bands)).toEqual(new Set([0]));
  });

  it('orders every overlapping pair, and keeps each band as low as it can be', () => {
    const rect = fc.record({
      x: fc.integer({ min: -300, max: 300 }),
      y: fc.integer({ min: -300, max: 300 }),
      width: fc.integer({ min: 0, max: 200 }),
      height: fc.integer({ min: 0, max: 200 }),
    });
    const scenes = fc.array(rect, { maxLength: 40 }).chain((rects) =>
      fc.tuple(
        fc.constant(rects),
        fc.shuffledSubarray(
          rects.map((_, at) => at),
          { minLength: rects.length, maxLength: rects.length },
        ),
      ),
    );
    fc.assert(
      fc.property(scenes, ([rects, drawing]) => {
        const scene = indexScene(
          sceneOf(
            rects.map((each, at) => shapeAt(`s${at}`, each)),
            drawing,
          ),
        );
        drawing.forEach((later, rank) => {
          expect(scene.rankOf[later]).toBe(rank);
          let expected = 0;
          for (const earlier of drawing.slice(0, rank)) {
            if (!overlaps(rects[earlier] as Rect, rects[later] as Rect)) continue;
            expect(scene.bands[earlier]).toBeLessThan(scene.bands[later] as number);
            expected = Math.max(expected, (scene.bands[earlier] as number) + 1);
          }
          expect(scene.bands[later]).toBe(expected);
        });
      }),
    );
  });
});

describe('indexScene', () => {
  it('gives the same index for the same scene, and shares what a new drawing order leaves alike', () => {
    const scene = buildScene(sample, 'system-overview');
    expect(indexScene(scene)).toBe(indexScene(scene));
    const restacked = indexScene({ ...scene, drawing: [1, 2, 3, 4, 5, 6, 7, 0] });
    const again = indexScene(scene);
    expect(restacked.relations).toBe(again.relations);
    expect(restacked.byKey).toBe(again.byKey);
    expect(restacked.contentsIndex('')).toBe(again.contentsIndex(''));
    expect(restacked.shapes).not.toBe(again.shapes);
    expect(restacked.rankOf[0]).toBe(7);
  });

  it('finds a relation only along its route, not across the rectangle around it', () => {
    const scene = indexScene({
      ...sceneOf([]),
      relations: [
        {
          relation: 'bent',
          route: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
          ],
          from: { x: 0, y: 0 },
          to: { x: 1000, y: 1000 },
          middle: { x: 1000, y: 0 },
          stroke: '#000000',
          width: 2,
          dash: 'solid',
        },
      ],
    });
    expect(scene.relations.at({ x: 500, y: 0 })).toEqual([0]);
    expect(scene.relations.at({ x: 1000, y: 700 })).toEqual([0]);
    expect(scene.relations.at({ x: 200, y: 800 })).toEqual([]);
  });

  it('lists the shapes that sit directly in each container shape, and indexes them by their extents', () => {
    expect(indexed.contentsOf.get('')?.map((shape) => shape.key)).toEqual([
      'patient',
      'clinic-booking',
    ]);
    expect(indexed.contentsOf.get('clinic-booking')?.map((shape) => shape.element)).toEqual([
      'whatsapp',
      'booking-agent',
      'scheduling',
    ]);
    const inside = indexed.contentsIndex('clinic-booking');
    expect(
      inside.query({ x: 0, y: 0, width: 2000, height: 2000 }).map((shape) => shape.element),
    ).toEqual(['whatsapp', 'booking-agent', 'scheduling']);
    expect(indexed.contentsIndex('clinic-booking')).toBe(inside);
    expect(
      indexed.contentsIndex('patient').query({ x: 0, y: 0, width: 2000, height: 2000 }),
    ).toEqual([]);
  });
});

describe('outlying and overlapWithContents', () => {
  // A container at (0, 0) holding a content at (-300, -200), and a shape in World in the corner
  // between them, which overlaps neither.
  const container = shapeAt(
    'S',
    { x: 0, y: 0, width: 400, height: 300 },
    { x: -300, y: -200, width: 700, height: 500 },
  );
  const content = shapeAt('S/c', { x: -300, y: -200, width: 180, height: 80 });
  const beside = shapeAt('Y', { x: -250, y: 100, width: 180, height: 80 });
  const corner = indexScene(sceneOf([container, content, beside]));

  it('finds what sticks out of a shape, and nothing for shapes that hold all they contain', () => {
    expect(outlying(corner, container)).toEqual([content]);
    expect(outlying(corner, beside)).toEqual([]);
    for (const shape of indexed.scene.shapes) expect(outlying(indexed, shape)).toEqual([]);
  });

  it('tells overlaps through what sticks out apart from the rectangle around it all', () => {
    expect(overlapWithContents(corner, container, beside)).toBe(false);
    expect(overlapWithContents(corner, beside, container)).toBe(false);
    const under = shapeAt('Z', { x: -200, y: -150, width: 50, height: 50 });
    const covered = indexScene(sceneOf([container, content, under]));
    expect(overlapWithContents(covered, container, under)).toBe(true);
    const clinic = indexed.byKey.get('clinic-booking')!;
    const patient = indexed.byKey.get('patient')!;
    expect(overlapWithContents(indexed, clinic, patient)).toBe(false);
    expect(
      overlapWithContents(indexed, clinic, indexed.byKey.get('clinic-booking/scheduling')!),
    ).toBe(true);
  });
});

describe('enclosedBy', () => {
  it('finds only what a box holds entirely', () => {
    const { shapes, notes } = enclosedBy(
      indexed,
      rectBetween({ x: 730, y: 90 }, { x: 1190, y: 490 }),
    );
    expect(shapes.map((shape) => shape.element)).toEqual([
      'scheduling',
      'appointments-api',
      'appointments-db',
      'reminder-service',
    ]);
    expect(notes).toEqual([]);
  });
});

describe('SpatialIndex', () => {
  it('finds each item once, in the order added, even across many cells', () => {
    const index = new SpatialIndex<string>(10);
    index.insert('big', { x: 0, y: 0, width: 100, height: 100 });
    index.insert('small', { x: 5, y: 5, width: 2, height: 2 });
    expect(index.query({ x: 0, y: 0, width: 50, height: 50 })).toEqual(['big', 'small']);
    expect(index.at({ x: 90, y: 90 })).toEqual(['big']);
    expect(index.at({ x: 200, y: 200 })).toEqual([]);
  });

  it('finds the highest score among the items that overlap a rectangle', () => {
    const rect = fc.record({
      x: fc.integer({ min: -2000, max: 2000 }),
      y: fc.integer({ min: -2000, max: 2000 }),
      width: fc.integer({ min: 0, max: 900 }),
      height: fc.integer({ min: 0, max: 900 }),
    });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(rect, fc.integer({ min: 0, max: 50 })), { maxLength: 30 }),
        rect,
        (items, probe) => {
          const index = new SpatialIndex<number>();
          items.forEach(([each], at) => index.insert(at, each));
          const scores = items.map(([, score]) => score);
          const expected = Math.max(
            -1,
            ...index
              .query(probe)
              .filter((at) => overlaps((items[at] as [Rect, number])[0], probe))
              .map((at) => scores[at] as number),
          );
          expect(index.highest(probe, (at) => scores[at] as number)).toBe(expected);
        },
      ),
    );
  });
});
