import type { ProjectSnapshot } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { centerOf, distance, type Rect } from './geometry';
import { indexScene, type IndexedScene } from './hit';
import {
  containerOf,
  directionScore,
  drawnRelations,
  farEnd,
  firstInside,
  nearestInDirection,
  nearestTo,
  rectOf,
  stepRelation,
  type Direction,
  type Reachable,
} from './navigation';
import { buildScene, type ElementShape } from './scene';

const sample = loadSample();
const indexed = indexScene(buildScene(sample, 'system-overview'));

function shape(key: string, within: IndexedScene = indexed): ElementShape {
  const found = within.byKey.get(key);
  if (!found) throw new Error(`The scene has no shape ${key}.`);
  return found;
}

const PATIENT = 'patient';
const CLINIC = 'clinic-booking';
const WHATSAPP = 'clinic-booking/whatsapp';
const AGENT = 'clinic-booking/booking-agent';
const SCHEDULING = 'clinic-booking/scheduling';
const API = 'clinic-booking/scheduling/appointments-api';
const DB = 'clinic-booking/scheduling/appointments-db';
const REMINDERS = 'clinic-booking/scheduling/reminder-service';

/** Where a press of an arrow key goes from the shape with this key: a shape's key, or a note's id. */
function from(key: string, direction: Direction): string | undefined {
  const start = shape(key);
  return nameOf(nearestInDirection(indexed, { rect: start.rect, shape: start }, direction));
}

function nameOf(reached: Reachable | undefined): string | undefined {
  if (!reached) return undefined;
  return reached.kind === 'shape'
    ? reached.shape.key
    : reached.kind === 'note'
      ? reached.note.id
      : reached.arrow.id;
}

describe('nearestInDirection', () => {
  it('goes to the nearest shape in a row, entering the containers on the way', () => {
    expect(from(PATIENT, 'right')).toBe(WHATSAPP);
    expect(from(WHATSAPP, 'right')).toBe(AGENT);
    expect(from(AGENT, 'right')).toBe(API);
    expect(from(API, 'right')).toBe(REMINDERS);
    expect(from(REMINDERS, 'right')).toBeUndefined();
  });

  it('leaves the containers it starts in, which surround it rather than lie in a direction', () => {
    expect(from(API, 'left')).toBe(AGENT);
    expect(from(WHATSAPP, 'left')).toBe(PATIENT);
    expect(from(API, 'up')).toBeUndefined();
  });

  it('goes up and down between rows', () => {
    expect(from(API, 'down')).toBe(DB);
    expect(from(DB, 'up')).toBe(API);
  });

  it('reaches free shapes too', () => {
    expect(from(DB, 'down')).toBe('calendar-note');
  });

  it('from a container, goes to the shapes around it, not to what it holds', () => {
    expect(from(CLINIC, 'left')).toBe(PATIENT);
    expect(from(CLINIC, 'right')).toBeUndefined();
  });

  it('starts from a point, such as the middle of a selected relation', () => {
    const middle = drawnRelations(indexed.scene, sample).line('agent-to-api')!.middle;
    const start = { rect: { ...middle, width: 0, height: 0 } };
    expect(nameOf(nearestInDirection(indexed, start, 'right'))).toBe(API);
    expect(nameOf(nearestInDirection(indexed, start, 'left'))).toBe(AGENT);
  });

  it('never goes to another shape of the same element, which the selection already holds', () => {
    // The Reminder service's second shape sits right of its first one, inside Clinic booking.
    const twice = withSecondContainer(sample, { x: 1000, y: 164 });
    const scene = indexScene(buildScene(twice, 'system-overview'));
    const inScheduling = shape(REMINDERS, scene);
    const inClinic = shape('clinic-booking/reminder-service', scene);
    expect(inClinic.rect.x).toBeGreaterThan(inScheduling.rect.x + inScheduling.rect.width);
    const start = { rect: inScheduling.rect, shape: inScheduling };
    expect(nearestInDirection(scene, start, 'right')).toBeUndefined();
  });
});

describe('directionScore', () => {
  const box = (x: number, y: number): Rect => ({ x, y, width: 100, height: 50 });

  it('counts the gap in the direction, and the offset across it twice', () => {
    expect(directionScore(box(0, 0), box(150, 0), 'right')).toBe(50);
    expect(directionScore(box(0, 0), box(150, 80), 'right')).toBe(50 + 2 * 30);
    expect(directionScore(box(0, 0), box(0, 70), 'down')).toBe(20);
  });

  it('takes only shapes whose middle lies beyond the middle of the start', () => {
    expect(directionScore(box(0, 0), box(-150, 0), 'right')).toBeUndefined();
    expect(directionScore(box(0, 0), box(40, 0), 'right')).toBe(0);
    expect(directionScore(box(0, 0), box(0, 0), 'left')).toBeUndefined();
  });
});

describe('nearestInDirection on 10,000 shapes', () => {
  const big = indexScene(buildScene(syntheticProject({ elements: 10_000 }), 'everything'));

  it('looks only at the shapes around where it starts', () => {
    let looked = 0;
    const query = big.shapes.query.bind(big.shapes);
    const counting = {
      ...big,
      shapes: Object.assign(Object.create(big.shapes) as typeof big.shapes, {
        query: (rect: Rect) => {
          const found = query(rect);
          looked += found.length;
          return found;
        },
      }),
    };
    const start = shape('system-200/element-200-12', big);
    const reached = nearestInDirection(counting, { rect: start.rect, shape: start }, 'right');
    expect(reached?.kind === 'shape' && reached.shape.key).toBe('system-200/element-200-13');
    expect(looked).toBeLessThan(200);
  });

  it('finds what a look at every shape finds', () => {
    const shapes = big.scene.shapes;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: shapes.length - 1 }),
        fc.constantFrom<Direction>('left', 'right', 'up', 'down'),
        (at, direction) => {
          const start = shapes[at] as ElementShape;
          const reached = nearestInDirection(big, { rect: start.rect, shape: start }, direction);
          expect(nameOf(reached)).toBe(nameOf(byLookingAtEverything(big, start, direction)));
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('nearestTo', () => {
  it('finds the innermost shape under a point', () => {
    expect(nameOf(nearestTo(indexed, centerOf(shape(AGENT).rect)))).toBe(AGENT);
    expect(nameOf(nearestTo(indexed, { x: 630, y: 336 }))).toBe(CLINIC);
    expect(nameOf(nearestTo(indexed, { x: 470, y: 600 }))).toBe('calendar-note');
  });

  it('finds the nearest shape to a point outside them all', () => {
    expect(nameOf(nearestTo(indexed, { x: -100, y: 240 }))).toBe(PATIENT);
    expect(nameOf(nearestTo(indexed, { x: 5000, y: 240 }))).toBe(CLINIC);
  });

  it('finds nothing in a view without shapes', () => {
    const empty = indexScene({
      shapes: [],
      relations: [],
      notes: [],
      arrows: [],
      bounds: undefined,
    });
    expect(nearestTo(empty, { x: 0, y: 0 })).toBeUndefined();
  });
});

describe('containerOf and firstInside', () => {
  it('finds the container a shape sits in, and none for a shape directly in World', () => {
    expect(containerOf(indexed, shape(API))?.key).toBe(SCHEDULING);
    expect(containerOf(indexed, shape(PATIENT))).toBeUndefined();
  });

  it('finds the shape nearest the top left of a container', () => {
    expect(firstInside(indexed, shape(CLINIC))?.key).toBe(WHATSAPP);
    expect(firstInside(indexed, shape(SCHEDULING))?.key).toBe(API);
    expect(firstInside(indexed, shape(PATIENT))).toBeUndefined();
  });
});

describe('drawnRelations', () => {
  const drawn = drawnRelations(indexed.scene, sample);
  const around = (element: string) => drawn.around(element).map((line) => line.relation);

  it('lists the relations drawn on an element clockwise from the top of its shape', () => {
    expect(around('booking-agent')).toEqual(['agent-to-api', 'whatsapp-to-agent']);
    expect(around('appointments-api')).toEqual([
      'api-to-reminders',
      'api-writes-db',
      'api-reads-db',
      'agent-to-api',
    ]);
    expect(around('patient')).toEqual(['patient-to-whatsapp']);
  });

  it('leaves out the nesting relations, which the view does not draw', () => {
    expect(around('clinic-booking')).toEqual([]);
    expect(drawn.line('api-in-scheduling')).toBeUndefined();
    expect(drawn.line('agent-to-api')?.label).toBe('HTTPS');
  });

  it('draws an element’s relations from its first shape', () => {
    const twice = withSecondContainer(sample);
    const scene = buildScene(twice, 'system-overview');
    const first = scene.shapes.find((each) => each.element === 'reminder-service');
    expect(drawnRelations(scene, twice).shapeOf('reminder-service')).toBe(first);
  });

  it('is worked out once for each scene', () => {
    expect(drawnRelations(indexed.scene, sample)).toBe(drawn);
  });
});

describe('stepRelation and farEnd', () => {
  const drawn = drawnRelations(indexed.scene, sample);
  const step = (element: string, current: string | undefined, by: 1 | -1) =>
    stepRelation(drawn, element, current, by)?.relation;

  it('steps forwards and backwards through an element’s relations, wrapping around', () => {
    expect(step('booking-agent', undefined, 1)).toBe('agent-to-api');
    expect(step('booking-agent', 'agent-to-api', 1)).toBe('whatsapp-to-agent');
    expect(step('booking-agent', 'whatsapp-to-agent', 1)).toBe('agent-to-api');
    expect(step('booking-agent', undefined, -1)).toBe('whatsapp-to-agent');
    expect(step('booking-agent', 'agent-to-api', -1)).toBe('whatsapp-to-agent');
  });

  it('starts again from the first relation when the current one is not the element’s', () => {
    expect(step('booking-agent', 'api-reads-db', 1)).toBe('agent-to-api');
  });

  it('finds no relation on an element without any', () => {
    expect(step('clinic-booking', undefined, 1)).toBeUndefined();
  });

  it('goes to the other end, or to the end the relation points to', () => {
    const relation = { from: 'whatsapp', to: 'booking-agent' };
    expect(farEnd(relation, 'booking-agent')).toBe('whatsapp');
    expect(farEnd(relation, 'whatsapp')).toBe('booking-agent');
    expect(farEnd(relation, undefined)).toBe('booking-agent');
  });
});

describe('rectOf', () => {
  it('gives an arrow the rectangle around its two ends', () => {
    expect(
      rectOf({
        kind: 'arrow',
        arrow: {
          id: 'arrow',
          from: { x: 10, y: 50 },
          to: { x: 0, y: 20 },
          arrowhead: { tip: { x: 0, y: 20 }, left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
        },
      }),
    ).toEqual({ x: 0, y: 20, width: 10, height: 30 });
  });
});

/**
 * The sample with the Reminder service inside Clinic booking too, so that it has two shapes; the
 * second one sits at `at` in Clinic booking when given.
 */
function withSecondContainer(
  project: ProjectSnapshot,
  at?: { x: number; y: number },
): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        {
          id: 'reminders-in-clinic',
          relationType: 'systems.is-part-of',
          from: 'reminder-service',
          to: 'clinic-booking',
        },
      ],
    },
    views: project.views.map((view) => ({
      ...view,
      positions: at
        ? [...view.positions, { element: 'reminder-service', container: 'clinic-booking', ...at }]
        : view.positions,
    })),
  };
}

/**
 * What `nearestInDirection` should find, by scoring every shape of the scene: the best one, then the
 * best inside it for as long as it is a container with shapes in that direction.
 */
function byLookingAtEverything(
  scene: IndexedScene,
  start: ElementShape,
  direction: Direction,
): Reachable | undefined {
  const related = (key: string) =>
    key.startsWith(`${start.key}/`) || start.key.startsWith(`${key}/`);
  const best = (candidates: Reachable[]): Reachable | undefined => {
    let found: { reachable: Reachable; score: number; distance: number } | undefined;
    for (const candidate of candidates) {
      const rect = rectOf(candidate);
      const score = directionScore(start.rect, rect, direction);
      if (score === undefined) continue;
      const apart = distance(centerOf(start.rect), centerOf(rect));
      if (!found || score < found.score || (score === found.score && apart < found.distance)) {
        found = { reachable: candidate, score, distance: apart };
      }
    }
    return found?.reachable;
  };
  const shapes = scene.scene.shapes.filter(
    (each) => each.element !== start.element && !related(each.key),
  );
  let reached = best([
    ...shapes.map((each): Reachable => ({ kind: 'shape', shape: each })),
    ...scene.scene.notes.map((note): Reachable => ({ kind: 'note', note })),
    ...scene.scene.arrows.map((arrow): Reachable => ({ kind: 'arrow', arrow })),
  ]);
  while (reached?.kind === 'shape' && reached.shape.holdsContents) {
    const container: ElementShape = reached.shape;
    const inner = best(
      shapes
        .filter((each) => each.containerShape === container.key)
        .map((each): Reachable => ({ kind: 'shape', shape: each })),
    );
    if (!inner) break;
    reached = inner;
  }
  return reached;
}
