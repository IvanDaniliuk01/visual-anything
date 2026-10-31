/**
 * The keys and the outline go through a solid's anchored parts in their solid's order (ADR 0075), and
 * a box takes a part whose point lies inside it.
 */
import { describe, expect, it } from 'vitest';
import { outlineOf } from '../../shell/outlineItems';
import { withSolids } from '../../test/solids';
import { enclosedBy, indexScene } from '../hit';
import { nearestInDirection, partsInOrder } from '../navigation';
import { buildScene } from '../scene';

const state = withSolids();
const scene = buildScene(state, 'robot');
const indexed = indexScene(scene);
// In the solid's order: the base (0), the link (1), the wrist (2), the gripper (4).
const ORDER = ['arm/base', 'arm/link', 'arm/wrist', 'arm/gripper'];

describe('a solid’s parts in their solid’s order', () => {
  it('are stepped through by the keys in that order', () => {
    expect(partsInOrder(indexed, 'arm').map((shape) => shape.key)).toEqual(ORDER);
    const base = indexed.byKey.get('arm/base');
    if (!base) throw new Error('No base.');
    const next = nearestInDirection(indexed, { rect: base.rect, shape: base }, 'right');
    expect(next?.kind === 'shape' ? next.shape.key : undefined).toBe('arm/link');
  });

  it('are listed first in the outline, in that order', () => {
    const outline = outlineOf(scene, state);
    const arm = outline.top.find((item) => item.id === 'arm');
    if (!arm) throw new Error('The outline has no arm.');
    const inside = outline.inside(arm).map((item) => item.id);
    expect(inside.slice(0, ORDER.length)).toEqual(ORDER);
  });

  it('are taken by a box that holds their points', () => {
    const link = indexed.byKey.get('arm/link')?.part?.point;
    if (!link) throw new Error('The link has no point.');
    const box = { x: link.x - 1, y: link.y - 1, width: 2, height: 2 };
    const found = enclosedBy(indexed, box).shapes.map((shape) => shape.key);
    expect(found).toContain('arm/link');
    // A box that holds no point takes no part, though it touches a part's dot.
    const beside = { x: link.x + 1, y: link.y - 1, width: 4, height: 2 };
    expect(enclosedBy(indexed, beside).shapes.map((shape) => shape.key)).not.toContain('arm/link');
  });
});
