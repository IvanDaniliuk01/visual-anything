/**
 * Pictures' media files on the canvas (ADR 0098): where their bytes come from, the size their texture
 * is drawn at, and how a GIF plays. Pure, so that the canvas, the read-only page and the tests share
 * it; `layer.ts` draws with it.
 */
import { composeGifFrames, gifFrameMilliseconds, type GifDocument } from '@visual-anything/core';
import type { MediaRef } from '@visual-anything/schema';
import type { LiveResult } from '../../live/connection';
import { LARGE_BUCKETS, bucketFor, sharpBucketFor } from '../images';

import type { MediaFiles } from './files';

export type { MediaFiles } from './files';

/** How long a file that could not be had is not asked for again, in milliseconds. */
const RETRY_AFTER = 10_000;

const filesOver = new WeakMap<object, MediaFiles>();

/**
 * The media files of a live session, asked for once each: a file is asked for again only once a
 * failure is ten seconds old, as when the person puts the file back.
 */
export function mediaFilesOver(
  get: (hash: string) => Promise<LiveResult<Uint8Array>>,
  now: () => number = () => performance.now(),
): MediaFiles {
  const known = filesOver.get(get);
  if (known) return known;
  const asked = new Map<string, { at: number; bytes: Promise<Uint8Array | undefined> }>();
  const files: MediaFiles = (hash) => {
    const before = asked.get(hash);
    if (before) return before.bytes;
    const bytes = get(hash).then(
      (result) => {
        if (result.ok) return result.answer;
        asked.set(hash, { at: now(), bytes: Promise.resolve(undefined) });
        setTimeout(() => {
          const entry = asked.get(hash);
          if (entry && now() - entry.at >= RETRY_AFTER - 1) asked.delete(hash);
        }, RETRY_AFTER);
        return undefined;
      },
      () => undefined,
    );
    asked.set(hash, { at: now(), bytes });
    return bytes;
  };
  filesOver.set(get, files);
  return files;
}

/** The media files a read-only page carries, by hash, in base64 (ADR 0098). */
export function embeddedMediaFiles(files: Readonly<Record<string, Uint8Array>>): MediaFiles {
  const read: MediaFiles = (hash) =>
    Promise.resolve(Object.hasOwn(files, hash) ? files[hash] : undefined);
  read.holds = (hash) => Object.hasOwn(files, hash);
  return read;
}

/** The largest side a picture's texture takes (ADR 0098). */
export const PICTURE_TEXTURE_SIDE = LARGE_BUCKETS[LARGE_BUCKETS.length - 1] as number;

/**
 * The bucket a picture's texture is drawn at: no larger than it shows on screen, rounded up to the
 * image store's buckets when the camera rests, and never past 2,048 pixels on a side nor past the
 * picture's own size.
 */
export function pictureBucket(devicePixels: number, settled: boolean, media: MediaRef): number {
  const bucket = settled ? sharpBucketFor(devicePixels, true) : bucketFor(devicePixels, true);
  const own = Math.max(media.width, media.height);
  const ownBucket = sharpBucketFor(own, true);
  return Math.min(bucket, ownBucket, PICTURE_TEXTURE_SIDE);
}

/** The size in pixels of a picture's texture at a bucket: its longer side the bucket, its own at most. */
export function textureSize(media: MediaRef, bucket: number): { width: number; height: number } {
  const scale = Math.min(1, bucket / Math.max(media.width, media.height));
  return {
    width: Math.max(1, Math.round(media.width * scale)),
    height: Math.max(1, Math.round(media.height * scale)),
  };
}

/**
 * A GIF playing (ADR 0098): which frame shows, and when the next is due, from its frames' delays and
 * how often it loops. It composes frames as a browser does, one at a time, so a GIF holds one picture
 * of its own size whatever its frame count.
 */
export class GifPlayer {
  readonly #document: GifDocument;
  #frames: Generator<Uint8ClampedArray>;
  #index = -1;
  #plays = 0;
  #due = 0;
  #done = false;

  constructor(document: GifDocument) {
    this.#document = document;
    this.#frames = composeGifFrames(document);
  }

  /** The frame shown now, from 0. */
  get index(): number {
    return this.#index;
  }

  /** Whether it played as often as it loops, and rests on its last frame. */
  get done(): boolean {
    return this.#done;
  }

  /** When the next frame is due, in milliseconds. */
  get due(): number {
    return this.#due;
  }

  /** Whether the GIF has more than one frame, so that it plays at all. */
  get animated(): boolean {
    return this.#document.frames.length > 1;
  }

  /**
   * The first frame's pixels, as RGBA of the GIF's size, starting it over; the same buffer each call
   * gives, which the caller draws before it asks for the next.
   */
  first(now: number): Uint8ClampedArray {
    this.#frames = composeGifFrames(this.#document);
    this.#index = -1;
    this.#plays = 0;
    this.#done = false;
    return this.#next(now) as Uint8ClampedArray;
  }

  /**
   * The next frame's pixels when it is due at `now`, or `undefined` when the frame shown stays. A
   * frame due long ago is not caught up frame by frame: the next one shows, and its delay counts
   * from now.
   */
  advance(now: number): Uint8ClampedArray | undefined {
    if (this.#done || !this.animated || now < this.#due) return undefined;
    return this.#next(now);
  }

  #next(now: number): Uint8ClampedArray | undefined {
    let step = this.#frames.next();
    if (step.done) {
      this.#plays += 1;
      const { loop } = this.#document;
      // No loop count plays once; 0 plays for ever; n plays n more times.
      if (loop === undefined || (loop !== 0 && this.#plays > loop)) {
        this.#done = true;
        return undefined;
      }
      this.#frames = composeGifFrames(this.#document);
      this.#index = -1;
      step = this.#frames.next();
    }
    this.#index += 1;
    const frame = this.#document.frames[this.#index];
    this.#due = now + (frame ? gifFrameMilliseconds(frame) : 100);
    return step.value as Uint8ClampedArray;
  }
}
