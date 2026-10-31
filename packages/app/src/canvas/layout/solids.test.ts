/**
 * Layout and a drawing with parts that shows a solid (ADR 0075, ADR 0015's clarification): the drawing
 * is one block, its anchored parts have no place of their own, and each related part gives the block a
 * port on the side nearest its point.
 */
import { describe, expect, it } from 'vitest';
import { withSolids } from '../../test/solids';
import { buildScene, type ElementShape, type Scene } from '../scene';
import { blockGraph } from './engine';
import { layoutInput } from './input';

const VIEW = 'robot';

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

describe('layout and a solid’s anchored parts', () => {
  const state = withSolids(VIEW);
  const scene = buildScene(state, VIEW);
  const input = layoutInput(scene, state, { kind: 'view' });

  it('gives each anchored part no place of its own, with its point, from its drawing’s top left', () => {
    const arm = shapeOf(scene, 'arm');
    for (const key of ['arm/base', 'arm/link', 'arm/gripper', 'arm/wrist']) {
      const laid = input?.shapes.find((shape) => shape.key === key);
      const point = shapeOf(scene, key).part?.point;
      if (!point) throw new Error(`${key} has no point.`);
      expect(laid?.free, key).toBe(false);
      expect(laid?.partAt?.x).toBeCloseTo(point.x - arm.rect.x, 9);
      expect(laid?.partAt?.y).toBeCloseTo(point.y - arm.rect.y, 9);
    }
    // The drawing is one block, its other contents arranged below its picture.
    const drawing = input?.shapes.find((shape) => shape.key === 'arm');
    expect(drawing?.pictureBottom).toBe(48 + 320);
  });

  it('gives the block a port for a related part on its side nearest the part’s point', () => {
    const arm = shapeOf(scene, 'arm');
    const gripper = input?.shapes.find((shape) => shape.key === 'arm/gripper')?.partAt;
    if (!gripper) throw new Error('The gripper has no place in its drawing.');
    const size = { width: arm.rect.width, height: arm.rect.height };
    const graph = blockGraph(
      'level',
      [0, 1],
      new Map([
        [0, size],
        [1, { width: 100, height: 60 }],
      ]),
      () => undefined,
      [{ u: 1, v: 0, uDirect: false, vDirect: false, vPart: gripper }],
    );
    const [block] = graph.children ?? [];
    const [port] = block?.ports ?? [];
    const sides = {
      WEST: gripper.x,
      EAST: size.width - gripper.x,
      NORTH: gripper.y,
      SOUTH: size.height - gripper.y,
    };
    const nearest = Object.entries(sides).sort((a, b) => a[1] - b[1])[0]?.[0];
    expect(port?.layoutOptions?.['elk.port.side']).toBe(nearest);
  });
});
