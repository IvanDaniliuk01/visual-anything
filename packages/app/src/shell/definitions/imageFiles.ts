/**
 * Turning a file the person chose into an image to send (docs/designs/components.md §5.4, ADR-0027).
 * The core cleans every image again when it stores it; cleaning here as well lets the picker show the
 * picture as it will be stored and say what cleaning removed before anything is sent.
 *
 * - **SVG** is read as text and cleaned by the core's cleaner; its cleaned text is what is sent.
 * - **Bitmaps**: the size each file's header gives is read before anything decodes it, and a file
 *   that claims more than 16,384 pixels a side or 64 megapixels is refused, so a small file claiming a
 *   huge picture never reaches the decoder. A PNG, JPEG or WebP within the caps is sent as it is, its
 *   metadata stripped by the core's cleaner. Larger pictures, GIF, AVIF, and animated pictures, whose
 *   first frame is kept, are decoded at most 1,024 pixels on their long side and encoded as WebP, or
 *   PNG where the browser cannot encode WebP; while the result is over 192 KiB, the long side shrinks
 *   to 768 and then to 512.
 */
import {
  BITMAP_CAPS,
  SVG_CAPS,
  cleanSvg,
  encodeBase64,
  readBitmap,
  readImageHeader,
  type BitmapFormat,
} from '@visual-anything/core';

/** What a picture file may claim before it is refused, and how large a file is read at all. */
export const FILE_LIMITS = {
  /** Pixels a side its header may claim. */
  side: 16_384,
  /** Pixels in all its header may claim. */
  pixels: 64_000_000,
  /** Bytes of a file read at all. */
  bytes: 64 * 1024 * 1024,
  /** The long sides a picture is shrunk to, in turn, until it fits. */
  shrinkTo: [1024, 768, 512],
} as const;

/** The files the picker offers to open. */
export const IMAGE_FILE_TYPES =
  '.svg,.png,.jpg,.jpeg,.webp,.gif,.avif,image/svg+xml,image/png,image/jpeg,image/webp,image/gif,image/avif';

/** Decodes and encodes pictures in the browser; tests give a fake. */
export interface PictureCodec {
  /** Decodes a picture file at a size, off the main thread; only its first frame. */
  decode(file: Blob, width: number, height: number): Promise<{ close(): void }>;
  /** Encodes a decoded picture at a size, as WebP, or as PNG where the browser cannot encode WebP. */
  encode(
    picture: { close(): void },
    width: number,
    height: number,
  ): Promise<{ format: 'webp' | 'png'; bytes: Uint8Array }>;
}

/** An image ready to send: its name and its content as the core stores it, with what cleaning removed. */
export type PreparedImage =
  | {
      ok: true;
      name: string;
      content: { svg: string } | { format: BitmapFormat; data: string };
      width: number;
      height: number;
      /** What cleaning removed, in the core's words, such as "1 script element". */
      removed: readonly string[];
      /** The size it was shrunk to, when it was larger than a stored bitmap may be. */
      shrunk?: { width: number; height: number };
    }
  | { ok: false; message: string };

/**
 * The name a picture takes from its file: the file's name without its extension, at most 200
 * characters; `unnamed` when that leaves nothing, which the picker gives in the language read in, as
 * every name the app gives something new is (ADR 0038).
 */
export function nameOfFile(fileName: string, unnamed = 'Picture'): string {
  const dot = fileName.lastIndexOf('.');
  const name = (dot > 0 ? fileName.slice(0, dot) : dot === 0 ? '' : fileName).trim();
  return name === '' ? unnamed : name.slice(0, 200);
}

/**
 * Prepares a file the person chose or dropped, refusing what cannot be stored, with the reason. A
 * file whose name gives none is named `unnamed`.
 */
export async function prepareImageFile(
  file: File,
  codec: PictureCodec = browserCodec,
  unnamed?: string,
): Promise<PreparedImage> {
  if (file.size > FILE_LIMITS.bytes) {
    return { ok: false, message: 'The file is too large to be a picture the project can hold.' };
  }
  const name = nameOfFile(file.name, unnamed);
  if (isSvgFile(file)) {
    if (file.size > SVG_CAPS.input) {
      return { ok: false, message: 'An SVG picture holds at most 512 KiB of text.' };
    }
    const cleaned = cleanSvg(await file.text());
    if (!cleaned.ok) return { ok: false, message: cleaned.problem.message };
    const { svg, width, height } = cleaned.value;
    return { ok: true, name, content: { svg }, width, height, removed: cleaned.removed };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) {
    return {
      ok: false,
      message:
        'This file is not a picture the app reads: choose an SVG, PNG, JPEG, WebP, GIF or AVIF file.',
    };
  }
  const { width, height } = header;
  if (
    !(width > 0 && height > 0) ||
    width > FILE_LIMITS.side ||
    height > FILE_LIMITS.side ||
    width * height > FILE_LIMITS.pixels
  ) {
    return {
      ok: false,
      message:
        'The picture is too large: it is refused before it is opened, at most 16,384 pixels a side and 64 megapixels.',
    };
  }
  if (header.format === 'png' || header.format === 'jpeg' || header.format === 'webp') {
    const fits =
      width <= BITMAP_CAPS.side &&
      height <= BITMAP_CAPS.side &&
      width * height <= BITMAP_CAPS.pixels;
    if (fits) {
      const cleaned = readBitmap(bytes, header.format);
      if (cleaned.ok) {
        return {
          ok: true,
          name,
          content: { format: header.format, data: encodeBase64(cleaned.value.bytes) },
          width: cleaned.value.width,
          height: cleaned.value.height,
          removed: cleaned.removed,
        };
      }
    }
  }
  return shrunk(file, name, width, height, codec);
}

/** Decodes a picture at a smaller size, and encodes it again, until it fits the caps. */
async function shrunk(
  file: File,
  name: string,
  width: number,
  height: number,
  codec: PictureCodec,
): Promise<PreparedImage> {
  for (const side of FILE_LIMITS.shrinkTo) {
    const scale = Math.min(1, side / Math.max(width, height));
    const size = {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
    let encoded: { format: 'webp' | 'png'; bytes: Uint8Array };
    try {
      const picture = await codec.decode(file, size.width, size.height);
      try {
        encoded = await codec.encode(picture, size.width, size.height);
      } finally {
        picture.close();
      }
    } catch {
      return { ok: false, message: 'The browser could not open this picture.' };
    }
    if (encoded.bytes.length > BITMAP_CAPS.bytes) continue;
    const cleaned = readBitmap(encoded.bytes, encoded.format);
    if (!cleaned.ok) {
      if (cleaned.problem.code === 'image-too-large') continue;
      return { ok: false, message: cleaned.problem.message };
    }
    return {
      ok: true,
      name,
      content: { format: encoded.format, data: encodeBase64(cleaned.value.bytes) },
      width: cleaned.value.width,
      height: cleaned.value.height,
      removed: cleaned.removed,
      shrunk: size,
    };
  }
  return {
    ok: false,
    message:
      'The picture is still over 192 KiB at 512 pixels a side: choose a smaller or simpler one.',
  };
}

function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

/** The browser's codec: `createImageBitmap` to decode, an offscreen canvas to encode. */
export const browserCodec: PictureCodec = {
  decode: (file, width, height) =>
    createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }),
  encode: async (picture, width, height) => {
    const offscreen =
      typeof OffscreenCanvas === 'undefined' ? undefined : new OffscreenCanvas(width, height);
    const element = offscreen
      ? undefined
      : Object.assign(document.createElement('canvas'), { width, height });
    const context = offscreen ? offscreen.getContext('2d') : element?.getContext('2d');
    if (!context) throw new Error('This browser draws no 2D canvas.');
    context.drawImage(picture as ImageBitmap, 0, 0, width, height);
    const blobOf = (type: string, quality?: number): Promise<Blob | null> =>
      offscreen
        ? offscreen.convertToBlob({ type, ...(quality === undefined ? {} : { quality }) })
        : new Promise((resolve) => element?.toBlob(resolve, type, quality));
    let blob = await blobOf('image/webp', 0.85);
    // A browser that cannot encode WebP gives PNG instead.
    if (!blob || blob.type !== 'image/webp') blob = await blobOf('image/png');
    if (!blob) throw new Error('This browser encodes no picture.');
    return {
      format: blob.type === 'image/webp' ? 'webp' : 'png',
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  },
};
