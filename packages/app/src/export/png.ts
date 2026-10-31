/**
 * A PNG writer for the pictures exports hold (ADR 0075): a solid's picture, drawn by the solid worker
 * and shaded with its parts' states, is written into an SVG or a page as a PNG. Pure TypeScript with
 * the platform's `CompressionStream`, so that it runs alike in the browser and in Node, with no canvas.
 *
 * It writes 8-bit RGBA, not interlaced, each row filtered by Paeth's predictor, and nothing else: no
 * text, no time, no color profile, so that the same pixels always give the same bytes.
 */

/** The eight bytes every PNG starts with. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | undefined;

/** The running CRC-32 of some bytes, not yet inverted: a chunk stores its complement. */
export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = crc;
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let at = 0; at < 4; at++) out[4 + at] = type.charCodeAt(at);
  out.set(data, 8);
  // The CRC covers the type and the data, and is stored inverted.
  view.setUint32(8 + data.length, ~crc32(out.subarray(4, 8 + data.length)) >>> 0);
  return out;
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
}

/** The rows of RGBA pixels, each led by its filter's byte, filtered by Paeth's predictor. */
export function filteredRows(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const at = y * (stride + 1);
    out[at] = 4;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? (pixels[row + x - 4] as number) : 0;
      const up = y > 0 ? (pixels[row - stride + x] as number) : 0;
      const upLeft = x >= 4 && y > 0 ? (pixels[row - stride + x - 4] as number) : 0;
      out[at + 1 + x] = ((pixels[row + x] as number) - paeth(left, up, upLeft)) & 0xff;
    }
  }
  return out;
}

/** Bytes compressed in zlib's format, by the platform's stream. */
async function deflated(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new CompressionStream('deflate') as unknown as TransformStream<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pieces.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const piece of pieces) {
    out.set(piece, at);
    at += piece.length;
  }
  return out;
}

/**
 * The PNG of RGBA pixels, not premultiplied, row by row from the top left. Throws a `RangeError` for a
 * size that the pixels do not fill.
 */
export async function encodePng(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  ) {
    throw new RangeError(`${pixels.length} bytes are not the pixels of ${width} × ${height}.`);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  // 8 bits a channel, RGBA, deflate, filtered by rows, not interlaced.
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', await deflated(filteredRows(pixels, width, height))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
