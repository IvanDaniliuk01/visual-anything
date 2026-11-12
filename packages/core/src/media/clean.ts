/**
 * Media files (ADR 0098): the files beside the project that pictures show, `media/<hash>.<extension>`:
 * images, and from stage 2 videos and their posters.
 * The local program cleans what an app or Claude gives it with the readers here, in a worker, before
 * it writes anything; the same readers check a file when it is served again.
 */
import type { MediaFormat, MediaRef } from '@visual-anything/schema';
import { sha256Bytes } from '../code/hash';
import { readBitmap, type BitmapCaps } from '../images/bitmap';
import { cleanSvg } from '../images/svg';
import { problem, type Problem } from '../problems';
import { GIF_CAPS, readGif } from './gif';
import { VIDEO_CAPS, readVideo, videoFormatOf } from './video';

/**
 * The caps on an image's file (ADR 0098), unlike a package image's: it keeps its size. A video's are
 * `VIDEO_CAPS`.
 */
export const MEDIA_CAPS = {
  /** Bytes in, and cleaned: 32 MiB. */
  bytes: 32 * 1024 * 1024,
  /** Pixels on a side. */
  side: 8_192,
  /** Pixels in all: 40 megapixels. */
  pixels: 40_000_000,
} as const;

/** The caps a picture's bitmap is read within. */
const PICTURE_BITMAP_CAPS: BitmapCaps = {
  bytes: MEDIA_CAPS.bytes,
  side: MEDIA_CAPS.side,
  pixels: MEDIA_CAPS.pixels,
  jpegScans: 64,
};

/** The extension each format's file takes in `media/`. */
export const MEDIA_EXTENSIONS: Readonly<Record<MediaFormat, string>> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
  svg: 'svg',
  mp4: 'mp4',
  webm: 'webm',
};

/** The MIME type each format is served and exported as. */
export const MEDIA_TYPES: Readonly<Record<MediaFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** The most bytes any media file has: a video's 50 MiB. */
export const MEDIA_FILE_BYTES = VIDEO_CAPS.bytes;

/** Whether a media file is a video, MP4 or WebM (ADR 0098, stage 2). */
export function isVideoFormat(format: MediaFormat): format is 'mp4' | 'webm' {
  return format === 'mp4' || format === 'webm';
}

/** The most bytes a media file of a format has: 50 MiB for a video, 32 MiB for an image. */
export function mediaBytesCap(format: MediaFormat): number {
  return isVideoFormat(format) ? VIDEO_CAPS.bytes : MEDIA_CAPS.bytes;
}

/** A picture's file's name in `media/`: `<hash>.<extension>`. */
export function mediaFileName(ref: Pick<MediaRef, 'hash' | 'format'>): string {
  return `${ref.hash}.${MEDIA_EXTENSIONS[ref.format]}`;
}

/** A file name of `media/` read back as its hash and format, or `undefined` for any other name. */
export function mediaFileOf(name: string): { hash: string; format: MediaFormat } | undefined {
  const match = /^([0-9a-f]{64})\.(png|jpg|webp|gif|svg|mp4|webm)$/.exec(name);
  if (match === null) return undefined;
  const extension = match[2] as string;
  const format = (Object.keys(MEDIA_EXTENSIONS) as MediaFormat[]).find(
    (each) => MEDIA_EXTENSIONS[each] === extension,
  ) as MediaFormat;
  return { hash: match[1] as string, format };
}

/** The format a file's first bytes say it is, or `undefined` when it is none the program takes. */
export function mediaFormatOf(bytes: Uint8Array): MediaFormat | undefined {
  const video = videoFormatOf(bytes);
  if (video !== undefined) return video;
  const starts = (prefix: readonly number[]) =>
    bytes.length >= prefix.length && prefix.every((byte, each) => bytes[each] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts([0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12) {
    const kind = String.fromCharCode(...bytes.subarray(8, 12));
    if (kind === 'WEBP') return 'webp';
  }
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'gif';
  // An SVG is text whose first markup, after a byte order mark, spaces, an XML declaration,
  // comments or a doctype, is an element: `cleanSvg` decides whether it is an `svg`.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 1024))
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (head.startsWith('<') && /<svg[\s>/]/.test(head)) return 'svg';
  return undefined;
}

/** What cleaning a file gives: the reference a picture names it by, and the bytes to keep. */
export type MediaCleaning =
  | { ok: true; ref: MediaRef; bytes: Uint8Array; removed: readonly string[] }
  | { ok: false; problem: Problem };

const TAKEN = 'The program takes PNG, JPEG, WebP, GIF or SVG pictures, and MP4 or WebM videos.';

/**
 * Cleans a file for `media/` (ADR 0098): a PNG, JPEG or WebP through the bitmap reader, a GIF
 * through its strict reader, an SVG through `cleanSvg`, an MP4 or a WebM through the video reader,
 * each within its caps. Anything else is refused with what the program takes. Never throws on bytes.
 */
export function cleanMedia(bytes: Uint8Array): MediaCleaning {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    return { ok: false, problem: problem('invalid-image', `The file is empty. ${TAKEN}`) };
  }
  if (videoFormatOf(bytes) !== undefined) {
    const result = readVideo(bytes);
    if (!result.ok) return result;
    const { format, width, height, bytes: kept } = result.value;
    return {
      ok: true,
      ref: { hash: sha256Bytes(kept), format, width, height, bytes: kept.length },
      bytes: kept,
      removed: result.removed,
    };
  }
  if (bytes.length > MEDIA_CAPS.bytes) {
    return {
      ok: false,
      problem: problem(
        'image-too-large',
        `The file is over ${MEDIA_CAPS.bytes / 1024 / 1024} MiB.`,
      ),
    };
  }
  const format = mediaFormatOf(bytes);
  if (format === undefined) {
    return { ok: false, problem: problem('invalid-image', `The file is not a picture. ${TAKEN}`) };
  }
  try {
    return cleanAs(bytes, format);
  } catch {
    // Bytes that send a reader past what it checked are refused as well, never thrown.
    return { ok: false, problem: problem('invalid-image', 'The picture could not be read.') };
  }
}

function cleanAs(bytes: Uint8Array, format: MediaFormat): MediaCleaning {
  let kept: Uint8Array;
  let width: number;
  let height: number;
  let removed: readonly string[];
  if (format === 'gif') {
    const result = readGif(bytes, GIF_CAPS);
    if (!result.ok) return result;
    ({ bytes: kept } = result.value);
    ({ width, height } = result.value.document);
    removed = result.removed;
  } else if (format === 'svg') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    } catch {
      return { ok: false, problem: problem('invalid-image', 'The SVG picture is not UTF-8 text.') };
    }
    const result = cleanSvg(text);
    if (!result.ok) return result;
    kept = new TextEncoder().encode(result.value.svg);
    ({ width, height } = svgSize(result.value.width, result.value.height));
    removed = result.removed;
  } else if (format === 'png' || format === 'jpeg' || format === 'webp') {
    const result = readBitmap(bytes, format, PICTURE_BITMAP_CAPS);
    if (!result.ok) return result;
    ({ bytes: kept, width, height } = result.value);
    removed = result.removed;
  } else {
    // A video is read before, by its own reader.
    return { ok: false, problem: problem('invalid-video', `The file is not a picture. ${TAKEN}`) };
  }
  return {
    ok: true,
    ref: { hash: sha256Bytes(kept), format, width, height, bytes: kept.length },
    bytes: kept,
    removed,
  };
}

/** An SVG's own size: its view box's, rounded, scaled to fit 1 to 8,192 pixels a side. */
function svgSize(width: number, height: number): { width: number; height: number } {
  const side = MEDIA_CAPS.side;
  const scale = Math.min(1, side / Math.max(width, height));
  return {
    width: Math.min(side, Math.max(1, Math.round(width * scale))),
    height: Math.min(side, Math.max(1, Math.round(height * scale))),
  };
}

/**
 * Checks a file of `media/` before it is served (ADR 0098): its bytes hash to its name, and it passes
 * its format's reader again. A file that fails is drawn as a missing one, never as an error.
 */
export function checkMediaFile(
  bytes: Uint8Array,
  hash: string,
  format: MediaFormat,
): { ok: true } | { ok: false; problem: Problem } {
  const notClean = (why: string) => ({
    ok: false as const,
    problem: problem('media-not-clean', `The media file ${hash.slice(0, 12)}… ${why}`),
  });
  if (sha256Bytes(bytes) !== hash) return notClean('is not the file its name says.');
  if (mediaFormatOf(bytes) !== format) return notClean(`is not a ${format.toUpperCase()} file.`);
  const result = cleanMedia(bytes);
  if (!result.ok) return notClean(`no longer passes its reader: ${result.problem.message}`);
  // A file put in `media/` by hand, under its own hash, that the reader takes but would rewrite is
  // not served: only what cleaning writes leaves the program.
  if (result.ref.hash !== hash || !sameBytes(result.bytes, bytes)) {
    return notClean('is not as cleaning writes it.');
  }
  return { ok: true };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
  return true;
}

/** The most a side of a picture takes on the canvas when it is added (ADR 0098). */
export const PICTURE_LARGEST_SIDE = 480;
/** The least a side of a picture takes on the canvas when it is added. */
export const PICTURE_SMALLEST_SIDE = 32;

/**
 * A picture's size on the canvas when it is added (ADR 0098): its own size, scaled down so that
 * neither side exceeds 480 units, and up so that neither is under 32; the larger cap wins when a
 * long strip cannot meet both.
 */
export function pictureSize(own: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const { width, height } = own;
  let scale = Math.min(1, PICTURE_LARGEST_SIDE / Math.max(width, height));
  if (Math.min(width, height) * scale < PICTURE_SMALLEST_SIDE) {
    scale = Math.min(
      PICTURE_LARGEST_SIDE / Math.max(width, height),
      PICTURE_SMALLEST_SIDE / Math.min(width, height),
    );
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return { width: round(width * scale), height: round(height * scale) };
}
