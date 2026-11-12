/**
 * Still pictures of explorables (ADR 0107, A10.3): the widths they are taken at, how long taking one
 * waits, and the key a still is kept by for the session. Pure: the app takes stills in a hidden
 * frame and keeps them in its canvas's image store; nothing is written into the project.
 */
import { sha256 } from '../code/hash';
import { STILL_BUCKETS, type VaData } from './types';

/** A width a still is taken at. */
export type StillBucket = (typeof STILL_BUCKETS)[number];

/**
 * How long taking a still waits (ADR 0107): after the frame says hello, for `va.ready()` or for two
 * frames drawn, whichever comes first; the runtime waits for `document.fonts.ready` at most 2 s
 * itself; and the whole take gives up after 5 s.
 */
export const STILL_WAIT = Object.freeze({
  /** Frames drawn after the hello that stand for `va.ready()` when a page never says it. */
  framesForReady: 2,
  /** The runtime's own wait for `document.fonts.ready`, in milliseconds. */
  fonts: 2_000,
  /** The whole take, from loading the frame to the still's PNG, in milliseconds. */
  giveUp: 5_000,
});

/**
 * The bucket a shape shown this many device pixels wide needs: the smallest still width at least as
 * wide, and the largest past it. A shape too small to show anything still takes the smallest.
 */
export function stillBucket(devicePixels: number): StillBucket {
  for (const bucket of STILL_BUCKETS) if (devicePixels <= bucket) return bucket;
  return STILL_BUCKETS[STILL_BUCKETS.length - 1] as StillBucket;
}

/** Whether a width is one stills are taken at. */
export function isStillBucket(width: unknown): width is StillBucket {
  return STILL_BUCKETS.some((bucket) => bucket === width);
}

/**
 * The key a still is kept by (ADR 0107): the SHA-256 of the frame's inputs (`approval`, the hash
 * of the explorable's file and its script libraries, `approvalHashOf`), the data it was given, which
 * holds its theme, its parameters, its language and its size, and the bucket. Two stills share a key
 * exactly when they are drawn from the same inputs, whatever order the data's fields came in.
 */
export function stillKey(approval: string, data: VaData, bucket: StillBucket): string {
  return sha256(`still\n${approval}\n${bucket}\n${canonical(data)}`);
}

/** A value as JSON with every object's keys sorted, so that equal data writes equal text. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    // `undefined` and functions are not data: they are written as JSON leaves them out.
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}
