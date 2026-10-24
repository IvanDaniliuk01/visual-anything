import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { enclosedBy, hitAt, indexScene } from './hit';
import { buildScene } from './scene';
import { SpatialIndex, rectBetween } from './spatial';

const indexed = indexScene(buildScene(loadSample(), 'system-overview'));

describe('hitAt', () => {
  it('finds the innermost shape under a point', () => {
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
});
