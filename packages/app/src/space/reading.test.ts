/**
 * The physical-space panel's ways of reading (ADR 0076) as what the tab keeps: a cut across an axis,
 * moved within what the panel draws and keeping one side; the exploded view from 0 to 2; Names and
 * Relations of the selection; and Show World, which keeps them but the camera and the cut. What says
 * nothing is left out, as view states write it.
 */
import { MAX_SPACE_DISTANCE, spaceOf } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { workcell } from '../test/space';
import {
  cutAcross,
  cutAt,
  cutKeeping,
  cutRangeOf,
  CUT_STEPS,
  exploded,
  explodeBetween,
  showingWorld,
  spaceBoundsOf,
  switched,
} from './reading';

const CAMERA = { target: { x: 0, y: 1, z: 0 }, azimuth: 30, elevation: 20, distance: 5 };

describe('the bounds of what the panel draws', () => {
  it('hold each solid where it is placed and each other entry’s origin', () => {
    const project = workcell();
    const bounds = spaceBoundsOf(spaceOf(project, project.views[0]));
    // The table at the origin, the camera 80 cm over it, the arm's solid 2 m to the right.
    expect(bounds).toEqual({ min: { x: 0, y: 0, z: -1 }, max: { x: 3, y: 2, z: 1 } });
    expect(spaceBoundsOf({ entries: new Map(), faint: new Map() })).toBeUndefined();
  });
});

describe('the cut', () => {
  const bounds = { min: { x: 0, y: 0, z: -1 }, max: { x: 3, y: 2, z: 1 } };

  it('moves a little past what the panel draws, and holds where it crosses now', () => {
    const y = cutRangeOf(bounds, 'y');
    expect(y.min).toBeCloseTo(-0.1);
    expect(y.max).toBeCloseTo(2.1);
    expect(y.step).toBeCloseTo(2.2 / CUT_STEPS);
    expect(cutRangeOf(bounds, 'y', 5).max).toBe(5);
    // A point alone, or nothing drawn: a meter either way.
    const point = { min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } };
    expect(cutRangeOf(point, 'x')).toEqual({ min: 0, max: 2, step: 2 / CUT_STEPS });
    expect(cutRangeOf(undefined, 'x')).toEqual({ min: -1, max: 1, step: 2 / CUT_STEPS });
    const far = {
      min: { x: -MAX_SPACE_DISTANCE, y: 0, z: 0 },
      max: { x: MAX_SPACE_DISTANCE, y: 0, z: 0 },
    };
    expect(cutRangeOf(far, 'x').min).toBe(-MAX_SPACE_DISTANCE);
  });

  it('crosses a new axis at the middle, keeping below, and keeps its side on another axis', () => {
    const cut = cutAcross({ names: true }, 'y', bounds);
    expect(cut).toEqual({ names: true, cut: { axis: 'y', at: 1, keep: 'below' } });
    const above = cutKeeping(cut, 'above');
    expect(cutAcross(above, 'x', bounds).cut).toEqual({ axis: 'x', at: 1.5, keep: 'above' });
    expect(cutAcross(above, 'y', bounds)).toBe(above);
    expect(cutAcross(above, undefined, bounds)).toEqual({ names: true });
  });

  it('moves along its axis within where a cut may go, and nothing while there is none', () => {
    const cut = cutAcross({}, 'z', bounds);
    expect(cutAt(cut, 0.25).cut?.at).toBe(0.25);
    expect(cutAt(cut, 1e9).cut?.at).toBe(MAX_SPACE_DISTANCE);
    expect(cutAt(cut, Number.NaN)).toBe(cut);
    expect(cutAt({}, 1)).toEqual({});
    expect(cutKeeping({}, 'above')).toEqual({});
  });
});

describe('the exploded view, Names and Relations of the selection', () => {
  it('explode from 0 to 2, left out at 0', () => {
    expect(exploded({}, 1.25)).toEqual({ explode: 1.25 });
    expect(exploded({ explode: 1 }, 3)).toEqual({ explode: 2 });
    expect(exploded({ explode: 1, names: true }, 0)).toEqual({ names: true });
    expect(exploded({ explode: 1 }, -1)).toEqual({});
  });

  it('eases from one factor to the other', () => {
    expect(explodeBetween(0, 2, 0)).toBe(0);
    expect(explodeBetween(0, 2, 0.5)).toBe(1);
    expect(explodeBetween(0, 2, 1)).toBe(2);
    expect(explodeBetween(2, 0, 2)).toBe(0);
  });

  it('turn Names and Relations of the selection on, and leave them out when off', () => {
    expect(switched({}, 'names', true)).toEqual({ names: true });
    expect(switched({ names: true, relations: true }, 'relations', false)).toEqual({
      names: true,
    });
  });
});

describe('Show World', () => {
  it('keeps the ways of reading but the camera and the cut, which are in the element’s coordinates', () => {
    expect(
      showingWorld({
        root: 'arm',
        camera: CAMERA,
        cut: { axis: 'x', at: 0, keep: 'below' },
        explode: 1,
        names: true,
        relations: true,
      }),
    ).toEqual({ explode: 1, names: true, relations: true });
  });
});
