/**
 * The messages between the app and the solid worker (ADR 0075). three.js runs only in that worker:
 * the page hands it a solid's canonical file, as bytes, and gets back pictures, the frames of a solid
 * turned live, and what lies under a pixel. The worker allows no connection; it never fetches
 * anything, and nothing it is handed names anything outside itself.
 *
 * From the app (`SolidWorkerRequest`):
 * - `load`: a solid's file, by its hash, its bytes transferred; answered with `loaded` or `refused`.
 *   The worker reads it with the core's reader and checks that its bytes are its hash's.
 * - `release`: lets go of a solid the open views no longer draw.
 * - `draw`: a picture, `{ key, solid, size, camera, lighting, hidden }`, at a bucket of 128, 256,
 *   512, 1,024 or 2,048 pixels on its longer side, with `parts` asking for its part buffer;
 *   answered with `picture` or `refused`. `only` draws one part alone, fitted to its bounds.
 * - `turn/start`, `turn/camera`, `turn/play` and `turn/end`: turning (ADR 0075), whose `frame`s
 *   come whenever the camera changes, or while an animation plays.
 * - `pick`: what part, and what point of the solid, lies under a pixel of a view.
 *
 * From the worker (`SolidWorkerReply`):
 * - `ready`, once, with its limits; `loaded`, `picture`, `frame`, `picked` and `refused`;
 * - `let-go`: the solids it let go of to keep within its memory, least lately drawn first, which
 *   must be loaded again before they are drawn;
 * - `context-lost` and `context-restored`: its one WebGL context lost, and got back.
 *
 * The physical-space panel (ADR 0076) draws through the same worker, by the number of its drawing:
 * - from the app, `space/show` starts drawing a space: its entries (`SpaceDrawnEntry`), their states,
 *   its camera, its cut, its exploded view, names and relation lines; `space/update` changes any of
 *   them; `space/framing` asks for the camera that frames some of its elements, or all; `space/pick`
 *   asks what lies under a pixel; `space/end` stops it;
 * - from the worker, `space/frame` whenever something it shows changed, `space/framed`,
 *   `space/picked`, and `space/gesture-ended` once a gesture on its handles ended; a refusal names the
 *   drawing by `space`, or a framing and a pick by `id`.
 *
 * A part buffer holds, for each pixel of its picture, the index of the innermost named part drawn
 * there plus one, or 0 where none is. Each reader checks a message strictly and answers it, or why it
 * cannot be read, as the core's readers do.
 */
import { MAX_SPACE_DISTANCE, SOLID_CAPS, isId, type ThemeName } from '@visual-anything/core';
import type {
  Color,
  Id,
  Rotation,
  SolidCamera,
  SpaceBounds,
  SpaceCamera,
  SpaceCut,
  SpacePoint,
} from '@visual-anything/schema';
import {
  LARGEST_SOLID_PICTURE,
  SOLID_BUCKETS,
  type PixelSize,
  type SolidLighting,
  type SolidPartBuffer,
  type SolidView,
} from './views';

export {
  LARGEST_SOLID_PICTURE,
  SOLID_BUCKETS,
  SOLID_WORKER_MEMORY,
  solidBucketFor,
  solidPictureSize,
  type PixelSize,
  type SolidBucket,
  type SolidLighting,
  type SolidPartBuffer,
  type SolidView,
} from './views';

/** What the worker can do, which it says once it starts. */
export interface SolidWorkerLimits {
  /** The largest side, in pixels, it draws a picture or a frame at; at most 2,048. */
  largestPicture: number;
  /** The estimated GPU memory it keeps solids within. */
  memoryBytes: number;
}

// From the app ------------------------------------------------------------------------------------

export interface SolidLoadRequest {
  type: 'load';
  id: number;
  hash: string;
  /** The file's bytes, transferred: the page keeps no copy. */
  bytes: ArrayBuffer;
}

export interface SolidReleaseRequest {
  type: 'release';
  hash: string;
}

export interface SolidDrawRequest extends SolidView {
  type: 'draw';
  id: number;
  /** The picture's key (`solidPictureKey` with its bucket), which its answer carries. */
  key: string;
}

export interface SolidTurnStartRequest extends SolidView {
  type: 'turn/start';
  /** The turning's number, which its frames carry. */
  turn: number;
}

/** The camera, and the size, a turning's frames are drawn from now. */
export interface SolidTurnCameraRequest {
  type: 'turn/camera';
  turn: number;
  camera: SolidCamera;
  size?: PixelSize;
}

/** Plays an animation, by its index, looping, in a turning's frames; `null` pauses. */
export interface SolidTurnPlayRequest {
  type: 'turn/play';
  turn: number;
  animation: number | null;
}

export interface SolidTurnEndRequest {
  type: 'turn/end';
  turn: number;
}

/** What lies under the pixel (x, y) of a view, from its top left. */
export interface SolidPickRequest extends Omit<SolidView, 'parts' | 'lighting'> {
  type: 'pick';
  id: number;
  x: number;
  y: number;
}

// The physical-space panel's drawing (ADR 0076) -----------------------------------------------------

/** The most entries, states and elements framed a space's messages carry. */
export const MAX_SPACE_ENTRIES = 65_536;
/** The most relation lines a space draws. */
export const MAX_SPACE_LINES = 4096;
/** The most markers travelling along one line. */
export const MAX_SPACE_LINE_MARKERS = 64;
/** The longest name an entry carries; the app shortens longer ones. */
export const MAX_SPACE_NAME = 200;
/** The farthest a matrix's number goes either way: past it, a place is not drawn. */
export const MAX_SPACE_MATRIX = 1e9;

/**
 * One element as a space draws it, worked out by the app from the core's `spaceOf` (`space/entries.ts`):
 * where it is, and what draws it there.
 */
export interface SpaceDrawnEntry {
  /** The element, by id: what states name and picking answers. */
  element: Id;
  /** Its name, as the panel writes it facing the screen; at most {@link MAX_SPACE_NAME} characters. */
  name: string;
  /**
   * Its origin and axes in the coordinates of the element the panel shows, in meters: 16 numbers,
   * column by column, as the core's `spaceMath` writes them.
   */
  matrix: readonly number[];
  /** The solid drawn at its matrix, by its file's hash. */
  solid?: string;
  /** That solid's bounds in its own coordinates, which framing reads before its file is loaded. */
  bounds?: SpaceBounds;
  /** For an anchored part: the element whose drawn solid holds it, and its part's index there. */
  part?: { of: Id; index: number };
  /**
   * For a posed element: the entry it is posed in, when that is drawn, so that the exploded view
   * moves it with what it is posed in. An anchored part has none: its `part` says what holds it.
   */
  in?: Id;
  /** Drawn as a marker at its origin: posed, with neither a solid nor anything in it. */
  marker?: boolean;
  /**
   * The collapsed container of the open view it is drawn as: pointed at, picked and marked as that
   * container, whose state it takes (ADR 0076).
   */
  as?: Id;
  /** Its shape's fill on the canvas, which its marker is drawn in unless an overlay fills it. */
  fill?: Color;
}

/** How one element in a space looks, from the canvas's emphasis and marks (`space/states.ts`). */
export interface SpaceElementState {
  /** Not drawn, as a filter or isolation hides it. */
  hidden?: boolean;
  /** Drawn faintly, outside a focus, or as a container the view does not show. */
  faint?: boolean;
  /** Marked by playback, guidance or a tour. */
  highlighted?: boolean;
  selected?: boolean;
  hovered?: boolean;
  /** An overlay's fill. */
  fill?: Color;
  /** An overlay's opacity, below 1. */
  opacity?: number;
}

/** One element's state, by its id; an element a message names no state for looks plain. */
export interface SpaceStateEntry extends SpaceElementState {
  element: Id;
}

/** A relation drawn in space as a straight line between its ends' points (`pointInSpace`). */
export interface SpaceLine {
  relation: Id;
  from: SpacePoint;
  to: SpacePoint;
  highlighted?: boolean;
  selected?: boolean;
  hovered?: boolean;
  faint?: boolean;
  /** Markers travelling along it, each a fraction of the way from `from`, 0, to `to`, 1. */
  markers?: number[];
}

/** The least and the most device pixels a space's frames draw for each pixel of the page. */
export const SPACE_PIXEL_RATIOS = { least: 0.5, most: 4 } as const;

/** An axis of the handles. */
export type SpaceAxis = 'x' | 'y' | 'z';

/**
 * The handles that move or rotate posed elements (ADR 0076), which the worker draws over a space and
 * the page hit-tests and drives (`solids/worker/space/handles.ts` works out where they are for both).
 */
export interface SpaceHandles {
  /** Arrows along three axes to move, or rings around them to rotate. */
  mode: 'move' | 'rotate';
  /** Where they stand, in the coordinates of the element the panel shows. */
  at: SpacePoint;
  /** How their axes are turned from those coordinates' own; not turned when absent. */
  rotation?: Rotation;
  /** The axis pointed at or dragged, drawn stronger. */
  active?: SpaceAxis;
}

/** What a space shows, as `space/show` carries it and `space/update` changes it. */
export interface SpaceShown {
  /** The frames' size, in pixels. */
  size: PixelSize;
  entries: readonly SpaceDrawnEntry[];
  states: readonly SpaceStateEntry[];
  /** Where it looks from; absent, the worker frames everything it draws, again as that changes. */
  camera?: SpaceCamera;
  cut?: SpaceCut;
  /** How far parts move away from the middle of what holds them, from 0 to 2; 0 when absent. */
  explode?: number;
  /** Whether Names is on. */
  names?: boolean;
  lines?: readonly SpaceLine[];
  /** The theme its marks, names, lines and ground are drawn in; light when absent. */
  theme?: ThemeName;
  /**
   * Device pixels for each pixel of the page, from {@link SPACE_PIXEL_RATIOS}: what sizes markers,
   * marks, lines and names, which keep their size on the screen; 1 when absent.
   */
  pixelRatio?: number;
  /** The handles drawn over it, which the page drives; none when absent. */
  handles?: SpaceHandles;
}

/**
 * A change of what a space shows: what it gives replaces what was; `null` takes a camera, a cut or
 * the handles away.
 */
export type SpaceChange = Partial<Omit<SpaceShown, 'camera' | 'cut' | 'handles'>> & {
  camera?: SpaceCamera | null;
  cut?: SpaceCut | null;
  handles?: SpaceHandles | null;
};

/** Starts drawing a space, by its number, which its frames carry. */
export interface SpaceShowRequest extends SpaceShown {
  type: 'space/show';
  space: number;
}

export interface SpaceUpdateRequest extends SpaceChange {
  type: 'space/update';
  space: number;
}

/** Asks for the camera that frames these elements of a space, or all it draws when none are named. */
export interface SpaceFramingRequest {
  type: 'space/framing';
  space: number;
  id: number;
  elements?: Id[];
}

/** What lies under the pixel (x, y) of a space's frames, from their top left. */
export interface SpacePickRequest {
  type: 'space/pick';
  space: number;
  id: number;
  x: number;
  y: number;
}

export interface SpaceEndRequest {
  type: 'space/end';
  space: number;
}

export type SolidWorkerRequest =
  | SolidLoadRequest
  | SolidReleaseRequest
  | SolidDrawRequest
  | SolidTurnStartRequest
  | SolidTurnCameraRequest
  | SolidTurnPlayRequest
  | SolidTurnEndRequest
  | SolidPickRequest
  | SpaceShowRequest
  | SpaceUpdateRequest
  | SpaceFramingRequest
  | SpacePickRequest
  | SpaceEndRequest;

// From the worker ---------------------------------------------------------------------------------

export interface SolidReadyReply {
  type: 'ready';
  limits: SolidWorkerLimits;
}

export interface SolidLoadedReply {
  type: 'loaded';
  id: number;
  hash: string;
  /** How many named parts, and animations, its file holds. */
  parts: number;
  animations: number;
}

export interface SolidPictureReply {
  type: 'picture';
  id: number;
  key: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Present when the draw asked for it. */
  partBuffer?: SolidPartBuffer;
}

export interface SolidFrameReply {
  type: 'frame';
  turn: number;
  /**
   * Counts up from 1 within its turning, so that a late frame is told from a newer one; a turning
   * started again, as after its context was lost, counts from 1 again.
   */
  serial: number;
  /** The camera it was drawn from. */
  camera: SolidCamera;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  partBuffer?: SolidPartBuffer;
  /** Where the animation playing is, in seconds; absent when none plays. */
  time?: number;
}

export interface SolidPickedReply {
  type: 'picked';
  id: number;
  /** The innermost named part under the pixel, by its index; null where none is. */
  part: number | null;
  /** The point of the solid under the pixel, in its space; absent where nothing is drawn. */
  point?: SpacePoint;
}

/** Why the worker did not do what it was asked. */
export type SolidWorkerCode =
  /** The solid is not loaded, or was let go of: load it again. */
  | 'not-loaded'
  /** The file is not a canonical solid, or its bytes are not its hash's. */
  | 'invalid-solid'
  /** Past the worker's limits. */
  | 'too-large'
  /** Its context is lost: ask again once it is restored. */
  | 'context-lost'
  /** This build has no solid worker to draw with; solids stay their placeholders. */
  | 'unavailable'
  /** Anything else. */
  | 'failed';

export const SOLID_WORKER_CODES: readonly SolidWorkerCode[] = [
  'not-loaded',
  'invalid-solid',
  'too-large',
  'context-lost',
  'unavailable',
  'failed',
];

export interface SolidRefusedReply {
  type: 'refused';
  /**
   * The request refused: a load, a draw, a pick or a space's framing or pick by its id, a turning by
   * its number, or a space's drawing by its number.
   */
  id?: number;
  turn?: number;
  space?: number;
  code: SolidWorkerCode;
  message: string;
}

export interface SolidLetGoReply {
  type: 'let-go';
  hashes: string[];
}

export interface SolidContextReply {
  type: 'context-lost' | 'context-restored';
}

/** A frame of a space, drawn once something it shows changed. */
export interface SpaceFrameReply {
  type: 'space/frame';
  space: number;
  /** Counts up from 1 within its drawing, so that a late frame is told from a newer one. */
  serial: number;
  /** The camera it was drawn from: the one asked for, or the one that frames everything. */
  camera: SpaceCamera;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/** The camera that frames what a `space/framing` named, from the camera's own direction. */
export interface SpaceFramedReply {
  type: 'space/framed';
  space: number;
  id: number;
  camera: SpaceCamera;
}

/**
 * What lies under a pixel of a space: an element, by id, or none, and the point there; or a relation
 * drawn as a line, by id, with `element` null.
 */
export interface SpacePickedReply {
  type: 'space/picked';
  space: number;
  id: number;
  element: Id | null;
  /** The relation whose line lies under the pixel, which is drawn over the solids. */
  relation?: Id;
  /** The point under the pixel, in the coordinates of the element the panel shows; absent on nothing. */
  point?: SpacePoint;
}

/** One element where a gesture left it: its origin and axes, as an entry's matrix. */
export interface SpaceMoved {
  element: Id;
  matrix: readonly number[];
}

/**
 * A gesture on a space's handles that ended (ADR 0076): where it left each element it moved or
 * turned, from which the app sends one `set-poses`. The interaction task says what starts one.
 */
export interface SpaceGestureEndedReply {
  type: 'space/gesture-ended';
  space: number;
  gesture: 'move' | 'rotate';
  moved: SpaceMoved[];
}

export type SolidWorkerReply =
  | SolidReadyReply
  | SolidLoadedReply
  | SolidPictureReply
  | SolidFrameReply
  | SolidPickedReply
  | SolidRefusedReply
  | SolidLetGoReply
  | SolidContextReply
  | SpaceFrameReply
  | SpaceFramedReply
  | SpacePickedReply
  | SpaceGestureEndedReply;

// Readers -----------------------------------------------------------------------------------------

/** A message read, or why it cannot be. */
export type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

const HASH = /^[0-9a-f]{64}$/;
/** The longest key a picture carries. */
export const MAX_SOLID_KEY = 2048;
/** The longest message a refusal carries. */
const MAX_REFUSAL = 2000;

class Unread extends Error {}

function refuse(reason: string): never {
  throw new Unread(reason);
}

function reading<T>(read: () => T): Read<T> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof Unread) return { ok: false, reason: error.message };
    throw error;
  }
}

function recordOf(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse(`${what} is an object.`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) refuse(`${what} holds no "${key}".`);
  }
}

function counter(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    refuse(`${what} is a whole number from 1.`);
  }
  return value;
}

function hashOf(value: unknown): string {
  if (typeof value !== 'string' || !HASH.test(value)) {
    refuse('A solid is named by its SHA-256, in lowercase hexadecimal.');
  }
  return value;
}

function partIndex(value: unknown, what: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= SOLID_CAPS.parts
  ) {
    refuse(`${what} is a part's index, from 0 to ${SOLID_CAPS.parts - 1}.`);
  }
  return value;
}

function sizeOf(value: unknown, bucketed: boolean): PixelSize {
  const size = recordOf(value, 'A size');
  onlyKeys(size, ['width', 'height'], 'A size');
  const side = (number: unknown) => {
    if (
      typeof number !== 'number' ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > LARGEST_SOLID_PICTURE
    ) {
      refuse(`A size is whole pixels, from 1 to ${LARGEST_SOLID_PICTURE} a side.`);
    }
    return number;
  };
  const width = side(size.width);
  const height = side(size.height);
  if (bucketed && !(SOLID_BUCKETS as readonly number[]).includes(Math.max(width, height))) {
    refuse(`A picture's longer side is one of ${SOLID_BUCKETS.join(', ')} pixels.`);
  }
  return { width, height };
}

function within(number: unknown, low: number, high: number, what: string): number {
  if (typeof number !== 'number' || !Number.isFinite(number) || number < low || number > high) {
    refuse(`A camera's ${what} is a number from ${low} to ${high}.`);
  }
  return number;
}

function pointOf(value: unknown, what: string): SpacePoint {
  const point = recordOf(value, what);
  onlyKeys(point, ['x', 'y', 'z'], what);
  return {
    x: within(point.x, -100_000, 100_000, 'point'),
    y: within(point.y, -100_000, 100_000, 'point'),
    z: within(point.z, -100_000, 100_000, 'point'),
  };
}

/** A solid's camera, within the ranges the schema gives it. */
export function readSolidCamera(value: unknown): Read<SolidCamera> {
  return reading(() => cameraOf(value));
}

function cameraOf(value: unknown): SolidCamera {
  const camera = recordOf(value, 'A camera');
  onlyKeys(camera, ['azimuth', 'elevation', 'zoom', 'target', 'projection'], 'A camera');
  const read: SolidCamera = {
    azimuth: within(camera.azimuth, -180, 180, 'azimuth'),
    elevation: within(camera.elevation, -89, 89, 'elevation'),
  };
  if (camera.zoom !== undefined) read.zoom = within(camera.zoom, 0.25, 16, 'zoom');
  if (camera.target !== undefined) read.target = pointOf(camera.target, "A camera's target");
  if (camera.projection !== undefined) {
    if (camera.projection !== 'perspective' && camera.projection !== 'orthographic') {
      refuse('A camera’s projection is "perspective" or "orthographic".');
    }
    read.projection = camera.projection;
  }
  return read;
}

function lightingOf(value: unknown): SolidLighting {
  if (value !== 'studio' && value !== 'flat') refuse('Lighting is "studio" or "flat".');
  return value;
}

function hiddenOf(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > SOLID_CAPS.parts) {
    refuse('The hidden parts are a list of their indexes.');
  }
  const hidden: number[] = [];
  for (const each of value) {
    const index = partIndex(each, 'A hidden part');
    if (hidden.length > 0 && index <= (hidden.at(-1) as number)) {
      refuse('The hidden parts are listed once each, in ascending order.');
    }
    hidden.push(index);
  }
  return hidden;
}

/** The fields of a view, as `draw`, `turn/start` and `pick` carry them. */
function viewOf(message: Record<string, unknown>, bucketed: boolean, lit: boolean): SolidView {
  const view: SolidView = {
    solid: hashOf(message.solid),
    size: sizeOf(message.size, bucketed),
    camera: cameraOf(message.camera),
    lighting: lit ? lightingOf(message.lighting) : 'studio',
    hidden: hiddenOf(message.hidden),
    parts: false,
  };
  if (lit) {
    if (typeof message.parts !== 'boolean') refuse('Whether a part buffer comes is true or false.');
    view.parts = message.parts;
  }
  if (message.only !== undefined) view.only = partIndex(message.only, 'The part drawn alone');
  return view;
}

const VIEW_KEYS = ['solid', 'size', 'camera', 'lighting', 'hidden', 'parts', 'only'] as const;

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  );
}

// A space's fields --------------------------------------------------------------------------------

const COLOR = /^#[0-9a-fA-F]{6}$/;

function idOf(value: unknown, what: string): Id {
  if (!isId(value)) refuse(`${what} is an id.`);
  return value;
}

function listOf(value: unknown, most: number, what: string): unknown[] {
  if (!Array.isArray(value) || value.length > most) {
    refuse(`${what} is a list of at most ${most}.`);
  }
  return value as unknown[];
}

function flag(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') refuse(`${what} is true or false.`);
  return value;
}

function finiteWithin(value: unknown, low: number, high: number, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    refuse(`${what} is a number from ${low} to ${high}.`);
  }
  return value;
}

/** A point in a space, in meters, within the farthest a view state's camera looks. */
function spacePointOf(value: unknown, what: string): SpacePoint {
  const point = recordOf(value, what);
  onlyKeys(point, ['x', 'y', 'z'], what);
  const axis = (number: unknown) =>
    finiteWithin(number, -MAX_SPACE_DISTANCE, MAX_SPACE_DISTANCE, `${what}'s coordinate`);
  return { x: axis(point.x), y: axis(point.y), z: axis(point.z) };
}

/** A matrix: 16 finite numbers, column by column, none past {@link MAX_SPACE_MATRIX} either way. */
function matrixOf(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 16) refuse('A matrix is 16 numbers.');
  return value.map((number) =>
    finiteWithin(number, -MAX_SPACE_MATRIX, MAX_SPACE_MATRIX, 'A matrix’s number'),
  );
}

/** The camera of the physical-space panel, as a view state's `space.camera` gives it. */
function spaceCameraOf(value: unknown): SpaceCamera {
  const camera = recordOf(value, 'A space’s camera');
  onlyKeys(camera, ['target', 'azimuth', 'elevation', 'distance'], 'A space’s camera');
  const distance = finiteWithin(camera.distance, 0, MAX_SPACE_DISTANCE, 'A space’s distance');
  if (distance === 0) refuse('A space’s camera looks from more than 0 m.');
  return {
    target: spacePointOf(camera.target, 'A space’s target'),
    azimuth: finiteWithin(camera.azimuth, -180, 180, 'A space’s azimuth'),
    elevation: finiteWithin(camera.elevation, -89, 89, 'A space’s elevation'),
    distance,
  };
}

/** Reads the camera of the physical-space panel, as the worker takes and answers it. */
export function readSpaceCamera(value: unknown): Read<SpaceCamera> {
  return reading(() => spaceCameraOf(value));
}

function spaceCutOf(value: unknown): SpaceCut {
  const cut = recordOf(value, 'A cut');
  onlyKeys(cut, ['axis', 'at', 'keep'], 'A cut');
  if (cut.axis !== 'x' && cut.axis !== 'y' && cut.axis !== 'z')
    refuse('A cut’s axis is x, y or z.');
  if (cut.keep !== 'below' && cut.keep !== 'above') refuse('A cut keeps "below" or "above".');
  return {
    axis: cut.axis,
    at: finiteWithin(
      cut.at,
      -MAX_SPACE_DISTANCE,
      MAX_SPACE_DISTANCE,
      'Where a cut crosses its axis',
    ),
    keep: cut.keep,
  };
}

function boundsOf(value: unknown): SpaceBounds {
  const bounds = recordOf(value, 'Bounds');
  onlyKeys(bounds, ['min', 'max'], 'Bounds');
  const min = spacePointOf(bounds.min, 'A bounds’ least corner');
  const max = spacePointOf(bounds.max, 'A bounds’ greatest corner');
  if (min.x > max.x || min.y > max.y || min.z > max.z) {
    refuse('Bounds’ least corner is nowhere past their greatest.');
  }
  return { min, max };
}

function entryOf(value: unknown): SpaceDrawnEntry {
  const entry = recordOf(value, 'An entry of a space');
  onlyKeys(
    entry,
    ['element', 'name', 'matrix', 'solid', 'bounds', 'part', 'in', 'marker', 'as', 'fill'],
    'An entry of a space',
  );
  const { name } = entry;
  if (typeof name !== 'string' || name.length > MAX_SPACE_NAME) {
    refuse(`An entry’s name is text of at most ${MAX_SPACE_NAME} characters.`);
  }
  const read: SpaceDrawnEntry = {
    element: idOf(entry.element, 'An entry’s element'),
    name,
    matrix: matrixOf(entry.matrix),
  };
  if (entry.solid !== undefined) read.solid = hashOf(entry.solid);
  if (entry.bounds !== undefined) {
    if (read.solid === undefined) refuse('Only an entry that draws a solid has its bounds.');
    read.bounds = boundsOf(entry.bounds);
  }
  if (entry.part !== undefined) {
    const part = recordOf(entry.part, 'An entry’s part');
    onlyKeys(part, ['of', 'index'], 'An entry’s part');
    read.part = { of: idOf(part.of, 'What holds a part'), index: partIndex(part.index, 'A part') };
  }
  if (entry.in !== undefined) {
    read.in = idOf(entry.in, 'What an entry is posed in');
    if (read.part !== undefined) refuse('An anchored part is posed in nothing.');
  }
  if (entry.marker !== undefined && flag(entry.marker, 'Whether an entry is a marker')) {
    if (read.solid !== undefined || read.part !== undefined) {
      refuse('An entry drawn as a marker draws no solid and is no part.');
    }
    read.marker = true;
  }
  if (entry.as !== undefined) read.as = idOf(entry.as, 'The container an entry is drawn as');
  if (entry.fill !== undefined) read.fill = colorOf(entry.fill);
  return read;
}

function colorOf(value: unknown): Color {
  if (typeof value !== 'string' || !COLOR.test(value)) refuse('A fill is a color, #RRGGBB.');
  return value;
}

/** A rotation: a quaternion of finite numbers, within a millionth of unit length. */
function rotationOf(value: unknown): Rotation {
  const rotation = recordOf(value, 'A rotation');
  onlyKeys(rotation, ['x', 'y', 'z', 'w'], 'A rotation');
  const read = {
    x: finiteWithin(rotation.x, -1, 1, 'A rotation’s x'),
    y: finiteWithin(rotation.y, -1, 1, 'A rotation’s y'),
    z: finiteWithin(rotation.z, -1, 1, 'A rotation’s z'),
    w: finiteWithin(rotation.w, -1, 1, 'A rotation’s w'),
  };
  if (Math.abs(Math.hypot(read.x, read.y, read.z, read.w) - 1) > 1e-6) {
    refuse('A rotation is a quaternion of unit length.');
  }
  return read;
}

const AXES: readonly string[] = ['x', 'y', 'z'];

function handlesOf(value: unknown): SpaceHandles {
  const handles = recordOf(value, 'Handles');
  onlyKeys(handles, ['mode', 'at', 'rotation', 'active'], 'Handles');
  if (handles.mode !== 'move' && handles.mode !== 'rotate') {
    refuse('Handles move or rotate: "move" or "rotate".');
  }
  const read: SpaceHandles = {
    mode: handles.mode,
    at: spacePointOf(handles.at, 'Where handles stand'),
  };
  if (handles.rotation !== undefined) read.rotation = rotationOf(handles.rotation);
  if (handles.active !== undefined) {
    if (typeof handles.active !== 'string' || !AXES.includes(handles.active)) {
      refuse('The axis of the handles pointed at is x, y or z.');
    }
    read.active = handles.active as SpaceAxis;
  }
  return read;
}

const STATE_FLAGS = ['hidden', 'faint', 'highlighted', 'selected', 'hovered'] as const;

function stateOf(value: unknown): SpaceStateEntry {
  const state = recordOf(value, 'A state');
  onlyKeys(state, ['element', ...STATE_FLAGS, 'fill', 'opacity'], 'A state');
  const read: SpaceStateEntry = { element: idOf(state.element, 'A state’s element') };
  for (const key of STATE_FLAGS) {
    if (state[key] !== undefined && flag(state[key], `Whether it is ${key}`)) read[key] = true;
  }
  if (state.fill !== undefined) read.fill = colorOf(state.fill);
  if (state.opacity !== undefined) read.opacity = finiteWithin(state.opacity, 0, 1, 'An opacity');
  return read;
}

const LINE_FLAGS = ['highlighted', 'selected', 'hovered', 'faint'] as const;

function lineOf(value: unknown): SpaceLine {
  const line = recordOf(value, 'A line');
  onlyKeys(line, ['relation', 'from', 'to', ...LINE_FLAGS, 'markers'], 'A line');
  const read: SpaceLine = {
    relation: idOf(line.relation, 'A line’s relation'),
    from: spacePointOf(line.from, 'Where a line starts'),
    to: spacePointOf(line.to, 'Where a line ends'),
  };
  for (const key of LINE_FLAGS) {
    if (line[key] !== undefined && flag(line[key], `Whether a line is ${key}`)) read[key] = true;
  }
  if (line.markers !== undefined) {
    read.markers = listOf(line.markers, MAX_SPACE_LINE_MARKERS, 'A line’s markers').map((each) =>
      finiteWithin(each, 0, 1, 'A marker'),
    );
  }
  return read;
}

const SHOWN_KEYS = [
  'size',
  'entries',
  'states',
  'camera',
  'cut',
  'explode',
  'names',
  'lines',
  'theme',
  'pixelRatio',
  'handles',
] as const;

/**
 * The parts of what a space shows that a message gives, each read; `nulls` lets a camera, a cut and
 * the handles go.
 */
function shownPartsOf(message: Record<string, unknown>, nulls: boolean): SpaceChange {
  const read: SpaceChange = {};
  if (message.size !== undefined) read.size = sizeOf(message.size, false);
  if (message.entries !== undefined) {
    const entries = listOf(message.entries, MAX_SPACE_ENTRIES, 'A space’s entries').map(entryOf);
    const seen = new Set<Id>();
    for (const entry of entries) {
      if (seen.has(entry.element)) refuse('A space draws each element once.');
      seen.add(entry.element);
    }
    read.entries = entries;
  }
  if (message.states !== undefined) {
    read.states = listOf(message.states, MAX_SPACE_ENTRIES, 'A space’s states').map(stateOf);
  }
  if (message.camera !== undefined) {
    read.camera = nulls && message.camera === null ? null : spaceCameraOf(message.camera);
  }
  if (message.cut !== undefined) {
    read.cut = nulls && message.cut === null ? null : spaceCutOf(message.cut);
  }
  if (message.explode !== undefined) {
    read.explode = finiteWithin(message.explode, 0, 2, 'An explosion');
  }
  if (message.names !== undefined) read.names = flag(message.names, 'Whether names show');
  if (message.lines !== undefined) {
    read.lines = listOf(message.lines, MAX_SPACE_LINES, 'A space’s lines').map(lineOf);
  }
  if (message.theme !== undefined) {
    if (message.theme !== 'light' && message.theme !== 'dark') {
      refuse('A space’s theme is "light" or "dark".');
    }
    read.theme = message.theme;
  }
  if (message.pixelRatio !== undefined) {
    read.pixelRatio = finiteWithin(
      message.pixelRatio,
      SPACE_PIXEL_RATIOS.least,
      SPACE_PIXEL_RATIOS.most,
      'A space’s pixel ratio',
    );
  }
  if (message.handles !== undefined) {
    read.handles = nulls && message.handles === null ? null : handlesOf(message.handles);
  }
  return read;
}

function shownOf(message: Record<string, unknown>): SpaceShown {
  if (message.size === undefined || message.entries === undefined || message.states === undefined) {
    refuse('Showing a space gives its size, its entries and their states.');
  }
  return shownPartsOf(message, false) as SpaceShown;
}

function changeOf(message: Record<string, unknown>): SpaceChange {
  return shownPartsOf(message, true);
}

/** Reads a message from the app, as the solid worker takes it. */
export function readSolidWorkerRequest(value: unknown): Read<SolidWorkerRequest> {
  return reading((): SolidWorkerRequest => {
    const message = recordOf(value, 'A message to the solid worker');
    switch (message.type) {
      case 'load': {
        onlyKeys(message, ['type', 'id', 'hash', 'bytes'], 'load');
        const { bytes } = message;
        if (!isArrayBuffer(bytes) || bytes.byteLength < 1) refuse('A load hands over the bytes.');
        if (bytes.byteLength > SOLID_CAPS.fileBytes) {
          refuse(`A solid's file holds at most ${SOLID_CAPS.fileBytes} bytes.`);
        }
        return {
          type: 'load',
          id: counter(message.id, 'A load’s id'),
          hash: hashOf(message.hash),
          bytes,
        };
      }
      case 'release':
        onlyKeys(message, ['type', 'hash'], 'release');
        return { type: 'release', hash: hashOf(message.hash) };
      case 'draw': {
        onlyKeys(message, ['type', 'id', 'key', ...VIEW_KEYS], 'draw');
        const { key } = message;
        if (typeof key !== 'string' || key === '' || key.length > MAX_SOLID_KEY) {
          refuse(`A picture's key is text of 1 to ${MAX_SOLID_KEY} characters.`);
        }
        return {
          type: 'draw',
          id: counter(message.id, 'A draw’s id'),
          key,
          ...viewOf(message, true, true),
        };
      }
      case 'turn/start':
        onlyKeys(message, ['type', 'turn', ...VIEW_KEYS], 'turn/start');
        return {
          type: 'turn/start',
          turn: counter(message.turn, 'A turning'),
          ...viewOf(message, false, true),
        };
      case 'turn/camera': {
        onlyKeys(message, ['type', 'turn', 'camera', 'size'], 'turn/camera');
        return {
          type: 'turn/camera',
          turn: counter(message.turn, 'A turning'),
          camera: cameraOf(message.camera),
          ...(message.size === undefined ? {} : { size: sizeOf(message.size, false) }),
        };
      }
      case 'turn/play': {
        onlyKeys(message, ['type', 'turn', 'animation'], 'turn/play');
        const { animation } = message;
        if (
          animation !== null &&
          (typeof animation !== 'number' ||
            !Number.isInteger(animation) ||
            animation < 0 ||
            animation >= SOLID_CAPS.animations)
        ) {
          refuse(`An animation is its index, from 0 to ${SOLID_CAPS.animations - 1}, or null.`);
        }
        return { type: 'turn/play', turn: counter(message.turn, 'A turning'), animation };
      }
      case 'turn/end':
        onlyKeys(message, ['type', 'turn'], 'turn/end');
        return { type: 'turn/end', turn: counter(message.turn, 'A turning') };
      case 'pick': {
        onlyKeys(
          message,
          ['type', 'id', 'x', 'y', 'solid', 'size', 'camera', 'hidden', 'only'],
          'pick',
        );
        const { solid, size, camera, hidden, only } = viewOf(message, false, false);
        const coordinate = (number: unknown, most: number) => {
          if (
            typeof number !== 'number' ||
            !Number.isFinite(number) ||
            number < 0 ||
            number > most
          ) {
            refuse('A pixel picked lies within its view.');
          }
          return number;
        };
        return {
          type: 'pick',
          id: counter(message.id, 'A pick’s id'),
          x: coordinate(message.x, size.width),
          y: coordinate(message.y, size.height),
          solid,
          size,
          camera,
          hidden,
          ...(only === undefined ? {} : { only }),
        };
      }
      case 'space/show':
        onlyKeys(message, ['type', 'space', ...SHOWN_KEYS], 'space/show');
        return {
          type: 'space/show',
          space: counter(message.space, 'A space'),
          ...shownOf(message),
        };
      case 'space/update':
        onlyKeys(message, ['type', 'space', ...SHOWN_KEYS], 'space/update');
        return {
          type: 'space/update',
          space: counter(message.space, 'A space'),
          ...changeOf(message),
        };
      case 'space/framing': {
        onlyKeys(message, ['type', 'space', 'id', 'elements'], 'space/framing');
        return {
          type: 'space/framing',
          space: counter(message.space, 'A space'),
          id: counter(message.id, 'A framing’s id'),
          ...(message.elements === undefined
            ? {}
            : {
                elements: listOf(message.elements, MAX_SPACE_ENTRIES, 'The elements framed').map(
                  (each) => idOf(each, 'An element framed'),
                ),
              }),
        };
      }
      case 'space/pick': {
        onlyKeys(message, ['type', 'space', 'id', 'x', 'y'], 'space/pick');
        const coordinate = (number: unknown) => {
          if (
            typeof number !== 'number' ||
            !Number.isFinite(number) ||
            number < 0 ||
            number > LARGEST_SOLID_PICTURE
          ) {
            refuse('A pixel picked lies within the frames of its space.');
          }
          return number;
        };
        return {
          type: 'space/pick',
          space: counter(message.space, 'A space'),
          id: counter(message.id, 'A pick’s id'),
          x: coordinate(message.x),
          y: coordinate(message.y),
        };
      }
      case 'space/end':
        onlyKeys(message, ['type', 'space'], 'space/end');
        return { type: 'space/end', space: counter(message.space, 'A space') };
      default:
        return refuse(`The solid worker takes no message ${JSON.stringify(message.type)}.`);
    }
  });
}

/** Whether a value is a picture: an `ImageBitmap`, or where there is none, as in tests, its like. */
function isBitmap(value: unknown): value is ImageBitmap {
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return true;
  if (typeof value !== 'object' || value === null) return false;
  const like = value as { width?: unknown; height?: unknown; close?: unknown };
  return (
    typeof like.width === 'number' &&
    typeof like.height === 'number' &&
    typeof like.close === 'function'
  );
}

/** A picture and its part buffer, which must be its picture's size. */
function pictureOf(message: Record<string, unknown>): {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  partBuffer?: SolidPartBuffer;
} {
  const { bitmap } = message;
  const { width, height } = sizeOf({ width: message.width, height: message.height }, false);
  if (!isBitmap(bitmap) || bitmap.width !== width || bitmap.height !== height) {
    refuse('A picture is a bitmap of the size it says.');
  }
  if (message.partBuffer === undefined) return { bitmap, width, height };
  const buffer = recordOf(message.partBuffer, 'A part buffer');
  onlyKeys(buffer, ['width', 'height', 'data'], 'A part buffer');
  if (
    buffer.width !== width ||
    buffer.height !== height ||
    !(buffer.data instanceof Uint16Array) ||
    buffer.data.length !== width * height
  ) {
    refuse('A part buffer holds a number for each pixel of its picture.');
  }
  return { bitmap, width, height, partBuffer: { width, height, data: buffer.data } };
}

/** Reads a message from the solid worker, as the app takes it. */
export function readSolidWorkerReply(value: unknown): Read<SolidWorkerReply> {
  return reading((): SolidWorkerReply => {
    const message = recordOf(value, 'A message from the solid worker');
    switch (message.type) {
      case 'ready': {
        onlyKeys(message, ['type', 'limits'], 'ready');
        const limits = recordOf(message.limits, 'The limits');
        onlyKeys(limits, ['largestPicture', 'memoryBytes'], 'The limits');
        const { largestPicture, memoryBytes } = limits;
        if (
          typeof largestPicture !== 'number' ||
          !Number.isInteger(largestPicture) ||
          largestPicture < SOLID_BUCKETS[0] ||
          largestPicture > LARGEST_SOLID_PICTURE
        ) {
          refuse(
            `The largest picture is from ${SOLID_BUCKETS[0]} to ${LARGEST_SOLID_PICTURE} pixels.`,
          );
        }
        if (
          typeof memoryBytes !== 'number' ||
          !Number.isSafeInteger(memoryBytes) ||
          memoryBytes < 0
        ) {
          refuse('The memory is a number of bytes.');
        }
        return { type: 'ready', limits: { largestPicture, memoryBytes } };
      }
      case 'loaded': {
        onlyKeys(message, ['type', 'id', 'hash', 'parts', 'animations'], 'loaded');
        const count = (number: unknown, most: number, what: string) => {
          if (
            typeof number !== 'number' ||
            !Number.isInteger(number) ||
            number < 0 ||
            number > most
          ) {
            refuse(`A solid holds 0 to ${most} ${what}.`);
          }
          return number;
        };
        return {
          type: 'loaded',
          id: counter(message.id, 'A load’s id'),
          hash: hashOf(message.hash),
          parts: count(message.parts, SOLID_CAPS.parts, 'parts'),
          animations: count(message.animations, SOLID_CAPS.animations, 'animations'),
        };
      }
      case 'picture': {
        onlyKeys(
          message,
          ['type', 'id', 'key', 'bitmap', 'width', 'height', 'partBuffer'],
          'picture',
        );
        const { key } = message;
        if (typeof key !== 'string' || key === '' || key.length > MAX_SOLID_KEY) {
          refuse(`A picture's key is text of 1 to ${MAX_SOLID_KEY} characters.`);
        }
        return {
          type: 'picture',
          id: counter(message.id, 'A draw’s id'),
          key,
          ...pictureOf(message),
        };
      }
      case 'frame': {
        onlyKeys(
          message,
          ['type', 'turn', 'serial', 'camera', 'bitmap', 'width', 'height', 'partBuffer', 'time'],
          'frame',
        );
        const { time } = message;
        if (
          time !== undefined &&
          (typeof time !== 'number' || !Number.isFinite(time) || time < 0)
        ) {
          refuse('A frame’s time is seconds from 0.');
        }
        return {
          type: 'frame',
          turn: counter(message.turn, 'A turning'),
          serial: counter(message.serial, 'A frame’s serial'),
          camera: cameraOf(message.camera),
          ...pictureOf(message),
          ...(time === undefined ? {} : { time }),
        };
      }
      case 'picked': {
        onlyKeys(message, ['type', 'id', 'part', 'point'], 'picked');
        return {
          type: 'picked',
          id: counter(message.id, 'A pick’s id'),
          part: message.part === null ? null : partIndex(message.part, 'The part picked'),
          ...(message.point === undefined ? {} : { point: pointOf(message.point, 'A point') }),
        };
      }
      case 'refused': {
        onlyKeys(message, ['type', 'id', 'turn', 'space', 'code', 'message'], 'refused');
        const { code, message: text } = message;
        if (!SOLID_WORKER_CODES.includes(code as SolidWorkerCode)) {
          refuse(`A refusal's code is one of ${SOLID_WORKER_CODES.join(', ')}.`);
        }
        if (typeof text !== 'string' || text.length > MAX_REFUSAL) {
          refuse(`A refusal says why in at most ${MAX_REFUSAL} characters.`);
        }
        return {
          type: 'refused',
          ...(message.id === undefined ? {} : { id: counter(message.id, 'A request’s id') }),
          ...(message.turn === undefined ? {} : { turn: counter(message.turn, 'A turning') }),
          ...(message.space === undefined ? {} : { space: counter(message.space, 'A space') }),
          code: code as SolidWorkerCode,
          message: text,
        };
      }
      case 'let-go': {
        onlyKeys(message, ['type', 'hashes'], 'let-go');
        if (!Array.isArray(message.hashes) || message.hashes.length > 4096) {
          refuse('The solids let go of are listed by their hashes.');
        }
        return { type: 'let-go', hashes: message.hashes.map(hashOf) };
      }
      case 'context-lost':
      case 'context-restored':
        onlyKeys(message, ['type'], message.type);
        return { type: message.type };
      case 'space/frame':
        onlyKeys(
          message,
          ['type', 'space', 'serial', 'camera', 'bitmap', 'width', 'height'],
          'space/frame',
        );
        return {
          type: 'space/frame',
          space: counter(message.space, 'A space'),
          serial: counter(message.serial, 'A frame’s serial'),
          camera: spaceCameraOf(message.camera),
          ...(pictureOf(message) as { bitmap: ImageBitmap; width: number; height: number }),
        };
      case 'space/framed':
        onlyKeys(message, ['type', 'space', 'id', 'camera'], 'space/framed');
        return {
          type: 'space/framed',
          space: counter(message.space, 'A space'),
          id: counter(message.id, 'A framing’s id'),
          camera: spaceCameraOf(message.camera),
        };
      case 'space/picked':
        onlyKeys(message, ['type', 'space', 'id', 'element', 'relation', 'point'], 'space/picked');
        if (message.relation !== undefined && message.element !== null) {
          refuse('A pick answers an element or a relation, not both.');
        }
        return {
          type: 'space/picked',
          space: counter(message.space, 'A space'),
          id: counter(message.id, 'A pick’s id'),
          element: message.element === null ? null : idOf(message.element, 'The element picked'),
          ...(message.relation === undefined
            ? {}
            : { relation: idOf(message.relation, 'The relation picked') }),
          ...(message.point === undefined
            ? {}
            : { point: spacePointOf(message.point, 'The point picked') }),
        };
      case 'space/gesture-ended': {
        onlyKeys(message, ['type', 'space', 'gesture', 'moved'], 'space/gesture-ended');
        const { gesture, moved } = message;
        if (gesture !== 'move' && gesture !== 'rotate') {
          refuse('A gesture is "move" or "rotate".');
        }
        const list = listOf(moved, MAX_SPACE_ENTRIES, 'What a gesture moved');
        if (list.length === 0) refuse('A gesture that ended moved something.');
        return {
          type: 'space/gesture-ended',
          space: counter(message.space, 'A space'),
          gesture,
          moved: list.map((each) => {
            const one = recordOf(each, 'What a gesture moved');
            onlyKeys(one, ['element', 'matrix'], 'What a gesture moved');
            return {
              element: idOf(one.element, 'An element moved'),
              matrix: matrixOf(one.matrix),
            };
          }),
        };
      }
      default:
        return refuse(`The solid worker sends no message ${JSON.stringify(message.type)}.`);
    }
  });
}
