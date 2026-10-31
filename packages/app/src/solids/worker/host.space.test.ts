// @vitest-environment node
/**
 * The solid worker's side of the physical-space panel (ADR 0076), with fake GPUs: a space is drawn
 * once a frame, only when something it shows changed, framed whole while the app gives no camera;
 * framing works from bounds without the GPU; picks go to the space's GPU; a lost context draws again
 * once it is back; and without a GPU to draw spaces, they are refused as unavailable. Every reply
 * passes the app's reader.
 */
import { describe, expect, it } from 'vitest';
import {
  readSolidWorkerReply,
  type SolidView,
  type SolidWorkerReply,
  type SolidWorkerRequest,
  type SpaceDrawnEntry,
} from '../protocol';
import type { BuiltSolid } from './build';
import { ARM, ARM_HASH } from './fixtures';
import {
  SolidWorkerHost,
  type DrawnPicture,
  type SolidGpu,
  type SpaceGpu,
  type SpacePicked,
  type SpaceToDraw,
} from './host';

function bitmap(width: number, height: number): ImageBitmap {
  return { width, height, close() {} };
}

/** A GPU that draws nothing, and a space GPU that says what it was asked to draw. */
class FakeGpu implements SolidGpu, SpaceGpu {
  largestPicture = 2048;
  lost = false;
  throws = false;
  readonly spaces: SpaceToDraw[] = [];
  readonly ended: number[] = [];
  picked: SpacePicked = { element: null };
  private listener: ((state: 'lost' | 'restored') => void) | undefined;

  draw(_solid: BuiltSolid, view: SolidView): DrawnPicture {
    return { bitmap: bitmap(view.size.width, view.size.height) };
  }

  forget(): void {}

  onContext(listener: (state: 'lost' | 'restored') => void): void {
    this.listener = listener;
  }

  drawSpace(space: SpaceToDraw): ImageBitmap {
    if (this.throws) throw new Error('The GPU failed.');
    this.spaces.push(space);
    return bitmap(space.size.width, space.size.height);
  }

  pickSpace(): SpacePicked {
    return this.picked;
  }

  endSpace(space: number): void {
    this.ended.push(space);
  }

  lose(): void {
    this.lost = true;
    this.listener?.('lost');
  }

  restore(): void {
    this.lost = false;
    this.listener?.('restored');
  }
}

function setUp(options: { gpu?: boolean; space?: boolean; triangleBudget?: number } = {}) {
  const gpu = new FakeGpu();
  const clock = { now: 0 };
  const replies: SolidWorkerReply[] = [];
  const transfers: Transferable[][] = [];
  const frames: (() => void)[] = [];
  const host = new SolidWorkerHost({
    post(reply, transfer) {
      const read = readSolidWorkerReply(reply);
      if (!read.ok) throw new Error(`The app cannot read the reply: ${read.reason}`);
      replies.push(read.value);
      transfers.push(transfer);
    },
    gpu: options.gpu === false ? undefined : gpu,
    ...(options.space === false ? {} : { space: gpu }),
    decodeImage: () => Promise.resolve(undefined),
    schedule: (callback) => frames.push(callback),
    now: () => clock.now,
    ...(options.triangleBudget === undefined ? {} : { triangleBudget: options.triangleBudget }),
  });
  host.start();
  const send = (request: SolidWorkerRequest) => host.receive(request);
  const tick = () => {
    for (const frame of frames.splice(0)) frame();
  };
  const ofType = <T extends SolidWorkerReply['type']>(type: T) =>
    replies.filter((reply): reply is Extract<SolidWorkerReply, { type: T }> => reply.type === type);
  return { host, gpu, replies, transfers, frames, send, tick, ofType, clock };
}

const SIZE = { width: 400, height: 200 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function at(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

const ARM_ENTRY: SpaceDrawnEntry = {
  element: 'arm',
  name: 'Arm',
  matrix: IDENTITY,
  solid: ARM_HASH,
};
const CAMERA_ENTRY: SpaceDrawnEntry = {
  element: 'camera',
  name: 'Camera',
  matrix: at(4, 0, 0),
  marker: true,
};
const CAMERA = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 3 };

function show(entries: SpaceDrawnEntry[] = [ARM_ENTRY, CAMERA_ENTRY], more = {}) {
  return { type: 'space/show' as const, space: 1, size: SIZE, entries, states: [], ...more };
}

describe('a space in the solid worker', () => {
  it('draws once a frame, only after something it shows changed, and counts its frames', async () => {
    const { gpu, send, tick, ofType, transfers } = setUp();
    await send(show([CAMERA_ENTRY], { camera: CAMERA }));
    await send({ type: 'space/update', space: 1, names: true });
    expect(gpu.spaces).toHaveLength(0);
    tick();
    expect(gpu.spaces).toHaveLength(1);
    expect(gpu.spaces[0]).toMatchObject({ space: 1, size: SIZE, camera: CAMERA, names: true });
    const [frame] = ofType('space/frame');
    expect(frame).toMatchObject({ space: 1, serial: 1, camera: CAMERA, width: 400, height: 200 });
    expect(transfers.at(-1)).toEqual([frame?.bitmap]);
    // At rest, nothing is drawn.
    tick();
    expect(gpu.spaces).toHaveLength(1);
    await send({
      type: 'space/update',
      space: 1,
      states: [{ element: 'camera', selected: true }],
      cut: { axis: 'x', at: 0, keep: 'below' },
      explode: 1,
    });
    tick();
    expect(gpu.spaces).toHaveLength(2);
    const second = gpu.spaces[1] as SpaceToDraw;
    expect(second.states.get('camera')).toEqual({ selected: true });
    expect(second.cut).toEqual({ axis: 'x', at: 0, keep: 'below' });
    expect(second.explode).toBe(1);
    expect(ofType('space/frame').map((each) => each.serial)).toEqual([1, 2]);
    await send({ type: 'space/update', space: 1, cut: null });
    tick();
    expect(gpu.spaces[2]?.cut).toBeUndefined();
  });

  it('frames everything while no camera is given, and keeps a camera once given', async () => {
    const { gpu, send, tick } = setUp();
    await send(show([{ ...CAMERA_ENTRY, matrix: at(4, 0, 0) }]));
    tick();
    const first = gpu.spaces[0]?.camera;
    expect(first?.target).toEqual({ x: 4, y: 0, z: 0 });
    await send({
      type: 'space/update',
      space: 1,
      entries: [{ ...CAMERA_ENTRY, matrix: at(-2, 1, 0) }],
    });
    tick();
    expect(gpu.spaces[1]?.camera.target).toEqual({ x: -2, y: 1, z: 0 });
    await send({ type: 'space/update', space: 1, camera: CAMERA });
    await send({ type: 'space/update', space: 1, entries: [CAMERA_ENTRY] });
    tick();
    expect(gpu.spaces[2]?.camera).toEqual(CAMERA);
    // Taking the camera away frames everything again.
    await send({ type: 'space/update', space: 1, camera: null });
    tick();
    expect(gpu.spaces[3]?.camera.target).toEqual({ x: 4, y: 0, z: 0 });
  });

  it('hands the GPU the solids loaded, and draws again when one it draws loads', async () => {
    const { gpu, send, tick } = setUp();
    await send(show());
    tick();
    expect(gpu.spaces[0]?.solids.size).toBe(0);
    await send({ type: 'load', id: 1, hash: ARM_HASH, bytes: ARM.slice().buffer });
    tick();
    expect(gpu.spaces).toHaveLength(2);
    expect([...(gpu.spaces[1]?.solids.keys() ?? [])]).toEqual([ARM_HASH]);
    // Framed whole again, now with the arm's bounds: from its base to its gripper, and the camera.
    const camera = gpu.spaces[1]?.camera;
    expect(camera?.target.x).toBeCloseTo(1.75, 9);
    expect(camera?.target.y).toBeCloseTo(0.6, 9);
  });

  it('answers the camera that frames the elements named, or everything, without drawing', async () => {
    const { send, ofType, gpu } = setUp({});
    await send(show(undefined, { camera: { ...CAMERA, azimuth: 45 } }));
    await send({ type: 'space/framing', space: 1, id: 5, elements: ['camera'] });
    await send({ type: 'space/framing', space: 1, id: 6 });
    const [one, all] = ofType('space/framed');
    expect(one).toMatchObject({ space: 1, id: 5 });
    expect(one?.camera.target).toEqual({ x: 4, y: 0, z: 0 });
    // From the camera's own direction.
    expect(one?.camera.azimuth).toBe(45);
    expect(all?.camera.target.x).toBeCloseTo(2, 9);
    expect(gpu.spaces).toHaveLength(0);
  });

  it('frames what is not hidden, or everything when all of it is', async () => {
    const { send, ofType } = setUp();
    await send(show(undefined, { states: [{ element: 'arm', hidden: true }] }));
    await send({ type: 'space/framing', space: 1, id: 2 });
    expect(ofType('space/framed')[0]?.camera.target).toEqual({ x: 4, y: 0, z: 0 });
    await send({
      type: 'space/update',
      space: 1,
      states: [
        { element: 'arm', hidden: true },
        { element: 'camera', hidden: true },
      ],
    });
    await send({ type: 'space/framing', space: 1, id: 3 });
    expect(ofType('space/framed')[1]?.camera.target.x).toBeCloseTo(2, 9);
  });

  it('answers a pick with what the space’s GPU finds', async () => {
    const { send, ofType, gpu, replies } = setUp();
    await send(show());
    gpu.picked = { element: 'camera', point: { x: 4, y: 0, z: 0 } };
    await send({ type: 'space/pick', space: 1, id: 9, x: 10, y: 20 });
    expect(ofType('space/picked')).toEqual([
      { type: 'space/picked', space: 1, id: 9, element: 'camera', point: { x: 4, y: 0, z: 0 } },
    ]);
    await send({ type: 'space/pick', space: 1, id: 10, x: 401, y: 20 });
    await send({ type: 'space/pick', space: 2, id: 11, x: 1, y: 1 });
    expect(replies.slice(-2)).toMatchObject([
      { type: 'refused', id: 10, code: 'failed' },
      { type: 'refused', id: 11, code: 'failed', message: 'The space is not shown.' },
    ]);
  });

  it('stops drawing a space that ended, and lets its GPU let go of it', async () => {
    const { host, gpu, send, tick } = setUp();
    await send(show());
    expect(host.spacesShown).toEqual([1]);
    await send({ type: 'space/end', space: 1 });
    tick();
    expect(host.spacesShown).toEqual([]);
    expect(gpu.spaces).toHaveLength(0);
    expect(gpu.ended).toEqual([1]);
  });

  it('hands the GPU the theme, the pixel ratio and the handles, which an update takes away', async () => {
    const { gpu, send, tick } = setUp();
    await send(show(undefined, { camera: CAMERA }));
    tick();
    expect(gpu.spaces[0]).toMatchObject({ theme: 'light', pixelRatio: 1, handles: undefined });
    const handles = { mode: 'move' as const, at: { x: 4, y: 0, z: 0 }, active: 'x' as const };
    await send({ type: 'space/update', space: 1, theme: 'dark', pixelRatio: 2, handles });
    tick();
    expect(gpu.spaces[1]).toMatchObject({ theme: 'dark', pixelRatio: 2, handles });
    await send({ type: 'space/update', space: 1, handles: null });
    tick();
    expect(gpu.spaces[2]?.handles).toBeUndefined();
    expect(gpu.spaces[2]?.theme).toBe('dark');
  });

  it('draws the farthest solids as boxes while the camera moves past the mark, and whole at rest', async () => {
    // The arm takes 36 triangles: with a budget of 50, two arms take one box.
    const { gpu, send, tick, clock, frames } = setUp({ triangleBudget: 50 });
    await send({ type: 'load', id: 1, hash: ARM_HASH, bytes: ARM.slice().buffer });
    const far = { ...ARM_ENTRY, element: 'far', matrix: at(0, 0, -30) };
    await send(show([ARM_ENTRY, far], { camera: CAMERA }));
    tick();
    // Shown, its camera has not moved: everything is drawn whole.
    expect(gpu.spaces[0]?.boxed).toEqual(new Set());
    clock.now = 1000;
    await send({ type: 'space/update', space: 1, camera: { ...CAMERA, azimuth: 10 } });
    tick();
    expect(gpu.spaces[1]?.boxed).toEqual(new Set(['far']));
    // Until it rests, nothing is drawn again, and the worker keeps looking.
    clock.now = 1100;
    tick();
    expect(gpu.spaces).toHaveLength(2);
    expect(frames.length).toBe(1);
    clock.now = 1250;
    tick();
    expect(gpu.spaces).toHaveLength(3);
    expect(gpu.spaces[2]?.boxed).toEqual(new Set());
    // At rest, it stops looking.
    tick();
    expect(frames.length).toBe(0);
    expect(gpu.spaces).toHaveLength(3);
  });

  it('draws everything whole while the camera moves within the mark', async () => {
    const { gpu, send, tick, clock } = setUp();
    await send({ type: 'load', id: 1, hash: ARM_HASH, bytes: ARM.slice().buffer });
    await send(show([ARM_ENTRY], { camera: CAMERA }));
    clock.now = 10;
    await send({ type: 'space/update', space: 1, camera: { ...CAMERA, distance: 9 } });
    tick();
    expect(gpu.spaces.at(-1)?.boxed).toEqual(new Set());
  });

  it('draws nothing while its context is lost, and again once it is back', async () => {
    const { gpu, send, tick, ofType } = setUp();
    await send(show());
    tick();
    gpu.lose();
    await send({ type: 'space/update', space: 1, names: true });
    tick();
    expect(gpu.spaces).toHaveLength(1);
    gpu.restore();
    tick();
    expect(gpu.spaces).toHaveLength(2);
    expect(gpu.spaces[1]?.names).toBe(true);
    expect(ofType('space/frame').map((frame) => frame.serial)).toEqual([1, 2]);
  });

  it('refuses a frame its GPU cannot draw, and frames past its largest picture', async () => {
    const { gpu, send, tick, ofType } = setUp();
    gpu.throws = true;
    await send(show());
    tick();
    expect(ofType('refused')).toMatchObject([{ space: 1, code: 'failed' }]);
    gpu.throws = false;
    gpu.largestPicture = 256;
    await send({ type: 'space/update', space: 1, names: true });
    tick();
    expect(ofType('refused')[1]).toMatchObject({ space: 1, code: 'too-large' });
  });

  it('refuses spaces as unavailable without a GPU to draw them', async () => {
    for (const options of [{ gpu: false }, { space: false }]) {
      const { send, ofType } = setUp(options);
      await send(show());
      await send({ type: 'space/framing', space: 1, id: 2 });
      await send({ type: 'space/pick', space: 1, id: 3, x: 0, y: 0 });
      expect(ofType('refused').map(({ space, id, code }) => ({ space, id, code }))).toEqual([
        { space: 1, id: undefined, code: 'unavailable' },
        { space: undefined, id: 2, code: 'unavailable' },
        { space: undefined, id: 3, code: 'unavailable' },
      ]);
    }
  });
});
