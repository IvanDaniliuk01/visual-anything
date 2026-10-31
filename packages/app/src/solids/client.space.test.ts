/**
 * The app's side of the physical-space panel's drawing (ADR 0076), against the stand-in worker that
 * draws boxes: showing a space starts the worker and loads the solids it draws, changes send only
 * what changed, frames come newest first, framing and picking are answered, a gesture that ended is
 * heard, what the worker let go of is loaded again, a worker started anew shows the space again, and
 * a build with no GPU says why nothing is drawn.
 */
import { solidHash } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { boxMesh, writeTestSolid } from '../../../core/src/test/solids';
import { spaceProjection } from '../space/camera';
import { createSolidClient, type SolidFileResult } from './client';
import type { SpaceDrawnEntry, SpaceFrameReply, SpaceShown } from './protocol';
import { StandInSolidWorker, type StandInBitmap } from './stand-in';

const BOX = writeTestSolid({
  nodes: [{ name: 'box', mesh: 0 }],
  meshes: [boxMesh([0, 0, 0], [1, 1, 1])],
});
const BOX_HASH = solidHash(BOX);

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const at = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

const TABLE: SpaceDrawnEntry = {
  element: 'table',
  name: 'Table',
  matrix: IDENTITY,
  solid: BOX_HASH,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
};
const CAMERA: SpaceDrawnEntry = {
  element: 'camera',
  name: 'Camera',
  matrix: at(0.5, 2, 0.5),
  marker: true,
};
const LOOK = { target: { x: 0.5, y: 0.5, z: 0.5 }, azimuth: 0, elevation: 0, distance: 4 };
const SHOWN: SpaceShown = {
  size: { width: 200, height: 100 },
  entries: [TABLE, CAMERA],
  states: [],
};

function setUp(options: { unavailable?: boolean } = {}) {
  const workers: StandInSolidWorker[] = [];
  const start = vi.fn(() => {
    if (options.unavailable) throw new Error('No worker.');
    const worker = new StandInSolidWorker();
    workers.push(worker);
    return worker;
  });
  const get = vi.fn((hash: string): Promise<SolidFileResult> =>
    Promise.resolve(
      hash === BOX_HASH
        ? { ok: true, bytes: BOX.slice() }
        : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
    ),
  );
  const client = createSolidClient({ files: { get }, start });
  return { client, get, start, workers, worker: () => workers.at(-1) as StandInSolidWorker };
}

/** Lets the stand-in's answers and the files' promises settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await Promise.resolve();
}

describe('a space drawn through the solid client', () => {
  it('starts the worker, shows the space, loads its solids and hands over each newer frame', async () => {
    const { client, get, worker } = setUp();
    const frames: SpaceFrameReply[] = [];
    const drawing = client.showSpace(SHOWN, { onFrame: (frame) => frames.push(frame) });
    expect(client.started).toBe(true);
    expect(worker().ofType('space/show')).toEqual([
      { type: 'space/show', space: drawing.space, ...SHOWN },
    ]);
    await settle();
    expect(get).toHaveBeenCalledWith(BOX_HASH);
    expect(
      worker()
        .ofType('load')
        .map((each) => each.hash),
    ).toEqual([BOX_HASH]);
    // Its first frame, and one again once the box loaded.
    expect(frames.map((frame) => frame.serial)).toEqual([1, 2]);
    expect(drawing.frame).toBe(frames[1]);
    expect((frames[0]?.bitmap as unknown as StandInBitmap).closed).toBe(true);
    // Framed whole, as no camera was given.
    expect(drawing.frame?.camera.target.x).toBeCloseTo(0.5, 9);
  });

  it('sends only what changed, and nothing for a change of nothing', async () => {
    const { client, worker } = setUp();
    const drawing = client.showSpace(SHOWN);
    await settle();
    drawing.update({});
    drawing.update({ camera: LOOK, states: [{ element: 'camera', selected: true }] });
    drawing.update({ camera: null });
    expect(worker().ofType('space/update')).toEqual([
      {
        type: 'space/update',
        space: drawing.space,
        camera: LOOK,
        states: [{ element: 'camera', selected: true }],
      },
      { type: 'space/update', space: drawing.space, camera: null },
    ]);
    await settle();
    expect(worker().spaces.get(drawing.space)?.shown.camera).toBeUndefined();
  });

  it('answers the camera that frames elements, and what lies under a pixel', async () => {
    const { client } = setUp();
    const drawing = client.showSpace({ ...SHOWN, camera: LOOK });
    await settle();
    const framed = await drawing.fit(['camera']);
    expect(framed?.target).toEqual({ x: 0.5, y: 2, z: 0.5 });
    // Each box lies around its entry's origin as the camera projects it.
    const project = spaceProjection(LOOK, 2);
    const table = project({ x: 0, y: 0, z: 0 });
    expect(await drawing.pick(table.x * 200, table.y * 100)).toEqual({
      element: 'table',
      point: { x: 0, y: 0, z: 0 },
    });
    const camera = project({ x: 0.5, y: 2, z: 0.5 });
    expect(await drawing.pick(camera.x * 200, camera.y * 100)).toEqual({
      element: 'camera',
      point: { x: 0.5, y: 2, z: 0.5 },
    });
    expect(await drawing.pick(199, 99)).toEqual({ element: null });
  });

  it('hears a gesture that ended', async () => {
    const { client, worker } = setUp();
    const onGesture = vi.fn();
    const drawing = client.showSpace(SHOWN, { onGesture });
    await settle();
    worker().endGesture(drawing.space, 'move', [{ element: 'camera', matrix: at(1, 2, 3) }]);
    await settle();
    expect(onGesture).toHaveBeenCalledWith({
      type: 'space/gesture-ended',
      space: drawing.space,
      gesture: 'move',
      moved: [{ element: 'camera', matrix: at(1, 2, 3) }],
    });
  });

  it('loads again what the worker let go of, and loads the solids of new entries', async () => {
    const { client, worker } = setUp();
    const drawing = client.showSpace({ ...SHOWN, entries: [CAMERA] });
    await settle();
    expect(worker().ofType('load')).toHaveLength(0);
    drawing.update({ entries: [TABLE, CAMERA] });
    await settle();
    expect(worker().ofType('load')).toHaveLength(1);
    worker().letGo(BOX_HASH);
    await settle();
    expect(worker().ofType('load')).toHaveLength(2);
  });

  it('shows the space again in a worker started anew, as it was last changed', async () => {
    const { client, workers, worker } = setUp();
    const drawing = client.showSpace(SHOWN);
    await settle();
    drawing.update({ names: true });
    workers[0]?.fail();
    await settle();
    expect(workers).toHaveLength(2);
    expect(worker().ofType('space/show')).toEqual([
      { type: 'space/show', space: drawing.space, ...SHOWN, names: true },
    ]);
    expect(drawing.frame?.serial).toBeGreaterThanOrEqual(1);
  });

  it('stops a space that ended, and answers nothing more for it', async () => {
    const { client, worker } = setUp();
    const drawing = client.showSpace(SHOWN);
    await settle();
    const last = drawing.frame;
    drawing.end();
    expect(worker().ofType('space/end')).toEqual([{ type: 'space/end', space: drawing.space }]);
    expect((last?.bitmap as unknown as StandInBitmap).closed).toBe(true);
    expect(drawing.frame).toBeUndefined();
    expect(await drawing.fit()).toBeUndefined();
    drawing.update({ names: true });
    expect(worker().ofType('space/update')).toHaveLength(0);
  });

  it('says why nothing is drawn when the build draws no solids', async () => {
    const { client } = setUp({ unavailable: true });
    const onProblem = vi.fn();
    const drawing = client.showSpace(SHOWN, { onProblem });
    expect(client.unavailable).toBe(true);
    expect(drawing.problem?.code).toBe('unavailable');
    const later = client.showSpace(SHOWN, { onProblem });
    expect(later.problem?.code).toBe('unavailable');
    expect(onProblem).toHaveBeenCalledTimes(2);
    expect(await drawing.pick(1, 1)).toBeUndefined();
  });

  it('draws again once a lost context is back, saying no problem meanwhile', async () => {
    const { client, worker } = setUp();
    const onProblem = vi.fn();
    const drawing = client.showSpace(SHOWN, { onProblem });
    worker().loseContext();
    await settle();
    expect(drawing.problem).toBeUndefined();
    worker().restoreContext();
    await settle();
    expect(drawing.frame).toBeDefined();
    expect(onProblem).not.toHaveBeenCalled();
  });
});
