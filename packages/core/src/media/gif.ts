/**
 * A strict reader of GIF files, for pictures (ADR 0098). It walks the file's blocks, checks each
 * against the caps before anything is decoded, keeps the frames, their delays and how often the file
 * loops, and drops comments, plain text and every application extension but the loop count. What it
 * keeps it writes again as a new file, so nothing the reader did not understand reaches `media/`.
 *
 * It also decodes a frame's LZW data into color indices and composes frames as a browser shows them,
 * so that the canvas and the read-only page play a GIF from the same code that checked it.
 */
import { Removals, cleaning, invalid, tooLarge, type Cleaned } from '../images/result';

/** The caps on a GIF picture (ADR 0098). */
export const GIF_CAPS = {
  /** Bytes in and cleaned: 32 MiB. */
  bytes: 32 * 1024 * 1024,
  /** Pixels on a side, of the picture and of each frame. */
  side: 8_192,
  /** Pixels of the picture: 40 megapixels. */
  pixels: 40_000_000,
  frames: 1_000,
  /** Pixels of every frame together: 400 megapixels. */
  totalPixels: 400_000_000,
} as const;

export type GifCaps = { readonly [K in keyof typeof GIF_CAPS]: number };

/** One frame of a GIF: where it draws, how long it shows, and its compressed color indices. */
export interface GifFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  /** How long it shows, in hundredths of a second, as the file says: 0 when it says nothing. */
  delay: number;
  /** What happens to its patch before the next frame draws: 0 or 1 keep it, 2 clears it, 3 restores. */
  disposal: number;
  /** The color index drawn as transparent, if any. */
  transparent?: number;
  interlaced: boolean;
  /** Its own palette, as RGB triples; left out when it uses the picture's. */
  palette?: Uint8Array;
  /** The LZW minimum code size, 2 to 8. */
  minCodeSize: number;
  /** Its LZW data, its sub-blocks joined. */
  data: Uint8Array;
}

/** What a GIF keeps once read. */
export interface GifDocument {
  width: number;
  height: number;
  /** The picture's palette, as RGB triples; left out when every frame has its own. */
  palette?: Uint8Array;
  /** The background color's index, kept as the file says. */
  background: number;
  /** How often it plays again after the first time: 0 for ever; left out to play once. */
  loop?: number;
  frames: GifFrame[];
}

/** What cleaning a GIF gives: the document it keeps and the file written from it. */
export interface CleanedGif {
  document: GifDocument;
  bytes: Uint8Array;
}

/**
 * Reads a GIF strictly, checks it against `caps`, decodes every frame once to check its data, and
 * writes what it keeps as a new file. Never throws on bytes.
 */
export function readGif(bytes: Uint8Array, caps: GifCaps = GIF_CAPS): Cleaned<CleanedGif> {
  return cleaning((removals) => {
    if (!(bytes instanceof Uint8Array)) invalid('A GIF picture is bytes.');
    if (bytes.length > caps.bytes)
      tooLarge(`The GIF file is over ${caps.bytes / 1024 / 1024} MiB.`);
    const document = parse(bytes, caps, removals);
    for (const frame of document.frames) decodeGifFrame(frame);
    const written = writeGif(document);
    if (written.length > caps.bytes) {
      tooLarge(`The cleaned GIF file is over ${caps.bytes / 1024 / 1024} MiB.`);
    }
    return { document, bytes: written };
  });
}

/**
 * Reads a GIF file that cleaning wrote, without decoding its frames: for the canvas, which plays it,
 * and the tests. Throws a refusal on bytes the reader would not keep.
 */
export function parseGif(bytes: Uint8Array, caps: GifCaps = GIF_CAPS): GifDocument {
  return parse(bytes, caps, new Removals());
}

class Reader {
  at = 0;
  constructor(readonly bytes: Uint8Array) {}

  byte(): number {
    if (this.at >= this.bytes.length) invalid('The GIF file ends too soon.');
    return this.bytes[this.at++] as number;
  }

  u16(): number {
    return this.byte() | (this.byte() << 8);
  }

  take(length: number): Uint8Array {
    if (this.at + length > this.bytes.length) invalid('The GIF file ends too soon.');
    const out = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return out;
  }

  /** Data sub-blocks, joined, up to the empty one that ends them. */
  subBlocks(limit: number): Uint8Array {
    const pieces: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const size = this.byte();
      if (size === 0) break;
      const piece = this.take(size);
      total += size;
      if (total > limit) tooLarge('A block of the GIF file is too large.');
      pieces.push(piece);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const piece of pieces) {
      out.set(piece, at);
      at += piece.length;
    }
    return out;
  }

  get done(): boolean {
    return this.at >= this.bytes.length;
  }
}

const SIGNATURES = ['GIF87a', 'GIF89a'];

function parse(bytes: Uint8Array, caps: GifCaps, removals: Removals): GifDocument {
  const reader = new Reader(bytes);
  if (bytes.length < 13) invalid('The bytes are not a GIF picture.');
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (!SIGNATURES.includes(signature)) invalid('The bytes are not a GIF picture.');
  reader.at = 6;
  const width = reader.u16();
  const height = reader.u16();
  const packed = reader.byte();
  const background = reader.byte();
  reader.byte(); // The pixel aspect ratio, which no browser honors, is dropped.
  if (width < 1 || height < 1) invalid('The GIF picture has no size.');
  if (width > caps.side || height > caps.side || width * height > caps.pixels) {
    tooLarge(
      `The picture is ${width} × ${height} pixels; at most ${caps.side} a side and ${caps.pixels} in all are kept.`,
    );
  }
  const palette = packed & 0x80 ? reader.take(3 * (2 << (packed & 7))).slice() : undefined;
  const frames: GifFrame[] = [];
  let loop: number | undefined;
  let control: { delay: number; disposal: number; transparent?: number } | undefined;
  let pixels = 0;
  let ended = false;
  while (!reader.done) {
    const introducer = reader.byte();
    if (introducer === 0x3b) {
      ended = true;
      break;
    }
    if (introducer === 0x21) {
      const label = reader.byte();
      if (label === 0xf9) {
        const size = reader.byte();
        if (size !== 4) invalid('A graphic control block of the GIF file is malformed.');
        const flags = reader.byte();
        const delay = reader.u16();
        const index = reader.byte();
        if (reader.byte() !== 0) invalid('A graphic control block of the GIF file is malformed.');
        const disposal = (flags >> 2) & 7;
        control = { delay, disposal: disposal > 3 ? 0 : disposal };
        if (flags & 1) control.transparent = index;
      } else if (label === 0xff) {
        const size = reader.byte();
        const identifier = String.fromCharCode(...reader.take(size));
        const data = reader.subBlocks(64 * 1024);
        if (
          size === 11 &&
          (identifier === 'NETSCAPE2.0' || identifier === 'ANIMEXTS1.0') &&
          data.length === 3 &&
          data[0] === 1
        ) {
          loop = (data[1] as number) | ((data[2] as number) << 8);
        } else {
          removals.add('application extension');
        }
      } else if (label === 0xfe) {
        reader.subBlocks(caps.bytes);
        removals.add('comment');
      } else if (label === 0x01) {
        reader.take(reader.byte());
        reader.subBlocks(caps.bytes);
        removals.add('plain text extension');
        control = undefined;
      } else {
        invalid(`The GIF file holds an extension it should not (0x${label.toString(16)}).`);
      }
      continue;
    }
    if (introducer === 0x2c) {
      const left = reader.u16();
      const top = reader.u16();
      const frameWidth = reader.u16();
      const frameHeight = reader.u16();
      const flags = reader.byte();
      if (frameWidth < 1 || frameHeight < 1) invalid('A frame of the GIF picture has no size.');
      if (frameWidth > caps.side || frameHeight > caps.side) {
        tooLarge(`A frame of the GIF picture is over ${caps.side} pixels on a side.`);
      }
      if (frames.length >= caps.frames) {
        tooLarge(`The GIF picture has over ${caps.frames} frames.`);
      }
      pixels += frameWidth * frameHeight;
      if (pixels > caps.totalPixels) {
        tooLarge(`The GIF picture's frames hold over ${caps.totalPixels} pixels in all.`);
      }
      const framePalette = flags & 0x80 ? reader.take(3 * (2 << (flags & 7))).slice() : undefined;
      if (framePalette === undefined && palette === undefined) {
        invalid('A frame of the GIF picture has no palette.');
      }
      const minCodeSize = reader.byte();
      if (minCodeSize < 2 || minCodeSize > 8) invalid('A frame of the GIF picture is malformed.');
      const data = reader.subBlocks(caps.bytes).slice();
      frames.push({
        left,
        top,
        width: frameWidth,
        height: frameHeight,
        delay: control?.delay ?? 0,
        disposal: control?.disposal ?? 0,
        ...(control?.transparent === undefined ? {} : { transparent: control.transparent }),
        interlaced: (flags & 0x40) !== 0,
        ...(framePalette === undefined ? {} : { palette: framePalette }),
        minCodeSize,
        data,
      });
      control = undefined;
      continue;
    }
    invalid(`The GIF file holds a block it should not (0x${introducer.toString(16)}).`);
  }
  if (ended && !reader.done) removals.add('trailing data', 'trailing data');
  if (frames.length === 0) invalid('The GIF picture has no frame.');
  return {
    width,
    height,
    ...(palette === undefined ? {} : { palette }),
    background,
    ...(loop === undefined ? {} : { loop }),
    frames,
  };
}

/** Writes a GIF document as a GIF89a file, in a stable form. */
export function writeGif(document: GifDocument): Uint8Array {
  const out: number[] = [];
  const push = (...values: number[]) => {
    for (const value of values) out.push(value);
  };
  const u16 = (value: number) => push(value & 0xff, (value >> 8) & 0xff);
  const pushBytes = (bytes: Uint8Array) => {
    for (const byte of bytes) out.push(byte);
  };
  const tableSize = (table: Uint8Array) => Math.log2(table.length / 3) - 1;
  pushBytes(Uint8Array.from([...'GIF89a'].map((each) => each.charCodeAt(0))));
  u16(document.width);
  u16(document.height);
  const palette = document.palette;
  push(palette ? 0x80 | 0x70 | tableSize(palette) : 0x70, document.background, 0);
  if (palette) pushBytes(palette);
  if (document.loop !== undefined) {
    push(0x21, 0xff, 11);
    pushBytes(Uint8Array.from([...'NETSCAPE2.0'].map((each) => each.charCodeAt(0))));
    push(3, 1);
    u16(document.loop);
    push(0);
  }
  for (const frame of document.frames) {
    if (frame.delay !== 0 || frame.disposal !== 0 || frame.transparent !== undefined) {
      push(0x21, 0xf9, 4, (frame.disposal << 2) | (frame.transparent === undefined ? 0 : 1));
      u16(frame.delay);
      push(frame.transparent ?? 0, 0);
    }
    push(0x2c);
    u16(frame.left);
    u16(frame.top);
    u16(frame.width);
    u16(frame.height);
    push((frame.palette ? 0x80 | tableSize(frame.palette) : 0) | (frame.interlaced ? 0x40 : 0));
    if (frame.palette) pushBytes(frame.palette);
    push(frame.minCodeSize);
    for (let at = 0; at < frame.data.length; at += 255) {
      const piece = frame.data.subarray(at, at + 255);
      push(piece.length);
      pushBytes(piece);
    }
    push(0);
  }
  push(0x3b);
  return Uint8Array.from(out);
}

/**
 * A frame's color indices, row by row, its interlacing undone. Data that ends early leaves the rest
 * at index 0, as browsers show it; a code past the table is refused as not a GIF.
 */
export function decodeGifFrame(frame: GifFrame): Uint8Array {
  const total = frame.width * frame.height;
  const out = new Uint8Array(total);
  const { data, minCodeSize } = frame;
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Uint16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  for (let code = 0; code < clear; code++) suffix[code] = code;
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;
  let first = 0;
  let written = 0;
  let buffer = 0;
  let bits = 0;
  let at = 0;
  while (written < total) {
    while (bits < codeSize) {
      if (at >= data.length) return deinterlaced(frame, out);
      buffer |= (data[at++] as number) << bits;
      bits += 8;
    }
    const code = buffer & ((1 << codeSize) - 1);
    buffer >>>= codeSize;
    bits -= codeSize;
    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) break;
    if (previous === -1) {
      if (code >= clear) invalid('A frame of the GIF picture does not decode.');
      out[written++] = code;
      previous = code;
      first = code;
      continue;
    }
    let current = code;
    let depth = 0;
    if (code > next || (code === next && next >= 4096)) {
      invalid('A frame of the GIF picture does not decode.');
    }
    if (code === next) {
      stack[depth++] = first;
      current = previous;
    }
    while (current >= clear) {
      stack[depth++] = suffix[current] as number;
      current = prefix[current] as number;
    }
    stack[depth++] = current;
    first = current;
    while (depth > 0 && written < total) out[written++] = stack[--depth] as number;
    depth = 0;
    if (next < 4096) {
      prefix[next] = previous;
      suffix[next] = first;
      next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    previous = code;
  }
  return deinterlaced(frame, out);
}

function deinterlaced(frame: GifFrame, indices: Uint8Array): Uint8Array {
  if (!frame.interlaced) return indices;
  const { width, height } = frame;
  const out = new Uint8Array(indices.length);
  let row = 0;
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const) {
    for (let y = start; y < height; y += step) {
      out.set(indices.subarray(row * width, row * width + width), y * width);
      row++;
    }
  }
  return out;
}

/**
 * The picture after each frame, as RGBA bytes of its whole size, in order, as a browser shows them:
 * each frame drawn over what the last left, its transparent index showing through, then its disposal
 * applied before the next. The same buffer is given each time, changed, so a caller copies what it
 * keeps.
 */
export function* composeGifFrames(document: GifDocument): Generator<Uint8ClampedArray> {
  const { width, height } = document;
  const canvas = new Uint8ClampedArray(width * height * 4);
  for (const frame of document.frames) {
    const saved = frame.disposal === 3 ? canvas.slice() : undefined;
    const indices = decodeGifFrame(frame);
    const palette = (frame.palette ?? document.palette) as Uint8Array;
    const colors = palette.length / 3;
    for (let y = 0; y < frame.height; y++) {
      const canvasY = frame.top + y;
      if (canvasY >= height) break;
      for (let x = 0; x < frame.width; x++) {
        const canvasX = frame.left + x;
        if (canvasX >= width) break;
        const index = indices[y * frame.width + x] as number;
        if (index === frame.transparent || index >= colors) continue;
        const to = (canvasY * width + canvasX) * 4;
        canvas[to] = palette[index * 3] as number;
        canvas[to + 1] = palette[index * 3 + 1] as number;
        canvas[to + 2] = palette[index * 3 + 2] as number;
        canvas[to + 3] = 255;
      }
    }
    yield canvas;
    if (frame.disposal === 2) {
      for (let y = frame.top; y < Math.min(height, frame.top + frame.height); y++) {
        const from = (y * width + frame.left) * 4;
        const to = (y * width + Math.min(width, frame.left + frame.width)) * 4;
        if (to > from) canvas.fill(0, from, to);
      }
    } else if (saved !== undefined) {
      canvas.set(saved);
    }
  }
}

/** How long a frame shows, in milliseconds, as browsers read it: under 20 ms shows for 100 ms. */
export function gifFrameMilliseconds(frame: GifFrame): number {
  return frame.delay < 2 ? 100 : frame.delay * 10;
}
