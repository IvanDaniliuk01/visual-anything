/**
 * Scenario playback brings its step into view in the physical-space panel (ADR 0076) as the canvas
 * does: a step asked for always; each step played on by itself until the person moves the panel's
 * camera; nothing for the first step, nor for one already in the frame.
 */
import { spaceOf } from '@visual-anything/core';
import type { SpaceCamera } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { workcell } from '../test/space';
import { frameSpace } from './camera';
import { SpacePlaybackFollower, inSpaceView, type SpacePlayedStep } from './playback-follow';
import { SpacePanelStore } from './store';

const VIEW = 'cell-view';
const project = workcell();
const space = spaceOf(project, project.views[0]);
/** Far away, looking elsewhere: nothing of the workcell is in the frame. */
const AWAY: SpaceCamera = { target: { x: 50, y: 0, z: 50 }, azimuth: 0, elevation: 0, distance: 1 };

function setUp() {
  const store = new SpacePanelStore({
    frames: { request: () => 0, cancel: () => undefined },
    windowWidth: () => 1600,
  });
  store.set(VIEW, { camera: AWAY });
  store.moves.setDrawn(VIEW, { camera: AWAY, aspect: 1 });
  const follower = new SpacePlaybackFollower(store);
  follower.attach();
  const step = (key: string, playing: boolean): SpacePlayedStep => ({
    key,
    viewId: VIEW,
    space,
    elements: ['camera', 'arm'],
    playing,
  });
  const framed = () => {
    const framing = store.framing(VIEW);
    if (framing) store.framed(VIEW, framing.serial);
    return framing?.elements;
  };
  return { store, follower, step, framed };
}

describe('the panel following playback', () => {
  it('leaves the first step where it finds the camera, and frames a step asked for', () => {
    const { follower, step, framed } = setUp();
    follower.show(step('s 0', false), 0);
    expect(framed()).toBeUndefined();
    follower.show(step('s 1', false), 1);
    expect(framed()).toEqual(['camera', 'arm']);
  });

  it('frames each step played on by itself, until the person moves the camera, and again once asked', () => {
    const { store, follower, step, framed } = setUp();
    follower.show(step('s 0', true), 1);
    follower.show(step('s 1', true), 1);
    expect(framed()).toEqual(['camera', 'arm']);
    store.set(VIEW, { camera: { ...AWAY, distance: 2 } });
    follower.show(step('s 2', true), 1);
    expect(framed()).toBeUndefined();
    follower.show(step('s 3', true), 2);
    expect(framed()).toEqual(['camera', 'arm']);
  });

  it('keeps following after its own moves', () => {
    const { store, follower, step, framed } = setUp();
    follower.show(step('s 0', true), 1);
    store.moves.move(VIEW, { ...AWAY, azimuth: 30 }, { reducedMotion: true });
    follower.show(step('s 1', true), 1);
    expect(framed()).toEqual(['camera', 'arm']);
  });

  it('moves nothing for a step already in the frame', () => {
    const { store, follower, step, framed } = setUp();
    const whole = frameSpace([{ min: { x: -1, y: -1, z: -1 }, max: { x: 3, y: 2, z: 1 } }], 1);
    store.moves.setDrawn(VIEW, { camera: whole, aspect: 1 });
    expect(inSpaceView({ camera: whole, aspect: 1 }, space, ['camera', 'arm'])).toBe(true);
    follower.show(step('s 0', true), 0);
    follower.show(step('s 1', true), 1);
    expect(framed()).toBeUndefined();
  });

  it('frames nothing while the panel is closed', () => {
    const { store, follower, step } = setUp();
    store.close(VIEW);
    follower.show(step('s 0', true), 0);
    follower.show(step('s 1', true), 1);
    expect(store.framing(VIEW)).toBeUndefined();
  });
});
