/**
 * What the emphasis hides cannot be pointed at: clicked, hovered, box-selected or dropped onto. What
 * lies beneath it is found instead (interface I2).
 */
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { dropAimAt, planDrop } from './drop';
import { emphasize } from './emphasize';
import { centerOf, type Rect } from './geometry';
import {
  enclosedBy,
  hitAt,
  indexScene,
  shapesAt,
  withoutShapes,
  type IndexedScene,
  type Skipped,
} from './hit';
import { buildScene, type ElementShape, type Scene } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';

function shapeAt(key: string, rect: Rect): ElementShape {
  return {
    key,
    element: key,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Box',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
  };
}

/** A shape over another, and a line across both. */
function stacked(): IndexedScene {
  const under = shapeAt('under', { x: 0, y: 0, width: 200, height: 100 });
  const over = shapeAt('over', { x: 50, y: 25, width: 100, height: 50 });
  const scene: Scene = {
    shapes: [under, over],
    relations: [
      {
        relation: 'across',
        route: [
          { x: 0, y: 50 },
          { x: 400, y: 50 },
        ],
        from: { x: 0, y: 50 },
        to: { x: 400, y: 50 },
        middle: { x: 200, y: 50 },
        stroke: '#000000',
        width: 2,
        dash: 'solid',
      },
    ],
    notes: [],
    arrows: [],
    bounds: { x: 0, y: 0, width: 400, height: 100 },
  };
  return indexScene(scene);
}

function skipping(...keys: string[]): Skipped {
  const set = new Set(keys);
  return { has: (key) => set.has(key) };
}

describe('pointing past what the emphasis hides', () => {
  it('finds what lies beneath a hidden shape or relation', () => {
    const indexed = stacked();
    const point = { x: 100, y: 50 };
    expect(hitAt(indexed, point, 6)).toMatchObject({ kind: 'relation' });
    expect(hitAt(indexed, point, 6, () => true, skipping('across'))).toMatchObject({
      kind: 'shape',
      shape: { key: 'over' },
    });
    expect(hitAt(indexed, point, 6, () => true, skipping('across', 'over'))).toMatchObject({
      kind: 'shape',
      shape: { key: 'under' },
    });
    expect(hitAt(indexed, point, 6, () => true, skipping('across', 'over', 'under'))).toBeUndefined();
    expect(shapesAt(indexed, point, () => true, skipping('over')).map((shape) => shape.key)).toEqual(
      ['under'],
    );
  });

  it('leaves what is hidden out of a box selection', () => {
    const indexed = stacked();
    const box = { x: -10, y: -10, width: 300, height: 200 };
    expect(enclosedBy(indexed, box).shapes.map((shape) => shape.key)).toEqual(['under', 'over']);
    expect(enclosedBy(indexed, box, skipping('under')).shapes.map((shape) => shape.key)).toEqual([
      'over',
    ]);
  });

  it('never drops onto a hidden container, but onto the one beneath it', () => {
    const indexed = indexScene(buildScene(sample, VIEW));
    const api = indexed.byKey.get('clinic-booking/scheduling/appointments-api') as ElementShape;
    const scheduling = indexed.byKey.get('clinic-booking/scheduling') as ElementShape;
    const patient = indexed.byKey.get('patient') as ElementShape;
    const plan = planDrop(indexed, sample, VIEW, selectionOf([{ kind: 'element', id: 'patient' }]), patient);
    if (!plan) throw new Error('The patient cannot be dropped.');
    // Over Scheduling, clear of its contents.
    const point = { x: scheduling.rect.x + scheduling.rect.width - 20, y: api.rect.y - 20 };
    const delta = { x: point.x - centerOf(patient.rect).x, y: point.y - centerOf(patient.rect).y };
    expect(dropAimAt(indexed, plan, point, delta, undefined, () => true)).toMatchObject({
      kind: 'into',
      target: { key: 'clinic-booking/scheduling' },
    });
    const hidden = emphasize(indexed.scene, { hidden: new Set(['clinic-booking/scheduling']) })
      .hidden.shapes;
    const aim = dropAimAt(withoutShapes(indexed, hidden), plan, point, delta, undefined, () => true);
    expect(aim).toMatchObject({ kind: 'into', target: { key: 'clinic-booking' } });
    // The index without them is made once for each set, and leaves the index it came from whole.
    expect(withoutShapes(indexed, hidden)).toBe(withoutShapes(indexed, hidden));
    expect(indexed.shapes.at(point)).toContain(indexed.indexOfKey.get('clinic-booking/scheduling'));
  });
});
