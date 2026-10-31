/**
 * How the physical-space panel's camera moves (ADR 0076): its travel in quarter turns, doublings and
 * target moves; eased up to three over 250 ms plus 150 ms each, at most 700 ms; cut past three, from
 * no camera, into another element shown, and under reduced motion.
 */
import type { SpaceCamera } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_SPACE_MOVE_TIME, spaceCameraBetween, spaceMove, spaceTravel } from './travel';

const AT: SpaceCamera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 2 };
const EASED = { reducedMotion: false, sameRoot: true };

describe('the panel’s camera travel', () => {
  it('counts quarter turns of its direction', () => {
    expect(spaceTravel(AT, { ...AT, azimuth: 90 })).toBeCloseTo(1);
    expect(spaceTravel(AT, { ...AT, azimuth: -180 })).toBeCloseTo(2);
    expect(spaceTravel(AT, { ...AT, elevation: 45 })).toBeCloseTo(0.5);
  });

  it('counts doublings and halvings of its distance', () => {
    expect(spaceTravel(AT, { ...AT, distance: 8 })).toBeCloseTo(2);
    expect(spaceTravel(AT, { ...AT, distance: 1 })).toBeCloseTo(1);
  });

  it('counts moves of its target by the nearer of its distances', () => {
    expect(spaceTravel(AT, { ...AT, target: { x: 3, y: 0, z: 4 } })).toBeCloseTo(2.5);
    // From 2 m to 1 m, a move of 1 m counts as one distance, and the halving as one more.
    expect(spaceTravel(AT, { ...AT, distance: 1, target: { x: 1, y: 0, z: 0 } })).toBeCloseTo(2);
  });
});

describe('the panel’s camera moves', () => {
  it('eases up to three over 250 ms plus 150 ms each, by a tour’s ease', () => {
    const to = { ...AT, azimuth: 90 };
    const move = spaceMove(AT, to, EASED);
    expect(move).toMatchObject({ kind: 'ease', duration: 400 });
    if (move.kind !== 'ease') return;
    expect(move.at(0)).toBe(AT);
    expect(move.at(1)).toBe(to);
    expect(move.at(0.5).azimuth).toBeCloseTo(45);
    // Sinusoidal: a quarter of the time is less than a quarter of the way.
    expect(move.at(0.25).azimuth).toBeLessThan(22.5);
    const three = spaceMove(AT, { ...AT, distance: 16 }, EASED);
    expect(three).toMatchObject({ kind: 'ease', duration: MAX_SPACE_MOVE_TIME });
    expect(MAX_SPACE_MOVE_TIME).toBe(700);
  });

  it('cuts past three, from no camera, into another element shown and under reduced motion', () => {
    expect(spaceMove(AT, { ...AT, distance: 17 }, EASED)).toEqual({ kind: 'cut' });
    expect(spaceMove(undefined, AT, EASED)).toEqual({ kind: 'cut' });
    expect(spaceMove(AT, { ...AT, azimuth: 10 }, { ...EASED, sameRoot: false })).toEqual({
      kind: 'cut',
    });
    expect(spaceMove(AT, { ...AT, azimuth: 10 }, { ...EASED, reducedMotion: true })).toEqual({
      kind: 'cut',
    });
  });

  it('stays where it is already', () => {
    expect(spaceMove(AT, { ...AT }, EASED)).toEqual({ kind: 'stay' });
  });

  it('turns the short way round', () => {
    const from = { ...AT, azimuth: 170 };
    const to = { ...AT, azimuth: -170 };
    expect(spaceTravel(from, to)).toBeCloseTo(20 / 90);
    expect(spaceCameraBetween(from, to, 0.5).azimuth).toBeCloseTo(180);
    expect(spaceCameraBetween(from, to, 0.75).azimuth).toBeCloseTo(-175);
  });

  it('keeps each camera between within a view state’s bounds', () => {
    const camera = fc.record({
      target: fc.record({
        x: fc.double({ min: -1e3, max: 1e3, noNaN: true }),
        y: fc.double({ min: -1e3, max: 1e3, noNaN: true }),
        z: fc.double({ min: -1e3, max: 1e3, noNaN: true }),
      }),
      azimuth: fc.double({ min: -180, max: 180, noNaN: true }),
      elevation: fc.double({ min: -89, max: 89, noNaN: true }),
      distance: fc.double({ min: 1e-3, max: 1e6, noNaN: true }),
    });
    fc.assert(
      fc.property(camera, camera, fc.double({ min: 0, max: 1, noNaN: true }), (a, b, part) => {
        const at = spaceCameraBetween(a, b, part);
        expect(at.azimuth).toBeGreaterThanOrEqual(-180);
        expect(at.azimuth).toBeLessThanOrEqual(180);
        expect(at.elevation).toBeGreaterThanOrEqual(-89);
        expect(at.elevation).toBeLessThanOrEqual(89);
        expect(at.distance).toBeGreaterThan(0);
        const move = spaceMove(a, b, EASED);
        if (move.kind === 'ease') expect(move.duration).toBeLessThanOrEqual(700);
      }),
    );
  });
});
