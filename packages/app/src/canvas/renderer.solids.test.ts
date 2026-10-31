/**
 * The renderer and solids (ADR 0075), with the stand-in worker: the solid layer lies above the element
 * shapes, a drawing with parts that shows a solid is pointed at through its part buffer once its
 * picture arrives, and at its drawing before, and turning shows its frames in the layer.
 */
import { solidHash } from '@visual-anything/core';
import { Container, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolidClient, type SolidFileResult } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { ARM_FILE, armDefinition, withSolids } from '../test/solids';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { ImagePlatform } from './images';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';
import type { SolidLayer } from './solids/layer';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

/** A platform whose textures are real and blank. */
const platform: ImagePlatform<Texture, unknown> = {
  now: () => performance.now(),
  bytesOf: (base64) => new Uint8Array(base64.length),
  decodeBitmap: () => Promise.resolve({}),
  loadSvg: () => Promise.resolve({}),
  texture: () => new Texture({ source: Texture.WHITE.source }),
  atlasTexture: () => new Texture({ source: Texture.WHITE.source }),
  flush: () => {},
  destroyTexture: () => {},
  destroyPage: () => {},
  releasePicture: () => {},
};

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function started() {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  const client = createSolidClient({
    files: {
      get: (hash: string): Promise<SolidFileResult> =>
        Promise.resolve(
          hash === solidHash(ARM_FILE)
            ? { ok: true, bytes: ARM_FILE.slice() }
            : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
        ),
    },
    start: () => new StandInSolidWorker(),
  });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    { text: counting, images: platform, solids: client },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  renderer.setSolids(client, (id) =>
    id === armDefinition().id ? armDefinition().parts : undefined,
  );
  return { renderer, client };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

interface Inside {
  world: Container;
  elementShapes: Container;
  solidLayer: SolidLayer;
  partLayer: { container: Container };
}

describe('the renderer and solids', () => {
  it('points at a drawing’s parts through its part buffer once its picture arrives', async () => {
    const { renderer } = await started();
    const look = renderer as unknown as Inside;
    const children = look.world.children;
    expect(children.indexOf(look.solidLayer.container)).toBe(
      children.indexOf(look.elementShapes) + 1,
    );
    const scene = buildScene(withSolids(), 'robot');
    const indexed = indexScene(scene);
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    const arm = indexed.byKey.get('arm');
    const link = indexed.byKey.get('arm/link');
    const point = link?.part?.point;
    if (!arm || !link || !point) throw new Error('No arm.');
    // Before its picture arrives, the pointer finds the drawing.
    expect(renderer.solidPartAt(arm, point)).toBe(arm);
    for (let frame = 0; frame < 8; frame++) {
      renderer.renderNow();
      await settle();
    }
    expect(look.solidLayer.drawn).toBe(1);
    const found = renderer.solidPartAt(arm, point);
    expect(found.part?.solid).toBe(armDefinition().id);
    // A filter that hides the part found finds the drawing, or the part holding it.
    renderer.setEmphasis({ hidden: new Set([found.key]) });
    expect(renderer.solidPartAt(arm, point)).not.toBe(found);
  });

  it('shows the shape being turned in the solid layer, and lets it go', async () => {
    const { renderer } = await started();
    const look = renderer as unknown as Inside;
    const indexed = indexScene(buildScene(withSolids(), 'robot'));
    renderer.show(indexed);
    renderer.setTurning({ key: 'pictured', frame: undefined });
    // The drawing with parts, and the shape turned.
    expect(look.solidLayer.drawn).toBe(2);
    renderer.setTurning(undefined);
    expect(look.solidLayer.drawn).toBe(1);
  });
});
