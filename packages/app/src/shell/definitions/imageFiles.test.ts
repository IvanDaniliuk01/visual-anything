import { BITMAP_CAPS, cleanedImage, decodeBase64, readImageHeader } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { base64Of, png, pngHeader, pngText } from '../../bench/pictures';
import { FILE_LIMITS, nameOfFile, prepareImageFile, type PictureCodec } from './imageFiles';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** A codec that decodes nothing and encodes every picture as a PNG of the size asked. */
function codec(
  encoded: (width: number, height: number) => { format: 'webp' | 'png'; bytes: Uint8Array } = (
    width,
    height,
    // Small enough to store, as a real encoder's compressed output would be.
  ) => ({
    format: 'png',
    bytes: png(Math.ceil(width / 64), Math.ceil(height / 64), () => [10, 20, 30]),
  }),
) {
  const decoded: string[] = [];
  const closed: number[] = [];
  const used: PictureCodec = {
    decode: vi.fn((_file: Blob, width: number, height: number) => {
      decoded.push(`${width}×${height}`);
      return Promise.resolve({ close: () => closed.push(1) });
    }),
    encode: vi.fn((_picture: unknown, width: number, height: number) =>
      Promise.resolve(encoded(width, height)),
    ),
  };
  return { codec: used, decoded, closed };
}

function file(parts: BlobPart[], name: string, type = ''): File {
  return new File(parts, name, { type });
}

describe('preparing an SVG file', () => {
  it('sends what cleaning gives, and says what it removed', async () => {
    const text = `<svg viewBox="0 0 24 24" ${NS}><script>alert(1)</script><a href="https://example.com"><rect width="24" height="24" onclick="steal()"/></a><text>Hi</text></svg>`;
    const prepared = await prepareImageFile(
      file([text], 'Logo.svg', 'image/svg+xml'),
      codec().codec,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.name).toBe('Logo');
    expect('svg' in prepared.content && prepared.content.svg).not.toMatch(
      /script|example\.com|onclick|<text/,
    );
    expect(prepared.removed.join(', ')).toMatch(/script/);
    expect(prepared.removed.join(', ')).toMatch(/text element/);
    expect(prepared.width).toBe(24);
  });

  it('refuses what cleaning refuses, with its reason', async () => {
    const prepared = await prepareImageFile(
      file([`<!DOCTYPE svg><svg viewBox="0 0 1 1" ${NS}/>`], 'bad.svg'),
      codec().codec,
    );
    expect(prepared.ok).toBe(false);
  });
});

describe('preparing a bitmap file', () => {
  it('sends a PNG within the caps as it is, its metadata stripped by the core’s cleaner', async () => {
    const bytes = png(8, 4, () => [200, 100, 50], [pngText('GPS', '41.40338, 2.17403')]);
    const { codec: used, decoded } = codec();
    const prepared = await prepareImageFile(file([bytes], 'photo.png', 'image/png'), used);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || !('data' in prepared.content)) throw new Error('not a bitmap');
    expect(decoded).toEqual([]);
    expect(prepared.content.format).toBe('png');
    expect(prepared.removed).toContain('1 tEXt chunk');
    const sent = decodeBase64(prepared.content.data) as Uint8Array;
    expect(new TextDecoder().decode(sent)).not.toContain('41.40338');
    expect(readImageHeader(sent)).toMatchObject({ width: 8, height: 4 });
  });

  it('refuses a header claiming a huge picture before anything decodes it', async () => {
    const { codec: used, decoded } = codec();
    for (const header of [
      pngHeader(30_000, 30_000),
      pngHeader(16_385, 10),
      pngHeader(9_000, 9_000),
    ]) {
      const prepared = await prepareImageFile(file([header], 'bomb.png', 'image/png'), used);
      expect(prepared.ok).toBe(false);
    }
    expect(decoded).toEqual([]);
  });

  it('refuses a GIF or an AVIF that claims a huge picture, from its header', async () => {
    const gif = Uint8Array.from(
      [...'GIF89a'].map((each) => each.charCodeAt(0)).concat([0x30, 0x75, 0x30, 0x75, 0, 0, 0]),
    );
    const { codec: used, decoded } = codec();
    const prepared = await prepareImageFile(file([gif], 'bomb.gif', 'image/gif'), used);
    expect(prepared.ok).toBe(false);
    // An AVIF file's size is in its `ispe` box.
    const be32 = (value: number) => [
      value >>> 24,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255,
    ];
    const text = (words: string) => [...words].map((each) => each.charCodeAt(0));
    const ispe = [...be32(20), ...text('ispe'), ...be32(0), ...be32(30_000), ...be32(30_000)];
    const avif = Uint8Array.from([
      ...be32(20),
      ...text('ftypavif'),
      ...be32(0),
      ...text('mif1'),
      ...be32(8 + ispe.length),
      ...text('meta'),
      ...ispe,
    ]);
    expect(readImageHeader(avif)).toMatchObject({ format: 'avif', width: 30_000 });
    const refused = await prepareImageFile(file([avif], 'bomb.avif', 'image/avif'), used);
    expect(refused.ok).toBe(false);
    expect(decoded).toEqual([]);
  });

  it('shrinks a larger picture to 1,024 pixels on its long side, and a GIF too, keeping one frame', async () => {
    const { codec: used, decoded, closed } = codec();
    const large = await prepareImageFile(
      file([pngHeader(2_000, 1_000)], 'wide.png', 'image/png'),
      used,
    );
    expect(large.ok).toBe(true);
    expect(decoded).toEqual(['1024×512']);
    expect(closed).toHaveLength(1);
    if (large.ok) expect(large.shrunk).toEqual({ width: 1024, height: 512 });
    const gif = Uint8Array.from(
      [...'GIF89a'].map((each) => each.charCodeAt(0)).concat([20, 0, 10, 0, 0, 0, 0]),
    );
    const small = await prepareImageFile(file([gif], 'small.gif', 'image/gif'), used);
    expect(small.ok).toBe(true);
    expect(decoded.at(-1)).toBe('20×10');
  });

  it('shrinks further while the result is over 192 KiB, to 768 and then 512 pixels', async () => {
    const sizes: number[] = [];
    const { codec: used } = codec((width, height) => {
      sizes.push(Math.max(width, height));
      // Only the smallest fits.
      return width > 512
        ? { format: 'webp', bytes: new Uint8Array(BITMAP_CAPS.bytes + 1) }
        : { format: 'png', bytes: png(4, 2, () => [0, 0, 0]) };
    });
    const prepared = await prepareImageFile(file([pngHeader(4_000, 2_000)], 'big.png'), used);
    expect(sizes).toEqual([1024, 768, 512]);
    expect(prepared.ok).toBe(true);
  });

  it('gives a stored picture that the core accepts as it is', async () => {
    const prepared = await prepareImageFile(
      file([png(3, 3, () => [1, 2, 3])], 'p.png'),
      codec().codec,
    );
    if (!prepared.ok || !('data' in prepared.content)) throw new Error('not prepared');
    const stored = cleanedImage({
      kind: 'bitmap',
      id: 'p.p',
      name: 'p',
      width: prepared.width,
      height: prepared.height,
      ...prepared.content,
    });
    expect(stored && stored.kind === 'bitmap' && stored.data).toBe(prepared.content.data);
  });

  it('refuses files that are not pictures, and files that are far too large to read', async () => {
    expect((await prepareImageFile(file(['hello'], 'note.txt'), codec().codec)).ok).toBe(false);
    const huge = { name: 'huge.png', type: 'image/png', size: FILE_LIMITS.bytes + 1 } as File;
    expect((await prepareImageFile(huge, codec().codec)).ok).toBe(false);
  });

  it('names a picture after its file', () => {
    expect(nameOfFile('My logo.final.svg')).toBe('My logo.final');
    expect(nameOfFile('.svg')).toBe('Picture');
    expect(nameOfFile(`${'x'.repeat(300)}.png`)).toHaveLength(200);
  });

  it('names a picture whose file gives no name in the language read in (ADR 0038)', async () => {
    expect(nameOfFile('.svg', 'Imagen')).toBe('Imagen');
    expect(nameOfFile('Logo.svg', 'Imagen')).toBe('Logo');
    const prepared = await prepareImageFile(
      file([`<svg viewBox="0 0 1 1" ${NS}><path d="M0 0h1v1z"/></svg>`], '.svg', 'image/svg+xml'),
      codec().codec,
      'Imagen',
    );
    expect(prepared.ok && prepared.name).toBe('Imagen');
  });

  it('keeps the bytes it read, as base64 of the cleaned file', () => {
    expect(base64Of(Uint8Array.from([1, 2, 3]))).toBe('AQID');
  });
});
