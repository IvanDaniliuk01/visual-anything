/**
 * Solids' pictures in the canvas's tiles (ADR 0075), drawn with the stand-in worker: their placeholders
 * until a picture arrives, the nearest the middle of the screen asked for and made first, at most one
 * made a texture a frame, in the atlas up to 256 pixels and as textures of their own past it, none
 * asked for while zoomed out past every picture's scale, the same in both themes over a plate of the
 * shape's fill, and a drawing with parts left to the solid layer but while it is dragged.
 */
import { solidHash } from '@visual-anything/core';
import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createSolidClient, type SolidFileResult } from '../../solids/client';
import { StandInSolidWorker } from '../../solids/stand-in';
import { ARM_FILE, withSolids } from '../../test/solids';
import type { Rect } from '../geometry';
import {
  IMAGE_LIMITS,
  ImageStore,
  readyTextureKey,
  type ImagePlatform,
  type Slot,
} from '../images';
import { TileImages, tileSolidOf, type ImageTile, type ImageView } from '../images-draw';
import { buildScene, type ElementShape } from '../scene';

interface Made {
  kind: 'atlas' | 'own';
  width: number;
  height: number;
  slot?: Slot;
}

/** A platform whose textures are real and blank, and that notes what it made. */
class FakePlatform implements ImagePlatform<Texture, unknown> {
  time = 0;
  readonly made: Made[] = [];
  released = 0;
  now(): number {
    return this.time;
  }
  bytesOf(base64: string): Uint8Array {
    return new Uint8Array(base64.length);
  }
  decodeBitmap(): Promise<unknown> {
    return Promise.resolve({});
  }
  loadSvg(): Promise<unknown> {
    return Promise.resolve({});
  }
  texture(_picture: unknown, width: number, height: number): Texture {
    this.made.push({ kind: 'own', width, height });
    return new Texture({ source: Texture.WHITE.source });
  }
  atlasTexture(slot: Slot, _picture: unknown, width: number, height: number): Texture {
    this.made.push({ kind: 'atlas', width, height, slot });
    return new Texture({ source: Texture.WHITE.source });
  }
  flush(): void {}
  destroyTexture(): void {}
  destroyPage(): void {}
  releasePicture(): void {
    this.released += 1;
  }
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function clientOf(workers: StandInSolidWorker[] = []) {
  const files = {
    get: vi.fn((hash: string): Promise<SolidFileResult> =>
      Promise.resolve(
        hash === solidHash(ARM_FILE)
          ? { ok: true, bytes: ARM_FILE.slice() }
          : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
      ),
    ),
  };
  const client = createSolidClient({
    files,
    start: () => {
      const worker = new StandInSolidWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { client, files, workers };
}

function tileOf(...shapes: ElementShape[]): ImageTile & { container: Container; full: Graphics } {
  const container = new Container();
  const full = new Graphics();
  container.addChild(full);
  const rects = shapes.map((shape) => shape.rect);
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    kind: 'shapes',
    container,
    full,
    shapes,
    bounds: {
      x,
      y,
      width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
      height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
    },
  };
}

function view(
  scale: number,
  shown: Rect,
  settled = true,
  theme: 'light' | 'dark' = 'light',
): ImageView {
  return { scale, shown, resolution: 1, settled, theme, spent: 0 };
}

function texturesIn(tile: ImageTile): number {
  const group = tile.container.children[1];
  if (!(group instanceof Container)) return 0;
  let count = 0;
  for (const child of group.children) {
    if (child instanceof Graphics) {
      count += child.context.instructions.filter((each) => each.action === 'texture').length;
    }
  }
  return count;
}

function shapeOf(key: string): ElementShape {
  const scene = buildScene(withSolids(), 'robot');
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

/** Copies of the motor, which shows the solid as an icon, side by side. */
function motors(count: number): ElementShape[] {
  const motor = shapeOf('motor');
  return Array.from({ length: count }, (_, at) => {
    const dx = at * 400;
    const move = (rect: Rect) => ({ ...rect, x: rect.x + dx });
    const solid = motor.solid;
    if (!solid) throw new Error('The motor shows no solid.');
    return {
      ...motor,
      key: `motor-${at}`,
      rect: move(motor.rect),
      // Another camera for each, so that each is a picture of its own.
      solid: {
        ...solid,
        camera: { ...solid.camera, azimuth: at },
        rect: move(solid.rect),
        box: move(solid.box),
      },
    };
  });
}

const SHOWN: Rect = { x: 600, y: -200, width: 1200, height: 800 };

describe('solids’ pictures in tiles', () => {
  it('draw the placeholder until a picture arrives, then the picture over a plate of the shape’s fill', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const { client, files } = clientOf();
    images.setSolids(client);
    const motor = shapeOf('motor');
    const tile = tileOf(motor);
    images.show(tile.shapes);
    expect(tileSolidOf(motor)).toBeDefined();
    images.frame([tile], view(1, SHOWN));
    // Nothing drawn: the tile's full drawing draws the placeholder.
    expect(texturesIn(tile)).toBe(0);
    await settle();
    expect(files.get).toHaveBeenCalledTimes(1);
    for (let frame = 0; frame < 4; frame++) images.frame([tile], view(1, SHOWN));
    expect(texturesIn(tile)).toBe(1);
    expect(platform.made).toHaveLength(1);
    // A small picture goes in the atlas, and the store never lets the client's picture go.
    expect(platform.made[0]?.kind).toBe('atlas');
    expect(platform.released).toBe(0);
    // A theme switch draws nothing again.
    images.frame([tile], view(1, SHOWN, true, 'dark'));
    expect(platform.made).toHaveLength(1);
  });

  it('make at most one picture a texture a frame, the nearest the middle of the screen first', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const { client, workers } = clientOf();
    images.setSolids(client);
    const shapes = motors(4);
    const tiles = shapes.map((shape) => tileOf(shape));
    images.show(shapes);
    // The screen's middle is over the third motor.
    const shown = { x: 800 + 2 * 400 - 600, y: -200, width: 1200, height: 800 };
    for (let round = 0; round < 6; round++) {
      images.frame(tiles, view(1, shown));
      await settle();
    }
    const draws = workers[0]?.ofType('draw') ?? [];
    expect(draws).toHaveLength(4);
    expect(draws[0]?.camera.azimuth).toBe(2);
    // Every picture is kept now: frame by frame, one texture each.
    platform.made.length = 0;
    const counts: number[] = [];
    const fresh = new TileImages(platform);
    fresh.setSolids(client);
    fresh.show(shapes);
    const freshTiles = shapes.map((shape) => tileOf(shape));
    for (let frame = 0; frame < 6; frame++) {
      fresh.frame(freshTiles, view(1, shown));
      counts.push(platform.made.length);
    }
    expect(counts.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(freshTiles.map(texturesIn)).toEqual([1, 1, 1, 1]);
  });

  it('ask for nothing while the canvas is zoomed out past every picture’s scale', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const { client, workers } = clientOf();
    images.setSolids(client);
    const tile = tileOf(shapeOf('pictured'));
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(0.05, { x: -5000, y: -5000, width: 20000, height: 20000 }));
      await settle();
    }
    expect(client.started).toBe(false);
    expect(workers).toHaveLength(0);
  });

  it('leave a drawing with parts to the solid layer, but draw it plain while it is dragged', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const { client } = clientOf();
    images.setSolids(client);
    const arm = shapeOf('arm');
    expect(arm.solid?.placement).toBe('parts');
    expect(tileSolidOf(arm)).toBeUndefined();
    expect(tileSolidOf(arm, true)).toBe(arm.solid);
    const tile = tileOf(arm);
    images.show(tile.shapes);
    images.frame([tile], view(1, { x: -200, y: -200, width: 1200, height: 800 }));
    expect(tile.container.children).toHaveLength(1);
    // Dragged: drawn with the textures already made, which a solid layer's ask made meanwhile.
    images.solids?.want(arm, 320, 0, true);
    images.solids?.flush();
    await settle();
    for (let frame = 0; frame < 3; frame++) {
      images.solids?.texture(arm, 320, 0, 'test', true);
      images.store.frame({ spent: 0, moving: false });
    }
    const [dragged] = images.dragged(
      [arm],
      view(1, { x: -200, y: -200, width: 1200, height: 800 }),
    );
    expect(dragged?.context.instructions.filter((each) => each.action === 'texture')).toHaveLength(
      1,
    );
  });
});

describe('the image store’s pictures made elsewhere', () => {
  const request = (serial: number, width: number, height: number, distance = 0) => ({
    serial,
    group: `group-${serial}`,
    picture: { serial },
    width,
    height,
    distance,
    tile: 'tile',
  });

  it('puts pictures of 256 pixels or fewer in the atlas, and larger ones in textures of their own', () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    expect(store.readyTexture(request(9001, 256, 200))).toBeUndefined();
    store.frame({ spent: 0, moving: false });
    expect(store.readyTexture(request(9002, 512, 512))).toBeUndefined();
    store.frame({ spent: 0, moving: false });
    expect(platform.made.map((made) => made.kind)).toEqual(['atlas', 'own']);
    expect(platform.made[0]?.slot?.cell).toBe(256 + 2 * IMAGE_LIMITS.gutter);
    expect(store.readyTexture(request(9001, 256, 200))?.exact).toBe(true);
    expect(store.readyTexture(request(9001, 256, 200))?.key).toBe(readyTextureKey(9001));
    // Never let go: the pictures are the solid client's.
    expect(platform.released).toBe(0);
  });

  it('makes one a frame, nearest first, and stands in another of the group meanwhile', () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    store.readyTexture(request(9101, 128, 128, 50));
    store.readyTexture(request(9102, 128, 128, 5));
    store.frame({ spent: 0, moving: true });
    expect(platform.made).toHaveLength(1);
    expect(store.readyTexture(request(9102, 128, 128))?.exact).toBe(true);
    expect(store.more).toBe(true);
    store.frame({ spent: 0, moving: true });
    expect(platform.made).toHaveLength(2);
    // Another size of the same picture stands in for one not made yet.
    const larger = { ...request(9103, 512, 512), group: 'group-9102' };
    const standIn = store.readyTexture(larger);
    expect(standIn?.exact).toBe(false);
    expect(standIn?.key).toBe(readyTextureKey(9102));
  });

  it('keeps pictures made elsewhere when the project’s images are pruned', () => {
    const platform = new FakePlatform();
    const store = new ImageStore(platform);
    store.readyTexture(request(9201, 128, 128));
    store.frame({ spent: 0, moving: false });
    store.prune([]);
    expect(store.readyTexture(request(9201, 128, 128))?.exact).toBe(true);
  });
});
