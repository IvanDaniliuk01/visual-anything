import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { cpuNow } from '../test/cpu';
import {
  ALIGN_HOWS,
  alignedRects,
  fewestFor,
  guideLines,
  guideShift,
  guidesNear,
  snapToGuides,
  type AlignHow,
} from './align';
import type { Rect } from './geometry';
import { indexScene } from './hit';
import { buildScene } from './scene';

/** Rectangles in whole canvas units, as shapes are stored. */
const rect = fc.record({
  x: fc.integer({ min: -2000, max: 2000 }),
  y: fc.integer({ min: -2000, max: 2000 }),
  width: fc.integer({ min: 1, max: 600 }),
  height: fc.integer({ min: 1, max: 600 }),
});
const rects = (min: number) => fc.array(rect, { minLength: min, maxLength: 12 });

const right = (each: Rect) => each.x + each.width;
const bottom = (each: Rect) => each.y + each.height;
const center = (each: Rect) => each.x + each.width / 2;
const middle = (each: Rect) => each.y + each.height / 2;

/** The rectangles in the order distributing goes through them: by their middles along an axis. */
function inOrder(list: readonly Rect[], axis: 'x' | 'y'): number[] {
  const along = axis === 'x' ? center : middle;
  return list.map((_, at) => at).sort((a, b) => along(list[a]!) - along(list[b]!) || a - b);
}

/** The gaps between neighbours along an axis, in that order. */
function gaps(list: readonly Rect[], order: readonly number[], axis: 'x' | 'y'): number[] {
  const end = axis === 'x' ? right : bottom;
  const start = (each: Rect) => (axis === 'x' ? each.x : each.y);
  return order.slice(1).map((at, k) => start(list[at]!) - end(list[order[k]!]!));
}

describe('aligning', () => {
  it('lines up the edges it names, on the selection’s bounds', () => {
    fc.assert(
      fc.property(rects(2), (list) => {
        const left = Math.min(...list.map((each) => each.x));
        const top = Math.min(...list.map((each) => each.y));
        const most = Math.max(...list.map(right));
        const lowest = Math.max(...list.map(bottom));
        expect(alignedRects(list, 'left').map((each) => each.x)).toEqual(list.map(() => left));
        expect(alignedRects(list, 'right').map(right)).toEqual(list.map(() => most));
        expect(alignedRects(list, 'top').map((each) => each.y)).toEqual(list.map(() => top));
        expect(alignedRects(list, 'bottom').map(bottom)).toEqual(list.map(() => lowest));
      }),
    );
  });

  it('puts the centers and the middles within half a unit of each other', () => {
    fc.assert(
      fc.property(rects(2), (list) => {
        const centers = alignedRects(list, 'centers').map(center);
        const middles = alignedRects(list, 'middles').map(middle);
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(0.5);
        expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(0.5);
      }),
    );
  });

  it('keeps every size and the other axis, and stays in whole units', () => {
    fc.assert(
      fc.property(
        rects(2),
        fc.constantFrom<AlignHow>('left', 'centers', 'right', 'top', 'middles', 'bottom'),
        (list, how) => {
          const aligned = alignedRects(list, how);
          const across = how === 'left' || how === 'centers' || how === 'right' ? 'y' : 'x';
          aligned.forEach((each, at) => {
            const was = list[at]!;
            expect([each.width, each.height, each[across]]).toEqual([
              was.width,
              was.height,
              was[across],
            ]);
            expect(Number.isInteger(each.x) && Number.isInteger(each.y)).toBe(true);
          });
        },
      ),
    );
  });

  it('distributes with equal gaps, the first and the last staying', () => {
    fc.assert(
      fc.property(rects(3), fc.constantFrom<'x' | 'y'>('x', 'y'), (list, axis) => {
        const how = axis === 'x' ? 'distribute-horizontally' : 'distribute-vertically';
        const order = inOrder(list, axis);
        const spaced = alignedRects(list, how);
        const between = gaps(spaced, order, axis);
        // Whole units: the gaps differ by one unit at most.
        expect(Math.max(...between) - Math.min(...between)).toBeLessThanOrEqual(1);
        expect(spaced[order[0]!]).toEqual(list[order[0]!]);
        expect(spaced[order.at(-1)!]).toEqual(list[order.at(-1)!]);
        // Nothing moves across, and no size changes.
        const across = axis === 'x' ? 'y' : 'x';
        spaced.forEach((each, at) => {
          expect([each.width, each.height, each[across]]).toEqual([
            list[at]!.width,
            list[at]!.height,
            list[at]![across],
          ]);
        });
      }),
    );
  });

  it('gives the same width or height, the widest’s or the tallest’s, keeping each top left corner', () => {
    fc.assert(
      fc.property(rects(2), (list) => {
        const widest = Math.max(...list.map((each) => each.width));
        const tallest = Math.max(...list.map((each) => each.height));
        const wide = alignedRects(list, 'same-width');
        const tall = alignedRects(list, 'same-height');
        wide.forEach((each, at) => {
          expect(each).toEqual({ ...list[at]!, width: widest });
        });
        tall.forEach((each, at) => {
          expect(each).toEqual({ ...list[at]!, height: tallest });
        });
      }),
    );
  });

  it('moves nothing when already aligned: aligning twice is aligning once', () => {
    fc.assert(
      fc.property(
        rects(2),
        fc.constantFrom<AlignHow>(
          'left',
          'centers',
          'right',
          'top',
          'middles',
          'bottom',
          'same-width',
          'same-height',
        ),
        (list, how) => {
          const once = alignedRects(list, how);
          expect(alignedRects(once, how)).toEqual(once);
        },
      ),
    );
  });

  it('moves nothing when already distributed, in a row that does not overlap', () => {
    const row = fc
      .array(
        fc.record({
          gap: fc.integer({ min: 0, max: 200 }),
          width: fc.integer({ min: 1, max: 300 }),
          height: fc.integer({ min: 1, max: 300 }),
          y: fc.integer({ min: -500, max: 500 }),
        }),
        { minLength: 3, maxLength: 10 },
      )
      .map((parts) => {
        let x = 0;
        return parts.map(({ gap, width, height, y }) => {
          x += gap;
          const placed = { x, y, width, height };
          x += width;
          return placed;
        });
      });
    fc.assert(
      fc.property(row, (list) => {
        const once = alignedRects(list, 'distribute-horizontally');
        expect(alignedRects(once, 'distribute-horizontally')).toEqual(once);
      }),
    );
  });

  it('leaves rectangles already lined up exactly as they are', () => {
    const lined = [
      { x: 40, y: 0, width: 160, height: 80 },
      { x: 40, y: 200, width: 96, height: 40 },
      { x: 40, y: -80, width: 300, height: 48 },
    ];
    expect(alignedRects(lined, 'left')).toEqual(lined);
  });

  it('needs two rectangles to align and three to distribute', () => {
    expect(ALIGN_HOWS).toHaveLength(10);
    expect(fewestFor('left')).toBe(2);
    expect(fewestFor('same-height')).toBe(2);
    expect(fewestFor('distribute-horizontally')).toBe(3);
    expect(fewestFor('distribute-vertically')).toBe(3);
  });
});

describe('alignment guides', () => {
  const sibling = { x: 300, y: 100, width: 120, height: 60 };

  it('shift a value onto the nearest target within the tolerance, and no further', () => {
    expect(guideShift([103], [100, 160, 300], 6)).toBe(-3);
    expect(guideShift([95, 252], [100, 249], 6)).toBe(-3);
    expect(guideShift([110], [100], 6)).toBeUndefined();
    expect(guideShift([110], [], 6)).toBeUndefined();
  });

  it('snap a moving shape’s edges and middle to a shape beside it, and draw the lines', () => {
    // Its left edge 4 units right of the sibling's, and its top 2 below the sibling's middle.
    const moving = { x: 304, y: 132, width: 80, height: 40 };
    const snapped = snapToGuides(moving, [sibling], 6, {
      x: ['start', 'middle', 'end'],
      y: ['start', 'middle', 'end'],
    });
    expect(snapped.dx).toBe(-4);
    expect(snapped.dy).toBe(-2);
    const lines = snapped.lines;
    expect(lines).toContainEqual({ axis: 'x', at: 300, from: 100, to: 170 });
    expect(lines).toContainEqual({ axis: 'y', at: 130, from: 300, to: 420 });
  });

  it('leave a shape far from every other alone', () => {
    const snapped = snapToGuides({ x: 600, y: 600, width: 40, height: 40 }, [sibling], 6, {
      x: ['start', 'middle', 'end'],
      y: ['start', 'middle', 'end'],
    });
    expect(snapped).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it('draw lines only for the edges asked about', () => {
    const resized = { x: 0, y: 100, width: 300, height: 60 };
    expect(guideLines(resized, [sibling], { x: ['end'], y: [] })).toEqual([
      { axis: 'x', at: 300, from: 100, to: 160 },
    ]);
    expect(guideLines(resized, [sibling], { x: ['start'], y: [] })).toEqual([]);
  });

  it('look only at the shapes of the same container, not at what moves', () => {
    const indexed = indexScene(buildScene(syntheticProject({ elements: 400 }), 'everything'));
    const [first, second] = indexed.contentsOf.get('') ?? [];
    if (!first || !second) throw new Error('World holds fewer than two shapes.');
    const view = { x: -1e6, y: -1e6, width: 2e6, height: 2e6 };
    // The first shape's own place, nudged: it lines up with what sits beside it, never itself.
    const moving = { ...first.rect, x: first.rect.x + 3 };
    const near = guidesNear(indexed, '', moving, new Set([first.key]), view, 6, {
      x: ['start', 'middle', 'end'],
      y: ['start', 'middle', 'end'],
    });
    for (const line of near.lines) {
      expect(line.at).not.toBeNaN();
    }
    const inside = (indexed.contentsOf.get(second.key) ?? [])[0];
    if (inside) {
      // A shape inside another container never guides one in World.
      const lined = { ...first.rect, x: inside.rect.x + 2, y: inside.rect.y + 2 };
      const alone = guidesNear(indexed, '', lined, new Set([first.key, second.key]), view, 1, {
        x: ['start'],
        y: ['start'],
      });
      expect(alone.lines.some((line) => line.at === inside.rect.x)).toBe(false);
    }
  });

  it('are found in under 1 ms at the 95th percentile on the 10,000-element view', () => {
    const indexed = indexScene(buildScene(syntheticProject({ elements: 10_000 }), 'everything'));
    const world = indexed.contentsOf.get('') ?? [];
    const containers = world.filter((shape) => (indexed.contentsOf.get(shape.key) ?? []).length);
    const samples: number[] = [];
    const edges = { x: ['start', 'middle', 'end'], y: ['start', 'middle', 'end'] } as const;
    for (let at = 0; at < 400; at++) {
      // A shape of World, and one inside a container, each dragged a little further every time.
      const home = at % 2 === 0 ? world[at % world.length] : containers[at % containers.length];
      const shape = at % 2 === 0 || !home ? home : (indexed.contentsOf.get(home.key) ?? [])[0];
      if (!shape) continue;
      const frame = shape.containerShape ?? '';
      const moving = { ...shape.rect, x: shape.rect.x + (at % 37), y: shape.rect.y - (at % 23) };
      // What a laptop's screen shows at 100%, around the shape.
      const view = { x: moving.x - 800, y: moving.y - 500, width: 1600, height: 1000 };
      const started = cpuNow();
      guidesNear(indexed, frame, moving, new Set([shape.key]), view, 6, edges);
      samples.push(cpuNow() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? Infinity;
    expect(samples.length).toBeGreaterThan(300);
    expect(p95).toBeLessThan(1);
  });
});
