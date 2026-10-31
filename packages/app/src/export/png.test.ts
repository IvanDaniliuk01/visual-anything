// @vitest-environment node
/**
 * The PNG writer of exports' pictures (ADR 0075): its chunks' checksums are zlib's, its data inflates
 * with zlib, and its rows, unfiltered, give back the pixels written, the same bytes each time.
 */
import { crc32 as zlibCrc32, inflateSync } from 'node:zlib';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readBitmap } from '@visual-anything/core';
import { encodePng } from './png';

interface Chunk {
  type: string;
  data: Uint8Array;
  crc: number;
}

function chunksOf(png: Uint8Array): Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    chunks.push({
      type,
      data: png.subarray(at + 8, at + 8 + length),
      crc: view.getUint32(at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** The pixels of a PNG this writer wrote, its rows unfiltered. */
function pixelsOf(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const chunks = chunksOf(png);
  const header = new DataView(chunks[0]!.data.buffer, chunks[0]!.data.byteOffset);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  const raw = inflateSync(
    Buffer.concat(chunks.filter((each) => each.type === 'IDAT').map((each) => each.data)),
  );
  const stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(4);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4]! : 0;
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + paeth(left, up, upLeft)) & 0xff;
    }
  }
  return { width, height, pixels };
}

describe('the PNG writer', () => {
  it('writes a header, the data and the end, each with zlib’s checksum', async () => {
    const png = await encodePng(new Uint8Array(3 * 2 * 4).fill(200), 3, 2);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = chunksOf(png);
    expect(chunks.map((each) => each.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const each of chunks) {
      const typed = new Uint8Array([...new TextEncoder().encode(each.type), ...each.data]);
      expect(each.crc).toBe(zlibCrc32(typed));
    }
    expect([...chunks[0]!.data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  });

  it('gives back the pixels it was given, the same bytes each time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer(),
        async (width, height, seed) => {
          const pixels = new Uint8Array(width * height * 4);
          let state = seed >>> 0;
          for (let at = 0; at < pixels.length; at++) {
            state = (state * 1103515245 + 12345) >>> 0;
            pixels[at] = state >>> 24;
          }
          const png = await encodePng(pixels, width, height);
          const read = pixelsOf(png);
          expect(read.width).toBe(width);
          expect(read.height).toBe(height);
          expect([...read.pixels]).toEqual([...pixels]);
          expect([...(await encodePng(pixels, width, height))]).toEqual([...png]);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('is read by the core’s bitmap reader, as a picture of its size', async () => {
    const png = await encodePng(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);
    const read = readBitmap(png, 'png');
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect({ width: read.value.width, height: read.value.height }).toEqual({
        width: 4,
        height: 4,
      });
      // Nothing to clean: it holds no chunk the reader drops.
      expect(read.removed).toEqual([]);
    }
  });

  it('refuses pixels that do not fill their size', async () => {
    await expect(encodePng(new Uint8Array(5), 1, 1)).rejects.toThrow(RangeError);
  });
});
