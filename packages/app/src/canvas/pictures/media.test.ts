/**
 * Pictures' media files on the canvas (ADR 0098): the size their texture is drawn at, how a GIF plays,
 * and where the bytes come from.
 */
import { parseGif } from '@visual-anything/core';
import type { MediaRef } from '@visual-anything/schema';
import { describe, expect, it, vi } from 'vitest';
import { GifPlayer, mediaFilesOver, pictureBucket, textureSize } from './media';
import { gifOf } from './test-gifs';

const photo: MediaRef = {
  hash: 'a'.repeat(64),
  format: 'jpeg',
  width: 4000,
  height: 3000,
  bytes: 9,
};

describe('pictureBucket', () => {
  it('is no larger than the picture shows on screen, rounded up at rest', () => {
    expect(pictureBucket(300, true, photo)).toBe(512);
    expect(pictureBucket(300, false, photo)).toBe(256);
  });

  it('never passes 2,048 pixels, nor the picture’s own size', () => {
    expect(pictureBucket(10_000, true, photo)).toBe(2048);
    expect(pictureBucket(10_000, true, { ...photo, width: 100, height: 60 })).toBe(128);
  });
});

describe('textureSize', () => {
  it('fits the longer side to the bucket, and keeps the picture’s own size below it', () => {
    expect(textureSize(photo, 512)).toEqual({ width: 512, height: 384 });
    expect(textureSize({ ...photo, width: 100, height: 60 }, 512)).toEqual({
      width: 100,
      height: 60,
    });
  });
});

describe('GifPlayer', () => {
  const three = parseGif(
    gifOf([
      { indices: [0], delay: 10 },
      { indices: [1], delay: 50 },
      { indices: [2], delay: 1 },
    ]),
  );

  it('shows each frame for its delay, a delay under two hundredths for 100 ms', () => {
    const player = new GifPlayer({ ...three, loop: 0 });
    expect(player.first(0)[0]).toBe(255);
    expect(player.due).toBe(100);
    expect(player.advance(99)).toBeUndefined();
    expect(player.advance(100)).toBeDefined();
    expect(player.index).toBe(1);
    expect(player.due).toBe(600);
    player.advance(600);
    expect(player.due).toBe(700);
    // Looping for ever, it starts over.
    player.advance(700);
    expect(player.index).toBe(0);
  });

  it('plays once without a loop count, and as often as its loop count says', () => {
    const once = new GifPlayer(three);
    once.first(0);
    for (const at of [100, 600, 700]) once.advance(at);
    expect(once.done).toBe(true);
    expect(once.index).toBe(2);
    const twice = new GifPlayer({ ...three, loop: 1 });
    twice.first(0);
    for (let step = 0; step < 10; step++) {
      twice.advance(twice.due);
    }
    expect(twice.done).toBe(true);
  });

  it('does not play a GIF of one frame', () => {
    const still = new GifPlayer(parseGif(gifOf([{ indices: [0] }])));
    still.first(0);
    expect(still.animated).toBe(false);
    expect(still.advance(10_000)).toBeUndefined();
  });
});

describe('mediaFilesOver', () => {
  it('asks the program once for each file, and again only some time after a failure', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const get = vi.fn((hash: string) =>
        Promise.resolve(
          hash === 'b'
            ? { ok: true as const, answer: new Uint8Array([1]) }
            : { ok: false as const, problems: [{ code: 'media-file-missing', message: 'Gone.' }] },
        ),
      );
      const files = mediaFilesOver(get, () => now);
      expect(await files('b')).toEqual(new Uint8Array([1]));
      await files('b');
      expect(get).toHaveBeenCalledTimes(1);
      expect(await files('a')).toBeUndefined();
      expect(await files('a')).toBeUndefined();
      expect(get).toHaveBeenCalledTimes(2);
      now = 10_000;
      vi.advanceTimersByTime(10_000);
      await files('a');
      expect(get).toHaveBeenCalledTimes(3);
      // The same connection's getter gives the same files.
      expect(mediaFilesOver(get)).toBe(files);
    } finally {
      vi.useRealTimers();
    }
  });
});
