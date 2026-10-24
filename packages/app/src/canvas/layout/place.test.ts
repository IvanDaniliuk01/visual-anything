import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Rect } from '../geometry';
import { CONTENTS_ORIGIN } from '../scene';
import { ceilToStep, measuredSize, packInRows, placeBlock, roundToStep } from './place';
import { GAP_BELOW, GAP_BESIDE, LAYOUT_STEP, NODE_GAP } from './types';

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('steps of 8', () => {
  it('rounds to the nearest multiple, and up', () => {
    expect(roundToStep(0)).toBe(0);
    expect(roundToStep(3.9)).toBe(0);
    expect(roundToStep(4)).toBe(8);
    expect(roundToStep(-13)).toBe(-16);
    expect(ceilToStep(1)).toBe(8);
    expect(ceilToStep(16)).toBe(16);
    expect(ceilToStep(-1)).toBe(0);
  });
});

describe('packInRows', () => {
  it('packs boxes left to right in rows, in order, about 1.6 times wider than tall', () => {
    const sizes = Array.from({ length: 9 }, () => ({ width: 100, height: 50 }));
    const places = packInRows(sizes);
    expect(places[0]).toEqual({ x: 0, y: 0 });
    expect(places[1]).toEqual({ x: 100 + NODE_GAP, y: 0 });
    // Each row starts at the left, below the one before.
    const rows = new Set(places.map((place) => place.y));
    expect(rows.size).toBeGreaterThan(1);
    for (const y of rows) expect(places.find((place) => place.y === y)?.x).toBe(0);
  });

  it('never overlaps two boxes, and keeps the gap between them', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            width: fc.integer({ min: 1, max: 400 }),
            height: fc.integer({ min: 1, max: 300 }),
          }),
          { maxLength: 40 },
        ),
        (sizes) => {
          const places = packInRows(sizes);
          // Grown by half the gap on every side, they still do not overlap.
          const half = NODE_GAP / 2;
          const rects = places.map((place, at) => ({
            x: place.x - half,
            y: place.y - half,
            width: (sizes[at]?.width ?? 0) + NODE_GAP,
            height: (sizes[at]?.height ?? 0) + NODE_GAP,
          }));
          for (let a = 0; a < rects.length; a++) {
            for (let b = a + 1; b < rects.length; b++) {
              expect(overlaps(rects[a] as Rect, rects[b] as Rect)).toBe(false);
            }
          }
        },
      ),
    );
  });
});

describe('placeBlock', () => {
  const block = { width: 300, height: 200 };

  it('puts a block at the contents origin of a container that keeps nothing', () => {
    expect(placeBlock(block, { kind: 'container' }, [], { into: 0, out: 0 })).toEqual(
      CONTENTS_ORIGIN,
    );
  });

  it('keeps a block in World where its shapes start now, on the step', () => {
    expect(
      placeBlock(block, { kind: 'world', now: { x: 37, y: -21, width: 10, height: 10 } }, [], {
        into: 0,
        out: 0,
      }),
    ).toEqual({ x: 40, y: -24 });
  });

  it('puts a block below what is kept, unless relations lead into it from there', () => {
    const kept = [{ x: 100, y: 60, width: 200, height: 100 }];
    expect(placeBlock(block, { kind: 'container' }, kept, { into: 0, out: 0 })).toEqual({
      x: CONTENTS_ORIGIN.x,
      y: ceilToStep(160 + GAP_BELOW),
    });
    expect(placeBlock(block, { kind: 'container' }, kept, { into: 2, out: 1 })).toEqual({
      x: ceilToStep(300 + GAP_BESIDE),
      y: 64,
    });
    const now = { x: 0, y: 0, width: 1, height: 1 };
    expect(placeBlock(block, { kind: 'world', now }, kept, { into: 0, out: 3 })).toEqual({
      x: Math.floor((100 - GAP_BESIDE - 300) / LAYOUT_STEP) * LAYOUT_STEP,
      y: 64,
    });
  });

  it('never covers what it keeps, and stays on the step and inside a container', () => {
    const rect = fc.record({
      x: fc.integer({ min: -500, max: 500 }),
      y: fc.integer({ min: -500, max: 500 }),
      width: fc.integer({ min: 1, max: 300 }),
      height: fc.integer({ min: 1, max: 300 }),
    });
    fc.assert(
      fc.property(
        fc.record({
          width: fc.integer({ min: 1, max: 900 }),
          height: fc.integer({ min: 1, max: 900 }),
        }),
        fc.array(rect, { maxLength: 8 }),
        fc.boolean(),
        fc.nat(4),
        fc.nat(4),
        (size, kept, inWorld, into, out) => {
          const level = inWorld
            ? ({ kind: 'world', now: { x: 3, y: 5, width: 1, height: 1 } } as const)
            : ({ kind: 'container' } as const);
          const at = placeBlock(size, level, kept, { into, out });
          expect(Number.isInteger(at.x / LAYOUT_STEP)).toBe(true);
          expect(Number.isInteger(at.y / LAYOUT_STEP)).toBe(true);
          for (const each of kept) expect(overlaps({ ...at, ...size }, each)).toBe(false);
          if (!inWorld) {
            expect(at.x).toBeGreaterThanOrEqual(CONTENTS_ORIGIN.x);
            expect(at.y).toBeGreaterThanOrEqual(CONTENTS_ORIGIN.y);
          }
        },
      ),
    );
  });
});

describe('measuredSize', () => {
  it('is the stored size, else the appearance size, when it holds nothing', () => {
    expect(measuredSize([], { width: 160, height: 72 }, { width: 300 })).toEqual({
      width: 300,
      height: 72,
    });
  });

  it('grows to hold its contents as the scene does: with room to spare without a stored size', () => {
    const contents = [{ x: 24, y: 48, width: 400, height: 300 }];
    expect(measuredSize(contents, { width: 160, height: 72 }, {})).toEqual({
      width: 424 + CONTENTS_ORIGIN.x,
      height: 348 + CONTENTS_ORIGIN.x,
    });
    expect(measuredSize(contents, { width: 160, height: 72 }, { width: 900, height: 200 })).toEqual(
      { width: 900, height: 348 },
    );
  });
});
