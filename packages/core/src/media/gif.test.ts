import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GIF_CAPS, composeGifFrames, decodeGifFrame, parseGif, readGif } from './gif';
import {
  PALETTE,
  TRAILER,
  application,
  bytesOf,
  comment,
  gif,
  gifFrame,
  gifScreen,
  loopBlock,
  lzw,
  subBlocks,
} from './test/gifs';

function cleaned(bytes: Uint8Array) {
  const result = readGif(bytes);
  if (!result.ok) throw new Error(`Refused: ${result.problem.message}`);
  return { ...result.value, removed: result.removed };
}

function refusal(bytes: Uint8Array): string {
  const result = readGif(bytes);
  if (result.ok) throw new Error('Accepted');
  return result.problem.code;
}

function holds(bytes: Uint8Array, text: string): boolean {
  return String.fromCharCode(...bytes).includes(text);
}

const red2x2 = { width: 2, height: 2, indices: [0, 0, 0, 0] };

describe('readGif', () => {
  it('keeps the frames, their delays and how often it loops', () => {
    const bytes = gif(
      [
        { ...red2x2, delay: 10 },
        { width: 2, height: 2, indices: [1, 2, 3, 0], delay: 25, disposal: 2, transparent: 3 },
      ],
      { loop: 0 },
    );
    const { document, bytes: written, removed } = cleaned(bytes);
    expect(removed).toEqual([]);
    expect(document.width).toBe(2);
    expect(document.height).toBe(2);
    expect(document.loop).toBe(0);
    expect(document.frames.map((frame) => frame.delay)).toEqual([10, 25]);
    expect(document.frames[1]).toMatchObject({ disposal: 2, transparent: 3 });
    // What it writes reads back as the same document.
    expect(parseGif(written)).toEqual(document);
  });

  it('drops comments and every application extension but the loop count', () => {
    const bytes = gif([{ ...red2x2, delay: 5 }], {
      loop: 3,
      extra: [comment('Shot at 41.40338, 2.17403'), application('XMP DataXMP', '<x:xmpmeta/>')],
    });
    const { bytes: written, document, removed } = cleaned(bytes);
    expect(holds(written, '41.40338')).toBe(false);
    expect(holds(written, 'xmpmeta')).toBe(false);
    expect(holds(written, 'NETSCAPE2.0')).toBe(true);
    expect(document.loop).toBe(3);
    expect(removed).toEqual(['1 comment', '1 application extension']);
  });

  it('drops plain text extensions and anything after its end', () => {
    const text = bytesOf([0x21, 0x01, 12], new Array(12).fill(0), subBlocks([65, 66]));
    const bytes = bytesOf(
      gifScreen({ width: 2, height: 2, palette: PALETTE }),
      text,
      gifFrame(red2x2),
      TRAILER,
      'trailing secrets',
    );
    const { bytes: written, removed } = cleaned(bytes);
    expect(holds(written, 'secrets')).toBe(false);
    expect(removed).toEqual(['1 plain text extension', '1 trailing data']);
    expect(written.at(-1)).toBe(0x3b);
  });

  it('takes a GIF87a file, and one that ends after its last frame', () => {
    const old = bytesOf(
      gifScreen({ width: 2, height: 2, palette: PALETTE, version: '87a' }),
      gifFrame(red2x2),
      TRAILER,
    );
    expect(cleaned(old).document.frames).toHaveLength(1);
    const cut = bytesOf(gifScreen({ width: 2, height: 2, palette: PALETTE }), gifFrame(red2x2));
    const { bytes: written, removed } = cleaned(cut);
    expect(written.at(-1)).toBe(0x3b);
    expect(removed).toEqual([]);
  });

  it.each([
    ['bytes that are not a GIF', bytesOf('\x89PNG\r\n\x1a\n')],
    [
      'a file without a frame',
      bytesOf(gifScreen({ width: 2, height: 2, palette: PALETTE }), TRAILER),
    ],
    ['a file cut inside a frame', gif([red2x2]).slice(0, -4)],
    [
      'an unknown block',
      bytesOf(gifScreen({ width: 2, height: 2, palette: PALETTE }), [0x99], TRAILER),
    ],
    [
      'a frame without a palette',
      bytesOf(gifScreen({ width: 2, height: 2 }), gifFrame(red2x2), TRAILER),
    ],
    ['a frame of no size', gif([{ width: 0, height: 2, indices: [] }], { width: 2, height: 2 })],
    [
      'a code size out of range',
      bytesOf(
        gifScreen({ width: 2, height: 2, palette: PALETTE }),
        gifFrame(red2x2).fill(12, 10, 11),
        TRAILER,
      ),
    ],
    [
      'data that is not LZW',
      bytesOf(
        gifScreen({ width: 2, height: 2, palette: PALETTE }),
        [0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2],
        subBlocks([0xff, 0xff, 0xff]),
        TRAILER,
      ),
    ],
  ])('refuses %s', (_, bytes) => {
    expect(refusal(bytes)).toBe('invalid-image');
  });

  it('refuses a GIF past its caps on a side, in pixels and in frames', () => {
    expect(refusal(bytesOf(gifScreen({ width: 8193, height: 1, palette: PALETTE }), TRAILER))).toBe(
      'image-too-large',
    );
    expect(
      refusal(bytesOf(gifScreen({ width: 8000, height: 8000, palette: PALETTE }), TRAILER)),
    ).toBe('image-too-large');
    const frame = gifFrame({ width: 1, height: 1, indices: [0] });
    const many = bytesOf(
      gifScreen({ width: 1, height: 1, palette: PALETTE }),
      ...new Array(GIF_CAPS.frames + 1).fill(frame),
      TRAILER,
    );
    expect(refusal(many)).toBe('image-too-large');
    const caps = { ...GIF_CAPS, totalPixels: 8 };
    const result = readGif(gif([red2x2, red2x2]), caps);
    expect(result.ok && 'accepted').toBe('accepted');
    expect(readGif(gif([red2x2, red2x2, red2x2]), caps)).toMatchObject({
      ok: false,
      problem: { code: 'image-too-large' },
    });
  });

  it('never throws on bytes, and what it keeps always reads again', () => {
    const valid = gif(
      [
        { ...red2x2, delay: 4 },
        { width: 1, height: 1, indices: [2], left: 1, top: 1 },
      ],
      { loop: 0 },
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(valid.length - 1), fc.integer({ min: 0, max: 255 })), {
          maxLength: 6,
        }),
        fc.nat(valid.length),
        (changes, cut) => {
          const bytes = valid.slice(0, Math.max(cut, 13));
          for (const [at, value] of changes) if (at < bytes.length) bytes[at] = value;
          const result = readGif(bytes);
          if (result.ok) expect(parseGif(result.value.bytes)).toEqual(result.value.document);
        },
      ),
    );
  });
});

describe('decodeGifFrame', () => {
  it('decodes what the encoder wrote, for any picture', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 2, max: 8 }),
        fc.infiniteStream(fc.nat(255)),
        (width, height, minCodeSize, stream) => {
          const colors = 1 << minCodeSize;
          const indices = [...stream.take(width * height)].map((each) => each % colors);
          const { document } = cleaned(
            bytesOf(
              gifScreen({ width, height, palette: PALETTE }),
              gifFrame({
                width,
                height,
                indices,
                minCodeSize,
                palette: new Array(colors).fill([1, 2, 3]),
              }),
              TRAILER,
            ),
          );
          expect([...decodeGifFrame(document.frames[0]!)]).toEqual(indices);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('decodes more than 4,096 codes, past the clear the table needs', () => {
    const indices = Array.from({ length: 64 * 64 }, (_, each) => (each * 7 + (each >> 5)) % 256);
    const data = lzw(indices, 8);
    const frame = parseGif(
      bytesOf(
        gifScreen({ width: 64, height: 64, palette: new Array(256).fill([0, 0, 0]) }),
        [0x2c, 0, 0, 0, 0, 64, 0, 64, 0, 0, 8],
        subBlocks(data),
        TRAILER,
      ),
    ).frames[0]!;
    expect([...decodeGifFrame(frame)]).toEqual(indices);
  });

  it('puts interlaced rows back in order', () => {
    // Rows in interlaced order: 0, 4 | 2, 6 | 1, 3, 5, 7.
    const rows = [0, 4, 2, 6, 1, 3, 5, 7];
    const indices = rows.flatMap((row) => [row % 4, row % 4]);
    const { document } = cleaned(gif([{ width: 2, height: 8, indices, interlaced: true }]));
    expect([...decodeGifFrame(document.frames[0]!)]).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].flatMap((row) => [row % 4, row % 4]),
    );
  });
});

describe('composeGifFrames', () => {
  it('draws each frame over the last, as its disposal says', () => {
    const { document } = cleaned(
      gif([
        { width: 2, height: 1, indices: [0, 0], delay: 1, disposal: 1 },
        { width: 1, height: 1, left: 1, indices: [2], delay: 1, disposal: 2 },
        { width: 1, height: 1, indices: [3], delay: 1, transparent: 0 },
      ]),
    );
    const frames: number[][] = [];
    for (const rgba of composeGifFrames(document)) frames.push([...rgba]);
    expect(frames[0]).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    expect(frames[1]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    // The second frame's patch is cleared to transparent before the third draws.
    expect(frames[2]).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
  });
});
