import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_GLIDE_SHAPES,
  MIN_GLIDE_SHARED,
  glideRectAt,
  matchShapes,
  planGlide,
  type GlideShape,
} from './glide';
import { MAX_TOUR_MOVE_TIME, TOUR_MOVE_TIME } from './camera';

const SCREEN = { width: 1000, height: 600 };

function shape(element: string, path: string, x = 0, y = 0, size = 40): GlideShape {
  return { element, path, rect: { x, y, width: size, height: size } };
}

/** The pairs as the keys of their two shapes, so that two answers compare whatever their order. */
function keyed(
  before: readonly GlideShape[],
  after: readonly GlideShape[],
  pairs: readonly { before: number; after: number }[],
): string[] {
  const sign = (each: GlideShape | undefined) =>
    each ? `${each.element}@${each.path}@${each.rect.x},${each.rect.y}` : '?';
  return pairs.map((pair) => `${sign(before[pair.before])} > ${sign(after[pair.after])}`).sort();
}

describe('matchShapes', () => {
  it('pairs the shapes of one element across two scenes', () => {
    const pairs = matchShapes(
      [shape('case', 'audit/case'), shape('finding', 'audit/finding')],
      [shape('finding', 'audit/finding', 500), shape('subject', 'audit/subject')],
    );
    expect(pairs).toEqual([{ before: 1, after: 0 }]);
  });

  it('matches a copy by its container path first, then by the nearest copy', () => {
    const before = [
      shape('case', 'audit/case', 0, 0),
      shape('case', 'billing/case', 900, 0),
      shape('case', 'archive/case', 0, 500),
    ];
    const after = [
      // The same path, far away: still matched by its path.
      shape('case', 'billing/case', 0, 0),
      // Another path, nearest the copy in `archive`.
      shape('case', 'legacy/case', 10, 480),
    ];
    expect(keyed(before, after, matchShapes(before, after))).toEqual(
      keyed(before, after, [
        { before: 1, after: 0 },
        { before: 2, after: 1 },
      ]),
    );
  });

  it('gives each shape one partner at most', () => {
    const before = [shape('a', 'a', 0), shape('a', 'b', 100)];
    const after = [shape('a', 'c', 50)];
    const pairs = matchShapes(before, after);
    expect(pairs).toHaveLength(1);
  });

  it('is symmetric: matching the other way round gives the same pairs, swapped', () => {
    const shapes = fc.array(
      fc.record({
        element: fc.constantFrom('a', 'b', 'c'),
        path: fc.constantFrom('x', 'y', 'z'),
        x: fc.integer({ min: 0, max: 20 }).map((value) => value * 50),
        y: fc.integer({ min: 0, max: 20 }).map((value) => value * 50),
      }),
      { maxLength: 12 },
    );
    fc.assert(
      fc.property(shapes, shapes, (one, two) => {
        const before = one.map((each) => shape(each.element, each.path, each.x, each.y));
        const after = two.map((each) => shape(each.element, each.path, each.x, each.y));
        const forth = keyed(before, after, matchShapes(before, after));
        const back = keyed(
          before,
          after,
          matchShapes(after, before).map((pair) => ({ before: pair.after, after: pair.before })),
        );
        expect(back).toEqual(forth);
        // Each shape has one partner at most, and only of its own element.
        const pairs = matchShapes(before, after);
        expect(new Set(pairs.map((pair) => pair.before)).size).toBe(pairs.length);
        expect(new Set(pairs.map((pair) => pair.after)).size).toBe(pairs.length);
        for (const pair of pairs) {
          expect(before[pair.before]?.element).toBe(after[pair.after]?.element);
        }
        // As many pairs as the element's copies allow.
        for (const element of ['a', 'b', 'c']) {
          const count = (list: readonly GlideShape[]) =>
            list.filter((each) => each.element === element).length;
          const paired = pairs.filter((pair) => before[pair.before]?.element === element).length;
          expect(paired).toBe(Math.min(count(before), count(after)));
        }
      }),
    );
  });
});

describe('planGlide', () => {
  const row = (count: number, x = 0) =>
    Array.from({ length: count }, (_, at) => shape(`e${at}`, `e${at}`, x + at * 10, 0));

  it('glides the shared shapes, timed by how far they travel on screen', () => {
    const plan = planGlide(row(5), row(5, 500), { screen: SCREEN, reducedMotion: false });
    expect(plan.kind).toBe('glide');
    if (plan.kind !== 'glide') return;
    expect(plan.pairs).toHaveLength(5);
    // Half a screen's width: 250 ms and 150 ms for each screen width.
    expect(plan.duration).toBe(TOUR_MOVE_TIME + 75);
  });

  it('never takes longer than the camera may', () => {
    const plan = planGlide(row(5), row(5, 50_000), { screen: SCREEN, reducedMotion: false });
    expect(plan.kind === 'glide' && plan.duration).toBe(MAX_TOUR_MOVE_TIME);
  });

  it('cuts when it shares too few shapes, too many, when the step asks to, and under reduced motion', () => {
    const options = { screen: SCREEN, reducedMotion: false };
    expect(planGlide(row(MIN_GLIDE_SHARED - 1), row(MIN_GLIDE_SHARED - 1), options)).toEqual({
      kind: 'cut',
      reason: 'too-few',
      shared: MIN_GLIDE_SHARED - 1,
    });
    expect(planGlide(row(MAX_GLIDE_SHAPES + 1), row(MAX_GLIDE_SHAPES + 1), options)).toMatchObject({
      kind: 'cut',
      reason: 'too-many',
      shared: MAX_GLIDE_SHAPES + 1,
    });
    expect(planGlide(row(MAX_GLIDE_SHAPES), row(MAX_GLIDE_SHAPES), options).kind).toBe('glide');
    expect(planGlide(row(5), row(5), { ...options, transition: 'cut' })).toMatchObject({
      kind: 'cut',
      reason: 'opted-out',
    });
    expect(planGlide(row(5), row(5), { ...options, reducedMotion: true })).toMatchObject({
      kind: 'cut',
      reason: 'reduced-motion',
    });
  });
});

describe('glideRectAt', () => {
  it('moves and resizes evenly from one place to the other', () => {
    const from = { x: 0, y: 0, width: 10, height: 20 };
    const to = { x: 100, y: 50, width: 30, height: 40 };
    expect(glideRectAt(from, to, 0)).toEqual(from);
    expect(glideRectAt(from, to, 1)).toEqual(to);
    expect(glideRectAt(from, to, 0.5)).toEqual({ x: 50, y: 25, width: 20, height: 30 });
  });
});
