// @vitest-environment node
/**
 * The solid worker's side of its protocol (ADR 0075), with a fake GPU: loading, pictures with their
 * part buffers, the memory and what it lets go of, turning frames and animations, picking, a lost
 * context, and a worker with no WebGL. Every reply passes the app's reader, and the app's client
 * draws through it as it would through the worker.
 */
import { solidHash } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { boxMesh, writeTestSolid } from '../../../../core/src/test/solids';
import { createSolidClient, type SolidPicture, type SolidWorkerPort } from '../client';
import {
  readSolidWorkerReply,
  type SolidView,
  type SolidWorkerReply,
  type SolidWorkerRequest,
} from '../protocol';
import type { BuiltSolid } from './build';
import { ARM, ARM_HASH, SLIDER, SLIDER_HASH } from './fixtures';
import { SolidWorkerHost, type DrawnPicture, type SolidGpu } from './host';

/** A bitmap as the reader takes one. */
function bitmap(width: number, height: number): ImageBitmap {
  return { width, height, close() {} };
}

/** A GPU that draws nothing, and says what it was asked and where the solid's first node stood. */
class FakeGpu implements SolidGpu {
  largestPicture = 2048;
  lost = false;
  throws = false;
  readonly draws: { hash: string; view: SolidView; x: number }[] = [];
  readonly forgotten: string[] = [];
  private listener: ((state: 'lost' | 'restored') => void) | undefined;

  draw(solid: BuiltSolid, view: SolidView): DrawnPicture {
    if (this.throws) throw new Error('The GPU failed.');
    this.draws.push({ hash: solid.hash, view, x: solid.nodes[0]?.position.x ?? 0 });
    const { width, height } = view.size;
    return {
      bitmap: bitmap(width, height),
      ...(view.parts
        ? { partBuffer: { width, height, data: new Uint16Array(width * height).fill(1) } }
        : {}),
    };
  }

  forget(solid: BuiltSolid): void {
    this.forgotten.push(solid.hash);
  }

  onContext(listener: (state: 'lost' | 'restored') => void): void {
    this.listener = listener;
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

/** A host with a fake GPU, a clock, frames run by hand, and its replies read as the app reads them. */
function setUp(options: { gpu?: FakeGpu | null; memoryBytes?: number } = {}) {
  const gpu = options.gpu === null ? undefined : (options.gpu ?? new FakeGpu());
  const replies: SolidWorkerReply[] = [];
  const transfers: Transferable[][] = [];
  const frames: (() => void)[] = [];
  const clock = { now: 0 };
  const host = new SolidWorkerHost({
    post(reply, transfer) {
      const read = readSolidWorkerReply(reply);
      if (!read.ok) throw new Error(`The app cannot read the reply: ${read.reason}`);
      replies.push(read.value);
      transfers.push(transfer);
    },
    gpu,
    decodeImage: () => Promise.resolve(undefined),
    schedule: (callback) => frames.push(callback),
    now: () => clock.now,
    ...(options.memoryBytes === undefined ? {} : { memoryBytes: options.memoryBytes }),
  });
  host.start();
  const send = (request: SolidWorkerRequest) => host.receive(request);
  const load = (bytes: Uint8Array, id = 1) =>
    send({ type: 'load', id, hash: solidHash(bytes), bytes: bytes.slice().buffer });
  const tick = () => {
    for (const frame of frames.splice(0)) frame();
  };
  const last = () => replies.at(-1);
  const ofType = <T extends SolidWorkerReply['type']>(type: T) =>
    replies.filter((reply): reply is Extract<SolidWorkerReply, { type: T }> => reply.type === type);
  return { host, gpu, replies, transfers, frames, clock, send, load, tick, last, ofType };
}

function drawRequest(overrides: Partial<SolidView> & { id?: number; key?: string } = {}) {
  return {
    type: 'draw' as const,
    id: 10,
    key: 'arm@256',
    solid: ARM_HASH,
    size: { width: 256, height: 256 },
    camera: { azimuth: 30, elevation: 20 },
    lighting: 'studio' as const,
    hidden: [],
    parts: false,
    ...overrides,
  };
}

/** The view a turning starts from. */
function turnView(overrides: Partial<SolidView> = {}): SolidView {
  const { solid, size, camera, lighting, hidden, parts } = drawRequest(overrides);
  return { solid, size, camera, lighting, hidden, parts };
}

/** A solid of one box, a different file for each `n`, of 168 estimated bytes. */
function boxSolid(n: number): Uint8Array {
  return writeTestSolid({
    nodes: [{ name: `box${n}`, mesh: 0 }],
    meshes: [boxMesh([0, 0, 0], [1 + n, 1, 1])],
  });
}

describe('the solid worker', () => {
  it('says its limits as it starts', () => {
    const { replies } = setUp({ memoryBytes: 1000 });
    expect(replies).toEqual([
      { type: 'ready', limits: { largestPicture: 2048, memoryBytes: 1000 } },
    ]);
  });

  it('loads a canonical file and says how many parts and animations it holds', async () => {
    const { load, last, host } = setUp();
    await load(ARM, 3);
    expect(last()).toEqual({ type: 'loaded', id: 3, hash: ARM_HASH, parts: 3, animations: 0 });
    await load(SLIDER, 4);
    expect(last()).toMatchObject({ type: 'loaded', id: 4, parts: 1, animations: 1 });
    expect(host.solids).toEqual([ARM_HASH, SLIDER_HASH]);
  });

  it('refuses bytes that are not their hash’s, or not canonical', async () => {
    const { send, last } = setUp();
    await send({ type: 'load', id: 2, hash: SLIDER_HASH, bytes: ARM.slice().buffer });
    expect(last()).toMatchObject({ type: 'refused', id: 2, code: 'invalid-solid' });
    const broken = ARM.slice(0, 64);
    await send({ type: 'load', id: 3, hash: solidHash(broken), bytes: broken.slice().buffer });
    expect(last()).toMatchObject({ type: 'refused', id: 3, code: 'invalid-solid' });
  });

  it('refuses a solid that alone would take more than its memory', async () => {
    const { load, last } = setUp({ memoryBytes: 100 });
    await load(ARM);
    expect(last()).toMatchObject({ type: 'refused', id: 1, code: 'too-large' });
  });

  it('draws a picture from its camera, with its part buffer when asked, transferring both', async () => {
    const { load, send, last, gpu, transfers } = setUp();
    await load(ARM);
    await send(drawRequest({ parts: true, hidden: [1], key: 'arm@512' }));
    const picture = last();
    expect(picture).toMatchObject({ type: 'picture', id: 10, key: 'arm@512', width: 256 });
    if (picture?.type !== 'picture') throw new Error('no picture');
    expect(picture.partBuffer?.data).toHaveLength(256 * 256);
    expect(transfers.at(-1)).toEqual([picture.bitmap, picture.partBuffer?.data.buffer]);
    expect(gpu?.draws.at(-1)?.view).toEqual({
      solid: ARM_HASH,
      size: { width: 256, height: 256 },
      camera: { azimuth: 30, elevation: 20 },
      lighting: 'studio',
      hidden: [1],
      parts: true,
    });
    await send(drawRequest({ id: 11 }));
    expect(last()).not.toHaveProperty('partBuffer');
    expect(transfers.at(-1)).toHaveLength(1);
  });

  it('refuses a draw of a solid not loaded, past its largest picture, or of a part it lacks', async () => {
    const gpu = new FakeGpu();
    gpu.largestPicture = 512;
    const { load, send, last, replies } = setUp({ gpu });
    expect(replies[0]).toMatchObject({ limits: { largestPicture: 512 } });
    await send(drawRequest());
    expect(last()).toMatchObject({ type: 'refused', id: 10, code: 'not-loaded' });
    await load(ARM);
    await send(drawRequest({ size: { width: 1024, height: 512 } }));
    expect(last()).toMatchObject({ type: 'refused', code: 'too-large' });
    await send(drawRequest({ only: 3 }));
    expect(last()).toMatchObject({ type: 'refused', code: 'failed' });
    gpu.throws = true;
    await send(drawRequest());
    expect(last()).toMatchObject({ type: 'refused', code: 'failed' });
  });

  it('lets go of the solids drawn least lately past its memory, before the picture that needs it', async () => {
    // Each box takes 168 bytes once drawn: two fit in 400.
    const { load, send, replies, gpu, host } = setUp({ memoryBytes: 400 });
    const files = [boxSolid(1), boxSolid(2), boxSolid(3)];
    const hashes = files.map(solidHash);
    for (const [at, file] of files.entries()) await load(file, at + 1);
    const draw = (at: number, id: number) => send(drawRequest({ id, solid: hashes[at] as string }));
    await draw(0, 10);
    await draw(1, 11);
    await draw(0, 12);
    expect(host.recency).toEqual([hashes[1], hashes[0]]);
    replies.length = 0;
    await draw(2, 13);
    expect(replies.map((reply) => reply.type)).toEqual(['let-go', 'picture']);
    expect(replies[0]).toEqual({ type: 'let-go', hashes: [hashes[1]] });
    expect(gpu?.forgotten).toEqual([hashes[1]]);
    expect(host.solids).toEqual([hashes[0], hashes[2]]);
    // What it let go of is loaded again before it is drawn.
    await draw(1, 14);
    expect(replies.at(-1)).toMatchObject({ type: 'refused', id: 14, code: 'not-loaded' });
  });

  it('lets go of a solid released, and of what a solid loaded again replaces', async () => {
    const { load, send, last, gpu } = setUp();
    await load(ARM);
    await load(ARM, 2);
    expect(gpu?.forgotten).toEqual([ARM_HASH]);
    await send({ type: 'release', hash: ARM_HASH });
    expect(gpu?.forgotten).toEqual([ARM_HASH, ARM_HASH]);
    await send(drawRequest());
    expect(last()).toMatchObject({ type: 'refused', code: 'not-loaded' });
  });

  it('draws a turning’s frames when its camera changes, one a frame, counting from 1', async () => {
    const { load, send, tick, ofType, frames } = setUp();
    await load(ARM);
    const view = turnView({ parts: true });
    await send({ type: 'turn/start', turn: 1, ...view });
    expect(ofType('frame')).toEqual([]);
    tick();
    expect(ofType('frame').map((frame) => frame.serial)).toEqual([1]);
    expect(ofType('frame')[0]?.partBuffer).toBeDefined();
    await send({ type: 'turn/camera', turn: 1, camera: { azimuth: 40, elevation: 20 } });
    await send({
      type: 'turn/camera',
      turn: 1,
      camera: { azimuth: 50, elevation: 10 },
      size: { width: 300, height: 200 },
    });
    expect(frames).toHaveLength(1);
    tick();
    const second = ofType('frame')[1];
    expect(second).toMatchObject({ serial: 2, camera: { azimuth: 50, elevation: 10 }, width: 300 });
    expect(second).not.toHaveProperty('time');
    tick();
    expect(ofType('frame')).toHaveLength(2);
    // Started again, it counts from 1 again.
    await send({ type: 'turn/start', turn: 1, ...view });
    tick();
    expect(ofType('frame').at(-1)?.serial).toBe(1);
    await send({ type: 'turn/end', turn: 1 });
    await send({ type: 'turn/camera', turn: 1, camera: { azimuth: 0, elevation: 0 } });
    tick();
    expect(ofType('frame')).toHaveLength(3);
  });

  it('refuses a turning of a solid not loaded', async () => {
    const { send, last } = setUp();
    const view = turnView();
    await send({ type: 'turn/start', turn: 2, ...view });
    expect(last()).toMatchObject({ type: 'refused', turn: 2, code: 'not-loaded' });
  });

  it('plays an animation in a turning’s frames, looping, and draws pictures at rest', async () => {
    const { load, send, tick, ofType, clock, gpu, frames } = setUp();
    await load(SLIDER);
    const view = turnView({ solid: SLIDER_HASH });
    await send({ type: 'turn/start', turn: 1, ...view });
    tick();
    await send({ type: 'turn/play', turn: 1, animation: 0 });
    clock.now = 500;
    tick();
    expect(ofType('frame').at(-1)?.time).toBeCloseTo(0.5);
    expect(gpu?.draws.at(-1)?.x).toBeCloseTo(0.5);
    // It goes on drawing frames while it plays, and loops.
    clock.now = 2500;
    tick();
    expect(ofType('frame').at(-1)?.time).toBeCloseTo(0.5);
    // A picture drawn meanwhile shows the solid at rest.
    await send(drawRequest({ solid: SLIDER_HASH, id: 20 }));
    expect(gpu?.draws.at(-1)?.x).toBe(0);
    // Paused, it draws no frame of its own, and a new camera shows it where it stopped.
    clock.now = 2750;
    await send({ type: 'turn/play', turn: 1, animation: null });
    tick();
    const count = ofType('frame').length;
    tick();
    expect(ofType('frame')).toHaveLength(count);
    expect(frames).toHaveLength(0);
    await send({ type: 'turn/camera', turn: 1, camera: { azimuth: 10, elevation: 0 } });
    clock.now = 9000;
    tick();
    expect(ofType('frame').at(-1)).not.toHaveProperty('time');
    expect(gpu?.draws.at(-1)?.x).toBeCloseTo(0.75);
    // Played again, it goes on from there.
    await send({ type: 'turn/play', turn: 1, animation: 0 });
    clock.now = 9100;
    tick();
    expect(ofType('frame').at(-1)?.time).toBeCloseTo(0.85);
    // An animation it lacks plays nothing.
    await send({ type: 'turn/play', turn: 1, animation: 5 });
    expect(ofType('frame').at(-1)?.time).toBeCloseTo(0.85);
  });

  it('picks what lies under a pixel, the solid at rest', async () => {
    const { load, send, last } = setUp();
    await send({
      type: 'pick',
      id: 7,
      x: 1,
      y: 1,
      solid: ARM_HASH,
      size: { width: 256, height: 256 },
      camera: { azimuth: 0, elevation: 0 },
      hidden: [],
    });
    expect(last()).toMatchObject({ type: 'refused', id: 7, code: 'not-loaded' });
    await load(ARM);
    await send({
      type: 'pick',
      id: 8,
      x: 128,
      y: 128,
      solid: ARM_HASH,
      size: { width: 256, height: 256 },
      camera: { azimuth: 0, elevation: 0 },
      hidden: [],
    });
    expect(last()).toMatchObject({ type: 'picked', id: 8, part: 1 });
    await send({
      type: 'pick',
      id: 9,
      x: 0,
      y: 0,
      solid: ARM_HASH,
      size: { width: 256, height: 256 },
      camera: { azimuth: 0, elevation: 0 },
      hidden: [],
    });
    expect(last()).toEqual({ type: 'picked', id: 9, part: null });
  });

  it('refuses draws and turnings while its context is lost, and says when it is back', async () => {
    const { load, send, last, gpu, tick, ofType } = setUp();
    await load(ARM);
    const view = turnView();
    await send({ type: 'turn/start', turn: 1, ...view });
    gpu?.lose();
    expect(last()).toEqual({ type: 'context-lost' });
    tick();
    expect(ofType('frame')).toEqual([]);
    await send(drawRequest());
    expect(last()).toMatchObject({ type: 'refused', id: 10, code: 'context-lost' });
    await send({ type: 'turn/start', turn: 1, ...view });
    expect(last()).toMatchObject({ type: 'refused', turn: 1, code: 'context-lost' });
    gpu?.restore();
    expect(last()).toEqual({ type: 'context-restored' });
    await send(drawRequest({ id: 11 }));
    expect(last()).toMatchObject({ type: 'picture', id: 11 });
    // A draw that fails as the context goes is refused as lost, before its event comes.
    if (gpu) {
      gpu.throws = true;
      gpu.lost = true;
    }
    await send(drawRequest({ id: 12 }));
    expect(last()).toMatchObject({ type: 'refused', id: 12, code: 'context-lost' });
  });

  it('refuses everything as unavailable without WebGL, so that solids stay placeholders', async () => {
    const { load, send, replies } = setUp({ gpu: null });
    await load(ARM);
    await send(drawRequest());
    const view = turnView();
    await send({ type: 'turn/start', turn: 4, ...view });
    expect(replies.map((reply) => [reply.type, 'code' in reply ? reply.code : undefined])).toEqual([
      ['ready', undefined],
      ['refused', 'unavailable'],
      ['refused', 'unavailable'],
      ['refused', 'unavailable'],
    ]);
  });

  it('drops a message it cannot read', async () => {
    const { send, replies } = setUp();
    await send({ type: 'draw', id: 0 } as unknown as SolidWorkerRequest);
    expect(replies).toHaveLength(1);
  });

  it('draws through the app’s client as the worker would', async () => {
    const replies: SolidWorkerReply[] = [];
    const listeners: ((event: { data: unknown }) => void)[] = [];
    const start = (): SolidWorkerPort => {
      const host = new SolidWorkerHost({
        post: (reply) => {
          replies.push(reply);
          queueMicrotask(() => {
            for (const listener of listeners) listener({ data: reply });
          });
        },
        gpu: new FakeGpu(),
        decodeImage: () => Promise.resolve(undefined),
        schedule: (callback) => queueMicrotask(callback),
        now: () => 0,
      });
      host.start();
      return {
        postMessage: (message) => void host.receive(message),
        addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
          if (type === 'message') listeners.push(listener);
        },
        terminate() {},
      };
    };
    const client = createSolidClient({
      files: { get: () => Promise.resolve({ ok: true, bytes: ARM.slice() }) },
      start,
    });
    const kept = new Promise<SolidPicture>((resolve) => client.subscribe(resolve));
    client.ask([
      {
        key: 'arm',
        solid: ARM_HASH,
        pixels: 200,
        aspect: 1,
        distance: 0,
        camera: { azimuth: 30, elevation: 20 },
        lighting: 'flat',
        hidden: [],
        parts: true,
      },
    ]);
    const picture = await kept;
    expect(picture.bucket).toBe(256);
    expect(picture.partBuffer?.data).toHaveLength(256 * 256);
    expect(replies.map((reply) => reply.type)).toEqual(['ready', 'loaded', 'picture']);
    client.dispose();
  });
});
