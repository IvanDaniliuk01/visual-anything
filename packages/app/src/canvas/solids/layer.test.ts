/**
 * The solid layer (ADR 0075), with the stand-in worker: a drawing with parts that shows a solid draws
 * its picture with the parts' shader once a picture arrives, and its placeholder meanwhile; its parts'
 * states follow the selection, the hover, highlights, focus and filters without drawing the picture
 * again; a filter that hides parts draws it again without them, the old picture showing meanwhile;
 * below the scale its level shows images, its picture does not show and pointing finds the drawing.
 */
import { solidHash } from '@visual-anything/core';
import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createSolidClient, type SolidFileResult } from '../../solids/client';
import { StandInSolidWorker } from '../../solids/stand-in';
import { ARM_FILE, armDefinition, withSolids } from '../../test/solids';
import type { ImagePlatform } from '../images';
import { TileImages } from '../images-draw';
import { buildScene, type ElementShape, type Scene } from '../scene';
import { solidPictureKey, withHiddenParts } from '../shape-solids';
import { SolidLayer, partBufferBytes, type SolidLayerView } from './layer';
import { anchoredPartFor, partIndexAt, pointedPart } from './pointing';
import { PART_MARK, entryOffset, STATE_TABLE_WIDTH } from './states';

class FakePlatform implements ImagePlatform<Texture, unknown> {
  now(): number {
    return 0;
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
  texture(): Texture {
    return new Texture({ source: Texture.WHITE.source });
  }
  atlasTexture(): Texture {
    return new Texture({ source: Texture.WHITE.source });
  }
  flush(): void {}
  destroyTexture(): void {}
  destroyPage(): void {}
  releasePicture(): void {}
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

const VIEW: SolidLayerView = {
  scale: 1,
  shown: { x: -100, y: -100, width: 1200, height: 900 },
  resolution: 1,
  settled: true,
};

function setUp() {
  const workers: StandInSolidWorker[] = [];
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
  const images = new TileImages(new FakePlatform());
  images.setSolids(client);
  const layer = new SolidLayer(() => images.solids);
  layer.setParts((id) => (id === armDefinition().id ? armDefinition().parts : undefined));
  const scene = buildScene(withSolids(), 'robot');
  return { client, images, layer, scene, workers };
}

/** Frames until what the layer asked for has arrived and been made. */
async function frames(layer: SolidLayer, images: TileImages<Texture, unknown>, view = VIEW) {
  for (let round = 0; round < 6; round++) {
    images.solids?.begin();
    layer.frame(view);
    await settle();
    images.store.frame({ spent: 0, moving: false });
  }
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

const NONE = new Set<string>();

describe('the solid layer', () => {
  it('draws a drawing with parts once its picture arrives, and its placeholder meanwhile', async () => {
    const { layer, images, scene } = setUp();
    layer.setScene(scene, NONE, NONE);
    expect(layer.drawn).toBe(1);
    expect(layer.placedBuffer('arm')).toBeUndefined();
    await frames(layer, images);
    const placed = layer.placedBuffer('arm');
    expect(placed?.rect).toEqual(shapeOf(scene, 'arm').solid?.rect);
    expect(placed?.buffer.width).toBe(512);
    // Pointing through its part buffer finds the part drawn there.
    const arm = shapeOf(scene, 'arm');
    const base = shapeOf(scene, 'arm/base');
    const parts = layer.partsAt('arm');
    if (!placed || !parts) throw new Error('Nothing drawn.');
    const at = base.part?.point;
    if (!at) throw new Error('The base has no point.');
    // The anchored part standing for the part the buffer draws there, or the one holding it.
    const index = partIndexAt(placed, at);
    expect(index).toBeDefined();
    const found = pointedPart(arm, placed, at, parts.parts, parts.anchored);
    expect(found).toBe(anchoredPartFor(index as number, parts.parts, parts.anchored));
    expect(found.part?.solid).toBe(armDefinition().id);
    expect(
      pointedPart(
        arm,
        placed,
        { x: arm.rect.x + 30, y: arm.rect.y + 60 },
        parts.parts,
        parts.anchored,
      ),
    ).toBe(arm);
  });

  it('marks the selected, hovered and highlighted parts in the table, and the parts they hold', () => {
    const { layer, scene } = setUp();
    layer.setScene(scene, NONE, NONE);
    layer.setMarks({
      selected: new Set(['link']),
      hovered: 'arm/base',
      highlighted: new Set(['arm/gripper']),
    });
    const states = (layer as unknown as { entries: { states: { table: Uint8Array } }[] }).entries[0]
      ?.states;
    const bits = (index: number) =>
      states?.table[entryOffset(index + 1) + STATE_TABLE_WIDTH * 4 + 1] ?? 0;
    // The base (0) holds the link (1), which holds the wrist (2), the tip (3) and the gripper (4).
    expect(bits(0)).toBe(PART_MARK.hovered);
    expect(bits(1) & PART_MARK.selected).toBe(PART_MARK.selected);
    expect(bits(3) & PART_MARK.selected).toBe(PART_MARK.selected);
    expect(bits(4)).toBe(PART_MARK.selected | PART_MARK.hovered | PART_MARK.highlighted);
  });

  it('draws the solid again without the parts a filter hides, the old picture showing meanwhile', async () => {
    const { layer, images, scene, workers } = setUp();
    layer.setScene(scene, NONE, NONE);
    await frames(layer, images);
    const before = layer.placedBuffer('arm')?.buffer;
    expect(before).toBeDefined();
    const arm = shapeOf(scene, 'arm');
    expect(layer.pictureShown('arm')).toBe(solidPictureKey(arm));
    // The gripper hidden: its part, and none it holds, is asked for drawn without.
    layer.setScene(scene, NONE, NONE, new Set(['arm/gripper']));
    images.solids?.begin();
    layer.frame(VIEW);
    // Until it arrives, the old picture shows.
    expect(layer.placedBuffer('arm')?.buffer).toBe(before);
    expect(layer.pictureShown('arm')).toBe(solidPictureKey(arm));
    await frames(layer, images);
    const draws = workers[0]?.ofType('draw') ?? [];
    expect(draws.at(-1)?.hidden).toEqual([4]);
    expect(layer.pictureShown('arm')).toBe(solidPictureKey(withHiddenParts(arm, [4])));
    expect(layer.pictureShown('motor')).toBeUndefined();
    expect(draws.at(-1)?.key).toBe(`${solidPictureKey(withHiddenParts(arm, [4]))}@512`);
    expect(layer.placedBuffer('arm')?.buffer).not.toBe(before);
  });

  it('shows no picture below the scale its shape’s level shows images, where pointing finds the drawing', async () => {
    const { layer, images, scene } = setUp();
    layer.setScene(scene, NONE, NONE);
    await frames(layer, images);
    expect(layer.placedBuffer('arm')).toBeDefined();
    layer.frame({ ...VIEW, scale: 0.1, shown: { x: -5000, y: -5000, width: 12000, height: 9000 } });
    expect(layer.placedBuffer('arm')).toBeUndefined();
  });

  it('leaves out a drawing a drag or the emphasis hides', () => {
    const { layer, scene } = setUp();
    layer.setScene(scene, new Set(['arm']), NONE);
    expect(layer.drawn).toBe(0);
  });

  it('does nothing once destroyed, as when a camera’s glide calls it after the canvas went', async () => {
    const { layer, images, scene } = setUp();
    layer.setScene(scene, NONE, NONE);
    await frames(layer, images);
    layer.destroy();
    expect(() => {
      layer.setScale(2);
      layer.setMarks({ selected: new Set(['base']), hovered: undefined, highlighted: new Set() });
      layer.setTheme('dark', { selected: '#60A5FA', highlight: '#FB923C' });
      layer.setScene(buildScene(withSolids(), 'robot'), NONE, NONE);
      layer.setTurning({ key: 'arm', frame: undefined });
      layer.reset();
      expect(layer.frame(VIEW)).toBe(false);
      layer.destroy();
    }).not.toThrow();
    expect(layer.drawn).toBe(0);
  });

  it('turns a part buffer into the bytes of a texture, its numbers in red and green', () => {
    const bytes = partBufferBytes({ width: 2, height: 1, data: Uint16Array.from([0, 4097]) });
    expect([...bytes]).toEqual([0, 0, 0, 255, 1, 16, 0, 255]);
  });
});
