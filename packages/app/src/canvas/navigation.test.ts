import type { ProjectSnapshot } from '@visual-anything/core';
import { RELATES_TO_ID } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import { centerOf, distance, type Rect } from './geometry';
import { indexScene, type IndexedScene } from './hit';
import {
  containerOf,
  directionScore,
  drawnRelations,
  farEnd,
  firstInside,
  hiddenIn,
  nearestInDirection,
  nearestTo,
  rectOf,
  setHidden,
  stepRelation,
  type Direction,
  type Reachable,
} from './navigation';
import { buildScene, type ElementShape } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';
const indexed = indexScene(buildScene(sample, VIEW));

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

  it('enters a container whose contents sit outside its rectangle', () => {
    // Scheduling's contents dragged up and out of it: they sit at negative offsets, above it.
    const above = indexScene(buildScene(withSchedulingContentsMovedBy(sample, -400), VIEW));
    expect(shape(API, above).rect.y + shape(API, above).rect.height).toBeLessThan(
      shape(SCHEDULING, above).rect.y,
    );
    const start = shape(AGENT, above);
    const reached = nearestInDirection(above, { rect: start.rect, shape: start }, 'right');
    // The Appointments DB, the lowest of them, is the nearest to the right of the Booking agent.
    expect(nameOf(reached)).toBe(DB);
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

  it('at the same distance, finds the shape drawn on top, whatever the order of the shapes', () => {
    const rect = (x: number) => ({ x, y: 0, width: 100, height: 100 });
    const block = (key: string, x: number): ElementShape => ({
      key,
      element: key,
      offset: { x, y: 0 },
      positioned: 'stored',
      name: key,
      componentName: 'Service',
      kind: 'rectangle',
      fill: '#ffffff',
      stroke: '#000000',
      rect: rect(x),
      extent: rect(x),
      holdsContents: false,
    });
    const overlapping = (drawing: number[]) =>
      indexScene({
        shapes: [block('first', 0), block('second', 50)],
        drawing,
        relations: [],
        notes: [],
        arrows: [],
        bounds: { x: 0, y: 0, width: 150, height: 100 },
      });
    const middle = { x: 75, y: 50 };
    expect(nameOf(nearestTo(overlapping([0, 1]), middle))).toBe('second');
    expect(nameOf(nearestTo(overlapping([1, 0]), middle))).toBe('first');
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

  it('finds the shapes a container holds outside its rectangle', () => {
    // Above Scheduling, the Appointments DB comes nearest its top left corner; left of it, the
    // Reminder service does.
    const above = indexScene(buildScene(withSchedulingContentsMovedBy(sample, -400), VIEW));
    expect(firstInside(above, shape(SCHEDULING, above))?.key).toBe(DB);
    const left = indexScene(buildScene(withSchedulingContentsMovedBy(sample, 0, -600), VIEW));
    expect(firstInside(left, shape(SCHEDULING, left))?.key).toBe(REMINDERS);
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

  it('lists the relations that end on a relation, in the model’s order', () => {
    const onRelations = withRelationsOnRelations(sample);
    const lines = drawnRelations(buildScene(onRelations, VIEW), onRelations);
    const ids = (list: readonly { relation: string }[]) => list.map((line) => line.relation);
    expect(ids(lines.endingOn('api-reads-db'))).toEqual(['reads-and-writes', 'about-reading']);
    expect(ids(lines.endingOn('api-writes-db'))).toEqual(['reads-and-writes']);
    expect(ids(lines.endingOn('reads-and-writes'))).toEqual(['about-reading']);
    expect(lines.endingOn('agent-to-api')).toEqual([]);
    // Relations between relations are drawn on no element.
    expect(ids(lines.around('appointments-api'))).toEqual(around('appointments-api'));
  });

  it('steps from an element through its relations and those that end on them, each once', () => {
    const onRelations = withRelationsOnRelations(sample);
    const lines = drawnRelations(buildScene(onRelations, VIEW), onRelations);
    expect(lines.steps('appointments-api').map(({ line, on }) => [line.relation, on])).toEqual([
      ['api-to-reminders', 'appointments-api'],
      ['api-writes-db', 'appointments-api'],
      ['reads-and-writes', 'api-writes-db'],
      ['about-reading', 'reads-and-writes'],
      ['api-reads-db', 'appointments-api'],
      ['agent-to-api', 'appointments-api'],
    ]);
    expect(lines.steps('booking-agent').map(({ line }) => line.relation)).toEqual(
      around('booking-agent'),
    );
    expect(lines.steps('clinic-booking')).toEqual([]);
  });

  it('looks at each relation once, however deep relations between relations are woven', () => {
    // Every relation of a round ends on two of the round before: 2^40 ways back from the last.
    const rounds = 40;
    const woven = withWovenRelations(sample, rounds);
    const lines = drawnRelations(buildScene(woven, VIEW), woven);
    for (const side of ['a', 'b', 'c']) expect(lines.line(`weave-${side}-${rounds}`)).toBeDefined();
    const started = performance.now();
    expect(lines.elementOf(`weave-a-${rounds}`)).toBe('patient');
    const stops = lines.steps('patient').map(({ line }) => line.relation);
    expect(performance.now() - started).toBeLessThan(100);
    expect(stops).toEqual(expect.arrayContaining(['weave-a-40', 'weave-b-40', 'weave-c-40']));
    expect(new Set(stops).size).toBe(stops.length);
  });

  it('finds the element a relation is stepped through from, through the relations it ends on', () => {
    const onRelations = withRelationsOnRelations(sample);
    const lines = drawnRelations(buildScene(onRelations, VIEW), onRelations);
    expect(lines.elementOf('whatsapp-to-agent')).toBe('whatsapp');
    expect(lines.elementOf('reads-and-writes')).toBe('appointments-api');
    expect(lines.elementOf('about-reading')).toBe('appointments-api');
    expect(lines.elementOf('api-in-scheduling')).toBeUndefined();
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

  it('steps on into the relations that end on a relation', () => {
    const onRelations = withRelationsOnRelations(sample);
    const lines = drawnRelations(buildScene(onRelations, VIEW), onRelations);
    const next = (current: string | undefined, by: 1 | -1) =>
      stepRelation(lines, 'appointments-api', current, by)?.relation;
    expect(next('api-writes-db', 1)).toBe('reads-and-writes');
    expect(next('reads-and-writes', 1)).toBe('about-reading');
    expect(next('about-reading', 1)).toBe('api-reads-db');
    expect(next('api-reads-db', -1)).toBe('about-reading');
  });

  it('goes to the other end, or to the end the relation points to', () => {
    const relation = { from: 'whatsapp', to: 'booking-agent' };
    expect(farEnd(relation, 'booking-agent')).toBe('whatsapp');
    expect(farEnd(relation, 'whatsapp')).toBe('booking-agent');
    expect(farEnd(relation, undefined)).toBe('booking-agent');
  });
});

describe('what the canvas hides', () => {
  /** A scene of its own, so that what it hides reaches no other test. */
  function ownScene(project: ProjectSnapshot = sample): IndexedScene {
    const copy: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) => ({ ...view, positions: [...view.positions] })),
    };
    return indexScene(buildScene(copy, VIEW));
  }

  function going(within: IndexedScene, key: string, direction: Direction): string | undefined {
    const start = shape(key, within);
    return nameOf(nearestInDirection(within, { rect: start.rect, shape: start }, direction));
  }

  it('is nothing until it is set, and can be set again or taken away', () => {
    const own = ownScene();
    expect(hiddenIn(own.scene)).toBeUndefined();
    const hidden = new Set([WHATSAPP]);
    setHidden(own.scene, hidden);
    expect(hiddenIn(own.scene)).toBe(hidden);
    setHidden(own.scene, undefined);
    expect(hiddenIn(own.scene)).toBeUndefined();
    expect(hiddenIn(indexed.scene)).toBeUndefined();
  });

  it('is skipped by the arrow keys, free shapes too', () => {
    const own = ownScene();
    setHidden(own.scene, new Set([WHATSAPP, 'calendar-note']));
    expect(going(own, PATIENT, 'right')).toBe(AGENT);
    expect(going(own, DB, 'down')).toBeUndefined();
    setHidden(own.scene, new Set());
    expect(going(own, PATIENT, 'right')).toBe(WHATSAPP);
  });

  it('is skipped when the keys start from the middle of the canvas', () => {
    const own = ownScene();
    setHidden(own.scene, new Set([AGENT]));
    expect(nameOf(nearestTo(own, centerOf(shape(AGENT, own).rect)))).toBe(CLINIC);
  });

  it('is skipped going to a container, and into one', () => {
    const own = ownScene();
    setHidden(own.scene, new Set([SCHEDULING, WHATSAPP]));
    expect(containerOf(own, shape(API, own))?.key).toBe(CLINIC);
    expect(firstInside(own, shape(CLINIC, own))?.key).toBe(AGENT);
  });

  it('leaves the relations it hides out of the ones the keys step through and follow', () => {
    const own = ownScene();
    const shown = drawnRelations(own.scene, sample);
    setHidden(own.scene, new Set(['agent-to-api', 'api-reads-db']));
    const drawn = drawnRelations(own.scene, sample);
    expect(drawn).not.toBe(shown);
    expect(drawn.around('appointments-api').map((line) => line.relation)).toEqual([
      'api-to-reminders',
      'api-writes-db',
    ]);
    expect(drawn.line('agent-to-api')).toBeUndefined();
    expect(stepRelation(drawn, 'booking-agent', undefined, 1)?.relation).toBe('whatsapp-to-agent');
    expect(drawnRelations(own.scene, sample)).toBe(drawn);
  });

  it('gives an element’s relations the first of its shapes it does not hide', () => {
    const twice = withSecondContainer(sample);
    const own = ownScene(twice);
    const [first, second] = own.byElement.get('reminder-service') ?? [];
    setHidden(own.scene, new Set([first?.key ?? '']));
    expect(drawnRelations(own.scene, twice).shapeOf('reminder-service')).toBe(second);
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
 * The sample with relations between relations: "reads and writes" relates the API's reading of the
 * database to its writing, and "about reading" relates that relation to the reading.
 */
function withRelationsOnRelations(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        {
          id: 'reads-and-writes',
          relationType: RELATES_TO_ID,
          from: 'api-reads-db',
          to: 'api-writes-db',
        },
        {
          id: 'about-reading',
          relationType: RELATES_TO_ID,
          from: 'reads-and-writes',
          to: 'api-reads-db',
        },
      ],
    },
  };
}

/** The sample with the shapes inside Scheduling moved by (dy, dx) from where they are stored. */
function withSchedulingContentsMovedBy(
  project: ProjectSnapshot,
  dy: number,
  dx = 0,
): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) => ({
      ...view,
      positions: view.positions.map((position) =>
        position.container === 'scheduling'
          ? { ...position, x: position.x + dx, y: position.y + dy }
          : position,
      ),
    })),
  };
}

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
