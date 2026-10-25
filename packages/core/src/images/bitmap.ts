/**
 * Reading bitmaps without decoding them. A PNG, JPEG or WebP file's type and size are read from its
 * header and checked against the caps before anything decodes it, which stops decompression bombs, and
 * the file is rebuilt from an allow-list of its parts, which drops its metadata: text, EXIF with its GPS
 * position and camera data, colour profiles and times. Projects are shared through git, so this matters.
 */
import { Removals, cleaning, invalid, tooLarge, type Cleaned } from './result';

/** The formats a package keeps bitmaps in. */
export type BitmapFormat = 'png' | 'jpeg' | 'webp';

/** The caps on a stored bitmap. */
export const BITMAP_CAPS = {
  /** Bytes, once its metadata is dropped: 256 KiB of base64. */
  bytes: 192 * 1024,
  /** Pixels a side. */
  side: 1024,
  /** Pixels in all. */
  pixels: 1_048_576,
  /** Scans of a progressive JPEG: decoding cost grows with scans times pixels. */
  jpegScans: 64,
} as const;

/** What a bitmap cleaned keeps: its bytes without metadata, and its size from its header. */
export interface CleanedBitmap {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** A picture file's type and size, as its header gives them. */
export interface ImageHeader {
  format: BitmapFormat | 'gif' | 'avif';
  width: number;
  height: number;
}

/**
 * Checks a bitmap from its header before anything decodes it, and rebuilds it without metadata. Its
 * type is read from its first bytes and must be `format`.
 */
export function readBitmap(bytes: Uint8Array, format: BitmapFormat): Cleaned<CleanedBitmap> {
  return cleaning((removals) => {
    if (!(bytes instanceof Uint8Array)) invalid('A bitmap is bytes.');
    const actual = formatOf(bytes);
    if (actual === undefined) invalid('The bytes are not a PNG, JPEG or WebP picture.');
    if (actual !== format) {
      invalid(`The picture is a ${actual.toUpperCase()} file, not a ${format.toUpperCase()} file.`);
    }
    const cleaned =
      format === 'png'
        ? cleanPng(bytes, removals)
        : format === 'jpeg'
          ? cleanJpeg(bytes, removals)
          : cleanWebp(bytes, removals);
    if (cleaned.bytes.length > BITMAP_CAPS.bytes) {
      tooLarge(`The picture is over ${BITMAP_CAPS.bytes / 1024} KiB.`);
    }
    return cleaned;
  });
}

/**
 * The type and size a picture file's header gives, without decoding it; `undefined` when the bytes
 * are not a PNG, JPEG, WebP, GIF or AVIF file whose size can be read.
 */
export function readImageHeader(bytes: Uint8Array): ImageHeader | undefined {
  try {
    const format = formatOf(bytes);
    if (format === 'png') return { format, ...pngSize(bytes) };
    if (format === 'jpeg') return { format, ...jpegSize(bytes) };
    if (format === 'webp') return { format, ...webpSize(bytes) };
    if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) {
      if (bytes.length < 10) return undefined;
      return { format: 'gif', width: uint16le(bytes, 6), height: uint16le(bytes, 8) };
    }
    return avifSize(bytes);
  } catch {
    return undefined;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF87 = [...'GIF87a'].map((each) => each.charCodeAt(0));
const GIF89 = [...'GIF89a'].map((each) => each.charCodeAt(0));

function formatOf(bytes: Uint8Array): BitmapFormat | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (bytes.length >= 12 && fourcc(bytes, 0) === 'RIFF' && fourcc(bytes, 8) === 'WEBP')
    return 'webp';
  return undefined;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((byte, i) => bytes[i] === byte);
}

/** Checks a size against the caps. */
function checkSize(width: number, height: number): { width: number; height: number } {
  if (!(width >= 1 && height >= 1)) invalid('The picture has no size.');
  if (
    width > BITMAP_CAPS.side ||
    height > BITMAP_CAPS.side ||
    width * height > BITMAP_CAPS.pixels
  ) {
    tooLarge(
      `The picture is ${width} × ${height} pixels; at most ${BITMAP_CAPS.side} a side and ${BITMAP_CAPS.pixels} in all are kept.`,
    );
  }
  return { width, height };
}

// --- PNG -----------------------------------------------------------------------------------------

const PNG_KEPT = new Set(['IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'pHYs', 'IDAT', 'IEND']);

interface PngChunk {
  type: string;
  start: number;
  /** Where the chunk ends, its CRC included. */
  end: number;
}

function pngChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let at = 8;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) invalid('The PNG picture is cut short.');
    const length = uint32be(bytes, at);
    const type = fourcc(bytes, at + 4);
    if (!/^[A-Za-z]{4}$/.test(type)) invalid('The PNG picture is damaged.');
    const end = at + 12 + length;
    if (length > 0x7fffffff || end > bytes.length) invalid('The PNG picture is cut short.');
    chunks.push({ type, start: at, end });
    at = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || fourcc(bytes, 12) !== 'IHDR') invalid('The PNG picture has no header.');
  return { width: uint32be(bytes, 16), height: uint32be(bytes, 20) };
}

function cleanPng(bytes: Uint8Array, removals: Removals): CleanedBitmap {
  const chunks = pngChunks(bytes);
  if (chunks[0]?.type !== 'IHDR' || chunks[0].end - chunks[0].start !== 25) {
    invalid('The PNG picture does not start with its header.');
  }
  const header = pngSize(bytes);
  const size = checkSize(header.width, header.height);
  if (chunks.at(-1)?.type !== 'IEND') invalid('The PNG picture is cut short: it has no end.');
  if (chunks.some((chunk) => chunk.type === 'acTL')) {
    invalid('The PNG picture is animated; keep its first frame as a picture of its own.');
  }
  if (!chunks.some((chunk) => chunk.type === 'IDAT')) invalid('The PNG picture has no image data.');
  const kept: Uint8Array[] = [Uint8Array.from(PNG_SIGNATURE)];
  for (const chunk of chunks) {
    if (crc32(bytes, chunk.start + 4, chunk.end - 4) !== uint32be(bytes, chunk.end - 4)) {
      invalid(`The PNG picture is damaged: its ${chunk.type} chunk does not match its checksum.`);
    }
    // Chunks are copied whole, so their checksums stay valid.
    if (PNG_KEPT.has(chunk.type)) kept.push(bytes.subarray(chunk.start, chunk.end));
    else removals.add(`${chunk.type} chunk`);
  }
  if (chunks.at(-1)?.end !== bytes.length)
    removals.add(
      'byte after the end',
      'bytes after the end',
      bytes.length - (chunks.at(-1)?.end ?? 0),
    );
  return { bytes: concat(kept), ...size };
}

let crcTable: Uint32Array | undefined;

/** The CRC-32 of bytes, as PNG computes it over a chunk's type and data. */
export function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = (crcTable[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- JPEG ----------------------------------------------------------------------------------------

/** Frame markers: SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC). */
function isFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Segments kept: APP0, APP14, DQT, the frame, DHT, DAC and DRI; SOS and EOI are handled apart. */
function isKeptSegment(marker: number): boolean {
  return (
    marker === 0xe0 ||
    marker === 0xee ||
    marker === 0xdb ||
    marker === 0xc4 ||
    marker === 0xcc ||
    marker === 0xdd ||
    isFrame(marker)
  );
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) invalid('The JPEG picture is damaged.');
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = uint16be(bytes, at + 2);
    if (isFrame(marker)) {
      if (at + 9 > bytes.length) break;
      return { width: uint16be(bytes, at + 7), height: uint16be(bytes, at + 5) };
    }
    if (marker === 0xda || marker === 0xd9) break;
    at += 2 + length;
  }
  invalid('The JPEG picture has no frame header.');
}

function cleanJpeg(bytes: Uint8Array, removals: Removals): CleanedBitmap {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  let size: { width: number; height: number } | undefined;
  let scans = 0;
  let ended = false;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) invalid('The JPEG picture is damaged.');
    // Any number of 0xFF bytes may pad the space before a marker.
    while (bytes[at + 1] === 0xff) at += 1;
    const marker = bytes[at + 1];
    if (marker === undefined) invalid('The JPEG picture is cut short.');
    if (marker === 0xd9) {
      kept.push(bytes.subarray(at, at + 2));
      at += 2;
      ended = true;
      break;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x00) {
      invalid('The JPEG picture is damaged.');
    }
    if (marker === 0x01) {
      at += 2;
      continue;
    }
    if (at + 4 > bytes.length) invalid('The JPEG picture is cut short.');
    const length = uint16be(bytes, at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) invalid('The JPEG picture is cut short.');
    if (isFrame(marker)) {
      if (size) invalid('The JPEG picture has two frame headers.');
      if (length < 8) invalid('The JPEG picture is damaged.');
      size = checkSize(uint16be(bytes, at + 7), uint16be(bytes, at + 5));
    }
    if (marker === 0xda) {
      if (!size) invalid('The JPEG picture has a scan before its frame header.');
      scans += 1;
      if (scans > BITMAP_CAPS.jpegScans) {
        tooLarge(`The JPEG picture has over ${BITMAP_CAPS.jpegScans} scans.`);
      }
      const dataEnd = scanEnd(bytes, end);
      kept.push(bytes.subarray(at, dataEnd));
      at = dataEnd;
      continue;
    }
    if (isKeptSegment(marker)) kept.push(bytes.subarray(at, end));
    else removals.add(jpegSegmentName(marker));
    at = end;
  }
  if (!ended) invalid('The JPEG picture is cut short: it has no end.');
  if (!size) invalid('The JPEG picture has no frame header.');
  if (scans === 0) invalid('The JPEG picture has no image data.');
  if (at < bytes.length)
    removals.add('byte after the end', 'bytes after the end', bytes.length - at);
  return { bytes: concat(kept), ...size };
}

/** Where a scan's entropy-coded data ends: at the first marker that is not a restart or stuffing. */
function scanEnd(bytes: Uint8Array, from: number): number {
  let at = from;
  for (;;) {
    at = bytes.indexOf(0xff, at);
    if (at === -1 || at + 1 >= bytes.length) invalid('The JPEG picture is cut short.');
    const next = bytes[at + 1] ?? 0;
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      at += 2;
      continue;
    }
    if (next === 0xff) {
      at += 1;
      continue;
    }
    return at;
  }
}

function jpegSegmentName(marker: number): string {
  if (marker === 0xe1) return 'EXIF or XMP segment';
  if (marker === 0xe2) return 'colour profile segment';
  if (marker === 0xfe) return 'comment';
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0} segment`;
  return 'other segment';
}

// --- WebP ----------------------------------------------------------------------------------------

interface RiffChunk {
  fourcc: string;
  start: number;
  /** Where its data starts. */
  data: number;
  size: number;
  /** Where it ends, its padding byte included. */
  end: number;
}

function riffChunks(bytes: Uint8Array): RiffChunk[] {
  const declared = uint32le(bytes, 4) + 8;
  if (declared < 12 || declared > bytes.length) invalid('The WebP picture is cut short.');
  const chunks: RiffChunk[] = [];
  let at = 12;
  while (at < declared) {
    if (at + 8 > declared) invalid('The WebP picture is cut short.');
    const size = uint32le(bytes, at + 4);
    const data = at + 8;
    const end = data + size + (size % 2);
    if (data + size > declared) invalid('The WebP picture is cut short.');
    chunks.push({ fourcc: fourcc(bytes, at), start: at, data, size, end: Math.min(end, declared) });
    at = end;
  }
  return chunks;
}

/** The size the image chunk of a WebP file gives. */
function bitstreamSize(bytes: Uint8Array, chunk: RiffChunk): { width: number; height: number } {
  if (chunk.fourcc === 'VP8 ') {
    const d = chunk.data;
    if (
      chunk.size < 10 ||
      bytes[d + 3] !== 0x9d ||
      bytes[d + 4] !== 0x01 ||
      bytes[d + 5] !== 0x2a
    ) {
      invalid('The WebP picture is damaged.');
    }
    return { width: uint16le(bytes, d + 6) & 0x3fff, height: uint16le(bytes, d + 8) & 0x3fff };
  }
  if (chunk.size < 5 || bytes[chunk.data] !== 0x2f) invalid('The WebP picture is damaged.');
  const bits = uint32le(bytes, chunk.data + 1);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

function webpSize(bytes: Uint8Array): { width: number; height: number } {
  const chunks = riffChunks(bytes);
  const extended = chunks.find((chunk) => chunk.fourcc === 'VP8X');
  if (extended) {
    if (extended.size < 10) invalid('The WebP picture is damaged.');
    return {
      width: uint24le(bytes, extended.data + 4) + 1,
      height: uint24le(bytes, extended.data + 7) + 1,
    };
  }
  const image = chunks.find((chunk) => chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L');
  if (!image) invalid('The WebP picture has no image data.');
  return bitstreamSize(bytes, image);
}

const VP8X_ANIMATION = 0x02;
const VP8X_XMP = 0x04;
const VP8X_EXIF = 0x08;
const VP8X_ICC = 0x20;

function cleanWebp(bytes: Uint8Array, removals: Removals): CleanedBitmap {
  const chunks = riffChunks(bytes);
  if (chunks.some((chunk) => chunk.fourcc === 'ANIM' || chunk.fourcc === 'ANMF')) {
    invalid('The WebP picture is animated; keep its first frame as a picture of its own.');
  }
  const images = chunks.filter((chunk) => chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L');
  const [image] = images;
  if (!image || images.length > 1) invalid('The WebP picture must hold exactly one image.');
  const streamSize = bitstreamSize(bytes, image);
  const stream = checkSize(streamSize.width, streamSize.height);
  const extended = chunks.find((chunk) => chunk.fourcc === 'VP8X');
  let size = stream;
  const kept: Uint8Array[] = [];
  for (const chunk of chunks) {
    switch (chunk.fourcc) {
      case 'VP8X': {
        if (chunk !== chunks[0] || chunk.size < 10) invalid('The WebP picture is damaged.');
        const flags = bytes[chunk.data] ?? 0;
        if (flags & VP8X_ANIMATION) {
          invalid('The WebP picture is animated; keep its first frame as a picture of its own.');
        }
        size = checkSize(uint24le(bytes, chunk.data + 4) + 1, uint24le(bytes, chunk.data + 7) + 1);
        const copy = bytes.slice(chunk.start, chunk.data + 10);
        copy.set(le32(10), 4);
        // The flags say only what is still there.
        copy[8] = flags & ~(VP8X_XMP | VP8X_EXIF | VP8X_ICC);
        kept.push(copy);
        break;
      }
      case 'ALPH':
        if (!extended) {
          removals.add(`${chunk.fourcc.trim()} chunk`);
          break;
        }
        kept.push(bytes.subarray(chunk.start, chunk.end));
        break;
      case 'VP8 ':
      case 'VP8L':
        kept.push(bytes.subarray(chunk.start, chunk.end));
        if (chunk.end - chunk.start !== 8 + chunk.size + (chunk.size % 2)) {
          // A last chunk whose padding byte is missing gets one.
          kept.push(new Uint8Array(1));
        }
        break;
      default:
        removals.add(`${chunk.fourcc.trim()} chunk`);
    }
  }
  const declared = uint32le(bytes, 4) + 8;
  if (declared < bytes.length) {
    removals.add('byte after the end', 'bytes after the end', bytes.length - declared);
  }
  const body = concat(kept);
  const riff = new Uint8Array(12 + body.length);
  riff.set([0x52, 0x49, 0x46, 0x46], 0);
  riff.set(le32(4 + body.length), 4);
  riff.set([0x57, 0x45, 0x42, 0x50], 8);
  riff.set(body, 12);
  return { bytes: riff, ...size };
}

// --- AVIF ----------------------------------------------------------------------------------------

/** An AVIF file's size, from the largest of its `ispe` boxes. */
function avifSize(bytes: Uint8Array): ImageHeader | undefined {
  if (bytes.length < 12 || fourcc(bytes, 4) !== 'ftyp') return undefined;
  const ftypEnd = Math.min(uint32be(bytes, 0), bytes.length);
  let avif = false;
  for (let at = 8; at + 4 <= ftypEnd; at += 4) {
    const brand = fourcc(bytes, at);
    if (brand === 'avif' || brand === 'avis') avif = true;
  }
  if (!avif) return undefined;
  let width = 0;
  let height = 0;
  for (
    let at = bytes.indexOf(0x69, 8);
    at !== -1 && at + 16 <= bytes.length;
    at = bytes.indexOf(0x69, at + 1)
  ) {
    if (fourcc(bytes, at) !== 'ispe') continue;
    width = Math.max(width, uint32be(bytes, at + 8));
    height = Math.max(height, uint32be(bytes, at + 12));
  }
  return width > 0 && height > 0 ? { format: 'avif', width, height } : undefined;
}

// --- Bytes ---------------------------------------------------------------------------------------

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  );
}

function uint16be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function uint16le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function uint24le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
}

function uint32be(bytes: Uint8Array, at: number): number {
  return (
    (((bytes[at] ?? 0) << 24) |
      ((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0)) >>>
    0
  );
}

function uint32le(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) |
      ((bytes[at + 1] ?? 0) << 8) |
      ((bytes[at + 2] ?? 0) << 16) |
      ((bytes[at + 3] ?? 0) << 24)) >>>
    0
  );
}

function le32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255,
  );
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
