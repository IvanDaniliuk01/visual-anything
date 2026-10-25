import { cleanedImage, type CleanedImage } from '@visual-anything/core';
import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { Rect } from './geometry';
import { imageSerial } from './image-serials';
import { IMAGE_LIMITS, type ImagePlatform } from './images';
import { TileImages, type ImageTile, type ImageView } from './images-draw';
import type { ElementShape } from './scene';
import { placeImage } from './shape-images';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

interface FakePicture {
  width: number;
  height: number;
}

/** A platform that decodes nothing and keeps time by hand; its textures are real, and blank. */
class FakePlatform implements ImagePlatform<Texture, FakePicture> {
  time = 0;
  made = 0;
  loads = 0;
  decodes = 0;
  destroyed = 0;
  now(): number {
    return this.time;
  }
  bytesOf(base64: string): Uint8Array {
    return new Uint8Array(base64.length);
  }
  decodeBitmap(_bytes: Uint8Array, _type: string, width: number, height: number) {
    this.decodes += 1;
    return Promise.resolve({ width, height });
  }
  loadSvg(_svg: string, width: number, height: number) {
    this.loads += 1;
    return Promise.resolve({ width, height });
  }
  texture(): Texture {
    this.made += 1;
    return new Texture({ source: Texture.WHITE.source });
  }
  atlasTexture(): Texture {
    this.made += 1;
    return new Texture({ source: Texture.WHITE.source });
  }
  flush(): void {}
  destroyTexture(): void {
    this.destroyed += 1;
  }
  destroyPage(): void {}
  releasePicture(): void {}
}

async function arrived(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await Promise.resolve();
}

let count = 0;

function svg(): CleanedImage {
  count += 1;
  const image = cleanedImage({
    kind: 'svg',
    id: `test.svg-${count}`,
    name: `SVG ${count}`,
    width: 24,
    height: 24,
    svg: `<svg viewBox="0 0 24 24" ${NS}><path d="M0 0h${count}v1z"/></svg>`,
  });
  if (!image) throw new Error('The test picture does not clean.');
  return image;
}

function bitmap(): CleanedImage {
  count += 1;
  return {
    kind: 'bitmap',
    id: `test.bitmap-${count}`,
    name: `Bitmap ${count}`,
    format: 'png',
    width: 64,
    height: 64,
    data: `AAAA${count}`,
  } as unknown as CleanedImage;
}

/** A shape at a place, showing a picture as an icon or as its drawing. */
function shapeWith(
  image: CleanedImage,
  placement: 'icon' | 'drawing',
  rect: Rect,
  tint?: string,
): ElementShape {
  const placed = placeImage(
    { id: image.id, image, serial: imageSerial(image), placement, ...(tint ? { tint } : {}) },
    { kind: 'rectangle', rect, holdsContents: false, rows: false },
  );
  return {
    key: `shape-${rect.x}-${rect.y}`,
    element: `shape-${rect.x}-${rect.y}`,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: 'A shape',
    componentName: 'Service',
    kind: 'rectangle',
    fill: '#ABCDEF',
    stroke: '#123456',
    rect,
    extent: rect,
    holdsContents: false,
    ...(placed ? { image: placed.image } : {}),
    ...(placed?.plate ? { plate: placed.plate } : {}),
  };
}

/** A tile of shapes drawn in full, as the renderer makes it. */
function tileOf(...shapes: ElementShape[]): ImageTile & { container: Container; full: Graphics } {
  const container = new Container();
  const full = new Graphics();
  container.addChild(full);
  const xs = shapes.map((shape) => shape.rect.x);
  const ys = shapes.map((shape) => shape.rect.y);
  return {
    kind: 'shapes',
    container,
    full,
    shapes,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...shapes.map((shape) => shape.rect.x + shape.rect.width)) - Math.min(...xs),
      height:
        Math.max(...shapes.map((shape) => shape.rect.y + shape.rect.height)) - Math.min(...ys),
    },
  };
}

function view(
  scale: number,
  settled = true,
  shown: Rect = { x: 0, y: 0, width: 2000, height: 1200 },
): ImageView {
  return { scale, shown, resolution: 1, settled, spent: 0 };
}

/** The image drawing of a tile: its render group's two drawings, plates and pictures then icons. */
function drawingOf(
  tile: ImageTile,
): { group: Container; drawings: Graphics; icons: Graphics } | undefined {
  const group = tile.container.children[1];
  if (!(group instanceof Container) || group instanceof Graphics) return undefined;
  const [drawings, icons] = group.children as Graphics[];
  return { group, drawings: drawings as Graphics, icons: icons as Graphics };
}

function textures(graphics: Graphics | undefined): number {
  return graphics?.context.instructions.filter((each) => each.action === 'texture').length ?? 0;
}

function fills(graphics: Graphics | undefined): number {
  return graphics?.context.instructions.filter((each) => each.action === 'fill').length ?? 0;
}

describe('pictures in tiles', () => {
  it('draw an SVG icon once it is rasterized, while the camera rests, just above the full drawing', async () => {
    const platform = new FakePlatform();
    let arrivals = 0;
    const images = new TileImages(platform, () => (arrivals += 1));
    const tile = tileOf(shapeWith(svg(), 'icon', { x: 100, y: 100, width: 160, height: 80 }));
    images.show(tile.shapes);
    images.frame([tile], view(1));
    const drawing = drawingOf(tile);
    expect(drawing).toBeDefined();
    expect(tile.container.getChildIndex(drawing?.group as Container)).toBe(1);
    expect(drawing?.group.isRenderGroup).toBe(true);
    // Nothing until its picture is drawn: an icon's placeholder is nothing.
    expect(textures(drawing?.icons)).toBe(0);
    images.frame([tile], view(1));
    await arrived();
    expect(arrivals).toBe(1);
    images.frame([tile], view(1));
    expect(textures(drawing?.icons)).toBe(1);
    expect(platform.loads).toBe(1);
  });

  it('never rasterizes an SVG for the first time while the camera moves', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(shapeWith(svg(), 'icon', { x: 100, y: 100, width: 160, height: 80 }));
    images.show(tile.shapes);
    for (let frame = 0; frame < 5; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    expect(platform.loads).toBe(0);
    expect(textures(drawingOf(tile)?.icons)).toBe(0);
  });

  it('decode bitmaps during motion, and draw a drawing on its plate in its shape’s fill', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(
      shapeWith(bitmap(), 'drawing', { x: 100, y: 100, width: 160, height: 160 }),
    );
    images.show(tile.shapes);
    images.frame([tile], view(0.3, false));
    const drawing = drawingOf(tile);
    // The full drawing's outline inside the plate shows meanwhile: no plate yet.
    expect(fills(drawing?.drawings)).toBe(0);
    images.frame([tile], view(0.3, false));
    await arrived();
    images.frame([tile], view(0.3, false));
    expect(platform.decodes).toBe(1);
    expect(textures(drawing?.drawings)).toBe(1);
    expect(fills(drawing?.drawings)).toBe(1);
    const plate = drawing?.drawings.context.instructions.find((each) => each.action === 'fill');
    expect(plate?.data.style.color).toBe(0xabcdef);
  });

  it('tint silhouettes on the GPU', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(
      shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 }, '#FF0000'),
    );
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    const texture = drawingOf(tile)?.icons.context.instructions.find(
      (each) => each.action === 'texture',
    );
    expect(texture?.data.style).toBe(0xff0000);
  });

  it('hide below their scales: icons below names, drawings with the plain blocks', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(
      shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 }),
      shapeWith(bitmap(), 'drawing', { x: 200, y: 0, width: 160, height: 160 }),
    );
    images.show(tile.shapes);
    for (let frame = 0; frame < 4; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    const drawing = drawingOf(tile);
    expect(drawing?.icons.visible).toBe(true);
    images.frame([tile], view(0.3, false));
    expect(drawing?.icons.visible).toBe(false);
    expect(drawing?.group.visible).toBe(true);
    // Far out the full drawing hides, and the pictures with it.
    tile.full.visible = false;
    images.frame([tile], view(0.2, false));
    expect(drawing?.group.visible).toBe(false);
  });

  it('rebuild at most four image drawings a frame, nearest the middle first', () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tiles = Array.from({ length: 10 }, (_, at) =>
      tileOf(shapeWith(bitmap(), 'icon', { x: at * 200, y: 0, width: 160, height: 80 })),
    );
    images.show(tiles.flatMap((tile) => tile.shapes));
    images.frame(tiles, view(1, false, { x: 0, y: 0, width: 2000, height: 1200 }));
    expect(tiles.filter((tile) => drawingOf(tile) !== undefined)).toHaveLength(
      IMAGE_LIMITS.tileRebuilds,
    );
    expect(drawingOf(tiles[4] as ImageTile)).toBeDefined();
    expect(drawingOf(tiles[0] as ImageTile)).toBeUndefined();
  });

  it('cost nothing when the scene shows no picture', () => {
    const images = new TileImages(new FakePlatform());
    const shape = shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 });
    const plain = { ...shape };
    delete plain.image;
    const tile = tileOf(plain);
    images.show(tile.shapes);
    expect(images.frame([tile], view(1))).toBe(false);
    expect(drawingOf(tile)).toBeUndefined();
  });

  it('drop the drawing of a tile out of reach for 3 seconds, and draw it again when it comes back', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 }));
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    expect(textures(drawingOf(tile)?.icons)).toBe(1);
    const away = view(1, false, { x: 100_000, y: 0, width: 2000, height: 1200 });
    images.frame([tile], away);
    platform.time += IMAGE_LIMITS.outOfReach;
    images.frame([tile], away);
    expect(textures(drawingOf(tile)?.icons)).toBe(0);
    images.frame([tile], view(1, false));
    expect(textures(drawingOf(tile)?.icons)).toBe(1);
  });

  it('draw again at a larger bucket once the camera rests', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(shapeWith(bitmap(), 'drawing', { x: 0, y: 0, width: 160, height: 160 }));
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    const before = platform.decodes;
    // A 132-unit picture at 1.15 is 152 pixels: the 128 bucket while moving, the 256 one at rest.
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1.15, false));
      await arrived();
    }
    expect(platform.decodes).toBe(before);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1.15, true));
      await arrived();
    }
    expect(platform.decodes).toBe(before + 1);
  });

  it('draw what a drag carries with the textures made, and keep them while it is drawn', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const shape = shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 });
    const tile = tileOf(shape);
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    const [carried] = images.dragged([shape], view(1, false));
    expect(textures(carried)).toBe(1);
    carried?.destroy();
    // Once the drag's drawings are gone, so are its uses: nothing is left over.
    images.frame([tile], view(1, false));
    expect(images.dragged([], view(1, false))).toEqual([]);
  });

  it('start again from nothing when reset, as the benchmark’s cold runs do', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 }));
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    images.reset();
    expect(images.store.size).toBe(0);
    expect(textures(drawingOf(tile)?.icons)).toBe(0);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(1, false));
      await arrived();
    }
    expect(textures(drawingOf(tile)?.icons)).toBe(1);
  });
});
