/** The renderer draws pictures in its tiles, from its image platform, above the full drawings. */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Appearance, ImageDefinition } from '@visual-anything/schema';
import { Container, Graphics, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { ImagePlatform } from './images';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** A 1×1 PNG, which the core's cleaner accepts. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const PHOTO: ImageDefinition = {
  kind: 'bitmap',
  id: 'clinic.photo',
  name: 'Photo',
  format: 'png',
  width: 1,
  height: 1,
  data: PIXEL,
};

/** A platform that decodes every bitmap at once, into a blank texture. */
class FakePlatform implements ImagePlatform<Texture, object> {
  decodes = 0;
  now = () => performance.now();
  bytesOf = (base64: string) => new Uint8Array(base64.length);
  decodeBitmap = () => {
    this.decodes += 1;
    return Promise.resolve({});
  };
  loadSvg = () => Promise.resolve({});
  texture = () => new Texture({ source: Texture.WHITE.source });
  atlasTexture = () => new Texture({ source: Texture.WHITE.source });
  flush = () => undefined;
  destroyTexture = () => undefined;
  destroyPage = () => undefined;
  releasePicture = () => undefined;
}

const counting: TextFactory = () => new Container();

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

function withPhoto(shown: Record<string, Appearance['image']>): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    packages: sample.packages.map((file) =>
      file.id === 'clinic' ? { ...file, images: [PHOTO] } : file,
    ),
    model: {
      ...sample.model,
      elements: sample.model.elements.map((element) =>
        Object.hasOwn(shown, element.id)
          ? { ...element, appearance: { image: shown[element.id] } }
          : element,
      ),
    },
  };
}

async function started(platform: FakePlatform): Promise<CanvasRenderer> {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    { text: counting, images: platform },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

/** The picture drawings in the renderer's tiles: render groups just above a tile's full drawing. */
function pictureDrawings(renderer: CanvasRenderer): Graphics[] {
  const tiles = (
    renderer as unknown as { tiles: Map<string, { container: Container; full?: Graphics }> }
  ).tiles;
  const found: Graphics[] = [];
  for (const { container, full } of tiles.values()) {
    if (!full) continue;
    const next = container.children[container.getChildIndex(full) + 1];
    if (
      next &&
      !(next instanceof Graphics) &&
      next.isRenderGroup &&
      next.children[0] instanceof Graphics
    ) {
      found.push(...(next.children as Graphics[]));
    }
  }
  return found;
}

const textures = (drawings: Graphics[]) =>
  drawings.reduce(
    (sum, each) => sum + each.context.instructions.filter((one) => one.action === 'texture').length,
    0,
  );

async function frames(renderer: CanvasRenderer, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    renderer.renderNow();
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
  }
}

describe('the renderer’s pictures', () => {
  it('draws a drawing and an icon in their tiles once decoded, and none far out', async () => {
    const platform = new FakePlatform();
    const renderer = await started(platform);
    const project = withPhoto({
      whatsapp: { image: 'clinic.photo', placement: 'drawing' },
      'appointments-api': { image: 'clinic.photo' },
    });
    renderer.show(indexScene(buildScene(project, 'system-overview')));
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    await frames(renderer, 6);
    expect(platform.decodes).toBeGreaterThan(0);
    expect(textures(pictureDrawings(renderer))).toBe(2);
    renderer.setCamera({ x: 0, y: 0, scale: 0.1 });
    await frames(renderer, 2);
    for (const drawing of pictureDrawings(renderer)) expect(drawing.parent?.visible).toBe(false);
    renderer.destroy();
  });

  it('marks a drawing’s plate when it is selected, not its whole rectangle', async () => {
    const platform = new FakePlatform();
    const renderer = await started(platform);
    const project = withPhoto({ whatsapp: { image: 'clinic.photo', placement: 'drawing' } });
    const scene = buildScene(project, 'system-overview');
    renderer.show(indexScene(scene));
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'whatsapp' }]), undefined);
    await frames(renderer, 2);
    const chunks = (renderer as unknown as { selectionChunks: Graphics[] }).selectionChunks;
    const marked = chunks[0]?.context.bounds;
    const whatsapp = scene.shapes.find((shape) => shape.element === 'whatsapp');
    expect(marked && whatsapp?.plate && marked.width).toBeLessThan(whatsapp?.rect.width ?? 0);
    renderer.destroy();
  });
});
