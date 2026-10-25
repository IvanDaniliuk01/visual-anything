import fc from 'fast-check';
import { SVG_ALLOWED, cleanSvg, cleanedImage, type CleanedImage } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import {
  AtlasLayout,
  AtlasPage,
  IMAGE_LIMITS,
  ImageStore,
  bucketFor,
  extrudeEdges,
  imageSerial,
  loadSvgPicture,
  pruneImageSerials,
  sharpBucketFor,
  sizeIn,
  svgAtSize,
  textureKey,
  type ImagePlatform,
  type ImageRequest,
  type Slot,
} from './images';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

interface FakeTexture {
  id: number;
  width: number;
  height: number;
  silhouette: boolean;
  slot?: Slot;
}

interface FakePicture {
  kind: 'svg' | 'bitmap';
  width: number;
  height: number;
}

/** A platform that draws nothing and keeps time by hand: rasterizing an SVG takes `svgCost` ms. */
class FakePlatform implements ImagePlatform<FakeTexture, FakePicture> {
  time = 0;
  svgCost = 1;
  failDecodes = false;
  readonly calls: string[] = [];
  readonly textures = new Set<FakeTexture>();
  readonly pages = new Set<number>();
  #next = 0;

  now(): number {
    return this.time;
  }
  bytesOf(base64: string): Uint8Array {
    return new Uint8Array(base64.length);
  }
  decodeBitmap(
    _bytes: Uint8Array,
    type: string,
    width: number,
    height: number,
  ): Promise<FakePicture> {
    this.calls.push(`decode ${type} ${width}×${height}`);
    return this.failDecodes
      ? Promise.reject(new Error('Not a picture.'))
      : Promise.resolve({ kind: 'bitmap', width, height });
  }
  loadSvg(_svg: string, width: number, height: number): Promise<FakePicture> {
    this.calls.push(`load ${width}×${height}`);
    return Promise.resolve({ kind: 'svg', width, height });
  }
  texture(picture: FakePicture, width: number, height: number, silhouette: boolean): FakeTexture {
    return this.#make(picture, width, height, silhouette);
  }
  atlasTexture(
    slot: Slot,
    picture: FakePicture,
    width: number,
    height: number,
    silhouette: boolean,
  ): FakeTexture {
    this.pages.add(slot.page);
    const texture = this.#make(picture, width, height, silhouette);
    texture.slot = slot;
    return texture;
  }
  flush(): void {}
  destroyTexture(texture: FakeTexture): void {
    for (const each of this.textures) if (each.id === texture.id) this.textures.delete(each);
  }
  destroyPage(page: number): void {
    this.pages.delete(page);
  }
  releasePicture(): void {}

  #make(picture: FakePicture, width: number, height: number, silhouette: boolean): FakeTexture {
    if (picture.kind === 'svg') this.time += this.svgCost;
    const texture = { id: ++this.#next, width, height, silhouette };
    this.textures.add(texture);
    this.calls.push(
      `${picture.kind === 'svg' ? 'rasterize' : 'upload'} ${width}×${height}${silhouette ? ' silhouette' : ''}`,
    );
    return texture;
  }
}

/** Lets the pictures started load: the fake platform's pictures arrive within a few microtasks. */
async function settled(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await Promise.resolve();
}

let made = 0;

/** A cleaned SVG picture of its own content. */
function svg(width = 24, height = 24): CleanedImage {
  made += 1;
  const image = cleanedImage({
    kind: 'svg',
    id: `test.svg-${made}`,
    name: `SVG ${made}`,
    width,
    height,
    svg: `<svg viewBox="0 0 ${width} ${height}" ${NS}><path d="M0 0h${made}v1z"/></svg>`,
  });
  if (!image) throw new Error('The test picture does not clean.');
  return image;
}

/** A bitmap of its own content; the fake platform decodes nothing, so its bytes need not be a picture. */
function bitmap(width = 1024, height = 768): CleanedImage {
  made += 1;
  return {
    kind: 'bitmap',
    id: `test.bitmap-${made}`,
    name: `Bitmap ${made}`,
    format: 'png',
    width,
    height,
    data: `AAAA${made}`,
  } as unknown as CleanedImage;
}

function request(image: CleanedImage, extra: Partial<ImageRequest> = {}): ImageRequest {
  return { image, devicePixels: 32, silhouette: false, distance: 0, tile: 'tile', ...extra };
}

/** Runs frames at rest until nothing more happens, loading in between. */
async function rest(store: ImageStore<FakeTexture, FakePicture>, frames = 6): Promise<void> {
  for (let i = 0; i < frames; i++) {
    store.frame({ spent: 0, moving: false });
    await settled();
  }
}

describe('buckets', () => {
  it('follow the size on screen within 1.5×, and the 16 bucket takes the smallest icons', () => {
    // An 18-unit icon at scale 0.45 on a 1× screen.
    expect(bucketFor(18 * 0.45)).toBe(16);
    expect(bucketFor(1)).toBe(16);
    // Between 16 and 32, the nearest by ratio changes at 22.6.
    expect(bucketFor(22)).toBe(16);
    expect(bucketFor(23)).toBe(32);
    expect(bucketFor(277)).toBe(256);
    expect(bucketFor(5000)).toBe(512);
  });

  it('once the camera rests, are at least the size on screen', () => {
    expect(sharpBucketFor(17)).toBe(32);
    expect(sharpBucketFor(277)).toBe(512);
    expect(sharpBucketFor(5000)).toBe(512);
  });

  it('keep a picture’s proportions', () => {
    expect(sizeIn(64, 1024, 768)).toEqual({ width: 64, height: 48 });
    expect(sizeIn(16, 1, 1000)).toEqual({ width: 1, height: 16 });
  });
});

describe('serials', () => {
  it('are kept by equal content across a reload, and change with the content', () => {
    const stored = {
      kind: 'svg' as const,
      id: 'test.serial',
      name: 'Serial',
      width: 10,
      height: 10,
      svg: `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h7v7z"/></svg>`,
    };
    const first = cleanedImage(stored);
    const reloaded = cleanedImage(JSON.parse(JSON.stringify(stored)) as typeof stored);
    if (!first || !reloaded) throw new Error('The test picture does not clean.');
    expect(reloaded).not.toBe(first);
    expect(imageSerial(reloaded)).toBe(imageSerial(first));
    const changed = cleanedImage({ ...stored, svg: stored.svg.replace('h7', 'h8') });
    if (!changed) throw new Error('The test picture does not clean.');
    expect(imageSerial(changed)).not.toBe(imageSerial(first));
  });

  it('are forgotten for content a project no longer holds', () => {
    const kept = svg();
    const gone = svg();
    const serial = imageSerial(gone);
    pruneImageSerials([kept]);
    const again = { ...gone } as CleanedImage;
    expect(imageSerial(again)).not.toBe(serial);
  });
});

describe('the image store', () => {
  it('makes one texture for each serial, bucket and silhouette', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const picture = bitmap(100, 100);
    for (const tile of ['a', 'b', 'c']) store.texture(request(picture, { tile }));
    store.texture(request(picture, { silhouette: true }));
    store.texture(request(picture, { devicePixels: 200 }));
    await rest(store);
    expect(platform.calls.filter((call) => call.startsWith('upload')).sort()).toEqual([
      'upload 256×256',
      'upload 32×32',
      'upload 32×32 silhouette',
    ]);
    const serial = imageSerial(picture);
    expect(store.texture(request(picture))?.key).toBe(textureKey(serial, 32, false));
    expect(store.texture(request(picture))?.exact).toBe(true);
  });

  it('draws the placeholder until a texture is ready, then rebuilds the tiles that wait, four a frame', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const picture = bitmap(64, 64);
    const tiles = ['t1', 't2', 't3', 't4', 't5', 't6'];
    for (const tile of tiles) expect(store.texture(request(picture, { tile }))).toBeUndefined();
    expect(store.frame({ spent: 0, moving: false })).toEqual([]);
    await settled();
    expect(store.frame({ spent: 0, moving: false })).toEqual(['t1', 't2', 't3', 't4']);
    expect(store.frame({ spent: 0, moving: false })).toEqual(['t5', 't6']);
  });

  it('decodes at most two bitmaps a frame, nearest the middle of the screen first', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const far = bitmap(10, 10);
    const near = bitmap(40, 20);
    const nearer = bitmap(20, 40);
    store.texture(request(far, { distance: 900 }));
    store.texture(request(near, { distance: 100 }));
    store.texture(request(nearer, { distance: 10 }));
    store.frame({ spent: 0, moving: true });
    expect(platform.calls).toEqual(['decode image/png 16×32', 'decode image/png 32×16']);
    await settled();
    store.frame({ spent: 0, moving: true });
    expect(platform.calls.slice(2)).toEqual([
      'upload 16×32',
      'upload 32×16',
      'decode image/png 32×32',
    ]);
  });

  it('does no new image work once the frame has spent 8 ms', () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    store.texture(request(bitmap()));
    store.frame({ spent: IMAGE_LIMITS.workAfter, moving: false });
    expect(platform.calls).toEqual([]);
  });

  it('rasterizes at most one SVG a frame', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const pictures = [svg(), svg(), svg()];
    pictures.forEach((picture, i) =>
      store.texture(request(picture, { distance: i, tile: `t${i}` })),
    );
    for (let frame = 0; frame < 8; frame++) {
      const before = platform.calls.filter((call) => call.startsWith('rasterize')).length;
      store.frame({ spent: 0, moving: false });
      const after = platform.calls.filter((call) => call.startsWith('rasterize')).length;
      expect(after - before).toBeLessThanOrEqual(1);
      await settled();
    }
    expect(platform.calls.filter((call) => call.startsWith('rasterize'))).toHaveLength(3);
  });

  it('never rasterizes an SVG for the first time during motion, and first does so at the 32 bucket', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const picture = svg();
    store.texture(request(picture, { devicePixels: 128 }));
    for (let frame = 0; frame < 4; frame++) {
      store.frame({ spent: 0, moving: true });
      await settled();
    }
    expect(platform.calls).toEqual([]);
    await rest(store);
    expect(platform.calls.filter((call) => call.startsWith('rasterize'))).toEqual([
      'rasterize 32×32',
      'rasterize 128×128',
    ]);
  });

  it('serves the first bucket as a stand-in while the asked one is made', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const picture = svg();
    store.texture(request(picture, { devicePixels: 128 }));
    store.frame({ spent: 0, moving: false });
    await settled();
    store.frame({ spent: 0, moving: false });
    expect(store.texture(request(picture, { devicePixels: 128 }))).toMatchObject({
      bucket: 32,
      exact: false,
    });
  });

  it('during motion, rasterizes an SVG only at a bucket whose cost is known and that fits the frame', async () => {
    const platform = new FakePlatform();
    platform.svgCost = 4;
    const store = new ImageStore(platform);
    const picture = svg();
    store.texture(request(picture, { devicePixels: 64 }));
    await rest(store);
    const rasterized = () => platform.calls.filter((call) => call.startsWith('rasterize')).length;
    expect(rasterized()).toBe(2);
    // Cost known at 64 and below: 16 is rasterized while it fits, 128 is not.
    store.texture(request(picture, { devicePixels: 16, tile: 'small' }));
    store.texture(request(picture, { devicePixels: 128, tile: 'large' }));
    for (let frame = 0; frame < 4; frame++) {
      store.frame({ spent: 7, moving: true });
      await settled();
    }
    expect(rasterized()).toBe(2);
    for (let frame = 0; frame < 4; frame++) {
      store.frame({ spent: 1, moving: true });
      await settled();
    }
    expect(platform.calls.filter((call) => call.startsWith('rasterize'))).toEqual([
      'rasterize 32×32',
      'rasterize 64×64',
      'rasterize 16×16',
    ]);
  });

  it('breaks an SVG for the session when its first rasterization takes over 16 ms', async () => {
    const platform = new FakePlatform();
    platform.svgCost = 17;
    const store = new ImageStore(platform);
    const picture = svg();
    store.texture(request(picture, { devicePixels: 128 }));
    await rest(store);
    expect(store.isBroken(picture)).toBe(true);
    expect(platform.textures.size).toBe(0);
    expect(store.texture(request(picture))).toBeUndefined();
    await rest(store);
    expect(platform.calls.filter((call) => call.startsWith('rasterize'))).toEqual([
      'rasterize 32×32',
    ]);
  });

  it('breaks a bitmap that does not decode', async () => {
    const platform = new FakePlatform();
    platform.failDecodes = true;
    const store = new ImageStore(platform);
    const picture = bitmap();
    store.texture(request(picture));
    await rest(store);
    expect(store.isBroken(picture)).toBe(true);
  });

  it('never evicts textures a tile uses, and evicts unused ones, oldest use first, past 64 MiB', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    // 512 × 384 pixels, mipmapped: about 1 MiB each.
    const pictures = Array.from({ length: 90 }, () => bitmap(1024, 768));
    const used = pictures.slice(0, 40);
    for (const [i, picture] of pictures.entries())
      store.texture(request(picture, { devicePixels: 512, tile: `t${i}` }));
    for (let frame = 0; frame < 60; frame++) {
      platform.time += 16;
      store.frame({ spent: 0, moving: false });
      await settled();
      if (frame === 20) {
        for (const [i, picture] of used.entries()) {
          const texture = store.texture(request(picture, { devicePixels: 512, tile: `t${i}` }));
          if (texture) store.use(`t${i}`, [texture.key]);
        }
      }
    }
    expect(store.gpuBytes).toBeLessThanOrEqual(IMAGE_LIMITS.gpuBudget);
    for (const [i, picture] of used.entries()) {
      expect(
        store.texture(request(picture, { devicePixels: 512, tile: `t${i}` }))?.exact,
        `t${i}`,
      ).toBe(true);
    }
  });

  it('lets a tile out of reach for 3 seconds give its textures up, and forgets pictures panned past', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const picture = bitmap(64, 64);
    store.texture(request(picture, { tile: 'a' }));
    await rest(store);
    const texture = store.texture(request(picture, { tile: 'a' }));
    store.use('a', [texture?.key ?? '']);
    expect(store.settle(new Set())).toEqual([]);
    platform.time += IMAGE_LIMITS.outOfReach - 1;
    expect(store.settle(new Set())).toEqual([]);
    platform.time += 1;
    expect(store.settle(new Set())).toEqual(['a']);

    const passed = bitmap(64, 64);
    store.texture(request(passed, { tile: 'b' }));
    store.settle(new Set());
    platform.time += IMAGE_LIMITS.outOfReach;
    store.settle(new Set());
    await rest(store);
    expect(platform.calls.filter((call) => call.startsWith('decode'))).toHaveLength(1);
  });

  it('keeps small buckets in atlas pages and lets a page go once it holds nothing', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    const icons = [svg(), svg()];
    const photo = bitmap(1024, 768);
    for (const icon of icons) store.texture(request(icon, { devicePixels: 16 }));
    store.texture(request(photo, { devicePixels: 300 }));
    await rest(store, 12);
    expect(platform.pages.size).toBe(1);
    const atlas = [...platform.textures].filter((texture) => texture.slot);
    expect(atlas.length).toBeGreaterThan(0);
    expect([...platform.textures].find((texture) => !texture.slot)).toMatchObject({
      width: 256,
      height: 192,
    });
    expect(store.gpuBytes).toBe(2048 * 2048 * 4 + Math.round(256 * 192 * 4 * 1.33));
    store.prune([]);
    expect(platform.pages.size).toBe(0);
    expect(store.gpuBytes).toBe(0);
  });

  it('keeps the GPU estimate under 64 MiB through a full pan of the "images" view at scale 2 on a 2× screen', async () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    // 10,000 shapes, 160 × 72 units every 200 × 120, in 1,024-unit tiles: 300 show bitmaps of their
    // own as drawings, the others one of 20 icons. 4 of the icons are slow to draw.
    const icons = Array.from({ length: 20 }, () => svg());
    const photos = Array.from({ length: 300 }, () => bitmap(1024, 768));
    const columns = 100;
    const scale = 2;
    const ratio = 2;
    const view = { width: 1920 / scale, height: 1080 / scale };
    const tiles = new Map<
      string,
      { x: number; y: number; picture: CleanedImage; devicePixels: number }[]
    >();
    for (let i = 0; i < 10_000; i++) {
      const x = (i % columns) * 200;
      const y = Math.floor(i / columns) * 120;
      const photo = i % 33 === 0 ? photos[(i / 33) % 300] : undefined;
      const icon = icons[i % 20];
      // A drawing's picture fits 160 × 52 units, keeping 4:3; an icon is 18 units a side.
      const shown = photo
        ? { picture: photo, devicePixels: 69 * scale * ratio }
        : icon && { picture: icon, devicePixels: 18 * scale * ratio };
      if (!shown) continue;
      const tile = `${Math.floor(x / 1024)},${Math.floor(y / 1024)}`;
      tiles.set(tile, [...(tiles.get(tile) ?? []), { x, y, ...shown }]);
    }
    // The icons were seen at rest before, so their cost is known and motion may draw them.
    for (const icon of icons)
      store.texture({
        image: icon,
        devicePixels: 72,
        silhouette: false,
        distance: 0,
        tile: 'start',
      });
    await rest(store, 60);
    let peak = 0;
    let made = 0;
    // A pan across the whole view, row after row, 96 canvas units a frame, while moving: the reach is
    // the screen grown by 512 units, as the renderer's is.
    for (let top = 0; top < 100 * 120; top += view.height) {
      for (let left = -view.width; left < columns * 200; left += 96) {
        platform.time += 16;
        const reach = {
          left: left - 512,
          top: top - 512,
          right: left + view.width + 512,
          bottom: top + view.height + 512,
        };
        const inReach = new Set<string>();
        for (
          let column = Math.floor(reach.left / 1024);
          column <= Math.floor(reach.right / 1024);
          column++
        ) {
          for (
            let row = Math.floor(reach.top / 1024);
            row <= Math.floor(reach.bottom / 1024);
            row++
          ) {
            const tile = `${column},${row}`;
            const shapes = tiles.get(tile);
            if (!shapes) continue;
            inReach.add(tile);
            const keys: string[] = [];
            for (const shape of shapes) {
              const distance = Math.hypot(
                shape.x - left - view.width / 2,
                shape.y - top - view.height / 2,
              );
              const texture = store.texture({
                image: shape.picture,
                devicePixels: shape.devicePixels,
                silhouette: false,
                distance,
                tile,
              });
              if (texture) keys.push(texture.key);
            }
            store.use(tile, keys);
          }
        }
        store.settle(inReach);
        store.frame({ spent: 4, moving: true });
        peak = Math.max(peak, store.gpuBytes);
        made = Math.max(made, platform.calls.filter((call) => call.startsWith('upload')).length);
        await settled();
      }
    }
    // Every photo was drawn on the way, and the estimate never passed the budget.
    expect(made).toBeGreaterThanOrEqual(300);
    expect(peak).toBeLessThanOrEqual(IMAGE_LIMITS.gpuBudget);
  }, 60_000);
});

describe('the atlas', () => {
  it('keeps a page’s pixels, and uploads only the rows of the cells drawn since the last upload', () => {
    const page = new AtlasPage(64);
    expect(page.takeDirty()).toBeUndefined();
    const cell = new Uint8ClampedArray(8 * 8 * 4).fill(200);
    page.put(cell, 8, 16, 24);
    page.put(cell, 8, 40, 28);
    // Rows 24 to 36, whole.
    expect(page.takeDirty()).toEqual({ start: 24 * 64, end: 36 * 64 });
    expect(page.takeDirty()).toBeUndefined();
    const at = (x: number, y: number) => page.data[(y * 64 + x) * 4];
    expect(at(16, 24)).toBe(200);
    expect(at(23, 31)).toBe(200);
    expect(at(24, 31)).toBe(0);
    expect(at(15, 24)).toBe(0);
    expect(at(47, 35)).toBe(200);
  });

  it('places 16-pixel pictures in 24-pixel cells, 4-pixel gutters around each, row by row', () => {
    const atlas = new AtlasLayout();
    const slots = Array.from({ length: 90 }, () => atlas.place(16).slot);
    expect(slots[0]).toEqual({ page: 1, x: 4, y: 4, cell: 24 });
    expect(slots[1]).toEqual({ page: 1, x: 28, y: 4, cell: 24 });
    // 2048 / 24 = 85 cells a row.
    expect(slots[85]).toEqual({ page: 1, x: 4, y: 28, cell: 24 });
    for (const [i, a] of slots.entries()) {
      for (const b of slots.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= 24 || Math.abs(a.y - b.y) >= 24;
        expect(apart).toBe(true);
      }
      expect(a.x + 16 + 4).toBeLessThanOrEqual(IMAGE_LIMITS.atlasPage);
    }
  });

  it('opens a new page when one is full, reuses freed cells, and lets an empty page go', () => {
    const atlas = new AtlasLayout();
    const perPage = Math.floor(2048 / 72) ** 2;
    const slots = Array.from({ length: perPage + 1 }, () => atlas.place(64));
    expect(slots.at(-1)).toMatchObject({ newPage: true, slot: { page: 2 } });
    const first = slots[0]?.slot;
    if (!first) throw new Error('No slot.');
    expect(atlas.free(first)).toBe(false);
    expect(atlas.place(64)).toEqual({ slot: first, newPage: false });
    const last = slots.at(-1)?.slot;
    if (!last) throw new Error('No slot.');
    expect(atlas.free(last)).toBe(true);
    expect(atlas.pages).toBe(1);
  });

  it('extrudes a picture’s outer pixels into its gutter on every side and corner', () => {
    const drawImage = vi.fn();
    extrudeEdges({ drawImage }, {} as CanvasImageSource, 4, 4, 16, 12, 4);
    const targets = drawImage.mock.calls.map((call) => call.slice(5) as number[]);
    expect(targets).toEqual([
      [4, 0, 16, 4],
      [4, 16, 16, 4],
      [0, 4, 4, 12],
      [20, 4, 4, 12],
      [0, 0, 4, 4],
      [20, 0, 4, 4],
      [0, 16, 4, 4],
      [20, 16, 4, 4],
    ]);
  });
});

describe('loading an SVG picture', () => {
  function fakeLoading(decode: () => Promise<void>) {
    const events: string[] = [];
    const image = {
      decode,
      src: '',
      width: 0,
      height: 0,
      decoding: '',
    } as unknown as HTMLImageElement;
    const blobs: Blob[] = [];
    return {
      events,
      image,
      blobs,
      loading: {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob);
          events.push('create');
          return 'blob:test/1';
        },
        revokeObjectURL: (url: string) => events.push(`revoke ${url}`),
        createImage: () => image,
      },
    };
  }

  it('decodes cleaned text from a Blob into a detached image, at its size, then revokes the URL', async () => {
    const fake = fakeLoading(() => Promise.resolve());
    const picture = await loadSvgPicture(
      `<svg viewBox="0 0 2 1" ${NS}><path d="M0 0h1"/></svg>`,
      64,
      32,
      fake.loading,
    );
    expect(picture).toBe(fake.image);
    expect(fake.image.src).toBe('blob:test/1');
    expect(fake.events).toEqual(['create', 'revoke blob:test/1']);
    expect(fake.blobs[0]?.type).toBe('image/svg+xml');
    expect(await fake.blobs[0]?.text()).toBe(
      `<svg height="32" width="64" viewBox="0 0 2 1" ${NS}><path d="M0 0h1"/></svg>`,
    );
    expect(document.querySelector('img')).toBeNull();
  });

  it('revokes the URL when the picture does not decode', async () => {
    const fake = fakeLoading(() => Promise.reject(new Error('Broken.')));
    await expect(
      loadSvgPicture(`<svg viewBox="0 0 1 1" ${NS}/>`, 16, 16, fake.loading),
    ).rejects.toThrow('Broken.');
    expect(fake.events).toEqual(['create', 'revoke blob:test/1']);
  });

  it('sets the size on the outermost element only', () => {
    expect(svgAtSize(`<svg viewBox="0 0 1 1" ${NS}><svg viewBox="0 0 1 1"/></svg>`, 8, 4)).toBe(
      `<svg height="4" width="8" viewBox="0 0 1 1" ${NS}><svg viewBox="0 0 1 1"/></svg>`,
    );
  });
});

describe('cleaned SVG, read by a real XML parser', () => {
  const allowed = (document: Document) => {
    expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
    for (const element of document.getElementsByTagName('*')) {
      expect(element.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(SVG_ALLOWED.elements.has(element.localName), element.localName).toBe(true);
      for (const attribute of element.attributes) {
        expect(SVG_ALLOWED.attributes.has(attribute.name), attribute.name).toBe(true);
        if (attribute.name === 'xmlns') expect(attribute.value).toBe('http://www.w3.org/2000/svg');
        else expect(attribute.value).not.toMatch(/javascript|data:|https?:|\/\//i);
      }
    }
  };

  it('holds nothing outside the allow-list, whatever went in', () => {
    const names = [
      'g',
      'path',
      'use',
      'script',
      'foreignObject',
      'a',
      'style',
      'set',
      'image',
      'text',
      'mask',
    ];
    const attributes = [
      'id',
      'd',
      'fill',
      'href',
      'xlink:href',
      'onload',
      'style',
      'class',
      'mask',
      'transform',
    ];
    const values = [
      'a',
      '#a',
      'url(#a)',
      'M0 0h1',
      'javascript:alert(1)',
      'data:x',
      'https://evil.example',
      'fill:red',
    ];
    const node: fc.Arbitrary<string> = fc.letrec<{ node: string }>((tie) => ({
      node: fc
        .tuple(
          fc.constantFrom(...names),
          fc.uniqueArray(fc.tuple(fc.constantFrom(...attributes), fc.constantFrom(...values)), {
            maxLength: 3,
            selector: ([name]) => name,
          }),
          fc.array(fc.oneof({ maxDepth: 3 }, fc.constant(''), tie('node')), { maxLength: 3 }),
        )
        .map(
          ([name, pairs, children]) =>
            `<${name}${pairs.map(([key, value]) => ` ${key}="${value}"`).join('')}>${children.join('')}</${name}>`,
        ),
    })).node;
    fc.assert(
      fc.property(fc.array(node, { maxLength: 4 }), (children) => {
        const result = cleanSvg(
          `<svg viewBox="0 0 10 10" ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><path id="a" d="M0 0h1"/>${children.join('')}</svg>`,
        );
        if (!result.ok) return;

        allowed(new DOMParser().parseFromString(result.value.svg, 'image/svg+xml'));
      }),
      { numRuns: 200 },
    );
  });
});
