// @vitest-environment node
/**
 * The handles that move and rotate posed elements (ADR 0076): what they hold, a drag along an arrow
 * and around a ring, snapped to 1 cm and 15° unless Alt is held, what moves with what they hold, and
 * the poses one `set-poses` sends, which the core takes and which put the elements where they were
 * dragged; and, while the exploded view is on, the handles where it draws what they hold.
 */
import { executeCommand, rotationFromDegrees, spaceMath, spaceOf } from '@visual-anything/core';
import type { SpaceCamera } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { handleShapes } from '../solids/worker/space/handles';
import { workcell } from '../test/space';
import { spaceProjection } from './camera';
import {
  entriesMoved,
  handlesOf,
  handleTargetOf,
  HandleGesture,
  movedMatrices,
  posesMoved,
  shiftedHandles,
  shiftOfHandles,
  shiftsFrom,
  snap,
} from './drag';
import { spaceEntriesOf } from './entries';

const SIZE = { width: 800, height: 600 };
/** Looking from the front, level: X runs right on the screen, Y up. */
const FRONT: SpaceCamera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 5 };

function setUp() {
  const project = workcell();
  const space = spaceOf(project, project.views[0]);
  const poseOf = (id: string) => project.model.elements.find((each) => each.id === id)?.pose;
  return { project, space, poseOf };
}

/** Where a point of the panel's coordinates falls in the frame, in pixels. */
function pixelOf(camera: SpaceCamera, point: { x: number; y: number; z: number }) {
  const projected = spaceProjection(camera, SIZE.width / SIZE.height)(point);
  return { x: projected.x * SIZE.width, y: projected.y * SIZE.height };
}

describe('what the handles hold', () => {
  it('holds the selected posed elements, outermost, at their middle; nothing anchored or shown', () => {
    const { space } = setUp();
    expect(handleTargetOf(space, new Set(['elbow', 'world']))).toBeUndefined();
    expect(handleTargetOf(space, new Set(['camera']))).toEqual({
      elements: ['camera'],
      at: { x: 0, y: 0.8, z: 0 },
    });
    // The camera moves with the table: only the table is held.
    expect(handleTargetOf(space, new Set(['camera', 'table', 'arm']))).toEqual({
      elements: ['table', 'arm'],
      at: { x: 1, y: 0, z: 0 },
    });
  });

  it('turns its axes as the container the first element is posed in', () => {
    const project = workcell();
    const turned = executeCommand(project, {
      type: 'update-element',
      id: 'table',
      changes: { pose: { at: { x: 0, y: 0, z: 0 }, rotation: rotationFromDegrees(0, 90, 0) } },
    });
    if (!turned.ok) throw new Error('Refused.');
    const space = spaceOf(turned.state, turned.state.views[0]);
    const target = handleTargetOf(space, new Set(['camera']));
    expect(target?.rotation?.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(handlesOf(target!, 'rotate', 'x')).toMatchObject({ mode: 'rotate', active: 'x' });
  });
});

describe('dragging a handle', () => {
  it('moves along an arrow as far as the pointer goes along it, snapped to 1 cm unless Alt is held', () => {
    const handles = handlesOf({ elements: ['table'], at: { x: 0, y: 0, z: 0 } }, 'move');
    const from = pixelOf(FRONT, { x: 0, y: 0, z: 0 });
    const gesture = new HandleGesture(handles, 'x', FRONT, SIZE, from);
    const to = pixelOf(FRONT, { x: 0.234, y: 0, z: 0 });
    // Off the line, the nearest point along it counts.
    expect(gesture.moveTo({ x: to.x, y: to.y + 40 }, false)).toBeCloseTo(0.234, 2);
    expect(gesture.moveTo(to, false)).toBeCloseTo(0.234, 9);
    expect(gesture.moveTo(to, true)).toBeCloseTo(0.23, 9);
    expect(spaceMath.transformPoint(gesture.matrixOf(0.23), { x: 1, y: 2, z: 3 })).toEqual({
      x: 1.23,
      y: 2,
      z: 3,
    });
    // An arrow pointing at the camera stays where it is.
    const along = new HandleGesture(handles, 'z', FRONT, SIZE, from);
    expect(along.moveTo({ x: from.x + 50, y: from.y }, false)).toBe(0);
  });

  it('turns around a ring as far as the pointer goes around it, snapped to 15° unless Alt is held', () => {
    const handles = handlesOf({ elements: ['table'], at: { x: 0, y: 0, z: 0 } }, 'rotate');
    const middle = pixelOf(FRONT, { x: 0, y: 0, z: 0 });
    // Z points at the camera: going anticlockwise on the screen turns positively about it.
    const gesture = new HandleGesture(handles, 'z', FRONT, SIZE, { x: middle.x + 70, y: middle.y });
    expect(gesture.moveTo({ x: middle.x, y: middle.y - 70 }, false)).toBeCloseTo(90, 6);
    // Past a half turn, the turn goes on counting.
    expect(gesture.moveTo({ x: middle.x - 70, y: middle.y + 1 }, false)).toBeGreaterThan(180);
    expect(gesture.moveTo({ x: middle.x - 70, y: middle.y - 10 }, true) % 15).toBe(0);
    const quarter = gesture.matrixOf(90);
    const turned = spaceMath.transformPoint(quarter, { x: 1, y: 0, z: 0 });
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.y).toBeCloseTo(1, 9);
    expect(snap(22, 15)).toBe(15);
    expect(snap(-0.004, 0.01)).toBe(0);
  });

  it('hit-tests the handles the worker draws where the gesture starts', () => {
    const handles = handlesOf({ elements: ['table'], at: { x: 0, y: 0, z: 0 } }, 'move');
    const shapes = handleShapes(handles, FRONT, SIZE);
    const x = shapes.find((shape) => shape.axis === 'x');
    expect(x?.points[1]?.x).toBeGreaterThan(x?.points[0]?.x ?? Infinity);
  });
});

describe('what a gesture moves, and the poses it sends', () => {
  it('moves what the handles hold and everything posed or anchored in it', () => {
    const { project, space } = setUp();
    const move = spaceMath.matrixOf({ x: 0, y: 0, z: 0.5 });
    const moved = movedMatrices(space, ['table'], move);
    expect([...moved.keys()]).toEqual(['table', 'camera']);
    expect(moved.get('camera')?.slice(12, 15)).toEqual([0, 0.8, 0.5]);
    const entries = spaceEntriesOf(space, (id) => id);
    const shown = entriesMoved(entries, moved);
    expect(shown.find((each) => each.element === 'arm')).toBe(
      entries.find((each) => each.element === 'arm'),
    );
    expect(shown.find((each) => each.element === 'table')?.matrix.slice(12, 15)).toEqual([
      0, 0, 0.5,
    ]);
    void project;
  });

  it('sends poses measured from what each is posed in, which the core takes as one action', () => {
    const { project, space, poseOf } = setUp();
    const move = spaceMath.matrixOf({ x: 0.1, y: 0, z: 0 });
    const poses = posesMoved(space, ['camera', 'arm', 'elbow'], move, poseOf);
    expect(poses).toEqual([
      { element: 'camera', pose: { in: 'table', at: { x: 0.1, y: 0.8, z: 0 } } },
      { element: 'arm', pose: { at: { x: 2.1, y: 0, z: 0 } } },
    ]);
    const done = executeCommand(project, { type: 'set-poses', poses });
    expect(done.ok).toBe(true);
    // A turn about Y, about where the arm stands.
    const gesture = new HandleGesture(
      handlesOf({ elements: ['arm'], at: { x: 2, y: 0, z: 0 } }, 'rotate'),
      'y',
      FRONT,
      SIZE,
      { x: 0, y: 0 },
    );
    const [turned] = posesMoved(space, ['arm'], gesture.matrixOf(90), poseOf);
    expect(turned?.pose.at).toEqual({ x: 2, y: 0, z: 0 });
    expect(turned?.pose.rotation?.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(turned?.pose.rotation?.w).toBeCloseTo(Math.SQRT1_2, 9);
    // A full turn turns nothing.
    const [whole] = posesMoved(space, ['arm'], gesture.matrixOf(360), poseOf);
    expect(whole?.pose).toEqual({ at: { x: 2, y: 0, z: 0 } });
  });
});

describe('the handles in the exploded view', () => {
  it('stand where the worker draws what they hold: moved by the mean of its moves', () => {
    const shifts = new Map([
      ['camera', { x: 0, y: 0.2, z: 0 }],
      ['arm', { x: 0.4, y: 0, z: 0 }],
    ]);
    expect(shiftOfHandles(['camera'], shifts)).toEqual({ x: 0, y: 0.2, z: 0 });
    // The handles stand at the middle of the two, which moves half as far as each.
    expect(shiftOfHandles(['camera', 'table'], shifts)).toEqual({ x: 0, y: 0.1, z: 0 });
    expect(shiftOfHandles(['table'], shifts)).toEqual({ x: 0, y: 0, z: 0 });
    expect(shiftOfHandles(['camera'], undefined)).toEqual({ x: 0, y: 0, z: 0 });
    const handles = handlesOf({ elements: ['camera'], at: { x: 0, y: 0.8, z: 0 } }, 'move', 'y');
    expect(shiftedHandles(handles, { x: 0, y: 0.2, z: 0 })).toEqual({
      mode: 'move',
      at: { x: 0, y: 1, z: 0 },
      active: 'y',
    });
    expect(shiftedHandles(handles, { x: 0, y: 0, z: 0 })).toBe(handles);
  });

  it('read a frame’s moves by element, kept as they were while they are the same', () => {
    const list = [{ element: 'camera', by: { x: 0, y: 0.2, z: 0 } }];
    const first = shiftsFrom(list, undefined);
    expect(first?.get('camera')).toEqual({ x: 0, y: 0.2, z: 0 });
    expect(shiftsFrom([{ element: 'camera', by: { x: 0, y: 0.2, z: 0 } }], first)).toBe(first);
    expect(shiftsFrom([{ element: 'camera', by: { x: 0, y: 0.3, z: 0 } }], first)).not.toBe(first);
    expect(shiftsFrom([], first)).toBeUndefined();
  });

  it('turn what they hold about where its pose puts it, so the pose sent keeps it where it is drawn', () => {
    const { space, poseOf } = setUp();
    const shift = { x: 0, y: 0.5, z: 0 };
    const drawn = shiftedHandles(
      handlesOf({ elements: ['arm'], at: { x: 2, y: 0, z: 0 } }, 'rotate'),
      shift,
    );
    const gesture = new HandleGesture(drawn, 'z', FRONT, SIZE, { x: 0, y: 0 }, shift);
    // Turned about its own place, the arm stays where it stands, as without the explosion.
    const [turned] = posesMoved(space, ['arm'], gesture.matrixOf(90), poseOf);
    expect(turned?.pose.at).toEqual({ x: 2, y: 0, z: 0 });
    expect(turned?.pose.rotation?.z).toBeCloseTo(Math.SQRT1_2, 9);
    // A move along an arrow is the same however far the explosion moved the handles.
    const moving = new HandleGesture(
      shiftedHandles(handlesOf({ elements: ['arm'], at: { x: 2, y: 0, z: 0 } }, 'move'), shift),
      'x',
      FRONT,
      SIZE,
      pixelOf(FRONT, { x: 2, y: 0.5, z: 0 }),
      shift,
    );
    const by = moving.moveTo(pixelOf(FRONT, { x: 2.3, y: 0.5, z: 0 }), true);
    expect(by).toBeCloseTo(0.3, 9);
    const [moved] = posesMoved(space, ['arm'], moving.matrixOf(by), poseOf);
    expect(moved?.pose.at.x).toBeCloseTo(2.3, 9);
  });
});
