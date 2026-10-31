/**
 * Tracing a part buffer (ADR 0075): the path of a part covers exactly the pixels it and the parts it
 * holds are drawn on, by the even-odd rule, holes and pixels meeting at a corner included.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SolidPart } from '@visual-anything/schema';
import { partValues, tracedPathData, valueBoxes } from './solid-trace';

/** The closed contours of path data made of M, H, V and Z, as lists of corners. */
function contoursOf(data: string): { x: number; y: number }[][] {
  const contours: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (const [, command, value] of data.matchAll(/([MHVZ])([^MHVZ]*)/g)) {
    if (command === 'M') {
      const [mx, my] = (value ?? '').trim().split(/\s+/).map(Number);
      x = mx as number;
      y = my as number;
      current = [{ x, y }];
    } else if (command === 'H') {
      x = Number(value);
      current.push({ x, y });
    } else if (command === 'V') {
      y = Number(value);
      current.push({ x, y });
    } else {
      contours.push(current);
    }
  }
  return contours;
}

/** Whether a point lies inside contours by the even-odd rule. */
function insideEvenOdd(contours: { x: number; y: number }[][], px: number, py: number): boolean {
  let inside = false;
  for (const contour of contours) {
    for (let at = 0; at < contour.length; at++) {
      const a = contour[at] as { x: number; y: number };
      const b = contour[(at + 1) % contour.length] as { x: number; y: number };
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function covered(data: Uint16Array, width: number, from: number, to: number) {
  return (x: number, y: number) => {
    const value = data[y * width + x] as number;
    return value >= from && value < to;
  };
}

describe('tracing a part buffer', () => {
  it('outlines a square as one contour of four corners', () => {
    const data = new Uint16Array(16);
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      data[(y as number) * 4 + (x as number)] = 1;
    }
    expect(tracedPathData({ width: 4, height: 4, data }, 1, 2)).toBe('M1 1H3V3H1Z');
  });

  it('writes nothing for a part its picture does not show', () => {
    expect(tracedPathData({ width: 2, height: 2, data: new Uint16Array(4) }, 1, 2)).toBe('');
  });

  it('covers exactly the pixels of the values asked for, by the even-odd rule', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 81, maxLength: 81 }),
        fc.integer({ min: 1, max: 3 }),
        (width, height, values, from) => {
          const data = Uint16Array.from(values.slice(0, width * height));
          const buffer = { width, height, data };
          const to = from + 1;
          const contours = contoursOf(tracedPathData(buffer, from, to));
          const isCovered = covered(data, width, from, to);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              expect(insideEvenOdd(contours, x + 0.5, y + 0.5)).toBe(isCovered(x, y));
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('traces within a box the same as across the whole buffer', () => {
    const data = new Uint16Array(36);
    data[7] = 2;
    data[8] = 2;
    data[14] = 3;
    const buffer = { width: 6, height: 6, data };
    const boxes = valueBoxes(buffer);
    expect(boxes.get(2)).toEqual({ x1: 1, y1: 1, x2: 3, y2: 2 });
    expect(boxes.get(3)).toEqual({ x1: 2, y1: 2, x2: 3, y2: 3 });
    expect(tracedPathData(buffer, 2, 4, { x: 1, y: 1, width: 2, height: 2 })).toBe(
      tracedPathData(buffer, 2, 4),
    );
  });

  it('takes the parts a part holds, which follow it in depth-first order', () => {
    const parts: SolidPart[] = [
      { name: 'base' },
      { name: 'link', parent: 0 },
      { name: 'wrist', parent: 1 },
      { name: 'tip', parent: 2 },
      { name: 'gripper', parent: 1 },
      { name: 'other' },
    ];
    expect(partValues(parts, 1)).toEqual({ from: 2, to: 6 });
    expect(partValues(parts, 3)).toEqual({ from: 4, to: 5 });
    expect(partValues(parts, 0)).toEqual({ from: 1, to: 6 });
    expect(partValues(parts, 5)).toEqual({ from: 6, to: 7 });
  });
});
