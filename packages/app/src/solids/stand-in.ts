/**
 * A stand-in for the solid worker, for tests (ADR 0075): it speaks the worker's protocol in the same
 * thread, with no three.js and no GPU. It reads each file with the core's reader, as the worker does,
 * and draws a solid as a box for each of its named parts, a square around the part's point placed by
 * the core's camera maths, inner parts over the parts holding them, with the part buffer to match.
 * Tests can hold its answers back, lose and restore its context, and make it let go of solids.
 *
 * It draws the physical-space panel's spaces (ADR 0076) as boxes too: one for each entry not hidden,
 * around its origin as the panel's camera projects it, the nearer over the farther, framed whole while
 * no camera is given, a frame for each change; a pick answers the entry whose box is under the pixel.
 * A test can end a gesture on a space's handles with `endGesture`.
 */
import {
  fitSolidCamera,
  projectSolidPoint,
  readSolid,
  type SolidDescription,
} from '@visual-anything/core';
import type { Id, SpaceCamera, SpacePoint } from '@visual-anything/schema';
import { boundsOfPoint, boundsPlaced, frameSpace, spaceProjection } from '../space/camera';
import type { SolidWorkerPort } from './client';
import {
  LARGEST_SOLID_PICTURE,
  SOLID_WORKER_MEMORY,
  readSolidWorkerReply,
  readSolidWorkerRequest,
  type SolidPartBuffer,
  type SolidView,
  type SolidWorkerReply,
  type SolidWorkerRequest,
  type SpaceDrawnEntry,
  type SpaceMoved,
  type SpaceShown,
} from './protocol';

/** A picture the stand-in made: its pixels, as RGBA, where the page would hold an `ImageBitmap`. */
export interface StandInBitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  closed: boolean;
  close(): void;
}

/** How a stand-in starts. */
export interface StandInOptions {
  /** Holds every answer until `flush`, so that a test can look at what was asked first. */
  manual?: boolean;
  /** Its largest picture, 2,048 pixels unless smaller. */
  largestPicture?: number;
}

type Listener = (event: { data: unknown }) => void;

/** The colors the stand-in fills parts with, by their index. */
const COLORS: readonly (readonly [number, number, number])[] = [
  [192, 57, 43],
  [41, 128, 185],
  [39, 174, 96],
  [142, 68, 173],
  [243, 156, 18],
];

/** A stand-in solid worker, which a test hands to `createSolidClient`. */
export class StandInSolidWorker implements SolidWorkerPort {
  /** Every request it got, read by the protocol's reader, in order. */
  readonly requests: SolidWorkerRequest[] = [];
  /** Whether it was stopped. */
  terminated = false;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly held: SolidWorkerReply[] = [];
  private readonly solids = new Map<string, SolidDescription>();
  private readonly turnings = new Map<
    number,
    { view: SolidView; serial: number; playing: boolean }
  >();
  /** The spaces it draws, by their numbers. */
  readonly spaces = new Map<number, StandInSpace>();
  private lost = false;

  constructor(private readonly options: StandInOptions = {}) {
    this.reply({
      type: 'ready',
      limits: {
        largestPicture: options.largestPicture ?? LARGEST_SOLID_PICTURE,
        memoryBytes: SOLID_WORKER_MEMORY,
      },
    });
  }

  addEventListener(type: 'message' | 'error', listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  postMessage(message: SolidWorkerRequest): void {
    if (this.terminated) throw new Error('The stand-in solid worker was stopped.');
    const read = readSolidWorkerRequest(message);
    if (!read.ok)
      throw new Error(`The app sent the solid worker what it cannot read: ${read.reason}`);
    this.requests.push(read.value);
    this.handle(read.value);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** The requests of one type, in order. */
  ofType<T extends SolidWorkerRequest['type']>(
    type: T,
  ): Extract<SolidWorkerRequest, { type: T }>[] {
    return this.requests.filter(
      (request): request is Extract<SolidWorkerRequest, { type: T }> => request.type === type,
    );
  }

  /** Sends every answer held back, in order. */
  flush(): void {
    for (const reply of this.held.splice(0)) this.emit(reply);
  }

  /** Sends the first answer held back. */
  flushOne(): void {
    const reply = this.held.shift();
    if (reply) this.emit(reply);
  }

  /** How many answers are held back. */
  get waiting(): number {
    return this.held.length;
  }

  /** Loses its context: until it is restored, every draw is refused with `context-lost`. */
  loseContext(): void {
    this.lost = true;
    this.reply({ type: 'context-lost' });
  }

  restoreContext(): void {
    this.lost = false;
    this.reply({ type: 'context-restored' });
    for (const space of this.spaces.keys()) this.spaceFrame(space);
  }

  /** Ends a gesture on a space's handles, as the worker would once the pointer is let go. */
  endGesture(space: number, gesture: 'move' | 'rotate', moved: SpaceMoved[]): void {
    this.reply({ type: 'space/gesture-ended', space, gesture, moved });
  }

  /** Lets go of solids, as it would to keep within its memory. */
  letGo(...hashes: string[]): void {
    for (const hash of hashes) this.solids.delete(hash);
    this.reply({ type: 'let-go', hashes });
  }

  /** Fails as a worker whose script throws: it answers nothing more. */
  fail(): void {
    for (const listener of this.listeners.get('error') ?? []) listener({ data: undefined });
  }

  private handle(request: SolidWorkerRequest): void {
    switch (request.type) {
      case 'load': {
        const bytes = new Uint8Array(request.bytes);
        const read = readSolid(bytes);
        if (!read.ok || read.hash !== request.hash) {
          this.reply({
            type: 'refused',
            id: request.id,
            code: 'invalid-solid',
            message: read.ok
              ? 'The bytes are not the ones their hash names.'
              : (read.problems[0]?.message ?? 'The file is not a canonical solid.'),
          });
          return;
        }
        this.solids.set(request.hash, read.description);
        this.reply({
          type: 'loaded',
          id: request.id,
          hash: request.hash,
          parts: read.description.parts.length,
          animations: read.description.animations.length,
        });
        for (const [number, space] of this.spaces) {
          if (space.shown.entries.some((entry) => entry.solid === request.hash)) {
            this.spaceFrame(number);
          }
        }
        return;
      }
      case 'release':
        this.solids.delete(request.hash);
        return;
      case 'draw': {
        const drawn = this.drawn(request);
        if (typeof drawn === 'string') {
          this.reply({
            type: 'refused',
            id: request.id,
            code: drawn,
            message: `Not drawn: ${drawn}.`,
          });
          return;
        }
        this.reply({
          type: 'picture',
          id: request.id,
          key: request.key,
          bitmap: drawn.bitmap as unknown as ImageBitmap,
          width: request.size.width,
          height: request.size.height,
          ...(request.parts ? { partBuffer: drawn.buffer } : {}),
        });
        return;
      }
      case 'turn/start':
        this.turnings.set(request.turn, { view: request, serial: 0, playing: false });
        this.frame(request.turn);
        return;
      case 'turn/camera': {
        const turning = this.turnings.get(request.turn);
        if (!turning) return;
        turning.view = {
          ...turning.view,
          camera: request.camera,
          ...(request.size ? { size: request.size } : {}),
        };
        this.frame(request.turn);
        return;
      }
      case 'turn/play': {
        const turning = this.turnings.get(request.turn);
        if (!turning) return;
        turning.playing = request.animation !== null;
        if (turning.playing) this.frame(request.turn);
        return;
      }
      case 'turn/end':
        this.turnings.delete(request.turn);
        return;
      case 'pick': {
        const drawn = this.drawn({ ...request, lighting: 'flat', parts: true });
        if (typeof drawn === 'string') {
          this.reply({
            type: 'refused',
            id: request.id,
            code: drawn,
            message: `Not picked: ${drawn}.`,
          });
          return;
        }
        const x = Math.min(request.size.width - 1, Math.floor(request.x));
        const y = Math.min(request.size.height - 1, Math.floor(request.y));
        const value = drawn.buffer.data[y * request.size.width + x] ?? 0;
        const part = value === 0 ? null : value - 1;
        const point =
          part === null ? undefined : this.solids.get(request.solid)?.parts[part]?.point;
        this.reply({ type: 'picked', id: request.id, part, ...(point ? { point } : {}) });
        return;
      }
      case 'space/show': {
        const { entries, states, size, camera, cut, explode, names, lines } = request;
        const shown: SpaceShown = {
          entries,
          states,
          size,
          ...(camera ? { camera } : {}),
          ...(cut ? { cut } : {}),
          ...(explode === undefined ? {} : { explode }),
          ...(names === undefined ? {} : { names }),
          ...(lines ? { lines } : {}),
        };
        this.spaces.set(request.space, { shown, serial: 0 });
        this.spaceFrame(request.space);
        return;
      }
      case 'space/update': {
        const known = this.spaces.get(request.space);
        if (!known) return;
        const { camera, cut, size, entries, states, explode, names, lines } = request;
        const shown: SpaceShown = {
          ...known.shown,
          ...(size ? { size } : {}),
          ...(entries ? { entries } : {}),
          ...(states ? { states } : {}),
          ...(explode === undefined ? {} : { explode }),
          ...(names === undefined ? {} : { names }),
          ...(lines ? { lines } : {}),
        };
        if (camera === null) delete shown.camera;
        else if (camera !== undefined) shown.camera = camera;
        if (cut === null) delete shown.cut;
        else if (cut !== undefined) shown.cut = cut;
        known.shown = shown;
        this.spaceFrame(request.space);
        return;
      }
      case 'space/framing': {
        const known = this.spaces.get(request.space);
        if (!known) {
          this.reply({ type: 'refused', id: request.id, code: 'failed', message: 'No space.' });
          return;
        }
        const named = request.elements && new Set(request.elements);
        const entries = known.shown.entries.filter((entry) => !named || named.has(entry.element));
        this.reply({
          type: 'space/framed',
          space: request.space,
          id: request.id,
          camera: this.framed(known.shown, entries),
        });
        return;
      }
      case 'space/pick': {
        const known = this.spaces.get(request.space);
        if (!known) {
          this.reply({ type: 'refused', id: request.id, code: 'failed', message: 'No space.' });
          return;
        }
        const drawn = drawSpaceBoxes(known.shown, this.cameraOf(known.shown));
        const { width, height } = known.shown.size;
        const x = Math.min(width - 1, Math.floor(request.x));
        const y = Math.min(height - 1, Math.floor(request.y));
        const at = drawn.entries[y * width + x] ?? 0;
        const entry = at === 0 ? undefined : known.shown.entries[at - 1];
        this.reply({
          type: 'space/picked',
          space: request.space,
          id: request.id,
          element: entry?.element ?? null,
          ...(entry ? { point: originOf(entry) } : {}),
        });
        return;
      }
      case 'space/end':
        this.spaces.delete(request.space);
        return;
    }
  }

  /** The camera a space is drawn from: the one given, or the one that frames it whole. */
  private cameraOf(shown: SpaceShown): SpaceCamera {
    return shown.camera ?? this.framed(shown, shown.entries);
  }

  /** The camera that frames these entries: their solids' bounds where given, else their origins. */
  private framed(shown: SpaceShown, entries: readonly SpaceDrawnEntry[]): SpaceCamera {
    const boxes = entries.map((entry) =>
      entry.bounds ? boundsPlaced(entry.matrix, entry.bounds) : boundsOfPoint(originOf(entry)),
    );
    return frameSpace(boxes, shown.size.width / shown.size.height, shown.camera);
  }

  private spaceFrame(number: number): void {
    const space = this.spaces.get(number);
    if (!space) return;
    if (this.lost) {
      this.reply({ type: 'refused', space: number, code: 'context-lost', message: 'Lost.' });
      return;
    }
    const camera = this.cameraOf(space.shown);
    const drawn = drawSpaceBoxes(space.shown, camera);
    space.serial += 1;
    this.reply({
      type: 'space/frame',
      space: number,
      serial: space.serial,
      camera,
      bitmap: drawn.bitmap as unknown as ImageBitmap,
      width: space.shown.size.width,
      height: space.shown.size.height,
    });
  }

  private frame(turn: number): void {
    const turning = this.turnings.get(turn);
    if (!turning) return;
    const drawn = this.drawn(turning.view);
    if (typeof drawn === 'string') {
      this.reply({ type: 'refused', turn, code: drawn, message: `No frame: ${drawn}.` });
      return;
    }
    turning.serial += 1;
    this.reply({
      type: 'frame',
      turn,
      serial: turning.serial,
      camera: turning.view.camera,
      bitmap: drawn.bitmap as unknown as ImageBitmap,
      width: turning.view.size.width,
      height: turning.view.size.height,
      ...(turning.view.parts ? { partBuffer: drawn.buffer } : {}),
      ...(turning.playing ? { time: 0 } : {}),
    });
  }

  /** A view drawn as boxes, or why it cannot be. */
  private drawn(
    view: SolidView,
  ): { bitmap: StandInBitmap; buffer: SolidPartBuffer } | 'not-loaded' | 'context-lost' {
    if (this.lost) return 'context-lost';
    const solid = this.solids.get(view.solid);
    if (!solid) return 'not-loaded';
    return drawBoxes(solid, view);
  }

  private reply(reply: SolidWorkerReply): void {
    // What the stand-in sends, the app's reader must take, as it takes the real worker's.
    const read = readSolidWorkerReply(reply);
    if (!read.ok) throw new Error(`The stand-in sent what the app cannot read: ${read.reason}`);
    this.held.push(read.value);
    if (!this.options.manual) queueMicrotask(() => this.flushOne());
  }

  private emit(reply: SolidWorkerReply): void {
    if (this.terminated) return;
    for (const listener of this.listeners.get('message') ?? []) listener({ data: reply });
  }
}

/** A space the stand-in draws: what it was last told it shows, and its frames' count. */
export interface StandInSpace {
  shown: SpaceShown;
  serial: number;
}

/** Where an entry's origin is, in the coordinates of the element the panel shows. */
function originOf(entry: SpaceDrawnEntry): SpacePoint {
  const m = entry.matrix;
  return { x: m[12] ?? 0, y: m[13] ?? 0, z: m[14] ?? 0 };
}

/**
 * Draws a space as a box for each entry not hidden, around its origin as the camera projects it, the
 * nearer over the farther, with which entry each pixel shows: its index in the entries plus one, or
 * 0 for none.
 */
export function drawSpaceBoxes(
  shown: SpaceShown,
  camera: SpaceCamera,
): { bitmap: StandInBitmap; entries: Uint32Array } {
  const { width, height } = shown.size;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const entries = new Uint32Array(width * height);
  const hidden = new Set<Id>(
    shown.states.filter((state) => state.hidden === true).map((state) => state.element),
  );
  const project = spaceProjection(camera, width / height);
  const side = standInBoxSide(width, height);
  const placed = shown.entries
    .map((entry, index) => ({ entry, index, at: project(originOf(entry)) }))
    .filter(({ entry, at }) => !hidden.has(entry.element) && at.depth > 0)
    // The farthest first, so that the nearer lie over them.
    .sort((a, b) => b.at.depth - a.at.depth);
  for (const { index, at } of placed) {
    const left = Math.max(0, Math.round(at.x * width - side / 2));
    const top = Math.max(0, Math.round(at.y * height - side / 2));
    const right = Math.min(width, left + side);
    const bottom = Math.min(height, top + side);
    const [r, g, b] = COLORS[index % COLORS.length] as readonly [number, number, number];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const pixel = y * width + x;
        entries[pixel] = index + 1;
        pixels.set([r, g, b, 255], pixel * 4);
      }
    }
  }
  const bitmap: StandInBitmap = {
    width,
    height,
    pixels,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  return { bitmap, entries };
}

/** The side of each part's box, in pixels, for a picture of this size. */
export function standInBoxSide(width: number, height: number): number {
  return Math.max(2, Math.round(Math.min(width, height) / 8));
}

/** Where a part's box is drawn in a view: around its point, projected by the core's camera. */
export function standInPixelOf(
  solid: SolidDescription,
  view: Pick<SolidView, 'camera' | 'size'>,
  point: SpacePoint,
): { x: number; y: number } {
  const { width, height } = view.size;
  const camera = fitSolidCamera(solid.bounds, view.camera, width / height);
  const projected = projectSolidPoint(camera, point);
  return { x: projected.x * width, y: projected.y * height };
}

/**
 * Draws a solid as a box for each named part drawn, in depth-first order, so that a part's box lies
 * over those of the parts holding it, and its part buffer.
 */
export function drawBoxes(
  solid: SolidDescription,
  view: SolidView,
): { bitmap: StandInBitmap; buffer: SolidPartBuffer } {
  const { width, height } = view.size;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const data = new Uint16Array(width * height);
  const hidden = new Set(view.hidden);
  const side = standInBoxSide(width, height);
  solid.parts.forEach((part, index) => {
    if (hidden.has(index) || part.point === undefined) return;
    if (view.only !== undefined && view.only !== index) return;
    const middle = standInPixelOf(solid, view, part.point);
    const left = Math.max(0, Math.round(middle.x - side / 2));
    const top = Math.max(0, Math.round(middle.y - side / 2));
    const right = Math.min(width, left + side);
    const bottom = Math.min(height, top + side);
    const [r, g, b] = COLORS[index % COLORS.length] as readonly [number, number, number];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const at = y * width + x;
        data[at] = index + 1;
        pixels.set([r, g, b, 255], at * 4);
      }
    }
  });
  const bitmap: StandInBitmap = {
    width,
    height,
    pixels,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  return { bitmap, buffer: { width, height, data } };
}
