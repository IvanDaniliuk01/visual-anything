import { describe, expect, it } from 'vitest';
import {
  LIVE_REST_MS,
  LiveFollower,
  LIVE_ON_CANVAS,
  NO_LIVE,
  livePlacement,
  liveAfter,
  liveShown,
  type LiveState,
  type LiveTarget,
} from './live';

const A: LiveTarget = { spot: 'shape-a', explorable: 'p.graph', element: 'a' };
const B: LiveTarget = { spot: 'free-b', explorable: 'p.other' };
const SCREEN = { x: 0, y: 0, width: 800, height: 600 };

function target(n: number): LiveTarget {
  return { spot: `spot-${n}`, explorable: 'p.graph' };
}

function explore(state: LiveState, ...targets: LiveTarget[]): LiveState {
  return targets.reduce((now, each) => liveAfter(now, { kind: 'explore', target: each }), state);
}

function live(state: LiveState): string[] {
  return state.kept.filter((each) => each.live).map((each) => each.target.spot);
}

function kept(state: LiveState): string[] {
  return state.kept.map((each) => each.target.spot);
}

describe('explorables live on a canvas (ADR 0107, as the user changed Q11 on 2026-11-12)', () => {
  it('keeps several live at once, up to four', () => {
    expect(LIVE_ON_CANVAS).toBe(4);
    const state = explore(NO_LIVE, target(1), target(2), target(3), target(4));
    expect(live(state)).toEqual(['spot-1', 'spot-2', 'spot-3', 'spot-4']);
  });

  it('pauses the one used longest ago when a fifth is explored, and keeps its frame', () => {
    let state = explore(NO_LIVE, target(1), target(2), target(3), target(4));
    // Using the first makes the second the one used longest ago.
    state = liveAfter(state, { kind: 'use', spot: 'spot-1' });
    state = explore(state, target(5));
    expect(live(state).sort()).toEqual(['spot-1', 'spot-3', 'spot-4', 'spot-5']);
    expect(kept(state)).toContain('spot-2');
  });

  it('shows a kept frame again, as it was left, when it is explored again', () => {
    let state = explore(NO_LIVE, A, B);
    state = liveAfter(state, { kind: 'still', spot: A.spot });
    expect(live(state)).toEqual([B.spot]);
    expect(kept(state)).toContain(A.spot);
    const before = state.kept.find((each) => each.target.spot === A.spot)?.target;
    state = explore(state, { ...A });
    expect(live(state).sort()).toEqual([A.spot, B.spot].sort());
    // The same target, so the same frame.
    expect(state.kept.find((each) => each.target.spot === A.spot)?.target).toBe(before);
  });

  it('keeps each frame in its place, since a frame moved in the page loads again', () => {
    let state = explore(NO_LIVE, A, B);
    state = liveAfter(state, { kind: 'still', spot: A.spot });
    state = explore(state, A);
    expect(kept(state)).toEqual([A.spot, B.spot]);
    state = explore(state, { ...A, explorable: 'p.third' });
    expect(kept(state)).toEqual([A.spot, B.spot]);
  });

  it('gives the same state when nothing changes', () => {
    const state = explore(NO_LIVE, A);
    expect(explore(state, { ...A })).toBe(state);
    expect(liveAfter(state, { kind: 'use', spot: 'nowhere' })).toBe(state);
    expect(liveAfter(state, { kind: 'spots', present: new Set([A.spot]) })).toBe(state);
    expect(liveAfter(NO_LIVE, { kind: 'escape' })).toBe(NO_LIVE);
  });

  it('turns the one used last still with Escape', () => {
    let state = explore(NO_LIVE, A, B);
    state = liveAfter(state, { kind: 'escape' });
    expect(live(state)).toEqual([A.spot]);
    state = liveAfter(state, { kind: 'escape' });
    expect(live(state)).toEqual([]);
    expect(kept(state).sort()).toEqual([A.spot, B.spot].sort());
  });

  it('starts a new frame when the spot shows another explorable', () => {
    let state = explore(NO_LIVE, A);
    const other = { ...A, explorable: 'p.third' };
    state = explore(state, other);
    expect(state.kept).toHaveLength(1);
    expect(state.kept[0]?.target).toBe(other);
  });

  it('removes the frames of shapes that went, and of the ones the tab let go', () => {
    let state = explore(NO_LIVE, A, B);
    state = liveAfter(state, { kind: 'spots', present: new Set([B.spot]) });
    expect(kept(state)).toEqual([B.spot]);
    state = liveAfter(state, { kind: 'drop', spot: B.spot });
    expect(state.kept).toEqual([]);
  });

  it('keeps every frame paused or turned still until the tab lets it go', () => {
    let state = NO_LIVE;
    for (let n = 1; n <= 9; n++) {
      state = explore(state, target(n));
      if (n <= 5) state = liveAfter(state, { kind: 'still', spot: `spot-${n}` });
    }
    expect(state.kept).toHaveLength(9);
    expect(live(state)).toHaveLength(4);
    state = liveAfter(state, { kind: 'drop', spot: 'spot-1' });
    expect(kept(state)).not.toContain('spot-1');
  });
});

describe('what a canvas shows of its kept frames', () => {
  it('shows a live one while its spot is on screen, and hides it, kept, while it is off', () => {
    const state = explore(NO_LIVE, A);
    const on = { x: 700, y: 500, width: 200, height: 200 };
    expect(liveShown(state.kept[0], on, SCREEN)).toBe(true);
    const off = { x: 801, y: 0, width: 100, height: 100 };
    expect(liveShown(state.kept[0], off, SCREEN)).toBe(false);
    expect(liveShown(state.kept[0], undefined, SCREEN)).toBe(false);
    const above = { x: 10, y: -200, width: 100, height: 200 };
    expect(liveShown(state.kept[0], above, SCREEN)).toBe(false);
    const still = liveAfter(state, { kind: 'still', spot: A.spot });
    expect(liveShown(still.kept[0], on, SCREEN)).toBe(false);
  });
});

describe('placing a live frame over its spot', () => {
  const rect = { x: 100, y: 50, width: 320, height: 240 };

  it('follows a pan at once', () => {
    expect(livePlacement({ x: 10, y: 20, scale: 2 }, rect, 2)).toEqual({
      x: 210,
      y: 120,
      scale: 2,
    });
  });

  it('keeps its last scale while a zoom runs, its corner on its spot', () => {
    expect(livePlacement({ x: 0, y: 0, scale: 1.5 }, rect, 1)).toEqual({
      x: 150,
      y: 75,
      scale: 1,
    });
  });
});

describe('a live frame following the camera', () => {
  const rect = { x: 100, y: 50, width: 320, height: 240 };

  function harness() {
    const box = { style: { transform: '' } };
    const timers: { at: number; callback: () => void }[] = [];
    let now = 0;
    const later = (ms: number, callback: () => void) => {
      const timer = { at: now + ms, callback };
      timers.push(timer);
      return () => timers.splice(timers.indexOf(timer), 1);
    };
    const pass = (ms: number) => {
      now += ms;
      for (const timer of timers.filter((each) => each.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
    };
    return { box, follower: new LiveFollower(box, rect, later), pass, timers };
  }

  it('moves with a pan at every step', () => {
    const { box, follower } = harness();
    follower.place({ x: 0, y: 0, scale: 1 });
    expect(box.style.transform).toBe('translate(100px, 50px) scale(1)');
    follower.place({ x: -30, y: 10, scale: 1 });
    expect(box.style.transform).toBe('translate(70px, 60px) scale(1)');
  });

  it('keeps its scale through a zoom and takes the new one once the camera rests', () => {
    const { box, follower, pass } = harness();
    follower.place({ x: 0, y: 0, scale: 1 });
    follower.place({ x: 0, y: 0, scale: 1.2 });
    expect(box.style.transform).toBe('translate(120px, 60px) scale(1)');
    pass(LIVE_REST_MS / 2);
    follower.place({ x: 0, y: 0, scale: 1.5 });
    expect(box.style.transform).toBe('translate(150px, 75px) scale(1)');
    pass(LIVE_REST_MS - 1);
    expect(box.style.transform).toBe('translate(150px, 75px) scale(1)');
    pass(1);
    expect(box.style.transform).toBe('translate(150px, 75px) scale(1.5)');
  });

  it('stops waiting for the rest when it goes', () => {
    const { follower, timers } = harness();
    follower.place({ x: 0, y: 0, scale: 1 });
    follower.place({ x: 0, y: 0, scale: 2 });
    expect(timers).toHaveLength(1);
    follower.dispose();
    expect(timers).toHaveLength(0);
  });
});
