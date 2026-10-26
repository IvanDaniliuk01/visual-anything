import { MAX_TOUR_MOVE_TIME } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { visibleRect, type Camera } from '../canvas/camera';
import type { Rect } from '../canvas/geometry';
import { buildScene } from '../canvas/scene';
import { loadSample } from '../test/sample';
import type { CanvasCamera } from '../view-state/canvas';
import { FOLLOW_MARGIN, PlaybackFollower, followCamera, stepBounds } from './follow';

const viewport = { width: 1000, height: 600 };

describe('stepBounds', () => {
  const scene = buildScene(loadSample(), 'system-overview');
  const [line] = scene.relations;
  if (!line) throw new Error('The sample draws no relation.');

  it('holds the lines of the step’s relations and the shapes it highlights', () => {
    const route = stepBounds(scene, new Set([line.relation]));
    for (const point of line.route) {
      expect(point.x).toBeGreaterThanOrEqual(route?.x ?? Infinity);
      expect(point.y).toBeGreaterThanOrEqual(route?.y ?? Infinity);
    }
    const shape = scene.shapes.at(-1);
    if (!shape) throw new Error('The sample draws no shape.');
    const both = stepBounds(scene, new Set([line.relation, shape.key]));
    expect(both?.x).toBeLessThanOrEqual(shape.rect.x);
    expect((both?.x ?? 0) + (both?.width ?? 0)).toBeGreaterThanOrEqual(
      shape.rect.x + shape.rect.width,
    );
  });

  it('is nothing when the scene draws none of it', () => {
    expect(stepBounds(scene, new Set(['gone']))).toBeUndefined();
  });
});

describe('followCamera', () => {
  const camera: Camera = { x: 0, y: 0, scale: 1 };

  it('stays where it is when the step is on screen, with room around it', () => {
    expect(followCamera(camera, viewport, { x: 100, y: 100, width: 300, height: 200 })).toBe(
      undefined,
    );
  });

  it('pans to a step off screen at the same zoom when it fits there', () => {
    const rect = { x: 3000, y: 2000, width: 300, height: 200 };
    const next = followCamera(camera, viewport, rect);
    expect(next?.scale).toBe(1);
    const shown = visibleRect(next as Camera, viewport);
    expect(shown.x + shown.width / 2).toBeCloseTo(3150);
    expect(shown.y + shown.height / 2).toBeCloseTo(2100);
  });

  it('zooms out to a step too large for the screen at the zoom it has', () => {
    const rect = { x: 0, y: 0, width: 4000, height: 300 };
    const next = followCamera(camera, viewport, rect) as Camera;
    expect(next.scale).toBeCloseTo((viewport.width - 2 * FOLLOW_MARGIN) / 4000);
    expect(followCamera(next, viewport, rect)).toBeUndefined();
  });
});

/** A canvas's camera that moves when told to, and says so to its listeners. */
function fakeCanvas(start: Camera = { x: 0, y: 0, scale: 1 }) {
  let camera = start;
  const listeners = new Set<() => void>();
  const set = (next: Camera) => {
    camera = next;
    for (const listener of listeners) listener();
  };
  const glides: { to: Camera; duration: number }[] = [];
  const canvas: CanvasCamera = {
    camera: () => camera,
    viewport: () => viewport,
    setCamera: set,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reveal: vi.fn(),
    targetOf: () => camera,
    glideTo: (to, duration) => {
      glides.push({ to, duration });
      set(to);
    },
  };
  return { canvas, glides, set, listening: () => listeners.size };
}

const NEAR: Rect = { x: 100, y: 100, width: 200, height: 100 };
const FAR: Rect = { x: 1500, y: 300, width: 200, height: 100 };
const FARTHER: Rect = { x: 3200, y: 300, width: 200, height: 100 };

describe('PlaybackFollower', () => {
  const follow = (reduced = false) => {
    const fake = fakeCanvas();
    let time = 0;
    const follower = new PlaybackFollower(fake.canvas, {
      reducedMotion: () => reduced,
      now: () => time,
    });
    return { ...fake, follower, later: (ms: number) => (time += ms) };
  };

  it('leaves the camera where it finds it for the first step it is told of', () => {
    const { follower, glides } = follow();
    follower.show({ key: 's 0', bounds: FAR, playing: false }, 3);
    expect(glides).toEqual([]);
  });

  it('brings a step asked for into view, with a tour’s eased move', () => {
    const { follower, glides } = follow();
    follower.show({ key: 's 0', bounds: NEAR, playing: false }, 0);
    follower.show({ key: 's 1', bounds: FAR, playing: false }, 1);
    expect(glides).toHaveLength(1);
    expect(glides[0]?.duration).toBeGreaterThan(0);
    expect(glides[0]?.duration).toBeLessThanOrEqual(MAX_TOUR_MOVE_TIME);
    // Asked for again where it is, it moves nothing more.
    follower.show({ key: 's 1', bounds: FAR, playing: false }, 2);
    expect(glides).toHaveLength(1);
  });

  it('cuts under reduced motion', () => {
    const { follower, glides } = follow(true);
    follower.show({ key: 's 0', bounds: NEAR, playing: false }, 0);
    follower.show({ key: 's 1', bounds: FAR, playing: false }, 1);
    expect(glides.map((glide) => glide.duration)).toEqual([0]);
  });

  it('leaves the camera to a step an address or a tour goes to, which it was not asked for', () => {
    const { follower, glides } = follow();
    follower.show({ key: 's 0', bounds: NEAR, playing: false }, 0);
    follower.show({ key: 's 4', bounds: FAR, playing: false }, 0);
    expect(glides).toEqual([]);
  });

  it('follows playback on by itself until the person moves the camera, and again once asked', () => {
    const { follower, glides, set, later } = follow();
    follower.show({ key: 's 0', bounds: NEAR, playing: false }, 0);
    // Play: the step it plays from is on screen already.
    follower.show({ key: 's 0', bounds: NEAR, playing: true }, 1);
    follower.show({ key: 's 1', bounds: FAR, playing: true }, 1);
    expect(glides).toHaveLength(1);
    later(1000);
    // The person pans while it plays: the next steps leave the camera to them.
    set({ x: -500, y: 0, scale: 1 });
    follower.show({ key: 's 2', bounds: FARTHER, playing: true }, 1);
    expect(glides).toHaveLength(1);
    // Playing again, or stepping, brings the step into view again.
    follower.show({ key: 's 2', bounds: FARTHER, playing: false }, 1);
    follower.show({ key: 's 3', bounds: NEAR, playing: false }, 2);
    expect(glides).toHaveLength(2);
  });

  it('takes the camera’s changes during its own move as its own', () => {
    const { follower, glides, set, later } = follow();
    follower.show({ key: 's 0', bounds: NEAR, playing: true }, 0);
    follower.show({ key: 's 1', bounds: FAR, playing: true }, 1);
    later(100);
    // A frame of the glide on its way.
    set({ x: -600, y: 0, scale: 1 });
    later(2000);
    follower.show({ key: 's 2', bounds: FARTHER, playing: true }, 1);
    expect(glides).toHaveLength(2);
  });

  it('stops listening to the camera once disposed', () => {
    const { follower, listening } = follow();
    expect(listening()).toBe(1);
    follower.dispose();
    expect(listening()).toBe(0);
  });
});
