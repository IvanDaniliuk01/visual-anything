/**
 * The sizes and views of solids' pictures (ADR 0075): the buckets a picture is drawn at, how a solid
 * is drawn, and its part buffer. Pure, with no DOM, so that the local program's exports read them as
 * the app does; `protocol.ts` gives them with the messages between the app and the solid worker.
 */
import type { SolidCamera } from '@visual-anything/schema';

/** The sizes a picture is drawn at, in pixels on its longer side. */
export const SOLID_BUCKETS = [128, 256, 512, 1024, 2048] as const;

/** One of the sizes a picture is drawn at. */
export type SolidBucket = (typeof SOLID_BUCKETS)[number];

/** The largest picture, and turning frame, the worker draws: 2,048 pixels a side. */
export const LARGEST_SOLID_PICTURE = 2048;

/** The estimated GPU memory the worker keeps the solids it drew lately within: 768 MiB. */
export const SOLID_WORKER_MEMORY = 768 * 1024 * 1024;

/** How the app lights every solid, the same in both themes. */
export type SolidLighting = 'studio' | 'flat';

/** The smallest bucket at least `pixels` across, up to the largest one `largest` allows. */
export function solidBucketFor(
  pixels: number,
  largest: number = LARGEST_SOLID_PICTURE,
): SolidBucket {
  const allowed = SOLID_BUCKETS.filter((bucket) => bucket <= largest);
  const buckets = allowed.length > 0 ? allowed : [SOLID_BUCKETS[0]];
  for (const bucket of buckets) if (bucket >= pixels) return bucket;
  return buckets.at(-1) as SolidBucket;
}

/** The size of a picture at a bucket, its longer side the bucket's, for an aspect of width over height. */
export function solidPictureSize(
  bucket: number,
  aspect: number,
): { width: number; height: number } {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const shorter = Math.max(1, Math.round(bucket * Math.min(ratio, 1 / ratio)));
  return ratio >= 1 ? { width: bucket, height: shorter } : { width: shorter, height: bucket };
}

/** A size in whole pixels. */
export interface PixelSize {
  width: number;
  height: number;
}

/** How a solid is drawn: which file, how large, from where, in which light, without which parts. */
export interface SolidView {
  /** The solid's file, by its hash. */
  solid: string;
  size: PixelSize;
  camera: SolidCamera;
  lighting: SolidLighting;
  /** The indexes, in its parts' depth-first order, of the parts not drawn, ascending. */
  hidden: readonly number[];
  /** Whether its part buffer comes with it. */
  parts: boolean;
  /** Present for a part drawn on its own: the index of the only part drawn, fitted to its bounds. */
  only?: number;
}

/** For each pixel, row by row from the top left: 0 for none, or the part's index plus one. */
export interface SolidPartBuffer {
  width: number;
  height: number;
  data: Uint16Array;
}
