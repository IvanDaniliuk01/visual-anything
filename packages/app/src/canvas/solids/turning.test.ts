/**
 * Turning's camera (ADR 0075): what the pointer, the wheel and the keys do, and where the solid is
 * announced to be seen from.
 */
import fc from 'fast-check';
import type { SolidCamera } from '@visual-anything/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { resetLanguageForTests, setCurrentLanguage } from '../../i18n/language';
import {
  TURN_BIG_STEP,
  TURN_STEP,
  TURN_ZOOM,
  seenFrom,
  turnAnnouncement,
  turnKey,
  turnedByDrag,
  zoomedByWheel,
} from './turning';

const START: SolidCamera = { azimuth: 30, elevation: 20 };

function cameraAfter(key: string, shiftKey = false, from: SolidCamera = START): SolidCamera {
  const done = turnKey({ key, shiftKey }, from, START);
  if (done.kind !== 'camera') throw new Error(`${key} did not turn the solid.`);
  return done.camera;
}

describe('turning’s keys', () => {
  it('turns by 15° with an arrow and by 90° with Shift and an arrow', () => {
    expect(cameraAfter('ArrowLeft')).toEqual({ azimuth: 30 + TURN_STEP, elevation: 20 });
    expect(cameraAfter('ArrowRight')).toEqual({ azimuth: 30 - TURN_STEP, elevation: 20 });
    expect(cameraAfter('ArrowUp')).toEqual({ azimuth: 30, elevation: 20 + TURN_STEP });
    expect(cameraAfter('ArrowDown')).toEqual({ azimuth: 30, elevation: 20 - TURN_STEP });
    expect(cameraAfter('ArrowLeft', true)).toEqual({ azimuth: 30 + TURN_BIG_STEP, elevation: 20 });
    expect(cameraAfter('ArrowDown', true)).toEqual({ azimuth: 30, elevation: -70 });
  });

  it('goes round past the back, and stops short of straight above or below', () => {
    expect(cameraAfter('ArrowLeft', true, { azimuth: 150, elevation: 0 }).azimuth).toBe(-120);
    expect(cameraAfter('ArrowRight', true, { azimuth: -150, elevation: 0 }).azimuth).toBe(120);
    expect(cameraAfter('ArrowUp', true, { azimuth: 0, elevation: 20 }).elevation).toBe(89);
    expect(cameraAfter('ArrowDown', true, { azimuth: 0, elevation: -20 }).elevation).toBe(-89);
  });

  it('zooms with + and −, within its bounds, and 0 goes back to where it started', () => {
    expect(cameraAfter('+').zoom).toBe(1.25);
    expect(cameraAfter('=').zoom).toBe(1.25);
    expect(cameraAfter('-').zoom).toBe(0.8);
    expect(cameraAfter('+', false, { ...START, zoom: 16 }).zoom).toBe(TURN_ZOOM.most);
    expect(cameraAfter('-', false, { ...START, zoom: 0.25 }).zoom).toBe(TURN_ZOOM.least);
    // Back at 1, a zoom is left out.
    expect(cameraAfter('-', false, { ...START, zoom: 1.25 })).toEqual(START);
    expect(cameraAfter('0', false, { azimuth: -100, elevation: 60, zoom: 3 })).toBe(START);
  });

  it('ends with Escape, and leaves other keys and keys with modifiers to the canvas', () => {
    expect(turnKey({ key: 'Escape' }, START, START)).toEqual({ kind: 'end' });
    expect(turnKey({ key: 'Delete' }, START, START)).toEqual({ kind: 'none' });
    expect(turnKey({ key: 'ArrowLeft', ctrlKey: true }, START, START)).toEqual({ kind: 'none' });
    expect(turnKey({ key: 't' }, START, START)).toEqual({ kind: 'none' });
  });

  it('keeps every camera it makes within its bounds (property)', () => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '0'];
    fc.assert(
      fc.property(
        fc.array(fc.record({ key: fc.constantFrom(...keys), shiftKey: fc.boolean() }), {
          maxLength: 40,
        }),
        (presses) => {
          let camera = START;
          for (const press of presses) {
            const done = turnKey(press, camera, START);
            if (done.kind === 'camera') camera = done.camera;
          }
          expect(camera.azimuth).toBeGreaterThan(-180);
          expect(camera.azimuth).toBeLessThanOrEqual(180);
          expect(Math.abs(camera.elevation)).toBeLessThanOrEqual(89);
          expect(camera.zoom ?? 1).toBeGreaterThanOrEqual(TURN_ZOOM.least);
          expect(camera.zoom ?? 1).toBeLessThanOrEqual(TURN_ZOOM.most);
        },
      ),
    );
  });
});

describe('turning by the pointer and the wheel', () => {
  it('turns half a turn across the picture’s width, and raises the camera for a drag down', () => {
    expect(turnedByDrag(START, 200, 0, 400)).toEqual({ azimuth: -60, elevation: 20 });
    expect(turnedByDrag(START, 0, 40, 400)).toEqual({ azimuth: 30, elevation: 38 });
  });

  it('zooms toward the solid for a wheel turned away', () => {
    expect(zoomedByWheel(START, -500).zoom).toBe(2);
    expect(zoomedByWheel(START, 500).zoom).toBe(0.5);
  });
});

describe('where the solid is seen from', () => {
  afterEach(() => resetLanguageForTests());

  it('names the side and the height', () => {
    expect(seenFrom(START)).toEqual({ side: 'front left', height: 'above' });
    expect(seenFrom({ azimuth: 0, elevation: 0 })).toEqual({ side: 'front', height: 'level' });
    expect(seenFrom({ azimuth: -90, elevation: -40 })).toEqual({ side: 'right', height: 'below' });
    expect(seenFrom({ azimuth: 180, elevation: 0 }).side).toBe('back');
    expect(seenFrom({ azimuth: -170, elevation: 0 }).side).toBe('back');
    expect(seenFrom({ azimuth: 135, elevation: 0 }).side).toBe('back left');
    expect(seenFrom({ azimuth: -135, elevation: 0 }).side).toBe('back right');
    expect(seenFrom({ azimuth: -45, elevation: 0 }).side).toBe('front right');
  });

  it('announces it with the shape’s name, in English and in Spanish', () => {
    expect(turnAnnouncement('Arm', START)).toBe('Arm, seen from the front left, above');
    expect(turnAnnouncement('Arm', { azimuth: 0, elevation: 0 })).toBe('Arm, seen from the front');
    expect(turnAnnouncement('Arm', { azimuth: 90, elevation: -30 })).toBe(
      'Arm, seen from the left, below',
    );
    setCurrentLanguage('es');
    expect(turnAnnouncement('Brazo', START)).toBe(
      'Brazo, visto desde adelante a la izquierda, desde arriba',
    );
    expect(turnAnnouncement('Brazo', { azimuth: 180, elevation: 0 })).toBe(
      'Brazo, visto desde atrás',
    );
  });
});
