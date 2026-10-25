import { describe, expect, it } from 'vitest';
import { BITMAP_CAPS, readBitmap, readImageHeader, type BitmapFormat } from './bitmap';
import {
  DHT,
  DQT,
  EXIF_GPS,
  JFIF,
  avifHeader,
  bytesOf,
  crc32,
  gifHeader,
  jpeg,
  jpegSegment,
  png,
  pngChunk,
  riffChunk,
  scan,
  sof,
  vp8,
  vp8l,
  vp8x,
  webp,
} from './test/bitmaps';

function cleaned(bytes: Uint8Array, format: BitmapFormat) {
  const result = readBitmap(bytes, format);
  if (!result.ok) throw new Error(`Refused: ${result.problem.message}`);
  return { ...result.value, removed: result.removed };
}

function refusal(bytes: Uint8Array, format: BitmapFormat): string {
  const result = readBitmap(bytes, format);
  if (result.ok) throw new Error('Accepted');
  return result.problem.code;
}

/** Whether text occurs in bytes, read as Latin-1. */
function holds(bytes: Uint8Array, text: string): boolean {
  return String.fromCharCode(...bytes).includes(text);
}

/** The chunks of a PNG file, as type and bytes, with whether each checksum holds. */
function chunksOf(bytes: Uint8Array): { type: string; valid: boolean; bytes: Uint8Array }[] {
  const chunks = [];
  let at = 8;
  while (at < bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at);
    const body = bytes.subarray(at + 4, at + 8 + length);
    const crc = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at + 8 + length);
    chunks.push({
      type: String.fromCharCode(...body.subarray(0, 4)),
      valid: crc32(body) === crc,
      bytes: bytes.subarray(at, at + 12 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

describe('the test files', () => {
  it('have the checksums zlib gives', () => {
    // The checksum every PNG file ends with.
    expect(crc32(bytesOf('IEND')).toString(16)).toBe('ae426082');
  });
});

describe('readBitmap on PNG', () => {
  it('keeps the picture and drops its text, EXIF, time and colour profile', () => {
    const file = png({
      before: [
        pngChunk('iCCP', 'profile\0\0xyz'),
        pngChunk('sRGB', [0]),
        pngChunk('tEXt', 'Author\0Juan'),
        pngChunk('eXIf', 'MM\0*GPSLatitude 48.8584'),
      ],
      after: [
        pngChunk('tIME', [7, 232, 10, 24, 12, 0, 0]),
        pngChunk('iTXt', 'Comment\0\0\0\0hello'),
      ],
    });
    const result = cleaned(file, 'png');
    expect(result).toMatchObject({ width: 4, height: 3 });
    expect(result.removed).toEqual([
      '1 iCCP chunk',
      '1 tEXt chunk',
      '1 eXIf chunk',
      '1 tIME chunk',
      '1 iTXt chunk',
    ]);
    expect(holds(result.bytes, 'GPS')).toBe(false);
    expect(holds(result.bytes, 'Juan')).toBe(false);
    const kept = chunksOf(result.bytes);
    expect(kept.map((chunk) => chunk.type)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IEND']);
    expect(kept.every((chunk) => chunk.valid)).toBe(true);
    // The chunks kept are the input's, byte for byte, so the picture decodes as it did.
    const input = chunksOf(file);
    for (const chunk of kept) {
      expect(input.find((each) => each.type === chunk.type)?.bytes).toEqual(chunk.bytes);
    }
  });

  it('keeps a clean file byte for byte', () => {
    const file = png();
    expect(cleaned(file, 'png')).toEqual({ bytes: file, width: 4, height: 3, removed: [] });
  });

  it('refuses an animated PNG', () => {
    const apng = png({ before: [pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0])] });
    expect(refusal(apng, 'png')).toBe('invalid-image');
  });

  it('refuses a 30000 × 30000 header without decoding the image data', () => {
    // The image data holds 4 × 3 pixels; only the header claims more.
    const bomb = png({ width: 30000, height: 30000, data: { width: 4, height: 3 } });
    const result = readBitmap(bomb, 'png');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.code).toBe('image-too-large');
    expect(result.problem.message).toContain('30000 × 30000');
  });

  it('refuses more than 1,048,576 pixels, and more than 1,024 a side', () => {
    expect(refusal(png({ width: 1025, height: 1, data: { width: 1, height: 1 } }), 'png')).toBe(
      'image-too-large',
    );
    expect(
      readBitmap(png({ width: 1024, height: 1024, data: { width: 1, height: 1 } }), 'png').ok,
    ).toBe(true);
  });

  it('refuses a damaged file: a wrong checksum, no end, no image data, or a header out of place', () => {
    const file = png();
    const damaged = file.slice();
    damaged[30] = (damaged[30] ?? 0) ^ 1;
    expect(refusal(damaged, 'png')).toBe('invalid-image');
    expect(refusal(file.subarray(0, file.length - 12), 'png')).toBe('invalid-image');
    const noData = bytesOf(file.subarray(0, 33), pngChunk('IEND'));
    expect(refusal(noData, 'png')).toBe('invalid-image');
    const headerLate = bytesOf(file.subarray(0, 8), pngChunk('sRGB', [0]), file.subarray(8));
    expect(refusal(headerLate, 'png')).toBe('invalid-image');
  });

  it('drops what follows the end', () => {
    const file = png();
    const result = cleaned(bytesOf(file, 'trailing secrets'), 'png');
    expect(result.bytes).toEqual(file);
    expect(result.removed).toEqual(['16 bytes after the end']);
  });

  it('refuses over 192 KiB once its metadata is dropped', () => {
    const big = png({ after: [pngChunk('IDAT', new Uint8Array(BITMAP_CAPS.bytes))] });
    expect(refusal(big, 'png')).toBe('image-too-large');
    const metadata = png({ after: [pngChunk('zTXt', new Uint8Array(BITMAP_CAPS.bytes))] });
    expect(readBitmap(metadata, 'png').ok).toBe(true);
  });
});

describe('readBitmap on JPEG', () => {
  it('keeps a baseline picture and drops its EXIF with the GPS position, and its comments', () => {
    const file = jpeg({ before: [JFIF, EXIF_GPS, jpegSegment(0xfe, 'shot by Juan')] });
    const result = cleaned(file, 'jpeg');
    expect(result).toMatchObject({ width: 8, height: 8 });
    expect(result.removed).toEqual(['1 EXIF or XMP segment', '1 comment']);
    expect(holds(result.bytes, 'GPS')).toBe(false);
    expect(holds(result.bytes, 'Juan')).toBe(false);
    expect(result.bytes).toEqual(jpeg());
  });

  it('keeps a progressive picture, its scans and their data byte for byte', () => {
    const file = jpeg({ frame: 0xc2, scans: 5, before: [JFIF, EXIF_GPS] });
    const result = cleaned(file, 'jpeg');
    expect(result.bytes).toEqual(jpeg({ frame: 0xc2, scans: 5 }));
  });

  it('refuses a progressive picture of 65 scans, and keeps one of 64', () => {
    expect(refusal(jpeg({ frame: 0xc2, scans: 65 }), 'jpeg')).toBe('image-too-large');
    expect(readBitmap(jpeg({ frame: 0xc2, scans: 64 }), 'jpeg').ok).toBe(true);
  });

  it('refuses a 30000 × 30000 frame, a frame without height, and a cut file', () => {
    expect(refusal(jpeg({ width: 30000, height: 30000 }), 'jpeg')).toBe('image-too-large');
    expect(refusal(jpeg({ height: 0 }), 'jpeg')).toBe('invalid-image');
    expect(refusal(jpeg({ cut: true }), 'jpeg')).toBe('invalid-image');
  });

  it('refuses two frames, or a scan before the frame', () => {
    const twoFrames = bytesOf(
      [0xff, 0xd8],
      DQT,
      sof(0xc0, 8, 8),
      sof(0xc0, 8, 8),
      DHT,
      scan(),
      [0xff, 0xd9],
    );
    expect(refusal(twoFrames, 'jpeg')).toBe('invalid-image');
    const scanFirst = bytesOf([0xff, 0xd8], DQT, scan(), sof(0xc0, 8, 8), [0xff, 0xd9]);
    expect(refusal(scanFirst, 'jpeg')).toBe('invalid-image');
  });
});

describe('readBitmap on WebP', () => {
  it('keeps a lossy and a lossless picture', () => {
    const lossy = webp(vp8(300, 200));
    expect(cleaned(lossy, 'webp')).toEqual({ bytes: lossy, width: 300, height: 200, removed: [] });
    const lossless = webp(vp8l(64, 32));
    expect(cleaned(lossless, 'webp')).toMatchObject({ width: 64, height: 32, removed: [] });
  });

  it('keeps alpha and drops EXIF, XMP and the colour profile of an extended file, fixing its flags and size', () => {
    const file = webp(
      vp8x(0x20 | 0x10 | 0x08 | 0x04, 300, 200),
      riffChunk('ICCP', 'profile'),
      riffChunk('ALPH', [1, 2, 3]),
      vp8(300, 200),
      riffChunk('EXIF', 'MM GPSLatitude 48.8584'),
      riffChunk('XMP ', '<x:xmpmeta>Juan</x:xmpmeta>'),
    );
    const result = cleaned(file, 'webp');
    expect(result.removed).toEqual(['1 ICCP chunk', '1 EXIF chunk', '1 XMP chunk']);
    expect(result.bytes).toEqual(
      webp(vp8x(0x10, 300, 200), riffChunk('ALPH', [1, 2, 3]), vp8(300, 200)),
    );
    expect(holds(result.bytes, 'GPS')).toBe(false);
  });

  it('refuses an animated WebP', () => {
    expect(
      refusal(webp(vp8x(0x02, 10, 10), riffChunk('ANIM', [0, 0, 0, 0, 0, 0]), vp8(10, 10)), 'webp'),
    ).toBe('invalid-image');
    expect(
      refusal(webp(vp8x(0, 10, 10), riffChunk('ANMF', new Uint8Array(16)), vp8(10, 10)), 'webp'),
    ).toBe('invalid-image');
  });

  it('refuses a canvas or a picture over the caps', () => {
    expect(refusal(webp(vp8x(0, 30000, 30000), vp8(10, 10)), 'webp')).toBe('image-too-large');
    expect(refusal(webp(vp8l(2000, 10)), 'webp')).toBe('image-too-large');
  });

  it('refuses a file cut short, or with no picture', () => {
    const file = webp(vp8(10, 10));
    expect(refusal(file.subarray(0, file.length - 4), 'webp')).toBe('invalid-image');
    expect(refusal(webp(riffChunk('EXIF', 'x')), 'webp')).toBe('invalid-image');
  });
});

describe('readBitmap', () => {
  it('refuses a format that does not match its bytes', () => {
    expect(refusal(png(), 'jpeg')).toBe('invalid-image');
    expect(refusal(jpeg(), 'webp')).toBe('invalid-image');
    expect(refusal(bytesOf('<svg/>'), 'png')).toBe('invalid-image');
  });
});

describe('readImageHeader', () => {
  it('reads the type and size of every accepted file before decoding, 30000² ones included', () => {
    expect(
      readImageHeader(png({ width: 30000, height: 30000, data: { width: 1, height: 1 } })),
    ).toEqual({ format: 'png', width: 30000, height: 30000 });
    expect(readImageHeader(jpeg({ width: 640, height: 480 }))).toEqual({
      format: 'jpeg',
      width: 640,
      height: 480,
    });
    expect(readImageHeader(webp(vp8x(0, 30000, 30000), vp8(1, 1)))).toEqual({
      format: 'webp',
      width: 30000,
      height: 30000,
    });
    expect(readImageHeader(gifHeader(30000, 30000))).toEqual({
      format: 'gif',
      width: 30000,
      height: 30000,
    });
    expect(readImageHeader(avifHeader(30000, 30000))).toEqual({
      format: 'avif',
      width: 30000,
      height: 30000,
    });
    expect(readImageHeader(bytesOf('not a picture'))).toBeUndefined();
  });
});
