// @vitest-environment node
/**
 * The panel's camera while it is open (ADR 0076): kept by the tab for the view, one write a frame
 * while a drag moves it, eased to what Fit answers, and cut under reduced motion.
 */
import type { SpaceCamera } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { SpaceDrawing } from '../solids/solid-client';
import { SPACE_CAMERA_EASE, SpaceControl } from './control';
import { SpacePanelStore } from './store';

const A: SpaceCamera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 1 };
const B: SpaceCamera = { target: { x: 2, y: 0, z: 0 }, azimuth: 90, elevation: 30, distance: 4 };

function setUp() {
  const queue: (() => void)[] = [];
  const frames = {
    request: (callback: () => void) => queue.push(callback),
    cancel: (handle: number) => {
      queue[handle - 1] = () => {};
    },
  };
  let time = 0;
  const store = new SpacePanelStore({ frames, windowWidth: () => 1600 });
  store.open('v', {});
  const control = new SpaceControl(store, 'v', { frames, now: () => time });
  const runFrame = (advance = 0) => {
    time += advance;
    const now = queue.splice(0);
    for (const each of now) each();
  };
  const drawing = {
    frame: { camera: A },
    fit: (elements?: readonly string[]) =>
      Promise.resolve(elements?.[0] === 'none' ? undefined : B),
  } as unknown as SpaceDrawing;
  return { store, control, runFrame, drawing };
}

describe('the panel’s camera', () => {
  it('starts from the newest frame’s camera, and writes a drag’s cameras once a frame', () => {
    const { store, control, runFrame, drawing } = setUp();
    expect(control.camera()).toBeUndefined();
    control.attach(drawing);
    expect(control.camera()).toBe(A);
    control.setCamera(B);
    control.setCamera(A);
    expect(control.camera()).toBe(A);
    expect(store.state('v')?.camera).toBeUndefined();
    runFrame();
    expect(store.state('v')).toEqual({ camera: A });
  });

  it('eases to what Fit answers, and cuts under reduced motion', async () => {
    const { store, control, runFrame, drawing } = setUp();
    control.attach(drawing);
    expect(await control.fit()).toBe(true);
    runFrame(SPACE_CAMERA_EASE / 2);
    const halfway = store.state('v')?.camera;
    expect(halfway?.distance).toBeGreaterThan(1);
    expect(halfway?.distance).toBeLessThan(4);
    runFrame(SPACE_CAMERA_EASE);
    expect(store.state('v')?.camera).toEqual(B);
    control.setReduced(true);
    control.moveTo(A);
    expect(store.state('v')?.camera).toEqual(A);
    expect(await control.fit(['none'])).toBe(false);
    control.dispose();
    expect(await control.fit()).toBe(false);
  });

  it('writes nothing once the panel is closed', () => {
    const { store, control, runFrame } = setUp();
    store.close('v');
    control.setCamera(B);
    runFrame();
    expect(store.state('v')).toBeUndefined();
  });
});
