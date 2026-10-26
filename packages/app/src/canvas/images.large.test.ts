/**
 * Large pictures in the image store (ADR 0067): the picture of a drawing with parts, and a part's own
 * picture, may be made at 1,024 and 2,048 pixels within the GPU budget, and are rasterized once the
 * camera rests even when that takes longer than a frame, but never during motion nor while a theme
 * switch is drawn; every other picture keeps to 512 pixels and to the frame's budget.
 */
import { cleanedImage, type CleanedImage } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_LIMITS,
  ImageStore,
  bucketFor,
  sharpBucketFor,
  type ImageFrame,
  type ImagePlatform,
  type ImageRequest,
} from './images';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

interface FakeTexture {
  width: number;
  height: number;
}

/** A platform whose rasterizations take a time that grows with the pixels: `perPixel` ms each. */
class SlowPlatform implements ImagePlatform<FakeTexture, { width: number; height: number }> {
  time = 0;
  perPixel = 200 / (2048 * 2048);
  readonly rasterized: number[] = [];
  now(): number {
    return this.time;
  }
  bytesOf(base64: string): Uint8Array {
    return new Uint8Array(base64.length);
  }
  decodeBitmap(_bytes: Uint8Array, _type: string, width: number, height: number) {
    return Promise.resolve({ width, height });
  }
  loadSvg(_svg: string, width: number, height: number) {
    return Promise.resolve({ width, height });
  }
  texture(_picture: unknown, width: number, height: number): FakeTexture {
    this.time += width * height * this.perPixel;
    this.rasterized.push(Math.max(width, height));
    return { width, height };
  }
  atlasTexture(_slot: unknown, _picture: unknown, width: number, height: number): FakeTexture {
    this.time += width * height * this.perPixel;
    this.rasterized.push(Math.max(width, height));
    return { width, height };
  }
  flush(): void {}
  destroyTexture(): void {}
  destroyPage(): void {}
  releasePicture(): void {}
}

let made = 0;

function picture(side = 1600): CleanedImage {
  made += 1;
  const image = cleanedImage({
    kind: 'svg',
    id: `test.heart-${made}`,
    name: `Heart ${made}`,
    width: side,
    height: side,
    svg: `<svg viewBox="0 0 ${side} ${side}" ${NS}><path d="M0 0h${made}v1z"/></svg>`,
  });
  if (!image) throw new Error('The picture does not clean.');
  return image;
}

function asked(image: CleanedImage, extra: Partial<ImageRequest> = {}): ImageRequest {
  return {
    image,
    devicePixels: 1600,
    sharp: true,
    silhouette: false,
    distance: 0,
    tile: 'tile',
    ...extra,
  };
}

/** Asks for a picture and runs frames, loading in between, as the canvas does while it shows it. */
async function show<P>(
  store: ImageStore<FakeTexture, P>,
  request: ImageRequest,
  frame: ImageFrame,
  frames = 16,
) {
  for (let at = 0; at < frames; at++) {
    const texture = store.texture(request);
    if (texture) store.use(request.tile, [texture.key]);
    store.frame(frame);
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
  }
  return store.texture(request);
}

describe('the buckets of large pictures', () => {
  it('go up to 2,048 pixels, and those of every other picture to 512', () => {
    expect(bucketFor(1600, true)).toBe(2048);
    expect(bucketFor(900, true)).toBe(1024);
    expect(bucketFor(1600)).toBe(512);
    expect(sharpBucketFor(1600, true)).toBe(2048);
    expect(sharpBucketFor(600, true)).toBe(1024);
    expect(sharpBucketFor(5000, true)).toBe(2048);
    expect(sharpBucketFor(5000)).toBe(512);
  });
});

describe('a large picture', () => {
  it('is rasterized at rest past the frame’s budget, up to 2,048 pixels', async () => {
    const platform = new SlowPlatform();
    const store = new ImageStore(platform);
    const made = await show(store, asked(picture(), { large: true }), { spent: 0, moving: false });
    expect(made).toMatchObject({ bucket: 2048, exact: true });
    // Its 2,048 pixels took longer than a frame keeps to.
    expect(platform.rasterized.at(-1)).toBe(2048);
    expect(200).toBeGreaterThan(IMAGE_LIMITS.slowFirst);
  });

  it('keeps to the frame’s budget while a theme switch is drawn, and every other picture always', async () => {
    const busy = new ImageStore(new SlowPlatform());
    const during = await show(busy, asked(picture(), { large: true }), {
      spent: 0,
      moving: false,
      busy: true,
    });
    expect(during?.bucket).toBeLessThanOrEqual(512);
    const plain = new ImageStore(new SlowPlatform());
    const ordinary = await show(plain, asked(picture()), { spent: 0, moving: false });
    expect(ordinary?.bucket).toBeLessThanOrEqual(512);
  });

  it('is never rasterized larger during motion', async () => {
    const platform = new SlowPlatform();
    const store = new ImageStore(platform);
    await show(store, asked(picture(), { large: true, sharp: false }), {
      spent: 0,
      moving: true,
    });
    expect(platform.rasterized).toEqual([]);
  });

  it('takes a large bucket only while what the canvas uses fits the GPU budget', async () => {
    const platform = new SlowPlatform();
    platform.perPixel = 0;
    const store = new ImageStore(platform);
    const buckets: number[] = [];
    for (let at = 0; at < 4; at++) {
      const made = await show(
        store,
        asked(picture(), { large: true, tile: `tile-${at}` }),
        { spent: 0, moving: false },
        6,
      );
      buckets.push(made?.bucket ?? 0);
    }
    // The first ones take 2,048 pixels; once those in use leave no room, the next take less.
    expect(buckets[0]).toBe(2048);
    expect([...buckets].sort((a, b) => b - a)).toEqual(buckets);
    expect(buckets.at(-1)).toBeLessThan(2048);
    expect(store.gpuBytes).toBeLessThanOrEqual(IMAGE_LIMITS.gpuBudget);
  });
});
