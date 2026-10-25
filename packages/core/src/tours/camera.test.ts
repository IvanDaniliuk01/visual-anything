import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_TOUR_MOVE_TIME,
  MAX_TOUR_TRAVEL,
  TOUR_MOVE_TIME,
  easeInOut,
  tourMove,
  tourTravel,
} from './camera';

const SCREEN = { width: 1000, height: 600 };
const HERE = { x: 0, y: 0, zoom: 1 };
const MOVE = { reducedMotion: false, sameView: true };

describe('tourTravel', () => {
  it('counts the move of the middle in screen widths, at the nearer zoom', () => {
    expect(tourTravel(HERE, { x: 1000, y: 0, zoom: 1 }, SCREEN)).toBe(1);
    expect(tourTravel(HERE, { x: 0, y: 2000, zoom: 1 }, SCREEN)).toBe(2);
    // Zoomed out to a half, a pan of 2000 canvas units shows as 1000 pixels, and the zoom one more.
    expect(tourTravel(HERE, { x: 2000, y: 0, zoom: 0.5 }, SCREEN)).toBe(2);
  });

  it('counts each doubling or halving of the zoom as a screen width', () => {
    expect(tourTravel(HERE, { x: 0, y: 0, zoom: 4 }, SCREEN)).toBe(2);
    expect(tourTravel(HERE, { x: 0, y: 0, zoom: 0.125 }, SCREEN)).toBe(3);
  });

  it('is the same both ways', () => {
    const camera = fc.record({
      x: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      y: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      zoom: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    });
    fc.assert(
      fc.property(camera, camera, (a, b) => {
        expect(tourTravel(a, b, SCREEN)).toBeCloseTo(tourTravel(b, a, SCREEN), 6);
      }),
    );
  });
});

describe('tourMove', () => {
  it('eases a short move, for longer the farther it goes', () => {
    const near = tourMove(HERE, { x: 100, y: 0, zoom: 1 }, SCREEN, MOVE);
    const far = tourMove(HERE, { x: 2500, y: 0, zoom: 1 }, SCREEN, MOVE);
    expect(near).toEqual({ kind: 'ease', duration: TOUR_MOVE_TIME + 15 });
    expect(far).toEqual({ kind: 'ease', duration: 625 });
  });

  it('cuts past three screen widths of travel, a long zoom flight included', () => {
    expect(tourMove(HERE, { x: 3001, y: 0, zoom: 1 }, SCREEN, MOVE)).toEqual({ kind: 'cut' });
    expect(tourMove(HERE, { x: 0, y: 0, zoom: 0.1 }, SCREEN, MOVE)).toEqual({ kind: 'cut' });
  });

  it('cuts under reduced motion, into another view, from no camera, and for no move at all', () => {
    const to = { x: 100, y: 0, zoom: 1 };
    expect(tourMove(HERE, to, SCREEN, { ...MOVE, reducedMotion: true })).toEqual({ kind: 'cut' });
    expect(tourMove(HERE, to, SCREEN, { ...MOVE, sameView: false })).toEqual({ kind: 'cut' });
    expect(tourMove(undefined, to, SCREEN, MOVE)).toEqual({ kind: 'cut' });
    expect(tourMove(HERE, HERE, SCREEN, MOVE)).toEqual({ kind: 'cut' });
  });

  it('never eases a move past the cap, nor for longer than its longest time', () => {
    const camera = fc.record({
      x: fc.double({ min: -1e7, max: 1e7, noNaN: true }),
      y: fc.double({ min: -1e7, max: 1e7, noNaN: true }),
      zoom: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    });
    fc.assert(
      fc.property(camera, camera, fc.boolean(), (a, b, reducedMotion) => {
        const move = tourMove(a, b, SCREEN, { reducedMotion, sameView: true });
        if (move.kind === 'ease') {
          expect(reducedMotion).toBe(false);
          expect(tourTravel(a, b, SCREEN)).toBeLessThanOrEqual(MAX_TOUR_TRAVEL);
          expect(move.duration).toBeGreaterThanOrEqual(TOUR_MOVE_TIME);
          expect(move.duration).toBeLessThanOrEqual(MAX_TOUR_MOVE_TIME);
        }
      }),
    );
  });
});

describe('easeInOut', () => {
  it('starts at 0, ends at 1, passes the middle at the middle and never goes back', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [low, high] = a < b ? [a, b] : [b, a];
          expect(easeInOut(low)).toBeLessThanOrEqual(easeInOut(high));
        },
      ),
    );
  });
});
