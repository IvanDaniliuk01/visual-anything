/**
 * The app's side of the solid worker (ADR 0075), whichever worker it starts: `client.ts` starts the
 * app's by its address, and the read-only page the one it holds. three.js runs only there, and the worker starts only
 * once the open view draws a solid: the first time the canvas asks for a picture.
 *
 * - **Files.** A solid's file comes from the local program over the live connection, by its hash
 *   (`solid/get`, answered in `solid/piece`s), and is handed to the worker, transferred: the page
 *   keeps no copy. The worker reads it with the core's reader and checks it against its hash. A file
 *   the program or the worker refuses leaves its solid drawn as its placeholder for the session.
 * - **Pictures.** The canvas says, as often as what shows changes, which pictures it wants and how
 *   far each is from the middle of the screen; the client asks the worker for those nearest the
 *   middle first, a few at a time, so that a newer wish reorders what is still to come. Pictures are
 *   kept for the session by their key, which `solidPictureKey` makes of the solid, its camera, its
 *   lighting, its hidden parts and its aspect, and by their bucket: 128, 256, 512, 1,024 or 2,048
 *   pixels on the longer side. While the right bucket is on its way, the nearest one kept shows.
 * - **Turning, picking, letting go, a lost context.** A turning's frames come as the camera changes,
 *   the newest one kept; what the worker let go of is loaded again when next drawn; draws refused
 *   while its context is lost are asked again once it is back, and a turning is started again.
 */
import type { SolidCamera } from '@visual-anything/schema';
import {
  readSolidWorkerReply,
  solidBucketFor,
  solidPictureSize,
  type PixelSize,
  type SolidBucket,
  type SolidFrameReply,
  type SolidPartBuffer,
  type SolidPickRequest,
  type SolidPickedReply,
  type SolidView,
  type SolidWorkerLimits,
  type SolidWorkerReply,
  type SolidWorkerRequest,
} from './protocol';
import { solidPictureSerial } from '../canvas/image-serials';
import type { SolidPictureAsk } from './ask';

export { solidAskFor, type SolidPictureAsk } from './ask';

/** What the client needs of a worker: the solid worker, or a stand-in for it in tests. */
export interface SolidWorkerPort {
  postMessage(message: SolidWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  terminate(): void;
}

/** A solid's file from the local program, or why it sent none. */
export type SolidFileResult =
  { ok: true; bytes: Uint8Array } | { ok: false; code: string; message: string };

/** Where the client gets solids' files: the program, over the live connection. */
export interface SolidFiles {
  get(hash: string): Promise<SolidFileResult>;
}

/** The files of the program a live connection is open to (`LiveConnection.getSolidFile`). */
export function solidFilesOver(connection: {
  getSolidFile(
    hash: string,
  ): Promise<
    { ok: true; answer: Uint8Array } | { ok: false; problems: { code: string; message: string }[] }
  >;
}): SolidFiles {
  return {
    async get(hash) {
      const result = await connection.getSolidFile(hash);
      if (result.ok) return { ok: true, bytes: result.answer };
      const first = result.problems[0];
      return {
        ok: false,
        code: first?.code ?? 'solid-file-missing',
        message: result.problems.map((each) => each.message).join(' '),
      };
    },
  };
}

/** A picture kept for the session. */
export interface SolidPicture {
  key: string;
  bucket: SolidBucket;
  /** Its serial in the image store, one for each key and bucket (`canvas/image-serials.ts`). */
  serial: number;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  partBuffer?: SolidPartBuffer;
}

/** Why a solid draws its placeholder: its file could not be had, or read. */
export interface SolidProblem {
  code: string;
  message: string;
}

/** A solid turned live (ADR 0075): its newest frame, and how to turn it, play it and end it. */
export interface SolidTurning {
  readonly turn: number;
  /** Its newest frame; absent until the first comes. The client closes the frames it replaces. */
  readonly frame: SolidFrameReply | undefined;
  camera(camera: SolidCamera, size?: PixelSize): void;
  /** Plays an animation, by its index, in its frames, looping; `null` pauses it. */
  play(animation: number | null): void;
  end(): void;
}

/** The app's side of the solid worker. */
export interface SolidClient {
  /** Whether the worker started. */
  readonly started: boolean;
  /** The worker's limits, once it said them. */
  readonly limits: SolidWorkerLimits | undefined;
  /** Whether the worker's context is lost now. */
  readonly contextLost: boolean;
  /** Whether this build draws no solids at all: every solid stays its placeholder. */
  readonly unavailable: boolean;
  /**
   * The picture kept for a key at the bucket that `pixels` asks for, `exact`; or else the nearest one
   * kept for that key, larger ones first; or none.
   */
  picture(key: string, pixels: number): { picture: SolidPicture; exact: boolean } | undefined;
  /** Why a solid, by its file's hash, draws its placeholder, if it does for good. */
  problem(hash: string): SolidProblem | undefined;
  /**
   * The pictures the canvas wants now, which replace those it wanted before and that are not yet
   * on their way. Starts the worker when it is not started and something is asked for.
   */
  ask(asks: readonly SolidPictureAsk[]): void;
  /**
   * Pictures wanted at once, as an export wants them: each stays asked for, before anything the
   * canvas asks meanwhile, until it is kept, and resolves with it; or with none once its file or its
   * drawing is refused, or the build draws no solids. Starts the worker as `ask` does.
   */
  draw(asks: readonly SolidPictureAsk[]): Promise<(SolidPicture | undefined)[]>;
  /** Called with each picture as it is kept. */
  subscribe(listener: (picture: SolidPicture) => void): () => void;
  /** Turns a solid live, with `onFrame` called for each newer frame. */
  turn(view: SolidView, onFrame?: (frame: SolidFrameReply) => void): SolidTurning;
  /** What part, and point, lies under a pixel of a view; none when the worker could not say. */
  pick(request: Omit<SolidPickRequest, 'type' | 'id'>): Promise<SolidPickedReply | undefined>;
  /** Lets go of a solid the open views no longer draw. Its pictures stay kept. */
  release(hash: string): void;
  /** Stops the worker and closes every picture kept. */
  dispose(): void;
}

/** How many pictures are on their way at once, so that a newer wish can reorder the rest. */
export const DRAWS_AT_ONCE = 2;
/** How many files are fetched and loaded at once. */
export const LOADS_AT_ONCE = 2;
/** How many times a worker that fails is started again before the client gives up on it. */
const MOST_STARTS = 3;

/** What `createSolidClient` takes. */
export interface SolidClientOptions {
  files: SolidFiles;
  /** Starts the worker; the solid worker by default. */
  start?: () => SolidWorkerPort;
}

interface Wanted {
  ask: SolidPictureAsk;
  bucket: SolidBucket;
  /** The key the picture is kept by, and asked for by: the ask's key and its bucket. */
  kept: string;
}

/** The key a picture is kept by: its shape's key and its bucket. */
export function keptKey(key: string, bucket: number): string {
  return `${key}@${bucket}`;
}

/**
 * Makes the app's side of a solid worker that `start` starts; nothing starts until a picture is asked
 * for. The app's `createSolidClient` starts the solid worker by its address; the read-only page starts
 * the copy of it the page holds.
 */
export function createSolidClientWith(
  files: SolidFiles,
  start: () => SolidWorkerPort,
): SolidClient {
  return new Client(files, start);
}

class Client implements SolidClient {
  private worker: SolidWorkerPort | undefined;
  private starts = 0;
  private count = 0;
  private turns = 0;
  limits: SolidWorkerLimits | undefined;
  contextLost = false;
  unavailable = false;
  private readonly kept = new Map<string, SolidPicture>();
  /** The buckets kept for each key. */
  private readonly bucketsOf = new Map<string, Set<SolidBucket>>();
  private wanted: Wanted[] = [];
  private readonly drawing = new Map<number, Wanted>();
  private readonly loaded = new Set<string>();
  private readonly loading = new Map<string, number | 'fetching'>();
  private readonly problems = new Map<string, SolidProblem>();
  /** Pictures the worker failed to draw, by their kept key: not asked for again this session. */
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<(picture: SolidPicture) => void>();
  private readonly picks = new Map<number, (reply: SolidPickedReply | undefined) => void>();
  private readonly turnings = new Map<number, TurningState>();
  /** What `draw` waits for, by kept key: asked for before anything else until it settles. */
  private readonly pinned = new Map<
    string,
    { wanted: Wanted; waiting: ((picture: SolidPicture | undefined) => void)[] }
  >();
  /** What the canvas asked for last, which a picture pinned since is asked for with. */
  private lastAsks: readonly SolidPictureAsk[] = [];
  private disposed = false;

  constructor(
    private readonly files: SolidFiles,
    private readonly start: () => SolidWorkerPort,
  ) {}

  get started(): boolean {
    return this.worker !== undefined;
  }

  picture(key: string, pixels: number): { picture: SolidPicture; exact: boolean } | undefined {
    const bucket = solidBucketFor(pixels, this.limits?.largestPicture);
    const exact = this.kept.get(keptKey(key, bucket));
    if (exact) return { picture: exact, exact: true };
    const buckets = [...(this.bucketsOf.get(key) ?? [])];
    if (buckets.length === 0) return undefined;
    // The nearest bucket kept, a larger one before a smaller one as far away.
    buckets.sort(
      (a, b) => Math.abs(Math.log2(a / bucket)) - Math.abs(Math.log2(b / bucket)) || b - a,
    );
    const nearest = this.kept.get(keptKey(key, buckets[0] as SolidBucket));
    return nearest && { picture: nearest, exact: false };
  }

  problem(hash: string): SolidProblem | undefined {
    return this.problems.get(hash);
  }

  ask(asks: readonly SolidPictureAsk[]): void {
    if (this.disposed || this.unavailable) return;
    this.lastAsks = asks;
    const onTheirWay = new Set([...this.drawing.values()].map((each) => each.kept));
    const seen = new Set<string>();
    const wanted: Wanted[] = [];
    // What an export waits for comes first, nearer than anything on screen.
    const pinned = [...this.pinned.values()].map(({ wanted: each }) => ({
      ...each.ask,
      distance: -Infinity,
    }));
    for (const ask of [...pinned, ...asks]) {
      const bucket = solidBucketFor(ask.pixels, this.limits?.largestPicture);
      const kept = keptKey(ask.key, bucket);
      if (seen.has(kept)) continue;
      seen.add(kept);
      if (this.kept.has(kept) || onTheirWay.has(kept) || this.failed.has(kept)) continue;
      if (this.problems.has(ask.solid)) continue;
      wanted.push({ ask, bucket, kept });
    }
    // The nearest the middle of the screen first; equally near, in the order asked.
    this.wanted = wanted
      .map((each, at) => ({ each, at }))
      .sort((a, b) => a.each.ask.distance - b.each.ask.distance || a.at - b.at)
      .map(({ each }) => each);
    this.pump();
  }

  draw(asks: readonly SolidPictureAsk[]): Promise<(SolidPicture | undefined)[]> {
    return Promise.all(asks.map((ask) => this.drawOne(ask)));
  }

  private drawOne(ask: SolidPictureAsk): Promise<SolidPicture | undefined> {
    if (this.disposed || this.unavailable) return Promise.resolve(undefined);
    const bucket = solidBucketFor(ask.pixels, this.limits?.largestPicture);
    const kept = keptKey(ask.key, bucket);
    const known = this.kept.get(kept);
    if (known) return Promise.resolve(known);
    if (this.failed.has(kept) || this.problems.has(ask.solid)) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const pin = this.pinned.get(kept);
      if (pin) pin.waiting.push(resolve);
      else this.pinned.set(kept, { wanted: { ask, bucket, kept }, waiting: [resolve] });
      this.ask(this.lastAsks);
    });
  }

  /** Settles what `draw` waits for that is kept now, or that can no longer come. */
  private settlePins(): void {
    for (const [kept, pin] of this.pinned) {
      const picture = this.kept.get(kept);
      const never =
        this.disposed ||
        this.unavailable ||
        this.failed.has(kept) ||
        this.problems.has(pin.wanted.ask.solid);
      if (!picture && !never) continue;
      this.pinned.delete(kept);
      for (const resolve of pin.waiting) resolve(picture);
    }
  }

  subscribe(listener: (picture: SolidPicture) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  turn(view: SolidView, onFrame?: (frame: SolidFrameReply) => void): SolidTurning {
    const turn = ++this.turns;
    const state: TurningState = {
      view,
      playing: null,
      started: false,
      ended: false,
      serial: 0,
      onFrame,
    };
    this.turnings.set(turn, state);
    this.startTurning(turn, state);
    return {
      turn,
      get frame() {
        return state.frame;
      },
      camera: (camera, size) => {
        if (state.ended) return;
        state.view = { ...state.view, camera, ...(size ? { size } : {}) };
        if (state.started)
          this.post({ type: 'turn/camera', turn, camera, ...(size ? { size } : {}) });
      },
      play: (animation) => {
        if (state.ended) return;
        state.playing = animation;
        if (state.started) this.post({ type: 'turn/play', turn, animation });
      },
      end: () => {
        if (state.ended) return;
        state.ended = true;
        this.turnings.delete(turn);
        state.frame?.bitmap.close();
        delete state.frame;
        if (state.started) this.post({ type: 'turn/end', turn });
      },
    };
  }

  pick(request: Omit<SolidPickRequest, 'type' | 'id'>): Promise<SolidPickedReply | undefined> {
    if (this.disposed || this.unavailable || !this.loaded.has(request.solid)) {
      return Promise.resolve(undefined);
    }
    const id = ++this.count;
    return new Promise((resolve) => {
      this.picks.set(id, resolve);
      if (!this.post({ type: 'pick', id, ...request })) {
        this.picks.delete(id);
        resolve(undefined);
      }
    });
  }

  release(hash: string): void {
    if (!this.loaded.delete(hash)) return;
    this.post({ type: 'release', hash });
  }

  dispose(): void {
    this.disposed = true;
    for (const pin of this.pinned.values()) for (const resolve of pin.waiting) resolve(undefined);
    this.pinned.clear();
    this.worker?.terminate();
    this.worker = undefined;
    for (const picture of this.kept.values()) picture.bitmap.close();
    this.kept.clear();
    this.bucketsOf.clear();
    for (const state of this.turnings.values()) state.frame?.bitmap.close();
    this.turnings.clear();
    for (const resolve of this.picks.values()) resolve(undefined);
    this.picks.clear();
    this.wanted = [];
    this.drawing.clear();
  }

  // What is sent ----------------------------------------------------------------------------------

  /** Sends what can be sent now: files to load, then the nearest pictures whose files are loaded. */
  private pump(): void {
    this.settlePins();
    if (this.disposed || this.unavailable || this.contextLost) return;
    if (this.wanted.length === 0) return;
    if (!this.ensure()) return;
    const loadsOnTheirWay = () => this.loading.size;
    const left: Wanted[] = [];
    for (const each of this.wanted) {
      const { solid } = each.ask;
      if (this.problems.has(solid)) continue;
      if (this.loaded.has(solid)) {
        if (this.drawing.size < DRAWS_AT_ONCE) this.send(each);
        else left.push(each);
        continue;
      }
      if (!this.loading.has(solid) && loadsOnTheirWay() < LOADS_AT_ONCE) this.load(solid);
      left.push(each);
    }
    this.wanted = left;
  }

  /** The worker, started when it is not; none when it cannot be. */
  private ensure(): SolidWorkerPort | undefined {
    if (this.worker) return this.worker;
    if (this.starts >= MOST_STARTS) {
      this.unavailable = true;
      return undefined;
    }
    this.starts += 1;
    let started: SolidWorkerPort;
    try {
      started = this.start();
    } catch {
      this.unavailable = true;
      return undefined;
    }
    started.addEventListener('message', (event) => {
      if (this.worker === started) this.receive(event.data);
    });
    started.addEventListener('error', () => {
      if (this.worker === started) this.failedWorker(started);
    });
    this.worker = started;
    return started;
  }

  private post(message: SolidWorkerRequest, transfer?: Transferable[]): boolean {
    const worker = this.worker;
    if (!worker) return false;
    try {
      if (transfer) worker.postMessage(message, transfer);
      else worker.postMessage(message);
      return true;
    } catch {
      this.failedWorker(worker);
      return false;
    }
  }

  private load(hash: string): void {
    this.loading.set(hash, 'fetching');
    void this.files.get(hash).then(
      (result) => this.fetched(hash, result),
      (error: unknown) =>
        this.fetched(hash, {
          ok: false,
          code: 'solid-file-missing',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  }

  private fetched(hash: string, result: SolidFileResult): void {
    if (this.disposed || this.loading.get(hash) !== 'fetching') return;
    if (!result.ok) {
      this.loading.delete(hash);
      this.problems.set(hash, { code: result.code, message: result.message });
      this.pump();
      return;
    }
    const id = ++this.count;
    this.loading.set(hash, id);
    const { bytes } = result;
    // The whole buffer is transferred: a view of part of one is copied first.
    const buffer =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : bytes.slice().buffer;
    if (!this.ensure() || !this.post({ type: 'load', id, hash, bytes: buffer }, [buffer])) {
      this.loading.delete(hash);
    }
  }

  private send(wanted: Wanted): void {
    const id = ++this.count;
    const { ask, bucket } = wanted;
    this.drawing.set(id, wanted);
    const sent = this.post({
      type: 'draw',
      id,
      key: wanted.kept,
      solid: ask.solid,
      size: solidPictureSize(bucket, ask.aspect),
      camera: ask.camera,
      lighting: ask.lighting,
      hidden: ask.hidden,
      parts: ask.parts,
      ...(ask.only === undefined ? {} : { only: ask.only }),
    });
    if (!sent) this.drawing.delete(id);
  }

  private startTurning(turn: number, state: TurningState): void {
    if (state.ended || this.disposed || this.unavailable) return;
    const { solid } = state.view;
    if (!this.loaded.has(solid)) {
      // Its file first, as for a picture; the turning starts once it is loaded.
      state.waiting = true;
      if (!this.problems.has(solid) && !this.loading.has(solid) && this.ensure()) this.load(solid);
      return;
    }
    state.waiting = false;
    // A turning started again counts its frames from the start.
    state.serial = 0;
    state.started = this.post({ type: 'turn/start', turn, ...state.view });
    if (state.started && state.playing !== null) {
      this.post({ type: 'turn/play', turn, animation: state.playing });
    }
  }

  // What comes back -------------------------------------------------------------------------------

  private receive(data: unknown): void {
    const read = readSolidWorkerReply(data);
    // A message that cannot be read is dropped: the worker is the app's own, so it is a bug.
    if (!read.ok) return;
    this.handle(read.value);
  }

  private handle(reply: SolidWorkerReply): void {
    switch (reply.type) {
      case 'ready':
        this.limits = reply.limits;
        return;
      case 'loaded': {
        if (this.loading.get(reply.hash) !== reply.id) return;
        this.loading.delete(reply.hash);
        this.loaded.add(reply.hash);
        for (const [turn, state] of this.turnings) {
          if (state.waiting && state.view.solid === reply.hash) this.startTurning(turn, state);
        }
        this.pump();
        return;
      }
      case 'picture': {
        const wanted = this.drawing.get(reply.id);
        if (!wanted || wanted.kept !== reply.key) {
          reply.bitmap.close();
          return;
        }
        this.drawing.delete(reply.id);
        const picture: SolidPicture = {
          key: wanted.ask.key,
          bucket: wanted.bucket,
          serial: solidPictureSerial(wanted.kept),
          bitmap: reply.bitmap,
          width: reply.width,
          height: reply.height,
          ...(reply.partBuffer ? { partBuffer: reply.partBuffer } : {}),
        };
        this.kept.get(wanted.kept)?.bitmap.close();
        this.kept.set(wanted.kept, picture);
        let buckets = this.bucketsOf.get(wanted.ask.key);
        if (!buckets) {
          buckets = new Set();
          this.bucketsOf.set(wanted.ask.key, buckets);
        }
        buckets.add(wanted.bucket);
        for (const listener of [...this.listeners]) listener(picture);
        this.pump();
        return;
      }
      case 'frame': {
        const state = this.turnings.get(reply.turn);
        if (!state || reply.serial <= state.serial) {
          reply.bitmap.close();
          return;
        }
        state.serial = reply.serial;
        state.frame?.bitmap.close();
        state.frame = reply;
        state.onFrame?.(reply);
        return;
      }
      case 'picked': {
        const resolve = this.picks.get(reply.id);
        this.picks.delete(reply.id);
        resolve?.(reply);
        return;
      }
      case 'refused':
        this.refused(reply);
        return;
      case 'let-go':
        for (const hash of reply.hashes) this.loaded.delete(hash);
        return;
      case 'context-lost':
        this.contextLost = true;
        return;
      case 'context-restored':
        this.contextLost = false;
        // A turning draws again what shows; pictures kept are the page's own and stay.
        for (const [turn, state] of this.turnings) {
          if (state.started) {
            state.started = false;
            this.startTurning(turn, state);
          }
        }
        this.pump();
        return;
    }
  }

  private refused(reply: Extract<SolidWorkerReply, { type: 'refused' }>): void {
    if (reply.code === 'unavailable') {
      this.unavailable = true;
      this.wanted = [];
      this.settlePins();
      return;
    }
    if (reply.turn !== undefined) {
      const state = this.turnings.get(reply.turn);
      if (!state) return;
      if (reply.code === 'not-loaded') {
        this.loaded.delete(state.view.solid);
        state.started = false;
        this.startTurning(reply.turn, state);
      }
      // Lost: started again once restored. Anything else ends nothing; its last frame stays.
      if (reply.code === 'context-lost') state.started = true;
      return;
    }
    if (reply.id === undefined) return;
    const resolve = this.picks.get(reply.id);
    if (resolve) {
      this.picks.delete(reply.id);
      resolve(undefined);
      return;
    }
    for (const [hash, id] of this.loading) {
      if (id !== reply.id) continue;
      this.loading.delete(hash);
      this.problems.set(hash, { code: reply.code, message: reply.message });
      this.pump();
      return;
    }
    const wanted = this.drawing.get(reply.id);
    if (!wanted) return;
    this.drawing.delete(reply.id);
    switch (reply.code) {
      case 'not-loaded':
        // Let go of: loaded again, then drawn.
        this.loaded.delete(wanted.ask.solid);
        this.wanted.unshift(wanted);
        break;
      case 'context-lost':
        this.contextLost = true;
        this.wanted.unshift(wanted);
        break;
      case 'invalid-solid':
      case 'too-large':
        this.problems.set(wanted.ask.solid, { code: reply.code, message: reply.message });
        break;
      default:
        this.failed.add(wanted.kept);
    }
    this.pump();
  }

  /** A worker that failed answers nothing more: what it was doing is asked of the next one. */
  private failedWorker(worker: SolidWorkerPort): void {
    if (this.worker !== worker) return;
    worker.terminate();
    this.worker = undefined;
    this.loaded.clear();
    this.loading.clear();
    this.contextLost = false;
    const again = [...this.drawing.values()];
    this.drawing.clear();
    this.wanted = [...again, ...this.wanted];
    for (const resolve of this.picks.values()) resolve(undefined);
    this.picks.clear();
    for (const state of this.turnings.values()) state.started = false;
    for (const [turn, state] of this.turnings) this.startTurning(turn, state);
    this.pump();
  }
}

interface TurningState {
  view: SolidView;
  playing: number | null;
  started: boolean;
  ended: boolean;
  /** The serial of its newest frame since it was last started. */
  serial: number;
  /** Waiting for its file to load. */
  waiting?: boolean;
  frame?: SolidFrameReply;
  onFrame: ((frame: SolidFrameReply) => void) | undefined;
}
