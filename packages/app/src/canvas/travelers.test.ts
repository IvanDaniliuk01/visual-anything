/** Travelers along relations' lines, worked out (ADR 0110). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from './geometry';
import {
  MOST_TRAVELERS,
  TRAVELER_SIZE,
  TRAVELER_SPACING,
  TRAVELER_SPEEDS,
  carriesAt,
  chooseLines,
  distanceToRect,
  eachTraveler,
  firstAt,
  headsLeft,
  lineTravelerOf,
  measureRoute,
  placeAt,
  sizedPicture,
  stepsOf,
  stillPlaces,
  travelerCount,
  travelerModeOf,
  uprightAt,
  type Candidate,
  type Place,
} from './travelers';

const place = (): Place => ({ x: 0, y: 0, angle: 0 });
const picture = { kind: 'svg', width: 30, height: 15 } as never;
const ell: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('a traveler as a line draws it', () => {
  it('fills in its defaults: 20 pixels, normal speed, 240 apart', () => {
    const traveler = lineTravelerOf({ image: 'p.truck' }, picture, true);
    expect(traveler).toMatchObject({
      image: 'p.truck',
      size: TRAVELER_SIZE,
      speed: TRAVELER_SPEEDS.normal,
      spacing: TRAVELER_SPACING,
      directed: true,
    });
    expect(TRAVELER_SIZE).toBe(20);
    expect(TRAVELER_SPACING).toBe(240);
  });

  it('goes 60, 120 or 240 canvas units a second', () => {
    expect(TRAVELER_SPEEDS).toEqual({ slow: 60, normal: 120, fast: 240 });
    const fast = lineTravelerOf(
      { image: 'p.a', speed: 'fast', size: 32, spacing: 80 },
      picture,
      false,
    );
    expect(fast).toMatchObject({ speed: 240, size: 32, spacing: 80, directed: false });
  });

  it('moves in a view that says nothing, and stands still or hides as the view says', () => {
    expect(travelerModeOf(undefined)).toBe('moving');
    expect(travelerModeOf('still')).toBe('still');
    expect(travelerModeOf('hidden')).toBe('hidden');
  });
});

describe('a place along a route', () => {
  const route = measureRoute(ell);

  it('is measured along its segments', () => {
    expect(route.length).toBe(200);
    expect([...route.at]).toEqual([0, 100, 200]);
  });

  it('heads along the segment it is on', () => {
    expect(placeAt(route, 50, false, place())).toEqual({ x: 50, y: 0, angle: 0 });
    const down = placeAt(route, 150, false, place());
    expect(down.x).toBe(100);
    expect(down.y).toBe(50);
    expect(down.angle).toBeCloseTo(Math.PI / 2);
  });

  it('counted from the end, heads back toward the start', () => {
    const up = placeAt(route, 50, true, place());
    expect(up).toMatchObject({ x: 100, y: 50 });
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
    const left = placeAt(route, 150, true, place());
    expect(left).toMatchObject({ x: 50, y: 0 });
    expect(Math.abs(left.angle)).toBeCloseTo(Math.PI);
  });

  it('stays on the route past its ends, and skips segments of no length', () => {
    expect(placeAt(route, -10, false, place())).toMatchObject({ x: 0, y: 0 });
    expect(placeAt(route, 999, false, place())).toMatchObject({ x: 100, y: 100 });
    const doubled = measureRoute([
      ell[0] as Point,
      ell[1] as Point,
      ell[1] as Point,
      ell[2] as Point,
    ]);
    const corner = placeAt(doubled, 100, false, place());
    expect(corner).toMatchObject({ x: 100, y: 0 });
    expect(Number.isFinite(corner.angle)).toBe(true);
  });

  it('is on the route and as far along it as asked, for any route', () => {
    const point = fc.record({
      x: fc.integer({ min: -500, max: 500 }),
      y: fc.integer({ min: -500, max: 500 }),
    });
    fc.assert(
      fc.property(
        fc.array(point, { minLength: 2, maxLength: 6 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (points, part) => {
          const measured = measureRoute(points);
          const at = placeAt(measured, part * measured.length, false, place());
          // The distance from the start along the route, measured again up to the place.
          let along = 0;
          let best = Infinity;
          for (let index = 1; index < points.length; index++) {
            const a = points[index - 1] as Point;
            const b = points[index] as Point;
            const span = Math.hypot(b.x - a.x, b.y - a.y);
            const off =
              Math.hypot(at.x - a.x, at.y - a.y) + Math.hypot(b.x - at.x, b.y - at.y) - span;
            if (off < 1e-6)
              best = Math.min(
                best,
                Math.abs(along + Math.hypot(at.x - a.x, at.y - a.y) - part * measured.length),
              );
            along += span;
          }
          expect(best).toBeLessThan(1e-6);
        },
      ),
    );
  });
});

describe('an upright traveler', () => {
  it('turns with its line and is mirrored only while it heads left', () => {
    expect(uprightAt(0)).toEqual({ rotation: 0, mirrored: false });
    expect(uprightAt(Math.PI)).toEqual({ rotation: Math.PI, mirrored: true });
    expect(uprightAt(Math.PI / 2).mirrored).toBe(false);
    expect(uprightAt(-Math.PI / 2).mirrored).toBe(false);
    expect(headsLeft((3 * Math.PI) / 4)).toBe(true);
    expect(headsLeft(-Math.PI / 4)).toBe(false);
  });

  it('keeps its top up: turned and mirrored, its own up points up the screen', () => {
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (angle) => {
        const { rotation, mirrored } = uprightAt(angle);
        // The picture's up, (0, -1), mirrored across its direction when it heads left, then turned.
        const upY = mirrored ? 1 : -1;
        const screenUpY = Math.cos(rotation) * upY;
        expect(screenUpY).toBeLessThanOrEqual(1e-9);
      }),
    );
  });
});

describe('spacing', () => {
  it('fits a whole number of travelers, at least the spacing apart', () => {
    expect(stepsOf(1000, 240)).toEqual({ count: 4, step: 250 });
    expect(stepsOf(480, 240)).toEqual({ count: 2, step: 240 });
    expect(stepsOf(0, 240)).toEqual({ count: 0, step: 0 });
  });

  it('gives a line shorter than its spacing one', () => {
    expect(stepsOf(100, 240)).toEqual({ count: 1, step: 100 });
    expect(travelerCount(100, { spacing: 240, directed: true })).toBe(1);
  });

  it('counts both halves of an undirected line', () => {
    expect(travelerCount(1000, { spacing: 240, directed: false })).toBe(4);
    expect(travelerCount(100, { spacing: 240, directed: false })).toBe(2);
  });

  it('starts half a step in, standing still', () => {
    expect(firstAt(250, 120, undefined)).toBe(125);
  });

  it('moves on at its speed and wraps around a step', () => {
    expect(firstAt(250, 120, 0)).toBe(125);
    expect(firstAt(250, 120, 1)).toBe(245);
    expect(firstAt(250, 120, 1.5)).toBeCloseTo(55);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e5, noNaN: true }), (seconds) => {
        const at = firstAt(250, 60, seconds);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(250);
      }),
    );
  });
});

describe('where travelers stand still', () => {
  const straight: Point[] = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
  ];

  it('on a directed line: the first half a spacing from the from end, then every spacing', () => {
    const places = stillPlaces(straight, { spacing: 250, speed: 120, directed: true });
    expect(places.map((each) => each.x)).toEqual([125, 375, 625, 875]);
    expect(places.every((each) => each.angle === 0)).toBe(true);
  });

  it('on an undirected line: from both ends toward the middle, each half its own', () => {
    const places = stillPlaces(straight, { spacing: 250, speed: 120, directed: false });
    expect(places.map((each) => each.x)).toEqual([125, 375, 875, 625]);
    expect(places.slice(0, 2).every((each) => each.angle === 0)).toBe(true);
    expect(places.slice(2).every((each) => headsLeft(each.angle))).toBe(true);
  });

  it('moving, each traveler goes from the from end toward the to end', () => {
    const route = measureRoute(straight);
    const at = (seconds: number) => {
      const xs: number[] = [];
      eachTraveler(route, { spacing: 250, speed: 120, directed: true }, seconds, place(), (each) =>
        xs.push(each.x),
      );
      return xs;
    };
    expect(at(0)).toEqual([125, 375, 625, 875]);
    expect(at(1)).toEqual([245, 495, 745, 995]);
    // The last comes back at the start as it leaves the end.
    expect(at(1.5)[0]).toBeCloseTo(55);
  });
});

describe('which lines carry travelers', () => {
  it('none on a line shorter on screen than twice its traveler', () => {
    expect(carriesAt(40, 20, 1)).toBe(true);
    expect(carriesAt(39, 20, 1)).toBe(false);
    expect(carriesAt(100, 20, 0.25)).toBe(false);
    expect(carriesAt(160, 20, 0.25)).toBe(true);
  });

  const box = (x: number): Rect => ({ x, y: 0, width: 10, height: 10 });

  it('all of them when they fit in a frame', () => {
    const candidates: Candidate[] = [
      { bounds: box(0), count: 3 },
      { bounds: box(100), count: 4 },
    ];
    expect(chooseLines(candidates, { x: 0, y: 0 }, 7)).toEqual([0, 1]);
  });

  it('past the most a frame draws, those nearest the screen center, nearest first', () => {
    const candidates: Candidate[] = [
      { bounds: box(-500), count: 3 },
      { bounds: box(20), count: 3 },
      { bounds: box(0), count: 3 },
      { bounds: box(300), count: 3 },
    ];
    expect(chooseLines(candidates, { x: 5, y: 5 }, 7)).toEqual([2, 1]);
  });

  it('never more than the most, and every line kept nearer than one left out', () => {
    const candidate = fc.record({
      x: fc.integer({ min: -1000, max: 1000 }),
      count: fc.integer({ min: 1, max: 50 }),
    });
    fc.assert(
      fc.property(
        fc.array(candidate, { maxLength: 40 }),
        fc.integer({ min: 1, max: 200 }),
        (made, most) => {
          const candidates = made.map(({ x, count }) => ({ bounds: box(x), count }));
          const kept = chooseLines(candidates, { x: 0, y: 0 }, most);
          const total = kept.reduce(
            (sum, index) => sum + (candidates[index] as Candidate).count,
            0,
          );
          const all = candidates.reduce((sum, each) => sum + each.count, 0);
          expect(total).toBeLessThanOrEqual(Math.max(most, all <= most ? all : 0));
          if (all > most) {
            const keptSet = new Set(kept);
            const farthestKept = Math.max(
              -1,
              ...kept.map((index) =>
                distanceToRect({ x: 0, y: 0 }, (candidates[index] as Candidate).bounds),
              ),
            );
            for (const [index, each] of candidates.entries()) {
              if (keptSet.has(index)) continue;
              expect(distanceToRect({ x: 0, y: 0 }, each.bounds)).toBeGreaterThanOrEqual(
                farthestKept,
              );
            }
          }
        },
      ),
    );
  });

  it('draws at most 2,000 a frame', () => {
    expect(MOST_TRAVELERS).toBe(2000);
  });
});

describe('a traveler picture', () => {
  it('keeps its proportions, its larger side the size', () => {
    expect(sizedPicture({ width: 30, height: 15 }, 20)).toEqual({ width: 20, height: 10 });
    expect(sizedPicture({ width: 10, height: 40 }, 20)).toEqual({ width: 5, height: 20 });
  });
});
