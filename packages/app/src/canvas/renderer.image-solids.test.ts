/**
 * Solids in the PNG of the canvas (ADR 0075), with the stand-in worker: the solid worker draws each
 * picture the image shows at the image's scale, and the image draws them where the solid layer lies,
 * above the element shapes, each over a plate of its shape's fill; once drawn, the canvas is as it was.
 */
import { solidHash } from '@visual-anything/core';
import { Container, Sprite, Texture, type Matrix } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolidClient, type SolidFileResult } from '../solids/client';
import { StandInSolidWorker, type StandInBitmap } from '../solids/stand-in';
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

const text: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

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

interface Inside {
  world: Container;
  solidLayer: SolidLayer;
}

/** What the world held, in order, each time a piece of the image was drawn. */
let seen: { children: Container[]; sprites: number[] }[];
let workers: StandInSolidWorker[];

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
    start: () => {
      const worker = new StandInSolidWorker();
      workers.push(worker);
      return worker;
    },
  });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    {
      text,
      images: platform,
      solids: client,
      solidPixels: (bitmap) => {
        const drawn = bitmap as unknown as StandInBitmap;
        return { width: drawn.width, height: drawn.height, pixels: drawn.pixels };
      },
    },
  );
  const app = FakeApplication.created.at(-1) as FakeApplication;
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  renderer.setSolids(client, (id) =>
    id === armDefinition().id ? armDefinition().parts : undefined,
  );
  Object.assign(app.renderer, {
    background: { colorRgba: [1, 1, 1, 1] },
    render: vi.fn((options: { container: Container; transform: Matrix }) => record(options)),
    extract: { canvas: vi.fn(() => 'piece') },
  });
  return { renderer };
}

/** Notes what the world holds as a piece is drawn, and how many sprites each child holds then. */
function record(options: { container: Container }): void {
  const children = [...options.container.children] as Container[];
  seen.push({
    children,
    sprites: children.map(
      (child) =>
        child.children.flatMap((group) => group.children.filter((each) => each instanceof Sprite))
          .length,
    ),
  });
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  seen = [];
  workers = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    drawImage: () => {},
  })) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
    done(new Blob(['png'], { type: 'image/png' })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('solids in the PNG', () => {
  it('draws each picture at the image’s scale, where the solid layer lies, then puts the canvas back', async () => {
    const { renderer } = await started();
    const look = renderer as unknown as Inside;
    const scene = buildScene(withSolids(), 'robot');
    renderer.show(indexScene(scene));
    const before = [...look.world.children];
    await renderer.exportImage({ area: 'view', scale: 2 });
    // The drawing with parts, 320 units a side, at two pixels a unit: the 1,024 bucket.
    const draws = workers.flatMap((worker) => worker.ofType('draw'));
    expect(draws.some((draw) => draw.parts && draw.size.width === 1024)).toBe(true);
    // Each piece of the image drew the image's solids just under the solid layer.
    expect(seen.length).toBeGreaterThan(0);
    const showing = scene.shapes.filter(
      (shape) =>
        shape.solid !== undefined && !(shape.part?.solid !== undefined && shape.part.inDrawing),
    );
    for (const { children, sprites } of seen) {
      const layer = children.indexOf(look.solidLayer.container);
      expect(before).not.toContain(children[layer - 1]);
      expect(sprites[layer - 1]).toBe(showing.length);
    }
    // Once drawn, the canvas holds what it held.
    expect(look.world.children).toEqual(before);
  });

  it('draws the tiles’ placeholders when there is no solid worker', async () => {
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
    const renderer = new CanvasRenderer(host, { onFailure: () => {} }, { text, images: platform });
    const app = FakeApplication.created.at(-1) as FakeApplication;
    app.finishInit();
    await Promise.resolve();
    await Promise.resolve();
    Object.assign(app.renderer, {
      background: { colorRgba: [1, 1, 1, 1] },
      render: vi.fn((options: { container: Container }) => record(options)),
      extract: { canvas: vi.fn(() => 'piece') },
    });
    const look = renderer as unknown as Inside;
    renderer.show(indexScene(buildScene(withSolids(), 'robot')));
    const before = [...look.world.children];
    await renderer.exportImage({ area: 'view', scale: 1 });
    for (const { children } of seen) expect(children).toEqual(before);
  });
});
