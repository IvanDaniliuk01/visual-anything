import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TourMove } from './camera';
import { tourCameraPath } from './camera';
import {
  MAX_TOUR_TRANSITION,
  TOUR_CROSS_FADE,
  TOUR_FADE_IN,
  TOUR_FADE_OUT,
  advanceAfter,
  readingTime,
  stepReadingTime,
  tourTransition,
} from './timing';

const SCREEN = { width: 1000, height: 600 };
const ease = (duration: number): TourMove => ({
  kind: 'ease',
  duration,
  path: tourCameraPath({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 0, zoom: 1 }, SCREEN),
});

describe('tourTransition', () => {
  it('fades out, moves the camera, then fades in, one after the other', () => {
    const transition = tourTransition(ease(400), { fades: true });
    expect(transition.out).toEqual({ start: 0, duration: TOUR_FADE_OUT });
    expect(transition.camera).toEqual({ kind: 'ease', start: TOUR_FADE_OUT, duration: 400 });
    expect(transition.in).toEqual({ start: TOUR_FADE_OUT + 400, duration: TOUR_FADE_IN });
    expect(transition.total).toBe(TOUR_FADE_OUT + 400 + TOUR_FADE_IN);
  });

  it('cross-fades where the camera cuts, and keeps it still for two steps of one scene', () => {
    const cut = tourTransition({ kind: 'cut' }, { fades: true });
    expect(cut.camera).toEqual({ kind: 'cut', start: TOUR_FADE_OUT, duration: TOUR_CROSS_FADE });
    const stay = tourTransition('stay', { fades: true });
    expect(stay.camera).toEqual({ kind: 'stay', start: TOUR_FADE_OUT, duration: 0 });
    expect(stay.total).toBe(TOUR_FADE_OUT + TOUR_FADE_IN);
  });

  it('with fades off, fades at once and cuts plainly, but still moves the camera', () => {
    expect(tourTransition({ kind: 'cut' }, { fades: false }).total).toBe(0);
    const moved = tourTransition(ease(500), { fades: false });
    expect(moved.camera).toEqual({ kind: 'ease', start: 0, duration: 500 });
    expect(moved.total).toBe(500);
  });

  it('never lasts past 1.1 s: the marks start to fade in before the longest move ends', () => {
    const longest = tourTransition(ease(800), { fades: true });
    expect(longest.total).toBe(MAX_TOUR_TRANSITION);
    expect(longest.in.start).toBe(MAX_TOUR_TRANSITION - TOUR_FADE_IN);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant<TourMove | 'stay'>('stay'),
          fc.constant<TourMove | 'stay'>({ kind: 'cut' }),
          fc.integer({ min: 250, max: 800 }).map(ease),
        ),
        fc.boolean(),
        (move, fades) => {
          const { out, camera, in: fadeIn, total } = tourTransition(move, { fades });
          expect(total).toBeLessThanOrEqual(MAX_TOUR_TRANSITION);
          expect(camera.start).toBe(out.start + out.duration);
          expect(fadeIn.start).toBeGreaterThanOrEqual(camera.start);
          expect(total).toBe(
            Math.max(camera.start + camera.duration, fadeIn.start + fadeIn.duration),
          );
        },
      ),
    );
  });
});

describe('reading a step', () => {
  it('takes 300 ms a word, at 200 words a minute', () => {
    expect(readingTime('')).toBe(0);
    expect(readingTime('  one   two\nthree ')).toBe(900);
  });

  it('reads the caption and every reveal', () => {
    const step = {
      caption: { title: 'The API', text: 'It takes the request.' },
      reveal: [{ marks: ['db'], text: 'Then the database.' }, { marks: ['queue'] }],
    };
    expect(stepReadingTime(step)).toBe(
      readingTime('The API It takes the request. Then the database.'),
    );
  });

  it('moves on after its time, never before its text is read, or after its scenario', () => {
    const caption = { title: 'One two three four five six seven eight nine ten' };
    expect(advanceAfter({ caption })).toBeUndefined();
    expect(advanceAfter({ caption, advance: 10_000 })).toBe(10_000);
    expect(advanceAfter({ caption, advance: 500 })).toBe(3000);
    expect(advanceAfter({ caption, advance: 'after-scenario' })).toBe('after-scenario');
  });
});
