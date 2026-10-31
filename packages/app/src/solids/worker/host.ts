/**
 * The solid worker's side of its protocol (ADR 0075), apart from the GPU, so that tests can fake it:
 * it reads each message strictly, loads files with the reader, keeps what it drew lately within its
 * memory, draws pictures and turning frames through a {@link SolidGpu}, plays animations in frames,
 * picks, and follows a lost context. Everything it sends passes the app's reader.
 *
 * - **Loading** checks a file against its hash and the canonical form, and builds it. A solid that
 *   alone would take more than the worker's memory is refused as `too-large`.
 * - **Drawing** marks a solid drawn now, and lets go of those drawn least lately past the memory,
 *   saying so with `let-go` before the picture comes; those must be loaded again.
 * - **Turning** draws a frame whenever the camera changes, coalesced to one a frame, and every frame
 *   while an animation plays, looping. Frames count from 1 for each `turn/start`, a turning started
 *   again included. Pictures and picks see a solid at rest, whatever plays.
 * - **A lost context** refuses draws and turnings with `context-lost` until it is back, and forgets
 *   the turnings, which the app starts again. Picking needs no GPU and goes on.
 * - **No GPU at all** refuses everything as `unavailable`, and solids stay their placeholders.
 */
import {
  LARGEST_SOLID_PICTURE,
  readSolidWorkerRequest,
  type SolidDrawRequest,
  type SolidLoadRequest,
  type SolidPartBuffer,
  type SolidPickRequest,
  type SolidView,
  type SolidWorkerCode,
  type SolidWorkerReply,
  type SolidWorkerRequest,
} from '../protocol';
import { loopedTime, poseAt } from './animation';
import { buildSolid, type BuiltSolid, type Digest, type ImageDecoder } from './build';
import { SolidMemory } from './memory';
import { pickAt } from './stage';

/** A picture the GPU drew, with its part buffer when one was asked for. */
export interface DrawnPicture {
  bitmap: ImageBitmap;
  partBuffer?: SolidPartBuffer;
}

/** What the worker draws with: three.js's renderer on its one canvas, or a fake of it in tests. */
export interface SolidGpu {
  /** The largest side it draws, in pixels, from 128 to 2,048. */
  readonly largestPicture: number;
  /** Whether its context is lost now, which a draw that failed may say before its event comes. */
  readonly lost?: boolean;
  /** Draws a view of a solid, posed as it is now, with its part buffer when `view.parts`. */
  draw(solid: BuiltSolid, view: SolidView): DrawnPicture;
  /** Lets go of what a solid holds on the GPU, before the solid is disposed of. */
  forget(solid: BuiltSolid): void;
  /** Called when its context is lost, and when it is back. */
  onContext(listener: (state: 'lost' | 'restored') => void): void;
}

/** What the host takes. */
export interface SolidWorkerHostOptions {
  /** Sends a reply to the app, transferring what it lists. */
  post(reply: SolidWorkerReply, transfer: Transferable[]): void;
  /** None when the worker has no WebGL to draw with. */
  gpu: SolidGpu | undefined;
  decodeImage: ImageDecoder;
  digest?: Digest;
  /** Calls back once before the next frame. */
  schedule(callback: () => void): void;
  /** Milliseconds, from any start. */
  now(): number;
  /** The estimated GPU memory to keep solids within; 768 MiB unless smaller. */
  memoryBytes?: number;
}

/** The longest message a refusal carries, as the app's reader takes it. */
const MAX_MESSAGE = 2000;

interface Turning {
  view: SolidView;
  serial: number;
  /** The animation posed in its frames, playing or paused; null for none. */
  animation: number | null;
  playing: boolean;
  /** When it last started playing, in milliseconds, and the time it started from, in seconds. */
  since: number;
  from: number;
  /** Whether its camera changed since its last frame. */
  dirty: boolean;
}

/** The solid worker, apart from its GPU and its scope. */
export class SolidWorkerHost {
  private readonly loaded = new Map<string, BuiltSolid>();
  private readonly turnings = new Map<number, Turning>();
  private readonly memory: SolidMemory;
  private lost = false;
  private scheduled = false;

  constructor(private readonly options: SolidWorkerHostOptions) {
    this.memory = new SolidMemory(options.memoryBytes);
    options.gpu?.onContext((state) => this.context(state));
  }

  /** Says the worker's limits, once, as it starts. */
  start(): void {
    this.send({
      type: 'ready',
      limits: {
        largestPicture: this.options.gpu?.largestPicture ?? LARGEST_SOLID_PICTURE,
        memoryBytes: this.memory.limit,
      },
    });
  }

  /** The solids loaded now, by their hashes. */
  get solids(): string[] {
    return [...this.loaded.keys()];
  }

  /** The solids drawn lately, least recent first. */
  get recency(): string[] {
    return this.memory.order;
  }

  /** Takes a message from the app; resolves once it is answered. */
  async receive(data: unknown): Promise<void> {
    const read = readSolidWorkerRequest(data);
    // A message the worker cannot read comes from the app's own bug: it is dropped.
    if (!read.ok) return;
    await this.handle(read.value);
  }

  private async handle(request: SolidWorkerRequest): Promise<void> {
    const { gpu } = this.options;
    if (!gpu) {
      if (request.type === 'load' || request.type === 'draw' || request.type === 'pick') {
        this.refuse({ id: request.id }, 'unavailable', 'This worker has no WebGL to draw solids.');
      } else if (request.type === 'turn/start') {
        this.refuse(
          { turn: request.turn },
          'unavailable',
          'This worker has no WebGL to draw solids.',
        );
      }
      return;
    }
    switch (request.type) {
      case 'load':
        return this.load(request);
      case 'release':
        this.letGoOf(request.hash);
        return;
      case 'draw':
        this.draw(gpu, request);
        return;
      case 'turn/start': {
        if (this.lost) {
          this.refuse({ turn: request.turn }, 'context-lost', 'The context is lost.');
          return;
        }
        if (!this.loaded.has(request.solid)) {
          this.refuse({ turn: request.turn }, 'not-loaded', 'The solid is not loaded.');
          return;
        }
        this.turnings.set(request.turn, {
          view: viewOf(request),
          serial: 0,
          animation: null,
          playing: false,
          since: 0,
          from: 0,
          dirty: true,
        });
        this.scheduleFrames();
        return;
      }
      case 'turn/camera': {
        const turning = this.turnings.get(request.turn);
        if (!turning) return;
        turning.view = {
          ...turning.view,
          camera: request.camera,
          ...(request.size ? { size: request.size } : {}),
        };
        turning.dirty = true;
        this.scheduleFrames();
        return;
      }
      case 'turn/play':
        this.play(request.turn, request.animation);
        return;
      case 'turn/end': {
        const turning = this.turnings.get(request.turn);
        this.turnings.delete(request.turn);
        const solid = turning && this.loaded.get(turning.view.solid);
        if (solid?.posed) solid.toRest();
        return;
      }
      case 'pick':
        this.pick(request);
        return;
    }
  }

  // Loading ---------------------------------------------------------------------------------------

  private async load(request: SolidLoadRequest): Promise<void> {
    const built = await buildSolid(new Uint8Array(request.bytes), request.hash, {
      decodeImage: this.options.decodeImage,
      ...(this.options.digest ? { digest: this.options.digest } : {}),
    });
    if (!built.ok) {
      this.refuse({ id: request.id }, built.code, built.message);
      return;
    }
    const { solid } = built;
    if (!this.memory.fits(solid.gpuBytes)) {
      solid.dispose();
      this.refuse(
        { id: request.id },
        'too-large',
        `The solid would take about ${Math.ceil(solid.gpuBytes / 2 ** 20)} MiB of the GPU's memory, past the ${Math.floor(this.memory.limit / 2 ** 20)} MiB the worker keeps.`,
      );
      return;
    }
    // Loading a solid again replaces what was loaded of it.
    this.letGoOf(request.hash);
    this.loaded.set(request.hash, solid);
    this.send({
      type: 'loaded',
      id: request.id,
      hash: request.hash,
      parts: solid.description.parts.length,
      animations: solid.description.animations.length,
    });
  }

  /** Forgets a solid and lets go of what it holds; answers whether it was loaded. */
  private letGoOf(hash: string): boolean {
    const solid = this.loaded.get(hash);
    this.memory.forget(hash);
    if (!solid) return false;
    this.loaded.delete(hash);
    this.options.gpu?.forget(solid);
    solid.dispose();
    return true;
  }

  /** Marks a solid drawn now, and lets go of those past the memory, saying so. */
  private drawing(solid: BuiltSolid): void {
    const past = this.memory.draw(solid.hash, solid.gpuBytes);
    const hashes = past.filter((hash) => this.letGoOf(hash));
    if (hashes.length > 0) this.send({ type: 'let-go', hashes });
  }

  // Pictures --------------------------------------------------------------------------------------

  private draw(gpu: SolidGpu, request: SolidDrawRequest): void {
    const id = { id: request.id };
    if (this.lost) return this.refuse(id, 'context-lost', 'The context is lost.');
    const solid = this.loaded.get(request.solid);
    if (!solid) return this.refuse(id, 'not-loaded', 'The solid is not loaded.');
    const problem = this.viewProblem(gpu, solid, request);
    if (problem) return this.refuse(id, problem.code, problem.message);
    const view = viewOf(request);
    this.drawing(solid);
    if (solid.posed) solid.toRest();
    let drawn: DrawnPicture;
    try {
      drawn = gpu.draw(solid, view);
    } catch (error) {
      return this.refuse(
        id,
        this.lost || gpu.lost === true ? 'context-lost' : 'failed',
        messageOf(error),
      );
    }
    this.send(
      {
        type: 'picture',
        id: request.id,
        key: request.key,
        bitmap: drawn.bitmap,
        width: view.size.width,
        height: view.size.height,
        ...(view.parts && drawn.partBuffer ? { partBuffer: drawn.partBuffer } : {}),
      },
      transfers(drawn, view.parts),
    );
  }

  /** Why a view cannot be drawn: past the largest picture, or a part alone the solid lacks. */
  private viewProblem(
    gpu: SolidGpu,
    solid: BuiltSolid,
    view: SolidView,
  ): { code: SolidWorkerCode; message: string } | undefined {
    if (view.size.width > gpu.largestPicture || view.size.height > gpu.largestPicture) {
      return {
        code: 'too-large',
        message: `This worker draws at most ${gpu.largestPicture} pixels a side.`,
      };
    }
    if (view.only !== undefined && view.only >= solid.description.parts.length) {
      return { code: 'failed', message: `The solid has no part ${view.only}.` };
    }
    return undefined;
  }

  // Turning ---------------------------------------------------------------------------------------

  private play(turn: number, animation: number | null): void {
    const turning = this.turnings.get(turn);
    if (!turning) return;
    const now = this.options.now();
    if (animation === null) {
      if (turning.playing) {
        turning.from = this.timeOf(turning, now);
        turning.playing = false;
      }
      return;
    }
    const solid = this.loaded.get(turning.view.solid);
    if (!solid || animation >= solid.animations.length) return;
    // Playing the one paused goes on from where it stopped; another starts from its beginning.
    if (turning.animation !== animation) turning.from = 0;
    turning.animation = animation;
    turning.playing = true;
    turning.since = now;
    turning.dirty = true;
    this.scheduleFrames();
  }

  /** Where a turning's animation is, in seconds. */
  private timeOf(turning: Turning, now: number): number {
    const solid = this.loaded.get(turning.view.solid);
    const duration =
      turning.animation === null ? 0 : (solid?.animations[turning.animation]?.duration ?? 0);
    if (!turning.playing) return turning.from;
    return loopedTime(turning.from + (now - turning.since) / 1000, duration);
  }

  private scheduleFrames(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.options.schedule(() => {
      this.scheduled = false;
      this.frames();
    });
  }

  /** Draws a frame of each turning whose camera changed or that plays. */
  private frames(): void {
    const { gpu } = this.options;
    if (!gpu || this.lost) return;
    for (const [turn, turning] of [...this.turnings]) {
      if (!turning.dirty && !turning.playing) continue;
      turning.dirty = false;
      this.frame(gpu, turn, turning);
    }
    if ([...this.turnings.values()].some((turning) => turning.playing)) this.scheduleFrames();
  }

  private frame(gpu: SolidGpu, turn: number, turning: Turning): void {
    const solid = this.loaded.get(turning.view.solid);
    if (!solid) {
      this.turnings.delete(turn);
      return this.refuse({ turn }, 'not-loaded', 'The solid is not loaded.');
    }
    const problem = this.viewProblem(gpu, solid, turning.view);
    if (problem) {
      this.turnings.delete(turn);
      return this.refuse({ turn }, problem.code, problem.message);
    }
    this.drawing(solid);
    const time = this.timeOf(turning, this.options.now());
    const animation = turning.animation === null ? undefined : solid.animations[turning.animation];
    if (animation) {
      poseAt(solid.nodes, solid.rest, animation, time);
      solid.root.updateMatrixWorld(true);
      solid.posed = true;
    } else if (solid.posed) {
      solid.toRest();
    }
    let drawn: DrawnPicture;
    try {
      drawn = gpu.draw(solid, turning.view);
    } catch (error) {
      return this.refuse(
        { turn },
        this.lost || gpu.lost === true ? 'context-lost' : 'failed',
        messageOf(error),
      );
    } finally {
      if (solid.posed) solid.toRest();
    }
    turning.serial += 1;
    this.send(
      {
        type: 'frame',
        turn,
        serial: turning.serial,
        camera: turning.view.camera,
        bitmap: drawn.bitmap,
        width: turning.view.size.width,
        height: turning.view.size.height,
        ...(turning.view.parts && drawn.partBuffer ? { partBuffer: drawn.partBuffer } : {}),
        ...(turning.playing ? { time } : {}),
      },
      transfers(drawn, turning.view.parts),
    );
  }

  // Picking ---------------------------------------------------------------------------------------

  private pick(request: SolidPickRequest): void {
    const solid = this.loaded.get(request.solid);
    if (!solid) return this.refuse({ id: request.id }, 'not-loaded', 'The solid is not loaded.');
    if (request.only !== undefined && request.only >= solid.description.parts.length) {
      return this.refuse({ id: request.id }, 'failed', `The solid has no part ${request.only}.`);
    }
    try {
      const picked = pickAt(solid, request, request.x, request.y);
      this.send({
        type: 'picked',
        id: request.id,
        part: picked.part,
        ...(picked.point ? { point: picked.point } : {}),
      });
    } catch (error) {
      this.refuse({ id: request.id }, 'failed', messageOf(error));
    }
  }

  // The context -----------------------------------------------------------------------------------

  private context(state: 'lost' | 'restored'): void {
    if (state === 'lost') {
      if (this.lost) return;
      this.lost = true;
      // What was on the GPU went with it; the app starts its turnings again once it is back.
      this.memory.reset();
      for (const turning of this.turnings.values()) {
        const solid = this.loaded.get(turning.view.solid);
        if (solid?.posed) solid.toRest();
      }
      this.turnings.clear();
      this.send({ type: 'context-lost' });
      return;
    }
    if (!this.lost) return;
    this.lost = false;
    this.send({ type: 'context-restored' });
  }

  // Sending ---------------------------------------------------------------------------------------

  private refuse(to: { id?: number; turn?: number }, code: SolidWorkerCode, message: string): void {
    this.send({ type: 'refused', ...to, code, message: message.slice(0, MAX_MESSAGE) });
  }

  private send(reply: SolidWorkerReply, transfer: Transferable[] = []): void {
    this.options.post(reply, transfer);
  }
}

/** The view a request names, without what else it carries. */
function viewOf(request: SolidView): SolidView {
  return {
    solid: request.solid,
    size: request.size,
    camera: request.camera,
    lighting: request.lighting,
    hidden: request.hidden,
    parts: request.parts,
    ...(request.only === undefined ? {} : { only: request.only }),
  };
}

/** What a picture's message transfers: its bitmap, and its part buffer's numbers when they go. */
function transfers(drawn: DrawnPicture, parts: boolean): Transferable[] {
  const list: Transferable[] = [drawn.bitmap];
  if (parts && drawn.partBuffer) list.push(drawn.partBuffer.data.buffer as ArrayBuffer);
  return list;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The solid could not be drawn.';
}
