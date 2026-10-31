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
 * - **Spaces** (ADR 0076), the physical-space panel's drawings, are kept by their number and drawn
 *   through a {@link SpaceGpu} once a frame, and only when something they show changed: what the app
 *   said, a solid they draw loaded, or the context came back. A space whose camera the app has not
 *   given is framed whole, again each time what it shows changes. Framing is worked out here, from
 *   the entries' bounds, their solids' and their parts', without the GPU.
 */
import type { Id, SpaceBounds, SpaceCamera, SpaceCut, SpacePoint } from '@visual-anything/schema';
import { boundsOfPoint, boundsPlaced, frameSpace } from '../../space/camera';
import {
  LARGEST_SOLID_PICTURE,
  readSolidWorkerRequest,
  type PixelSize,
  type SolidDrawRequest,
  type SolidLoadRequest,
  type SolidPartBuffer,
  type SolidPickRequest,
  type SolidView,
  type SolidWorkerCode,
  type SolidWorkerReply,
  type SolidWorkerRequest,
  type SpaceChange,
  type SpaceDrawnEntry,
  type SpaceElementState,
  type SpaceLine,
  type SpaceShown,
  type SpaceStateEntry,
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

/**
 * A space as the worker draws it (ADR 0076): what the app says it shows, the camera it is drawn from,
 * each element's state by id, and the solids its entries draw that are loaded now.
 */
export interface SpaceToDraw {
  /** The drawing's number. */
  readonly space: number;
  readonly size: PixelSize;
  /** The camera the app gave, or the one that frames everything. */
  readonly camera: SpaceCamera;
  readonly entries: readonly SpaceDrawnEntry[];
  /** Each element's state, by id; an element it has none for looks plain. */
  readonly states: ReadonlyMap<Id, SpaceElementState>;
  readonly cut: SpaceCut | undefined;
  /** From 0 to 2. */
  readonly explode: number;
  readonly names: boolean;
  readonly lines: readonly SpaceLine[];
  /** The solids its entries draw that are loaded, by hash; one still loading is left out. */
  readonly solids: ReadonlyMap<string, BuiltSolid>;
}

/** What lies under a pixel of a space: an element, by id, or none, and the point there. */
export interface SpacePicked {
  element: Id | null;
  point?: SpacePoint;
}

/**
 * What the worker draws spaces with, beside {@link SolidGpu}: the same renderer, on the same canvas,
 * so that a solid drawn on the canvas and in the panel sits on the GPU once (ADR 0076).
 */
export interface SpaceGpu {
  /** Draws a frame of a space as it is now; throws when it cannot, as when the context is lost. */
  drawSpace(space: SpaceToDraw): ImageBitmap;
  /** What a space's frame shows under the pixel (x, y), from its top left. */
  pickSpace(space: SpaceToDraw, x: number, y: number): SpacePicked;
}

/** What the host takes. */
export interface SolidWorkerHostOptions {
  /** Sends a reply to the app, transferring what it lists. */
  post(reply: SolidWorkerReply, transfer: Transferable[]): void;
  /** None when the worker has no WebGL to draw with. */
  gpu: SolidGpu | undefined;
  /** What draws spaces; none, and spaces are refused as `unavailable`, as without a GPU. */
  space?: SpaceGpu;
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

/** A space the app shows. */
interface Showing {
  shown: Omit<SpaceShown, 'states'>;
  states: Map<Id, SpaceElementState>;
  /** The camera it is drawn from: the app's, or else the one that frames everything. */
  camera: SpaceCamera;
  serial: number;
  dirty: boolean;
}

/** The solid worker, apart from its GPU and its scope. */
export class SolidWorkerHost {
  private readonly loaded = new Map<string, BuiltSolid>();
  private readonly turnings = new Map<number, Turning>();
  private readonly spaces = new Map<number, Showing>();
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
    if (request.type.startsWith('space/')) {
      this.spaceRequest(request as SpaceRequest);
      return;
    }
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
    // The spaces that draw it show it now.
    for (const showing of this.spaces.values()) {
      if (showing.shown.entries.some((entry) => entry.solid === request.hash)) {
        this.changedSpace(showing, true);
      }
    }
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

  /** Draws a frame of each turning whose camera changed or that plays, and of each space that changed. */
  private frames(): void {
    const { gpu } = this.options;
    if (!gpu || this.lost) return;
    for (const [turn, turning] of [...this.turnings]) {
      if (!turning.dirty && !turning.playing) continue;
      turning.dirty = false;
      this.frame(gpu, turn, turning);
    }
    const { space } = this.options;
    if (space) {
      for (const [number, showing] of [...this.spaces]) {
        if (!showing.dirty) continue;
        showing.dirty = false;
        this.spaceFrame(gpu, space, number, showing);
      }
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
    // What the spaces showed went with the context: they are drawn again, as the app left them.
    for (const showing of this.spaces.values()) this.changedSpace(showing, false);
  }

  // Spaces ----------------------------------------------------------------------------------------

  /** The spaces drawn now, by their numbers. */
  get spacesShown(): number[] {
    return [...this.spaces.keys()];
  }

  private spaceRequest(request: SpaceRequest): void {
    const { gpu, space } = this.options;
    if (!gpu || !space) {
      if (request.type === 'space/show') {
        this.refuse(
          { space: request.space },
          'unavailable',
          'This worker has no WebGL to draw physical space.',
        );
      } else if (request.type === 'space/framing' || request.type === 'space/pick') {
        this.refuse(
          { id: request.id },
          'unavailable',
          'This worker has no WebGL to draw physical space.',
        );
      }
      return;
    }
    if (request.type === 'space/show') {
      const { states, entries, size, camera, cut, explode, names, lines } = request;
      const shown: Omit<SpaceShown, 'states'> = {
        size,
        entries,
        ...(camera ? { camera } : {}),
        ...(cut ? { cut } : {}),
        ...(explode === undefined ? {} : { explode }),
        ...(names === undefined ? {} : { names }),
        ...(lines ? { lines } : {}),
      };
      const byElement = statesOf(states);
      // Shown again under the same number, it starts over.
      this.spaces.set(request.space, {
        shown,
        states: byElement,
        camera: camera ?? this.framed(shown, byElement),
        serial: 0,
        dirty: true,
      });
      this.scheduleFrames();
      return;
    }
    const showing = this.spaces.get(request.space);
    if (!showing) {
      if (request.type === 'space/framing' || request.type === 'space/pick') {
        this.refuse({ id: request.id }, 'failed', 'The space is not shown.');
      }
      return;
    }
    switch (request.type) {
      case 'space/update':
        this.updateSpace(showing, request);
        return;
      case 'space/framing': {
        const camera = frameSpace(
          this.boxesOf(showing.shown, showing.states, request.elements),
          showing.shown.size.width / showing.shown.size.height,
          showing.camera,
        );
        this.send({ type: 'space/framed', space: request.space, id: request.id, camera });
        return;
      }
      case 'space/pick': {
        const { width, height } = showing.shown.size;
        if (request.x > width || request.y > height) {
          this.refuse({ id: request.id }, 'failed', 'The pixel lies outside the space’s frames.');
          return;
        }
        try {
          const picked = space.pickSpace(this.toDraw(request.space, showing), request.x, request.y);
          this.send({
            type: 'space/picked',
            space: request.space,
            id: request.id,
            element: picked.element,
            ...(picked.point ? { point: picked.point } : {}),
          });
        } catch (error) {
          this.refuse({ id: request.id }, 'failed', messageOf(error));
        }
        return;
      }
      case 'space/end':
        this.spaces.delete(request.space);
        return;
    }
  }

  private updateSpace(showing: Showing, change: SpaceChange): void {
    const { camera, cut, states, ...rest } = change;
    const shown: Omit<SpaceShown, 'states'> = { ...showing.shown, ...rest };
    if (camera === null) delete shown.camera;
    else if (camera !== undefined) shown.camera = camera;
    if (cut === null) delete shown.cut;
    else if (cut !== undefined) shown.cut = cut;
    showing.shown = shown;
    if (states !== undefined) showing.states = statesOf(states);
    this.changedSpace(showing, true);
  }

  /** Marks a space to draw again at the next frame; framed again first when the app gave no camera. */
  private changedSpace(showing: Showing, reframe: boolean): void {
    if (showing.shown.camera) showing.camera = showing.shown.camera;
    else if (reframe) showing.camera = this.framed(showing.shown, showing.states, showing.camera);
    showing.dirty = true;
    this.scheduleFrames();
  }

  /** The camera that frames everything a space draws, from the direction of `from` if given. */
  private framed(
    shown: Omit<SpaceShown, 'states'>,
    states: ReadonlyMap<Id, SpaceElementState>,
    from?: SpaceCamera,
  ): SpaceCamera {
    return frameSpace(this.boxesOf(shown, states), shown.size.width / shown.size.height, from);
  }

  /**
   * The bounds, in the space's coordinates, of the entries named, or of every entry not hidden: an
   * entry's solid's, given or loaded; an anchored part's, in its holder's solid once loaded; or else
   * its origin alone. With every entry hidden, all of them.
   */
  private boxesOf(
    shown: Pick<SpaceShown, 'entries'>,
    states: ReadonlyMap<Id, SpaceElementState>,
    elements?: readonly Id[],
  ): SpaceBounds[] {
    const byElement = new Map(shown.entries.map((entry) => [entry.element, entry]));
    const named = elements ? new Set(elements) : undefined;
    let chosen = shown.entries.filter((entry) =>
      named ? named.has(entry.element) : states.get(entry.element)?.hidden !== true,
    );
    if (!named && chosen.length === 0) chosen = [...shown.entries];
    return chosen.map((entry) => {
      const solid = entry.solid === undefined ? undefined : this.loaded.get(entry.solid);
      const bounds = entry.bounds ?? solid?.description.bounds;
      if (bounds) return boundsPlaced(entry.matrix, bounds);
      if (entry.part) {
        const holder = byElement.get(entry.part.of);
        const held = holder?.solid === undefined ? undefined : this.loaded.get(holder.solid);
        if (holder && held && entry.part.index < held.description.parts.length) {
          return boundsPlaced(holder.matrix, held.partBounds(entry.part.index));
        }
      }
      const m = entry.matrix;
      return boundsOfPoint({ x: m[12] ?? 0, y: m[13] ?? 0, z: m[14] ?? 0 });
    });
  }

  private toDraw(number: number, showing: Showing): SpaceToDraw {
    const solids = new Map<string, BuiltSolid>();
    for (const entry of showing.shown.entries) {
      const solid = entry.solid === undefined ? undefined : this.loaded.get(entry.solid);
      if (solid) solids.set(solid.hash, solid);
    }
    return {
      space: number,
      size: showing.shown.size,
      camera: showing.camera,
      entries: showing.shown.entries,
      states: showing.states,
      cut: showing.shown.cut,
      explode: showing.shown.explode ?? 0,
      names: showing.shown.names ?? false,
      lines: showing.shown.lines ?? [],
      solids,
    };
  }

  private spaceFrame(gpu: SolidGpu, space: SpaceGpu, number: number, showing: Showing): void {
    const { width, height } = showing.shown.size;
    if (width > gpu.largestPicture || height > gpu.largestPicture) {
      this.refuse(
        { space: number },
        'too-large',
        `This worker draws at most ${gpu.largestPicture} pixels a side.`,
      );
      return;
    }
    const toDraw = this.toDraw(number, showing);
    for (const solid of toDraw.solids.values()) this.drawing(solid);
    let bitmap: ImageBitmap;
    try {
      for (const solid of toDraw.solids.values()) if (solid.posed) solid.toRest();
      bitmap = space.drawSpace(toDraw);
    } catch (error) {
      this.refuse(
        { space: number },
        this.lost || gpu.lost === true ? 'context-lost' : 'failed',
        messageOf(error),
      );
      return;
    }
    showing.serial += 1;
    this.send(
      {
        type: 'space/frame',
        space: number,
        serial: showing.serial,
        camera: showing.camera,
        bitmap,
        width,
        height,
      },
      [bitmap],
    );
  }

  // Sending ---------------------------------------------------------------------------------------

  private refuse(
    to: { id?: number; turn?: number; space?: number },
    code: SolidWorkerCode,
    message: string,
  ): void {
    this.send({ type: 'refused', ...to, code, message: message.slice(0, MAX_MESSAGE) });
  }

  private send(reply: SolidWorkerReply, transfer: Transferable[] = []): void {
    this.options.post(reply, transfer);
  }
}

/** The messages of the physical-space panel's drawings. */
type SpaceRequest = Extract<SolidWorkerRequest, { type: `space/${string}` }>;

/** Each element's state, by id, from the list a message carries. */
function statesOf(states: readonly SpaceStateEntry[]): Map<Id, SpaceElementState> {
  return new Map(states.map(({ element, ...state }) => [element, state]));
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
