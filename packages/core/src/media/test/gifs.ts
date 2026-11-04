/**
 * GIF files built byte by byte for the reader's tests: a real LZW encoder, and each block as the
 * format writes it, so that a test can put any block anywhere.
 */

/** Concatenates bytes, arrays of bytes and Latin-1 text. */
export function bytesOf(...parts: (Uint8Array | number[] | string)[]): Uint8Array {
  const arrays = parts.map((part) =>
    typeof part === 'string'
      ? Uint8Array.from([...part].map((each) => each.charCodeAt(0)))
      : Uint8Array.from(part),
  );
  const out = new Uint8Array(arrays.reduce((sum, each) => sum + each.length, 0));
  let at = 0;
  for (const each of arrays) {
    out.set(each, at);
    at += each.length;
  }
  return out;
}

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

/** Data split into sub-blocks of at most 255 bytes, ending with the empty one. */
export function subBlocks(data: Uint8Array | number[], size = 255): number[] {
  const out: number[] = [];
  const all = [...data];
  for (let at = 0; at < all.length; at += size) {
    const piece = all.slice(at, at + size);
    out.push(piece.length, ...piece);
  }
  out.push(0);
  return out;
}

/** Encodes color indices with GIF's LZW, least significant bit first. */
export function lzw(indices: readonly number[], minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  let codeSize = minCodeSize + 1;
  const emit = (code: number) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(buffer & 0xff);
      buffer >>= 8;
      bits -= 8;
    }
  };
  let table = new Map<string, number>();
  let next = end + 1;
  const reset = () => {
    table = new Map();
    for (let each = 0; each < clear; each++) table.set(String(each), each);
    next = end + 1;
    codeSize = minCodeSize + 1;
  };
  reset();
  emit(clear);
  let word = '';
  for (const index of indices) {
    const joined = word === '' ? String(index) : `${word},${index}`;
    if (table.has(joined)) {
      word = joined;
      continue;
    }
    emit(table.get(word) as number);
    if (next < 4096) {
      table.set(joined, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      reset();
    }
    word = String(index);
  }
  if (word !== '') emit(table.get(word) as number);
  emit(end);
  if (bits > 0) out.push(buffer & 0xff);
  return Uint8Array.from(out);
}

export interface GifScreen {
  width: number;
  height: number;
  /** RGB triples; left out for none. */
  palette?: number[][];
  version?: '87a' | '89a';
}

/** The header, logical screen descriptor and global palette. */
export function gifScreen({ width, height, palette, version = '89a' }: GifScreen): Uint8Array {
  const size = palette ? Math.max(0, Math.ceil(Math.log2(palette.length)) - 1) : 0;
  const packed = palette ? 0x80 | 0x70 | size : 0;
  const table: number[] = [];
  if (palette) {
    for (let each = 0; each < 2 << size; each++) table.push(...(palette[each] ?? [0, 0, 0]));
  }
  return bytesOf(`GIF${version}`, u16(width), u16(height), [packed, 0, 0], table);
}

export interface GifFrameOptions {
  left?: number;
  top?: number;
  width: number;
  height: number;
  indices: number[];
  palette?: number[][];
  minCodeSize?: number;
  /** Graphic control: delay in hundredths, disposal, transparent index. */
  delay?: number;
  disposal?: number;
  transparent?: number;
  interlaced?: boolean;
}

/** A graphic control extension. */
export function graphicControl(delay: number, disposal = 0, transparent?: number): Uint8Array {
  const packed = ((disposal & 7) << 2) | (transparent === undefined ? 0 : 1);
  return bytesOf([0x21, 0xf9, 4, packed], u16(delay), [transparent ?? 0, 0]);
}

/** An image: its graphic control if it has a delay, its descriptor, its palette and its data. */
export function gifFrame(options: GifFrameOptions): Uint8Array {
  const { left = 0, top = 0, width, height, indices, palette } = options;
  const minCodeSize = options.minCodeSize ?? 2;
  const control =
    options.delay !== undefined ||
    options.disposal !== undefined ||
    options.transparent !== undefined
      ? graphicControl(options.delay ?? 0, options.disposal ?? 0, options.transparent)
      : new Uint8Array();
  const size = palette ? Math.max(0, Math.ceil(Math.log2(palette.length)) - 1) : 0;
  const packed = (palette ? 0x80 | size : 0) | (options.interlaced ? 0x40 : 0);
  const table: number[] = [];
  if (palette) {
    for (let each = 0; each < 2 << size; each++) table.push(...(palette[each] ?? [0, 0, 0]));
  }
  return bytesOf(
    control,
    [0x2c],
    u16(left),
    u16(top),
    u16(width),
    u16(height),
    [packed],
    table,
    [minCodeSize],
    subBlocks(lzw(indices, minCodeSize)),
  );
}

/** The NETSCAPE2.0 block that says how often it loops: 0 for ever. */
export function loopBlock(times: number): Uint8Array {
  return bytesOf([0x21, 0xff, 11], 'NETSCAPE2.0', [3, 1], u16(times), [0]);
}

/** A comment extension. */
export function comment(text: string): Uint8Array {
  return bytesOf([0x21, 0xfe], subBlocks([...text].map((each) => each.charCodeAt(0))));
}

/** An application extension other than the loop count, such as XMP metadata. */
export function application(identifier: string, data: string): Uint8Array {
  return bytesOf(
    [0x21, 0xff, 11],
    identifier.padEnd(11, ' ').slice(0, 11),
    subBlocks([...data].map((each) => each.charCodeAt(0))),
  );
}

export const TRAILER = Uint8Array.from([0x3b]);

/** A whole GIF of the given frames, red, green, blue and white in its palette. */
export function gif(
  frames: GifFrameOptions[],
  options: { width?: number; height?: number; loop?: number; extra?: Uint8Array[] } = {},
): Uint8Array {
  const width =
    options.width ?? Math.max(...frames.map((frame) => (frame.left ?? 0) + frame.width));
  const height =
    options.height ?? Math.max(...frames.map((frame) => (frame.top ?? 0) + frame.height));
  return bytesOf(
    gifScreen({ width, height, palette: PALETTE }),
    options.loop === undefined ? new Uint8Array() : loopBlock(options.loop),
    ...(options.extra ?? []),
    ...frames.map(gifFrame),
    TRAILER,
  );
}

export const PALETTE = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 255],
];
