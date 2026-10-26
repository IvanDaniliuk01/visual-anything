/**
 * Route handles and dragged ends on outlines (ADR 0039's clarification of 2026-10-26): an end let go
 * on a shape with free geometry attaches at the outline's point nearest the pointer, stored as the
 * side and place that carry in to it, automatically only deep inside the outline, and with Alt never
 * inside the shape.
 */
import { readGeometry, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { TRIANGLE, beyondBoxes } from '../../test/beyond';
import { indexScene } from '../hit';
import { geometrySource, outlineAt, outlineIn } from '../outlines';
import { buildScene, relationLinesOf, type ElementShape } from '../scene';
import { carriedIn, nearestOnOutline } from './outline-ends';
import { aimEnd, snapEnd } from './snap';

function triangleShape(points?: ElementShape['points']): ElementShape {
  const read = readGeometry(TRIANGLE);
  if (!read.ok) throw new Error('The triangle does not read.');
  const rect = { x: 0, y: 0, width: 200, height: 100 };
  return {
    key: 'tri',
    element: 'tri',
    offset: { x: 0, y: 0 },
    positioned: 'stored',
    name: 'Tri',
    componentName: 'Chamber',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
    outline: outlineIn(geometrySource(read.outline), rect.width, rect.height),
    ...(points ? { points } : {}),
  };
}

const placedOf = (shape: ElementShape) => {
  const placed = outlineAt(shape);
  if (!placed) throw new Error('No outline');
  return placed;
};

describe('snapping a dragged end on an outline', () => {
  it('attaches at the outline’s point nearest the pointer, by the side and place that carry in', () => {
    const shape = triangleShape();
    // Inside the box, left of the triangle's left side.
    const snap = snapEnd(shape, { x: 60, y: 50 }, 1, false, false);
    expect(snap.attachment).toMatchObject({ kind: 'border' });
    const nearest = nearestOnOutline(placedOf(shape), { x: 60, y: 50 }).point;
    expect(snap.tick).toBeDefined();
    expect(
      Math.hypot((snap.tick?.at.x ?? 0) - nearest.x, (snap.tick?.at.y ?? 0) - nearest.y),
    ).toBeLessThan(0.5);
    // What is stored carries in to where the tick is.
    if (snap.attachment?.kind !== 'border') throw new Error('Not on the border');
    const carried = carriedIn(
      placedOf(shape),
      shape.rect,
      snap.attachment.side,
      snap.attachment.at,
    );
    expect(carried.point).toEqual(snap.tick?.at);
  });

  it('attaches automatically deep inside the outline, and with Alt at its nearest point instead', () => {
    const shape = triangleShape();
    const inside = { x: 100, y: 70 };
    expect(snapEnd(shape, inside, 1, false, false).attachment).toBeNull();
    const exact = snapEnd(shape, inside, 1, true, false);
    expect(exact.attachment).toMatchObject({ kind: 'border' });
    // Never inside the shape: on its outline.
    expect(nearestOnOutline(placedOf(shape), exact.tick?.at ?? inside).distance).toBeLessThan(0.5);
  });

  it('shows connection points where they are carried in to the outline, and snaps to them', () => {
    const shape = triangleShape([{ name: 'flank', side: 'left', at: 0.5 }]);
    const snap = snapEnd(shape, { x: 70, y: 52 }, 1, false, false);
    expect(snap.attachment).toEqual({ kind: 'connection-point', name: 'flank' });
    expect(snap.points[0]?.at.x).toBeCloseTo(68.75, 6);
    expect(snap.points[0]?.at.y).toBe(50);
  });
});

describe('aiming a dragged end at its own shape’s outline', () => {
  const VIEW = 'anatomy';
  const project: ProjectSnapshot = beyondBoxes(VIEW);

  it('takes a point in a hole, beyond reach of the outline, as not on the shape', () => {
    const scene = buildScene(project, VIEW);
    const indexed = indexScene(scene);
    const line = relationLinesOf(scene).get('tie');
    if (!line) throw new Error('No line');
    const framed = scene.shapes.find((shape) => shape.key === 'framed') as ElementShape;
    const hole = { x: framed.rect.x + 100, y: framed.rect.y + 50 };
    const aim = aimEnd(indexed, project, line, 'to', hole, 1, false, () => true, {
      has: () => false,
    });
    expect(aim.kind).not.toBe('attach');
    // On the frame itself, it attaches there.
    const onFrame = { x: framed.rect.x + 10, y: framed.rect.y + 50 };
    const attach = aimEnd(indexed, project, line, 'to', onFrame, 1, false, () => true, {
      has: () => false,
    });
    expect(attach.kind).toBe('attach');
  });
});
