/**
 * Pointing at a solid's parts through a part buffer (ADR 0075): exact to a pixel of the picture, the
 * innermost anchored part found, the drawing where none stands for what is drawn, box selection by
 * the parts' points, the solid's order, and within 1 ms at the 95th percentile.
 */
import type { SolidPart } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { buildScene, type ElementShape } from '../scene';
import { withSolids } from '../../test/solids';
import {
  anchoredByIndex,
  anchoredPartFor,
  boxHoldsSolidPart,
  inSolidOrder,
  partIndexAt,
  partPixelAt,
  pointedPart,
  type PlacedPartBuffer,
} from './pointing';

/** A fake part buffer of 8 by 4 pixels over a picture of 80 by 40 units at (100, 200). */
function fakeBuffer(): PlacedPartBuffer {
  // Rows: 0 for none, 1 for the base (0), 2 for the link (1), 5 for the gripper (4).
  const rows = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 2, 2, 5, 5, 0, 0],
    [0, 1, 1, 1, 1, 5, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
  ];
  return {
    buffer: { width: 8, height: 4, data: Uint16Array.from(rows.flat()) },
    rect: { x: 100, y: 200, width: 80, height: 40 },
  };
}

const PARTS: SolidPart[] = [
  { name: 'base' },
  { name: 'link', parent: 0 },
  { name: 'wrist', parent: 1 },
  { name: 'tip', parent: 2 },
  { name: 'gripper', parent: 1 },
];

function shape(key: string, index?: number): ElementShape {
  return {
    key,
    element: key,
    name: key,
    ...(index === undefined
      ? {}
      : {
          part: {
            solid: 'robotics.arm',
            part: PARTS[index]?.name ?? '',
            index,
            color: '#FFFFFF',
            inDrawing: true,
            point: { x: 110 + 10 * index, y: 210 },
          },
        }),
  } as unknown as ElementShape;
}

describe('pointing at a solid’s parts', () => {
  it('finds the pixel of the part buffer under a point, exact to a pixel of the picture', () => {
    const placed = fakeBuffer();
    expect(partPixelAt(placed, { x: 100, y: 200 })).toEqual({ x: 0, y: 0 });
    expect(partPixelAt(placed, { x: 109.999, y: 209.999 })).toEqual({ x: 0, y: 0 });
    expect(partPixelAt(placed, { x: 110, y: 210 })).toEqual({ x: 1, y: 1 });
    expect(partPixelAt(placed, { x: 179.99, y: 239.99 })).toEqual({ x: 7, y: 3 });
    expect(partPixelAt(placed, { x: 180, y: 220 })).toBeUndefined();
    expect(partPixelAt(placed, { x: 99.9, y: 220 })).toBeUndefined();
  });

  it('reads the part drawn there, and none where nothing is drawn', () => {
    const placed = fakeBuffer();
    expect(partIndexAt(placed, { x: 115, y: 215 })).toBe(1);
    expect(partIndexAt(placed, { x: 145, y: 215 })).toBe(4);
    expect(partIndexAt(placed, { x: 145, y: 225 })).toBe(0);
    expect(partIndexAt(placed, { x: 105, y: 205 })).toBeUndefined();
  });

  it('finds the anchored part, or the nearest part holding it that one stands for, or the drawing', () => {
    const drawing = shape('arm');
    const base = shape('arm/base', 0);
    const gripper = shape('arm/gripper', 4);
    const anchored = anchoredByIndex([base, gripper, shape('arm/extra')]);
    expect([...anchored.keys()]).toEqual([0, 4]);
    expect(anchoredPartFor(3, PARTS, anchored)).toBe(base);
    expect(anchoredPartFor(4, PARTS, anchored)).toBe(gripper);
    const placed = fakeBuffer();
    // The link stands for no element: the base holding it is found.
    expect(pointedPart(drawing, placed, { x: 115, y: 215 }, PARTS, anchored)).toBe(base);
    expect(pointedPart(drawing, placed, { x: 145, y: 215 }, PARTS, anchored)).toBe(gripper);
    expect(pointedPart(drawing, placed, { x: 105, y: 205 }, PARTS, anchored)).toBe(drawing);
    // What the canvas does not draw is not found.
    expect(
      pointedPart(drawing, placed, { x: 145, y: 215 }, PARTS, anchored, (each) => each === gripper),
    ).toBe(drawing);
    expect(anchoredPartFor(2, PARTS, new Map())).toBeUndefined();
  });

  it('takes a part in a box when its point lies inside it', () => {
    const base = shape('arm/base', 0);
    expect(boxHoldsSolidPart(base, { x: 105, y: 205, width: 10, height: 10 })).toBe(true);
    expect(boxHoldsSolidPart(base, { x: 111, y: 205, width: 10, height: 10 })).toBe(false);
    expect(boxHoldsSolidPart(shape('arm'), { x: 0, y: 0, width: 999, height: 999 })).toBe(false);
  });

  it('puts parts in their solid’s order', () => {
    const shapes = [shape('c', 4), shape('a', 0), shape('b', 1)];
    expect(inSolidOrder(shapes).map((each) => each.key)).toEqual(['a', 'b', 'c']);
  });

  it('finds the anchored parts of the scene’s drawing with parts by their index', () => {
    const scene = buildScene(withSolids('robot'), 'robot');
    const contents = scene.shapes.filter((each) => each.containerShape === 'arm');
    const anchored = anchoredByIndex(contents);
    expect([...anchored.entries()].map(([index, each]) => [index, each.key])).toEqual([
      [0, 'arm/base'],
      [1, 'arm/link'],
      [4, 'arm/gripper'],
      [2, 'arm/wrist'],
    ]);
  });

  it('points within 1 ms at the 95th percentile, over a picture of 2,048 pixels and 4,096 parts', () => {
    const side = 2048;
    const data = new Uint16Array(side * side);
    for (let at = 0; at < data.length; at++) data[at] = (at * 7919) % 4097;
    const parts: SolidPart[] = Array.from({ length: 4096 }, (_, at) =>
      at === 0 ? { name: 'p0' } : { name: `p${at}`, parent: Math.floor((at - 1) / 2) },
    );
    const anchored = new Map<number, ElementShape>([[0, shape('root', 0)]]);
    const placed: PlacedPartBuffer = {
      buffer: { width: side, height: side, data },
      rect: { x: 0, y: 0, width: 320, height: 320 },
    };
    const drawing = shape('drawing');
    const times: number[] = [];
    for (let run = 0; run < 2000; run++) {
      const point = { x: (run * 37) % 320, y: (run * 53) % 320 };
      const start = performance.now();
      pointedPart(drawing, placed, point, parts, anchored);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(1);
  });
});
