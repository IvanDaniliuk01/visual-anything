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
 * A part buffer holds, for each pixel of its picture, the index of the innermost named part drawn
 * there plus one, or 0 where none is. Each reader checks a message strictly and answers it, or why it
 * cannot be read, as the core's readers do.
 */
import { SOLID_CAPS } from '@visual-anything/core';
import type { SolidCamera, SpacePoint } from '@visual-anything/schema';
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

export type SolidWorkerRequest =
  | SolidLoadRequest
  | SolidReleaseRequest
  | SolidDrawRequest
  | SolidTurnStartRequest
  | SolidTurnCameraRequest
  | SolidTurnPlayRequest
  | SolidTurnEndRequest
  | SolidPickRequest;

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
  /** The request refused: a load, a draw or a pick by its id, or a turning by its number. */
  id?: number;
  turn?: number;
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

export type SolidWorkerReply =
  | SolidReadyReply
  | SolidLoadedReply
  | SolidPictureReply
  | SolidFrameReply
  | SolidPickedReply
  | SolidRefusedReply
  | SolidLetGoReply
  | SolidContextReply;

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
        onlyKeys(message, ['type', 'id', 'turn', 'code', 'message'], 'refused');
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
      default:
        return refuse(`The solid worker sends no message ${JSON.stringify(message.type)}.`);
    }
  });
}
