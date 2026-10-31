/**
 * The app's side of the solid worker (ADR 0075), against the stand-in worker: it starts only once a
 * picture is asked for, gets files from the program by their hash, asks for the pictures nearest the
 * middle of the screen first, keeps them for the session by key and bucket, and follows what the
 * worker lets go of, a lost context, turning and picking.
 */
import { readSolid, solidHash, type SolidDescription } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { boxMesh, writeTestSolid } from '../../../core/src/test/solids';
import {
  DRAWS_AT_ONCE,
  createSolidClient,
  keptKey,
  type SolidFileResult,
  type SolidPictureAsk,
} from './client';
import { StandInSolidWorker, standInPixelOf, type StandInBitmap } from './stand-in';

/** An arm of three named parts: a base, a link on it, and a gripper held by the link. */
const ARM = writeTestSolid({
  nodes: [
    { name: 'base', mesh: 0, children: [1] },
    { name: 'link', mesh: 1, children: [2] },
    { name: 'gripper', mesh: 2 },
  ],
  meshes: [
    boxMesh([-0.5, 0, -0.5], [0.5, 0.2, 0.5]),
    boxMesh([-0.1, 0.2, -0.1], [0.1, 1, 0.1]),
    boxMesh([-0.2, 1, -0.05], [0.2, 1.2, 0.05]),
  ],
});
const ARM_HASH = solidHash(ARM);
const ARM_DESCRIPTION = (readSolid(ARM) as { description: SolidDescription }).description;

/** A plain box with one part. */
const BOX = writeTestSolid({
  nodes: [{ name: 'box', mesh: 0 }],
  meshes: [boxMesh([0, 0, 0], [1, 1, 1])],
});
const BOX_HASH = solidHash(BOX);

const FILES = new Map([
  [ARM_HASH, ARM],
  [BOX_HASH, BOX],
]);

function filesOf(refuse: ReadonlySet<string> = new Set()) {
  const get = vi.fn((hash: string): Promise<SolidFileResult> => {
    const bytes = FILES.get(hash);
    if (!bytes || refuse.has(hash)) {
      return Promise.resolve({ ok: false, code: 'solid-file-missing', message: 'No such file.' });
    }
    // A copy, as the live connection puts one together from its pieces.
    return Promise.resolve({ ok: true, bytes: bytes.slice() });
  });
  return { get };
}

function setUp(options: { manual?: boolean; refuse?: ReadonlySet<string> } = {}) {
  const workers: StandInSolidWorker[] = [];
  const start = vi.fn(() => {
    const worker = new StandInSolidWorker({ manual: options.manual ?? false });
    workers.push(worker);
    return worker;
  });
  const files = filesOf(options.refuse);
  const client = createSolidClient({ files, start });
  return { client, files, start, workers, worker: () => workers.at(-1) as StandInSolidWorker };
}

function ask(key: string, distance: number, more: Partial<SolidPictureAsk> = {}): SolidPictureAsk {
  return {
    key,
    solid: ARM_HASH,
    pixels: 200,
    aspect: 1,
    distance,
    camera: { azimuth: 30, elevation: 20 },
    lighting: 'studio',
    hidden: [],
    parts: false,
    ...more,
  };
}

/** Lets every promise and microtask settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('starting the worker', () => {
  it('starts it only once a picture is asked for', async () => {
    const { client, start } = setUp();
    expect(client.started).toBe(false);
    client.ask([]);
    expect(start).not.toHaveBeenCalled();
    expect(client.picture('arm', 200)).toBeUndefined();
    client.ask([ask('arm', 0)]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(client.started).toBe(true);
    await settle();
    expect(client.limits).toEqual({ largestPicture: 2048, memoryBytes: 768 * 1024 * 1024 });
  });

  it('gets the file from the program by its hash, once, and hands its bytes to the worker', async () => {
    const { client, files, worker } = setUp();
    client.ask([ask('one', 0), ask('two', 1)]);
    await settle();
    expect(files.get).toHaveBeenCalledTimes(1);
    expect(files.get).toHaveBeenCalledWith(ARM_HASH);
    const [load] = worker().ofType('load');
    expect(load?.hash).toBe(ARM_HASH);
    expect(new Uint8Array(load?.bytes as ArrayBuffer)).toEqual(ARM);
    expect(
      worker()
        .ofType('draw')
        .map((draw) => draw.key),
    ).toEqual(['one@256', 'two@256']);
  });
});

describe('asking for pictures', () => {
  it('asks for those nearest the middle of the screen first, a few at a time', async () => {
    const { client, worker } = setUp({ manual: true });
    client.ask([ask('far', 300), ask('near', 10), ask('middle', 100), ask('nearest', 0)]);
    await settle();
    // The worker says it is ready, and has loaded the file.
    worker().flush();
    await settle();
    expect(
      worker()
        .ofType('draw')
        .map((draw) => draw.key),
    ).toEqual(['nearest@256', 'near@256']);
    // A newer wish reorders what is still to come, as the pictures on their way arrive.
    client.ask([ask('far', 0), ask('middle', 500), ask('near', 10), ask('nearest', 0)]);
    worker().flushOne();
    await settle();
    expect(worker().ofType('draw').at(-1)?.key).toBe('far@256');
    worker().flush();
    await settle();
    expect(
      worker()
        .ofType('draw')
        .map((draw) => draw.key),
    ).toEqual(['nearest@256', 'near@256', 'far@256', 'middle@256']);
    expect(DRAWS_AT_ONCE).toBe(2);
  });

  it('keeps pictures for the session by key and bucket, and shows the nearest kept meanwhile', async () => {
    const { client, worker } = setUp();
    const seen: string[] = [];
    client.subscribe((picture) => seen.push(`${picture.key}@${picture.bucket}`));
    client.ask([ask('arm', 0, { pixels: 200 })]);
    await settle();
    expect(seen).toEqual(['arm@256']);
    const kept = client.picture('arm', 200);
    expect(kept?.exact).toBe(true);
    expect(kept?.picture).toMatchObject({ key: 'arm', bucket: 256, width: 256, height: 256 });
    // Asked again, it is not drawn again.
    client.ask([ask('arm', 0, { pixels: 250 })]);
    await settle();
    expect(worker().ofType('draw')).toHaveLength(1);
    // Zoomed in, the larger bucket is drawn, and the one kept shows until it comes.
    const meanwhile = client.picture('arm', 900);
    expect(meanwhile).toMatchObject({ exact: false, picture: { bucket: 256 } });
    client.ask([ask('arm', 0, { pixels: 900 })]);
    await settle();
    expect(client.picture('arm', 900)).toMatchObject({ exact: true, picture: { bucket: 1024 } });
    // Each key and bucket has its own serial in the image store.
    expect(client.picture('arm', 900)?.picture.serial).not.toBe(kept?.picture.serial);
  });

  it('draws the aspect asked for, and a drawing with parts with its part buffer', async () => {
    const { client, worker } = setUp();
    client.ask([ask('wide', 0, { aspect: 2, parts: true, pixels: 500 })]);
    await settle();
    const [draw] = worker().ofType('draw');
    expect(draw?.size).toEqual({ width: 512, height: 256 });
    const picture = client.picture('wide', 500)?.picture;
    const buffer = picture?.partBuffer;
    expect(buffer).toBeDefined();
    // Every part is drawn, and the pixel at the gripper's point, the innermost, holds its index plus one.
    expect(new Set(buffer?.data)).toEqual(new Set([0, 1, 2, 3]));
    const gripper = ARM_DESCRIPTION.parts[2]?.point;
    const pixel = standInPixelOf(ARM_DESCRIPTION, draw!, gripper!);
    expect(buffer?.data[Math.floor(pixel.y) * 512 + Math.floor(pixel.x)]).toBe(3);
  });

  it('draws a solid again without its hidden parts, as a picture of its own', async () => {
    const { client, worker } = setUp();
    client.ask([
      ask('arm', 0, { parts: true }),
      ask('arm hidden', 1, { parts: true, hidden: [2] }),
    ]);
    await settle();
    const draws = worker().ofType('draw');
    expect(draws.map((draw) => draw.hidden)).toEqual([[], [2]]);
    const hidden = client.picture('arm hidden', 200)?.picture.partBuffer?.data ?? [];
    expect([...hidden].includes(3)).toBe(false);
  });

  it('leaves a solid whose file is refused drawn as its placeholder, and asks for it no more', async () => {
    const { client, worker, files } = setUp({ refuse: new Set([ARM_HASH]) });
    client.ask([ask('arm', 0), ask('box', 1, { solid: BOX_HASH })]);
    await settle();
    expect(client.problem(ARM_HASH)).toEqual({
      code: 'solid-file-missing',
      message: 'No such file.',
    });
    expect(client.problem(BOX_HASH)).toBeUndefined();
    expect(
      worker()
        .ofType('draw')
        .map((draw) => draw.key),
    ).toEqual(['box@256']);
    client.ask([ask('arm', 0)]);
    await settle();
    expect(files.get).toHaveBeenCalledTimes(2);
  });

  it('leaves a solid the worker cannot read drawn as its placeholder', async () => {
    const { client, worker } = setUp();
    const notCanonical = new Uint8Array(ARM.length).fill(1);
    FILES.set('1'.repeat(64), notCanonical);
    client.ask([ask('broken', 0, { solid: '1'.repeat(64) })]);
    await settle();
    expect(client.problem('1'.repeat(64))?.code).toBe('invalid-solid');
    expect(worker().ofType('draw')).toEqual([]);
    FILES.delete('1'.repeat(64));
  });

  it('loads a solid again that the worker let go of, before drawing it', async () => {
    const { client, worker, files } = setUp();
    client.ask([ask('arm', 0)]);
    await settle();
    worker().letGo(ARM_HASH);
    await settle();
    client.ask([ask('arm bigger', 0, { pixels: 1000 })]);
    await settle();
    expect(files.get).toHaveBeenCalledTimes(2);
    expect(worker().ofType('load')).toHaveLength(2);
    expect(client.picture('arm bigger', 1000)?.exact).toBe(true);
  });

  it('asks again, once its context is back, for what was refused while it was lost', async () => {
    const { client, worker } = setUp();
    client.ask([ask('first', 0)]);
    await settle();
    worker().loseContext();
    await settle();
    expect(client.contextLost).toBe(true);
    client.ask([ask('second', 0)]);
    await settle();
    expect(
      worker()
        .ofType('draw')
        .map((draw) => draw.key),
    ).toEqual(['first@256']);
    // The picture kept is the page's own, and still shows.
    expect(client.picture('first', 200)?.exact).toBe(true);
    worker().restoreContext();
    await settle();
    expect(client.contextLost).toBe(false);
    expect(client.picture('second', 200)?.exact).toBe(true);
  });

  it('starts a worker again after one fails, and gives up after three', async () => {
    const { client, workers, start } = setUp({ manual: true });
    client.ask([ask('arm', 0)]);
    for (let round = 0; round < 3; round++) {
      await settle();
      workers.at(-1)?.fail();
    }
    await settle();
    expect(start).toHaveBeenCalledTimes(3);
    expect(client.unavailable).toBe(true);
    client.ask([ask('arm', 0)]);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it('stops asking once the worker says this build draws no solids', async () => {
    const { client, worker } = setUp();
    client.ask([ask('arm', 0)]);
    await settle();
    worker()['reply']({ type: 'refused', id: 99, code: 'unavailable', message: 'No solids here.' });
    await settle();
    expect(client.unavailable).toBe(true);
  });

  it('closes every picture it kept when it is disposed, and stops the worker', async () => {
    const { client, worker } = setUp();
    client.ask([ask('arm', 0)]);
    await settle();
    const bitmap = client.picture('arm', 200)?.picture.bitmap as unknown as StandInBitmap;
    client.dispose();
    expect(bitmap.closed).toBe(true);
    expect(worker().terminated).toBe(true);
    expect(client.picture('arm', 200)).toBeUndefined();
  });
});

describe('turning and picking', () => {
  const VIEW = {
    solid: ARM_HASH,
    size: { width: 300, height: 200 },
    camera: { azimuth: 30, elevation: 20 },
    lighting: 'studio' as const,
    hidden: [],
    parts: true,
  };

  it('loads the solid, then gives the newest frame as the camera changes', async () => {
    const { client, worker } = setUp();
    const frames: number[] = [];
    const turning = client.turn(VIEW, (frame) => frames.push(frame.serial));
    await settle();
    expect(worker().ofType('turn/start')).toHaveLength(1);
    const first = turning.frame?.bitmap as unknown as StandInBitmap;
    turning.camera({ azimuth: 45, elevation: 20 });
    await settle();
    expect(frames).toEqual([1, 2]);
    expect(turning.frame?.camera).toEqual({ azimuth: 45, elevation: 20 });
    expect(first.closed).toBe(true);
    expect(turning.frame?.partBuffer).toBeDefined();
    turning.play(0);
    await settle();
    expect(turning.frame?.time).toBe(0);
    turning.end();
    expect(worker().ofType('turn/end')).toEqual([{ type: 'turn/end', turn: turning.turn }]);
    turning.camera({ azimuth: 0, elevation: 0 });
    expect(worker().ofType('turn/camera')).toHaveLength(1);
  });

  it('starts a turning again once a lost context is back', async () => {
    const { client, worker } = setUp();
    const turning = client.turn(VIEW);
    await settle();
    worker().loseContext();
    turning.camera({ azimuth: 90, elevation: 0 });
    await settle();
    worker().restoreContext();
    await settle();
    const starts = worker().ofType('turn/start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.camera).toEqual({ azimuth: 90, elevation: 0 });
    expect(turning.frame?.camera).toEqual({ azimuth: 90, elevation: 0 });
  });

  it('picks the part under a pixel, and its point', async () => {
    const { client } = setUp();
    client.ask([ask('arm', 0)]);
    await settle();
    const gripper = ARM_DESCRIPTION.parts[2]!;
    const pixel = standInPixelOf(ARM_DESCRIPTION, VIEW, gripper.point!);
    const picked = await client.pick({
      solid: ARM_HASH,
      size: VIEW.size,
      camera: VIEW.camera,
      hidden: [],
      x: pixel.x,
      y: pixel.y,
    });
    expect(picked).toMatchObject({ part: 2, point: gripper.point });
    const nothing = await client.pick({
      solid: ARM_HASH,
      size: VIEW.size,
      camera: VIEW.camera,
      hidden: [],
      x: 0,
      y: 0,
    });
    expect(nothing).toMatchObject({ part: null });
    // A solid not loaded is picked by no one.
    expect(
      await client.pick({
        solid: BOX_HASH,
        size: VIEW.size,
        camera: VIEW.camera,
        hidden: [],
        x: 0,
        y: 0,
      }),
    ).toBeUndefined();
  });

  it('names each picture it asks for by its key and bucket', () => {
    expect(keptKey('k', 512)).toBe('k@512');
  });
});

describe('drawing pictures at once, as an export does', () => {
  it('keeps them asked for, before the canvas’s, whatever the canvas asks meanwhile', async () => {
    const { client, worker } = setUp({ manual: true });
    client.ask([ask('screen', 0)]);
    const drawn = client.draw([ask('export', 50, { pixels: 900, parts: true })]);
    // The canvas asks for something else, which replaces what it wanted, but not what is drawn.
    client.ask([ask('other', 0)]);
    for (let round = 0; round < 5; round++) {
      await settle();
      worker().flush();
    }
    const [picture] = await drawn;
    expect(picture).toMatchObject({ key: 'export', bucket: 1024 });
    expect(picture?.partBuffer).toBeDefined();
    expect(
      worker()
        .ofType('draw')
        .map((draw) => draw.key)[0],
    ).toBe('export@1024');
    // Kept for the session, as any other picture.
    expect(client.picture('export', 900)).toMatchObject({ exact: true });
    // Asked again, it resolves at once, drawn once.
    const [again] = await client.draw([ask('export', 0, { pixels: 900, parts: true })]);
    expect(again).toBe(picture);
    expect(
      worker()
        .ofType('draw')
        .filter((draw) => draw.key === 'export@1024'),
    ).toHaveLength(1);
  });

  it('resolves with none once a file is refused, or the client is gone', async () => {
    const refused = setUp({ refuse: new Set([ARM_HASH]) });
    expect(await refused.client.draw([ask('arm', 0)])).toEqual([undefined]);
    // Its problem is known now: asked again, it resolves at once.
    expect(await refused.client.draw([ask('arm', 0)])).toEqual([undefined]);

    const disposed = setUp({ manual: true });
    const waiting = disposed.client.draw([ask('arm', 0)]);
    disposed.client.dispose();
    expect(await waiting).toEqual([undefined]);
    expect(await disposed.client.draw([ask('arm', 0)])).toEqual([undefined]);
  });
});
