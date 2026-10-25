/**
 * Pictures made in code for the benchmark and the tests: PNG files written byte by byte, with their
 * pixels in stored (uncompressed) deflate blocks, and SVG pictures, some of them at the cleaner's caps.
 * Everything is the same every time for the same arguments.
 */

/** The CRC-32 a PNG chunk ends with. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Data in a zlib stream of stored deflate blocks, which every decoder reads. */
export function zlibStored(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const most = 0xffff;
  const blocks = Math.max(1, Math.ceil(data.length / most));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let into = 2;
  for (let block = 0; block < blocks; block++) {
    const from = block * most;
    const to = Math.min(data.length, from + most);
    const length = to - from;
    out.set(
      [
        block === blocks - 1 ? 1 : 0,
        length & 0xff,
        length >> 8,
        ~length & 0xff,
        (~length >> 8) & 0xff,
      ],
      into,
    );
    out.set(data.subarray(from, to), into + 5);
    into += 5 + length;
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  out.set([(b >> 8) & 0xff, b & 0xff, (a >> 8) & 0xff, a & 0xff], into);
  return out;
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** A PNG chunk: its length, type, data and CRC. */
export function pngChunk(
  type: string,
  data: Uint8Array | readonly number[] = [],
): Uint8Array<ArrayBuffer> {
  const body = Uint8Array.from([...[...type].map((each) => each.charCodeAt(0)), ...data]);
  return Uint8Array.from([...uint32(data.length), ...body, ...uint32(crc32(body))]);
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Joins byte arrays. */
export function joined(
  ...parts: readonly (Uint8Array | readonly number[])[]
): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/**
 * A PNG of RGB pixels, each given by `color(x, y)` as [r, g, b]; `extra` chunks go before the pixels,
 * as a tEXt chunk of metadata would.
 */
export function png(
  width: number,
  height: number,
  color: (x: number, y: number) => readonly [number, number, number],
  extra: readonly Uint8Array[] = [],
): Uint8Array<ArrayBuffer> {
  const header = [...uint32(width), ...uint32(height), 8, 2, 0, 0, 0];
  const rows = new Uint8Array(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y++) {
    rows[at++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      rows[at++] = r;
      rows[at++] = g;
      rows[at++] = b;
    }
  }
  return joined(
    SIGNATURE,
    pngChunk('IHDR', header),
    ...extra,
    pngChunk('IDAT', zlibStored(rows)),
    pngChunk('IEND'),
  );
}

/** Only the header of a PNG that claims a size, with no pixels: what a decompression bomb starts with. */
export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return joined(SIGNATURE, pngChunk('IHDR', [...uint32(width), ...uint32(height), 8, 2, 0, 0, 0]));
}

/** A tEXt chunk of PNG metadata. */
export function pngText(keyword: string, text: string): Uint8Array<ArrayBuffer> {
  return pngChunk(
    'tEXt',
    [...`${keyword}\0${text}`].map((each) => each.charCodeAt(0) & 0xff),
  );
}

/** Bytes in base64, as an image's data is stored. */
export function base64Of(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** A small SVG icon of its own: a disc and a shape that differ with `seed`. */
export function svgIcon(seed: number): string {
  const hue = (seed * 47) % 360;
  const sides = 3 + (seed % 5);
  const points = Array.from({ length: sides }, (_, at) => {
    const angle = (at / sides) * Math.PI * 2;
    return `${(12 + Math.cos(angle) * 7).toFixed(2)},${(12 + Math.sin(angle) * 7).toFixed(2)}`;
  }).join(' ');
  return `<svg viewBox="0 0 24 24" ${NS}><circle cx="12" cy="12" r="11" fill="hsl(${hue}, 60%, 45%)"/><polygon points="${points}" fill="#ffffff"/></svg>`;
}

/**
 * SVG pictures that reach the cleaner's caps on what drawing them costs, each in its own way: many
 * elements, many path commands, many gradients, and clip paths and masks.
 */
export function heavySvgIcons(): string[] {
  // Elements: near the weighted cap of 4,000, within 64 KiB of text.
  const cells: string[] = [];
  for (let at = 0; cells.length < 2_700; at++) {
    cells.push(`<path d="M${at % 60} ${Math.floor(at / 60)}h1v1z"/>`);
  }
  const elements = `<svg viewBox="0 0 60 50" ${NS}><g fill="#2563EB">${cells.join('')}</g></svg>`;

  // Path commands: near the cap of 20,000, in one long path that goes round and round.
  const path = `<svg viewBox="0 0 4 4" ${NS}><path d="M1 1${'h2v2h-2v-2'.repeat(4_950)}" stroke="#0F766E" stroke-width="0.2" fill="none"/></svg>`;

  // Gradients: 32 of 16 stops each, each used by a shape.
  const gradients: string[] = [];
  const uses: string[] = [];
  for (let at = 0; at < 32; at++) {
    const stops = Array.from(
      { length: 16 },
      (_, stop) =>
        `<stop offset="${stop / 15}" stop-color="hsl(${(at * 11 + stop * 20) % 360}, 70%, 50%)"/>`,
    ).join('');
    gradients.push(`<linearGradient id="g${at}">${stops}</linearGradient>`);
    uses.push(
      `<rect x="${(at % 8) * 12}" y="${Math.floor(at / 8) * 12}" width="11" height="11" fill="url(#g${at})"/>`,
    );
  }
  const gradient = `<svg viewBox="0 0 96 48" ${NS}><defs>${gradients.join('')}</defs>${uses.join('')}</svg>`;

  // Clip paths and masks: 8 of each, each used by shapes that weigh 64 or 16.
  const defs: string[] = [];
  const clipped: string[] = [];
  for (let at = 0; at < 8; at++) {
    defs.push(`<clipPath id="c${at}"><circle cx="${at * 10 + 5}" cy="5" r="5"/></clipPath>`);
    defs.push(`<mask id="m${at}"><rect width="80" height="${at + 10}" fill="#ffffff"/></mask>`);
    for (let each = 0; each < 6; each++) {
      clipped.push(
        `<rect x="${at * 10}" y="${each * 2}" width="10" height="2" clip-path="url(#c${at})" fill="#7C3AED"/>`,
      );
      clipped.push(
        `<rect x="${at * 10}" y="${20 + each * 2}" width="10" height="2" mask="url(#m${at})" fill="#DB2777"/>`,
      );
    }
  }
  const masked = `<svg viewBox="0 0 80 40" ${NS}><defs>${defs.join('')}</defs>${clipped.join('')}</svg>`;

  return [elements, path, gradient, masked];
}
