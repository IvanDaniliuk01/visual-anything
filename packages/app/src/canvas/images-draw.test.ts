import { cleanedImage, type CleanedImage, type FaceDrawing } from '@visual-anything/core';
import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { FaceLabel, type FacePictures } from './faceDraw';
import type { ShapeFace } from './faces';
import { boundsOf, type Rect } from './geometry';
import { indexScene } from './hit';
import { imageSerial } from './image-serials';
import { IMAGE_LIMITS, type ImagePlatform } from './images';
import { TileImages, type ImageTile, type ImageView } from './images-draw';
import { buildScene, type ElementShape } from './scene';
import { placeImage } from './shape-images';
import { plannedTiles } from './tiles';

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
  return { scale, shown, resolution: 1, settled, theme: 'light', spent: 0 };
}

/** The image drawing of a tile: its render group's two drawings, plates and pictures then icons. */
function drawingOf(
  tile: ImageTile,
): { group: Container; plates: Graphics[]; drawings: Graphics; icons: Graphics } | undefined {
  const group = tile.container.children[1];
  if (!(group instanceof Container) || group instanceof Graphics) return undefined;
  // Plates first, under the pictures, then the drawings' pictures, then the icons.
  const children = group.children as Graphics[];
  return {
    group,
    plates: children.slice(0, -2),
    drawings: children.at(-2) as Graphics,
    icons: children.at(-1) as Graphics,
  };
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
    // It asks for its picture, and for the frame that starts loading it: at rest none would come.
    expect(images.frame([tile], view(1))).toBe(true);
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
    // Drawn with what it asked for, it asks for no more frames.
    expect(images.frame([tile], view(1))).toBe(false);
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
    // The full drawing's outline inside the plate shows meanwhile: no plate yet.
    expect(drawingOf(tile)?.plates).toEqual([]);
    images.frame([tile], view(0.3, false));
    await arrived();
    images.frame([tile], view(0.3, false));
    const drawing = drawingOf(tile);
    expect(platform.decodes).toBe(1);
    expect(textures(drawing?.drawings)).toBe(1);
    // In white, tinted to the shape's fill.
    const [plates] = drawing?.plates ?? [];
    expect(fills(plates)).toBe(1);
    const plate = plates?.context.instructions.find((each) => each.action === 'fill');
    expect((plate?.data.style as { color: number } | undefined)?.color).toBe(0xffffff);
    expect(plates?.tint).toBe(0xabcdef);
  });

  it('tint plates to the fill of the theme the canvas shows, and draw pictures as stored', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const shape = {
      ...shapeWith(bitmap(), 'drawing', { x: 0, y: 0, width: 160, height: 160 }),
      dark: { fill: '#203040', stroke: '#8899AA' },
    };
    const tile = tileOf(shape);
    images.show(tile.shapes);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([tile], view(0.3, false));
      await arrived();
    }
    const [plates] = drawingOf(tile)?.plates ?? [];
    expect(plates?.tint).toBe(0xabcdef);
    const dark = { ...view(0.3, false), theme: 'dark' as const };
    images.frame([tile], dark);
    // Tinted in the frame the switch shows, nothing drawn again.
    expect(drawingOf(tile)?.plates[0]).toBe(plates);
    expect(plates?.tint).toBe(0x203040);
    expect(textures(drawingOf(tile)?.drawings)).toBe(1);
    // A drag draws its plates in the theme's fill.
    const [carried] = images.dragged([shape], dark);
    const fill = carried?.context.instructions.find((each) => each.action === 'fill');
    expect((fill?.data.style as { color: number } | undefined)?.color).toBe(0x203040);
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

  it('decode and upload nothing while zoomed out too far for any picture to show', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const tile = tileOf(shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 }));
    images.show(tile.shapes);
    // Asked for at names' scale, then zoomed far out before anything was decoded.
    images.frame([tile], view(1, false));
    for (let frame = 0; frame < 4; frame++) {
      images.frame([tile], view(0.1, false));
      await arrived();
    }
    expect(platform.decodes).toBe(0);
    images.frame([tile], view(1, false));
    expect(platform.decodes).toBe(1);
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

  it('make the textures another layer asks for, as an explorable’s still, when the scene shows no picture', () => {
    // The bug the user saw (ADR 0107, A10.3): a view whose shapes show no picture never made the
    // texture of an explorable's still, so its shape kept its card.
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    images.keep('explorable-layer');
    const shape = shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 });
    const plain = { ...shape };
    delete plain.image;
    const tile = tileOf(plain);
    images.show(tile.shapes);
    const request = {
      serial: 9_000_001,
      group: 'explorable the-parabola',
      picture: { width: 512, height: 341 },
      width: 512,
      height: 341,
      distance: 0,
      tile: 'explorable-layer',
    };
    expect(images.store.readyTexture(request)).toBeUndefined();
    expect(images.frame([tile], view(1))).toBe(false);
    expect(images.store.readyTexture(request)?.exact).toBe(true);
    // Once made, a frame costs nothing again.
    const made = platform.made;
    expect(images.frame([tile], view(1))).toBe(false);
    expect(platform.made).toBe(made);
  });

  it('make the textures another layer asks for while zoomed out too far for the tiles’ pictures', () => {
    // A loose explorable shows at every scale, as pictures do (ADR 0107).
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    images.keep('explorable-layer');
    const tile = tileOf(shapeWith(bitmap(), 'icon', { x: 0, y: 0, width: 160, height: 80 }));
    images.show(tile.shapes);
    const request = {
      serial: 9_000_002,
      group: 'explorable loose',
      picture: { width: 256, height: 192 },
      width: 256,
      height: 192,
      distance: 0,
      tile: 'explorable-layer',
    };
    expect(images.store.readyTexture(request)).toBeUndefined();
    images.frame([tile], view(0.1));
    expect(images.store.readyTexture(request)?.exact).toBe(true);
    expect(platform.decodes).toBe(0);
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

describe('the pictures of faces (ADR 0083)', () => {
  /** A face drawing that draws one picture, its `<image ref="photo"/>`, in a 24-unit box. */
  const drawing: FaceDrawing = {
    width: 160,
    height: 40,
    cut: false,
    boxes: [{ x: 0, y: 0, width: 160, height: 40, radius: 0, background: '#ABCDEF' }],
    runs: [],
    bands: [],
    images: [{ kind: 'image', ref: 'photo', x: 8, y: 8, width: 24, height: 24 }],
    regions: [],
  };

  /** A shape whose face draws a picture, as the scene gives it; and two faces of it, painted. */
  function faced(image: CleanedImage, images: FacePictures) {
    const photo = { image, serial: imageSerial(image) };
    const shape = {
      ...shapeWith(image, 'icon', { x: 0, y: 0, width: 160, height: 40 }),
      face: { pictures: { photo } } as unknown as ShapeFace,
    };
    delete shape.image;
    const label = () => {
      const made = new FaceLabel(drawing, { x: 0, y: 0 }, { pictures: images, images: { photo } });
      made.paint('light', '#FFFFFF', '#000000');
      return made;
    };
    return { shape, label };
  }

  it('share one texture, kept for them, and paint again the faces that waited for it', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const { shape, label } = faced(bitmap(), images);
    images.show([shape]);
    const first = label();
    // Its picture is asked for, and drawn once made: its box meanwhile.
    expect(textures(first.graphics)).toBe(0);
    expect(fills(first.graphics)).toBe(1);
    let repaints = 0;
    const repaint = first.repaint.bind(first);
    first.repaint = () => {
      repaints += 1;
      repaint();
    };
    // While its picture decodes, frames that make no texture paint it not again.
    images.frame([], view(1, false));
    images.frame([], view(1, false));
    expect(platform.decodes).toBe(1);
    expect(repaints).toBe(0);
    await arrived();
    images.frame([], view(1, false));
    expect(repaints).toBe(1);
    expect(textures(first.graphics)).toBe(1);
    images.frame([], view(1, false));
    expect(repaints).toBe(1);
    // Over its box.
    const actions = first.graphics.context.instructions.map((each) => each.action);
    expect(actions.indexOf('texture')).toBeGreaterThan(actions.indexOf('fill'));
    // A second face draws it at once, with the same texture.
    const made = platform.made;
    const second = label();
    expect(textures(second.graphics)).toBe(1);
    expect(platform.made).toBe(made);
    // Nothing more to do: no frame is asked for.
    expect(images.frame([], view(1))).toBe(false);
    // Kept while the scene shows it, even with no tile within reach for long.
    platform.time += 10_000;
    images.frame([], view(1));
    expect(images.store.size).toBe(1);
  });

  it('paint their faces again once the store starts from nothing', async () => {
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    const { shape, label } = faced(bitmap(), images);
    images.show([shape]);
    const face = label();
    for (let frame = 0; frame < 3; frame++) {
      images.frame([], view(1, false));
      await arrived();
    }
    expect(textures(face.graphics)).toBe(1);
    images.reset();
    expect(textures(face.graphics)).toBe(0);
    for (let frame = 0; frame < 3; frame++) {
      images.frame([], view(1, false));
      await arrived();
    }
    expect(textures(face.graphics)).toBe(1);
  });
});

describe('the pictures of the "images" benchmark view', () => {
  it('stay within the GPU budget through a full pan at scale 2 on a 2× screen', async () => {
    const project = syntheticProject({ elements: 10_000, images: true });
    const indexed = indexScene(buildScene(project, 'everything'));
    const tiles: ImageTile[] = plannedTiles(indexed, new Set()).map((planned) => {
      const container = new Container();
      const full = new Graphics();
      container.addChild(full);
      return {
        kind: 'shapes',
        container,
        full,
        shapes: planned.shapes,
        bounds: boundsOf(planned.shapes.map((shape) => shape.rect)) as Rect,
      };
    });
    const platform = new FakePlatform();
    const images = new TileImages(platform);
    images.show(indexed.scene.shapes);
    const bounds = indexed.scene.bounds as Rect;
    // A 1,200 by 800 screen at scale 2 shows 600 by 400 units.
    const screen = { width: 600, height: 400 };
    let most = 0;
    let frames = 0;
    let spentIn = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += bounds.height / 4) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += screen.width / 2) {
        frames += 1;
        // Resting now and then, so that SVG icons are rasterized too.
        const settled = frames % 8 === 0;
        const began = performance.now();
        images.frame(tiles, {
          scale: 2,
          shown: { x, y, ...screen },
          resolution: 2,
          settled,
          theme: 'light',
          spent: 0,
        });
        spentIn += performance.now() - began;
        await arrived();
        platform.time += 120;
        most = Math.max(most, images.store.gpuBytes);
      }
    }
    expect(platform.made).toBeGreaterThan(100);
    // The image work of a frame, decoding aside, which the fake platform does at once.
    expect(spentIn / frames).toBeLessThan(IMAGE_LIMITS.workAfter);
    expect(most).toBeLessThanOrEqual(IMAGE_LIMITS.gpuBudget);
  }, 60_000);
});
