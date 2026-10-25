/**
 * Bitmap files for tests, built byte by byte: PNG with zlib image data (in stored blocks) and real
 * checksums, and JPEG and WebP with the structure their readers check. Written without Node, which the
 * core's tests do not load.
 */

/** ASCII text as bytes. */
function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 255);
}

let table: number[] | undefined;

/** CRC-32, as zlib computes it: written apart from the core's own, which it checks. */
export function crc32(bytes: Uint8Array): number {
  table ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = ((table[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bytes in the zlib format, as stored blocks. */
export function zlibStored(data: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01];
  for (let at = 0; at < data.length || at === 0; at += 65535) {
    const piece = data.subarray(at, at + 65535);
    const last = at + 65535 >= data.length ? 1 : 0;
    blocks.push(
      last,
      piece.length & 255,
      piece.length >> 8,
      ~piece.length & 255,
      (~piece.length >> 8) & 255,
      ...piece,
    );
    if (data.length === 0) break;
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return Uint8Array.from([...blocks, ...be32(((b << 16) | a) >>> 0)]);
}

export function bytesOf(...parts: (Uint8Array | number[] | string)[]): Uint8Array {
  const arrays = parts.map((part) =>
    typeof part === 'string' ? ascii(part) : Uint8Array.from(part),
  );
  const out = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of arrays) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function le32(value: number): number[] {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function be16(value: number): number[] {
  return [(value >>> 8) & 255, value & 255];
}

// --- PNG -----------------------------------------------------------------------------------------

export function pngChunk(type: string, data: Uint8Array | number[] | string = []): Uint8Array {
  const body = bytesOf(type, data);
  return bytesOf(be32(body.length - 4), body, be32(crc32(body)));
}

/** The raw scanlines of an RGBA picture: a filter byte, then four bytes a pixel. */
export function scanlines(width: number, height: number): Uint8Array {
  const rows = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set([x * 40, y * 40, 200, 255], y * (1 + width * 4) + 1 + x * 4);
    }
  }
  return rows;
}

export interface PngOptions {
  width?: number;
  height?: number;
  /** Chunks after the header and before the image data. */
  before?: Uint8Array[];
  /** Chunks after the image data and before the end. */
  after?: Uint8Array[];
  /** The image data's size, when the header claims another. */
  data?: { width: number; height: number };
}

/** A PNG file of 8-bit RGBA pixels. */
export function png(options: PngOptions = {}): Uint8Array {
  const width = options.width ?? 4;
  const height = options.height ?? 3;
  const data = options.data ?? { width, height };
  const header = bytesOf(be32(width), be32(height), [8, 6, 0, 0, 0]);
  return bytesOf(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk('IHDR', header),
    ...(options.before ?? []),
    pngChunk('IDAT', zlibStored(scanlines(data.width, data.height))),
    ...(options.after ?? []),
    pngChunk('IEND'),
  );
}

// --- JPEG ----------------------------------------------------------------------------------------

export function jpegSegment(marker: number, data: Uint8Array | number[] | string = []): Uint8Array {
  const body = bytesOf(data);
  return bytesOf([0xff, marker], be16(body.length + 2), body);
}

export const JFIF = jpegSegment(0xe0, bytesOf('JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
export const EXIF_GPS = jpegSegment(
  0xe1,
  bytesOf('Exif', [0, 0], 'MM GPSLatitude 48.8584 GPSLongitude 2.2945 Canon EOS'),
);
export const DQT = jpegSegment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
export const DHT = jpegSegment(0xc4, [
  0,
  ...Array.from({ length: 16 }, (_, i) => (i === 0 ? 1 : 0)),
  0,
]);

export function sof(marker: number, width: number, height: number): Uint8Array {
  return jpegSegment(marker, [8, ...be16(height), ...be16(width), 1, 1, 0x11, 0]);
}

/** A scan: its header, then entropy-coded data with stuffing and a restart marker in it. */
export function scan(): Uint8Array {
  return bytesOf(
    jpegSegment(0xda, [1, 1, 0, 0, 63, 0]),
    [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56],
  );
}

export interface JpegOptions {
  width?: number;
  height?: number;
  /** Segments before the frame. */
  before?: Uint8Array[];
  /** The frame marker: 0xC0 for baseline, 0xC2 for progressive. */
  frame?: number;
  scans?: number;
  /** Without its end marker. */
  cut?: boolean;
}

export function jpeg(options: JpegOptions = {}): Uint8Array {
  const scans: Uint8Array[] = [];
  for (let i = 0; i < (options.scans ?? 1); i++) scans.push(DHT, scan());
  return bytesOf(
    [0xff, 0xd8],
    ...(options.before ?? [JFIF]),
    DQT,
    sof(options.frame ?? 0xc0, options.width ?? 8, options.height ?? 8),
    ...scans,
    options.cut ? [] : [0xff, 0xd9],
  );
}

// --- WebP ----------------------------------------------------------------------------------------

export function riffChunk(fourcc: string, data: Uint8Array | number[] | string): Uint8Array {
  const body = bytesOf(data);
  return bytesOf(fourcc, le32(body.length), body, body.length % 2 === 1 ? [0] : []);
}

export function vp8(width: number, height: number): Uint8Array {
  return riffChunk('VP8 ', [
    0x30,
    0x01,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 255,
    (width >> 8) & 0x3f,
    height & 255,
    (height >> 8) & 0x3f,
    1,
    2,
    3,
  ]);
}

export function vp8l(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | (1 << 28);
  return riffChunk('VP8L', [0x2f, ...le32(bits), 7, 7, 7]);
}

export function vp8x(flags: number, width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return riffChunk('VP8X', [
    flags,
    0,
    0,
    0,
    w & 255,
    (w >> 8) & 255,
    (w >> 16) & 255,
    h & 255,
    (h >> 8) & 255,
    (h >> 16) & 255,
  ]);
}

export function webp(...chunks: Uint8Array[]): Uint8Array {
  const body = bytesOf(...chunks);
  return bytesOf('RIFF', le32(body.length + 4), 'WEBP', body);
}

// --- GIF and AVIF ---------------------------------------------------------------------------------

export function gifHeader(width: number, height: number): Uint8Array {
  return bytesOf('GIF89a', [width & 255, width >> 8, height & 255, height >> 8, 0, 0, 0]);
}

export function avifHeader(width: number, height: number): Uint8Array {
  const ftyp = bytesOf(be32(20), 'ftyp', 'avif', be32(0), 'mif1');
  const ispe = bytesOf(be32(20), 'ispe', be32(0), be32(width), be32(height));
  return bytesOf(ftyp, be32(8 + ispe.length), 'meta', ispe);
}
