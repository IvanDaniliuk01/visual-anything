import { describe, expect, it } from 'vitest';
import { sha256Bytes } from '../code/hash';
import { EXIF_GPS, JFIF, jpeg, png, pngChunk } from '../images/test/bitmaps';
import {
  MEDIA_CAPS,
  checkMediaFile,
  cleanMedia,
  mediaFileName,
  mediaFormatOf,
  pictureSize,
} from './clean';
import { comment, gif } from './test/gifs';

const encode = (text: string) => new TextEncoder().encode(text);

function kept(bytes: Uint8Array) {
  const result = cleanMedia(bytes);
  if (!result.ok) throw new Error(`Refused: ${result.problem.message}`);
  return result;
}

describe('cleanMedia', () => {
  it('cleans a PNG, keeping its size, and names it by its hash', () => {
    const bytes = png({ width: 3, height: 2, before: [pngChunk('tEXt', 'Author\0Somebody')] });
    const result = kept(bytes);
    expect(result.ref).toEqual({
      hash: sha256Bytes(result.bytes),
      format: 'png',
      width: 3,
      height: 2,
      bytes: result.bytes.length,
    });
    expect(result.removed.length).toBeGreaterThan(0);
    expect(mediaFileName(result.ref)).toBe(`${result.ref.hash}.png`);
  });

  it('drops a JPEG’s EXIF and names its file .jpg', () => {
    const result = kept(jpeg({ width: 4, height: 4, before: [JFIF, EXIF_GPS] }));
    expect(result.ref.format).toBe('jpeg');
    expect(mediaFileName(result.ref).endsWith('.jpg')).toBe(true);
    expect(String.fromCharCode(...result.bytes).includes('GPS')).toBe(false);
  });

  it('cleans a GIF, dropping its comments', () => {
    const result = kept(
      gif([{ width: 2, height: 1, indices: [0, 1] }], { extra: [comment('hi')] }),
    );
    expect(result.ref).toMatchObject({ format: 'gif', width: 2, height: 1 });
    expect(result.removed).toEqual(['1 comment']);
  });

  it('cleans an SVG, its size its view box’s, rounded', () => {
    const result = kept(
      encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100.4 50.6"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      ),
    );
    expect(result.ref).toMatchObject({ format: 'svg', width: 100, height: 51 });
    expect(new TextDecoder().decode(result.bytes)).not.toContain('script');
  });

  it('refuses anything else, saying what it takes', () => {
    const result = cleanMedia(encode('%PDF-1.7'));
    expect(result).toMatchObject({ ok: false, problem: { code: 'invalid-image' } });
    if (!result.ok) expect(result.problem.message).toMatch(/PNG, JPEG, WebP, GIF or SVG/);
  });

  it('refuses a file past 32 MiB before reading it', () => {
    const big = new Uint8Array(MEDIA_CAPS.bytes + 1);
    big.set(png({ width: 1, height: 1 }));
    expect(cleanMedia(big)).toMatchObject({ ok: false, problem: { code: 'image-too-large' } });
  });

  it('keeps a picture past the 192 KiB of a package image, within its own caps', () => {
    const result = kept(png({ width: 4000, height: 3000, data: { width: 1, height: 1 } }));
    expect(result.ref).toMatchObject({ width: 4000, height: 3000 });
    expect(
      cleanMedia(png({ width: 9000, height: 10, data: { width: 1, height: 1 } })),
    ).toMatchObject({
      ok: false,
      problem: { code: 'image-too-large' },
    });
  });
});

describe('mediaFormatOf', () => {
  it('tells each format from its first bytes', () => {
    expect(mediaFormatOf(png({ width: 1, height: 1 }))).toBe('png');
    expect(mediaFormatOf(gif([{ width: 1, height: 1, indices: [0] }]))).toBe('gif');
    expect(mediaFormatOf(encode('﻿  <?xml version="1.0"?><svg/>'))).toBe('svg');
    expect(mediaFormatOf(encode('hello'))).toBeUndefined();
  });
});

describe('checkMediaFile', () => {
  it('passes a file cleaning wrote, under its own name, and nothing else', () => {
    const { ref, bytes } = kept(png({ width: 2, height: 2 }));
    expect(checkMediaFile(bytes, ref.hash, 'png')).toEqual({ ok: true });
    expect(checkMediaFile(bytes, 'f'.repeat(64), 'png')).toMatchObject({
      ok: false,
      problem: { code: 'media-not-clean' },
    });
    expect(checkMediaFile(bytes, ref.hash, 'gif')).toMatchObject({
      ok: false,
      problem: { code: 'media-not-clean' },
    });
  });
});

describe('pictureSize', () => {
  it('scales its own size down so neither side exceeds 480, and up so neither is under 32', () => {
    expect(pictureSize({ width: 1600, height: 1200 })).toEqual({ width: 480, height: 360 });
    expect(pictureSize({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
    expect(pictureSize({ width: 16, height: 8 })).toEqual({ width: 64, height: 32 });
    // A strip that cannot meet both keeps the long side within 480.
    expect(pictureSize({ width: 4000, height: 10 })).toEqual({ width: 480, height: 1.2 });
  });
});
