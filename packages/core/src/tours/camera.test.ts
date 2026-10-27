import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_TOUR_MOVE_TIME,
  MAX_TOUR_ZOOM_OUT,
  TOUR_MOVE_TIME,
  TOUR_MOVE_TIME_PER_UNIT,
  easeInOut,
  tourCameraPath,
  tourEase,
  tourMove,
} from './camera';

const SCREEN = { width: 1000, height: 600 };
const HERE = { x: 0, y: 0, zoom: 1 };
const MOVE = { reducedMotion: false, sameView: true };

const camera = fc.record({
  x: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  y: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  zoom: fc.double({ min: 0.001, max: 1000, noNaN: true }),
});

/** The width of the view a camera shows, in canvas units, on the screen. */
const widthOf = (zoom: number) => SCREEN.width / zoom;

describe('tourCameraPath', () => {
  it('starts and ends exactly at its two cameras', () => {
    fc.assert(
      fc.property(camera, camera, (a, b) => {
        const path = tourCameraPath(a, b, SCREEN);
        expect(path.at(0)).toEqual(a);
        expect(path.at(1)).toEqual(b);
      }),
    );
  });

  it('is as long both ways, and never shorter than its zoom alone asks', () => {
    fc.assert(
      fc.property(camera, camera, (a, b) => {
        const there = tourCameraPath(a, b, SCREEN).length;
        const back = tourCameraPath(b, a, SCREEN).length;
        expect(there).toBeGreaterThanOrEqual(0);
        expect(there).toBeCloseTo(back, 6);
        expect(there + 1e-9).toBeGreaterThanOrEqual(Math.abs(Math.log(a.zoom / b.zoom)));
      }),
    );
  });

  it('zooms out on a pan to keep both places in sight, and back in', () => {
    // Four and a half screen widths apart, at the same zoom.
    const path = tourCameraPath(HERE, { x: 4500, y: 0, zoom: 1 }, SCREEN);
    const middle = path.at(0.5);
    expect(middle.x).toBeCloseTo(2250, 6);
    expect(middle.zoom).toBeLessThan(1);
    expect(path.zoomOut).toBeCloseTo(widthOf(middle.zoom) / widthOf(1), 6);
    expect(path.zoomOut).toBeLessThan(MAX_TOUR_ZOOM_OUT);
    expect(path.length).toBeCloseTo(2 * Math.asinh(2.25), 9);
  });

  it('only zooms, about its moving middle, when the middle does not move', () => {
    const path = tourCameraPath(HERE, { x: 0, y: 0, zoom: 4 }, SCREEN);
    expect(path.length).toBeCloseTo(Math.log(4), 9);
    expect(path.zoomOut).toBe(1);
    expect(path.at(0.5).zoom).toBeCloseTo(2, 9);
  });

  it('never shows wider than its widest view, nor narrower than its ends', () => {
    fc.assert(
      fc.property(camera, camera, fc.double({ min: 0, max: 1, noNaN: true }), (a, b, part) => {
        const path = tourCameraPath(a, b, SCREEN);
        const width = widthOf(path.at(part).zoom);
        const wider = Math.max(widthOf(a.zoom), widthOf(b.zoom));
        const narrower = Math.min(widthOf(a.zoom), widthOf(b.zoom));
        expect(width).toBeLessThanOrEqual(wider * path.zoomOut * (1 + 1e-6));
        expect(width).toBeGreaterThanOrEqual(narrower * (1 - 1e-6));
      }),
    );
  });
});

describe('tourMove', () => {
  it('moves along the path for longer the longer it is', () => {
    const near = tourMove(HERE, { x: 100, y: 0, zoom: 1 }, SCREEN, MOVE);
    const far = tourMove(HERE, { x: 2500, y: 0, zoom: 1 }, SCREEN, MOVE);
    expect(near.kind).toBe('ease');
    expect(far.kind).toBe('ease');
    if (near.kind !== 'ease' || far.kind !== 'ease') return;
    expect(near.duration).toBe(
      Math.round(TOUR_MOVE_TIME + TOUR_MOVE_TIME_PER_UNIT * near.path.length),
    );
    expect(far.duration).toBeGreaterThan(near.duration);
    expect(far.path.at(1)).toEqual({ x: 2500, y: 0, zoom: 1 });
  });

  it('glides up to about four and a half screen widths at one zoom, and cuts past', () => {
    expect(tourMove(HERE, { x: 4500, y: 0, zoom: 1 }, SCREEN, MOVE).kind).toBe('ease');
    expect(tourMove(HERE, { x: 5000, y: 0, zoom: 1 }, SCREEN, MOVE)).toEqual({ kind: 'cut' });
  });

  it('glides into a detail and out to an overview, and cuts a zoom that would take too long', () => {
    expect(tourMove(HERE, { x: 0, y: 0, zoom: 8 }, SCREEN, MOVE).kind).toBe('ease');
    expect(tourMove(HERE, { x: 300, y: 200, zoom: 0.125 }, SCREEN, MOVE).kind).toBe('ease');
    // A zoom of 100 times would take past 800 ms.
    expect(tourMove(HERE, { x: 0, y: 0, zoom: 100 }, SCREEN, MOVE)).toEqual({ kind: 'cut' });
  });

  it('cuts under reduced motion, into another view, from no camera, and for no move at all', () => {
    const to = { x: 100, y: 0, zoom: 1 };
    expect(tourMove(HERE, to, SCREEN, { ...MOVE, reducedMotion: true })).toEqual({ kind: 'cut' });
    expect(tourMove(HERE, to, SCREEN, { ...MOVE, sameView: false })).toEqual({ kind: 'cut' });
    expect(tourMove(undefined, to, SCREEN, MOVE)).toEqual({ kind: 'cut' });
    expect(tourMove(HERE, HERE, SCREEN, MOVE)).toEqual({ kind: 'cut' });
  });

  it('never glides past its bounds, nor for longer than its longest time', () => {
    fc.assert(
      fc.property(camera, camera, fc.boolean(), (a, b, reducedMotion) => {
        const move = tourMove(a, b, SCREEN, { reducedMotion, sameView: true });
        if (move.kind !== 'ease') return;
        expect(reducedMotion).toBe(false);
        expect(move.path.zoomOut).toBeLessThanOrEqual(MAX_TOUR_ZOOM_OUT);
        expect(move.duration).toBeGreaterThanOrEqual(TOUR_MOVE_TIME);
        expect(move.duration).toBeLessThanOrEqual(MAX_TOUR_MOVE_TIME);
      }),
    );
  });
});

describe('the eases', () => {
  it('start at 0, end at 1, pass the middle at the middle and never go back', () => {
    for (const ease of [tourEase, easeInOut]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(0.5)).toBeCloseTo(0.5, 12);
      expect(ease(-1)).toBe(0);
      expect(ease(2)).toBe(1);
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (a, b) => {
            const [low, high] = a < b ? [a, b] : [b, a];
            expect(ease(low)).toBeLessThanOrEqual(ease(high));
          },
        ),
      );
    }
  });

  it('a tour moves fastest at its middle, as a sinusoid does', () => {
    const speed = (at: number) => (tourEase(at + 0.001) - tourEase(at)) / 0.001;
    expect(speed(0.5)).toBeGreaterThan(speed(0.25));
    expect(speed(0.5)).toBeCloseTo(Math.PI / 2, 2);
  });
});
