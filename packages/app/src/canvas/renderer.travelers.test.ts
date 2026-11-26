/**
 * The renderer's travelers (ADR 0110): drawn in their own layer above the relations' tiles, moving
 * while they are on screen, still under reduced motion and in a view that keeps them still, hidden
 * in one that hides them, and drawn still in the PNG export.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { ImageDefinition } from '@visual-anything/schema';
import { Container, Texture, type Sprite } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { TRAVELERS_VIEW, withTravelers } from '../test/travelers';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { ImagePlatform } from './images';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';
import { lengthOf } from './route';
import type { TravelerLayer } from './travelerLayer';
import { carriesAt, travelerCount } from './travelers';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** A 1×1 PNG, which the core's cleaner accepts. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PARCEL: ImageDefinition = {
  kind: 'bitmap',
  id: 'clinic.parcel',
  name: 'Parcel',
  format: 'png',
  width: 1,
  height: 1,
  data: PIXEL,
};

/** A platform that decodes every bitmap at once, into a blank texture. */
class FakePlatform implements ImagePlatform<Texture, object> {
  now = () => performance.now();
  bytesOf = (base64: string) => new Uint8Array(base64.length);
  decodeBitmap = () => Promise.resolve({});
  loadSvg = () => Promise.resolve({});
  texture = () => new Texture({ source: Texture.WHITE.source });
  atlasTexture = () => new Texture({ source: Texture.WHITE.source });
  flush = () => undefined;
  destroyTexture = () => undefined;
  destroyPage = () => undefined;
  releasePicture = () => undefined;
}

const text: TextFactory = () => new Container();

/** The sample whose relations send the parcel, in a view that says `travelers`. */
function project(travelers?: 'still' | 'hidden'): ProjectSnapshot {
  const base = withTravelers({ image: 'clinic.parcel' });
  return {
    ...base,
    packages: base.packages.map((file) =>
      file.id === 'clinic' ? { ...file, images: [...(file.images ?? []), PARCEL] } : file,
    ),
    views: base.views.map((view) =>
      view.id === TRAVELERS_VIEW && travelers ? { ...view, travelers } : view,
    ),
  };
}

interface Inside {
  travelers: TravelerLayer;
  world: Container;
  relations: { container: Container };
  frame: number;
}
const inside = (renderer: CanvasRenderer) => renderer as unknown as Inside;

let reduced = false;

async function started(): Promise<CanvasRenderer> {
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
    { text, images: new FakePlatform(), firstFit: 'whole', reducedMotion: () => reduced },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

/** Draws frames until the pictures are decoded and made. */
async function settle(renderer: CanvasRenderer): Promise<void> {
  for (let round = 0; round < 6; round++) {
    renderer.renderNow();
    await new Promise((done) => setTimeout(done, 0));
  }
}

const shownSprites = (renderer: CanvasRenderer) =>
  (inside(renderer).travelers.container.children as Sprite[]).filter((each) => each.visible);

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // No frame is drawn on its own: the tests draw them.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  reduced = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the renderer’s travelers', () => {
  it('lie in a layer of their own, just above the relations’ tiles', async () => {
    const renderer = await started();
    const { world, relations, travelers } = inside(renderer);
    expect(world.getChildIndex(travelers.container)).toBe(
      world.getChildIndex(relations.container) + 1,
    );
    expect(travelers.container.isRenderGroup).toBe(true);
  });

  it('move along their lines on screen, asking for frames while they do', async () => {
    const renderer = await started();
    renderer.show(indexScene(buildScene(project(), TRAVELERS_VIEW)));
    await settle(renderer);
    expect(shownSprites(renderer).length).toBeGreaterThan(0);
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(10_000);
    inside(renderer).frame = 0;
    renderer.renderNow();
    const before = shownSprites(renderer).map((each) => each.x + each.y);
    expect(inside(renderer).frame).not.toBe(0);
    now.mockReturnValue(10_100);
    inside(renderer).frame = 0;
    renderer.renderNow();
    expect(shownSprites(renderer).map((each) => each.x + each.y)).not.toEqual(before);
  });

  it('stand still under reduced motion and in a view that keeps them still', async () => {
    const renderer = await started();
    renderer.show(indexScene(buildScene(project(), TRAVELERS_VIEW)));
    reduced = true;
    await settle(renderer);
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(10_000);
    renderer.renderNow();
    const still = shownSprites(renderer).map((each) => [each.x, each.y]);
    expect(still.length).toBeGreaterThan(0);
    now.mockReturnValue(20_000);
    renderer.renderNow();
    expect(shownSprites(renderer).map((each) => [each.x, each.y])).toEqual(still);

    reduced = false;
    renderer.setTravelers('still');
    now.mockReturnValue(30_000);
    renderer.renderNow();
    expect(shownSprites(renderer).map((each) => [each.x, each.y])).toEqual(still);
  });

  it('are hidden in a view that hides them', async () => {
    const renderer = await started();
    renderer.show(indexScene(buildScene(project(), TRAVELERS_VIEW)));
    await settle(renderer);
    expect(shownSprites(renderer).length).toBeGreaterThan(0);
    renderer.setTravelers('hidden');
    renderer.renderNow();
    expect(shownSprites(renderer)).toEqual([]);
  });

  it('go where the emphasis hides their lines', async () => {
    const renderer = await started();
    const scene = buildScene(project(), TRAVELERS_VIEW);
    renderer.show(indexScene(scene));
    await settle(renderer);
    const all = shownSprites(renderer).length;
    renderer.setEmphasis({ hidden: new Set(scene.relations.map((line) => line.relation)) });
    renderer.renderNow();
    expect(shownSprites(renderer).length).toBeLessThan(all);
  });
});

describe('travelers in the PNG', () => {
  it('are drawn still within the image, and the canvas draws them as it showed them after', async () => {
    const renderer = await started();
    const app = FakeApplication.created.at(-1) as FakeApplication;
    renderer.show(indexScene(buildScene(project(), TRAVELERS_VIEW)));
    await settle(renderer);
    const seen: { visible: boolean; drawn: number }[] = [];
    const { travelers } = inside(renderer);
    Object.assign(app.renderer, {
      background: { colorRgba: [1, 1, 1, 1] },
      render: () =>
        seen.push({ visible: travelers.container.visible, drawn: travelers.drawn.length }),
      extract: { canvas: () => document.createElement('canvas') },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      drawImage: () => undefined,
    })) as unknown as HTMLCanvasElement['getContext']);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
      done(new Blob(['png'])),
    );
    const scene = buildScene(project(), TRAVELERS_VIEW);
    // The whole view at scale 1, drawn as a screen at scale 1 shows it.
    const expected = scene.relations.reduce(
      (sum, line) =>
        line.traveler && carriesAt(lengthOf(line.route), line.traveler.size, 1)
          ? sum + travelerCount(lengthOf(line.route), line.traveler)
          : sum,
      0,
    );
    expect(expected).toBeGreaterThan(0);
    await renderer.exportImage({ area: 'view', scale: 1 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((each) => each.visible && each.drawn === expected)).toBe(true);
  });

  it('are left out of an image of a view that hides them', async () => {
    const renderer = await started();
    const app = FakeApplication.created.at(-1) as FakeApplication;
    renderer.show(indexScene(buildScene(project(), TRAVELERS_VIEW)));
    renderer.setTravelers('hidden');
    await settle(renderer);
    const { travelers } = inside(renderer);
    const seen: number[] = [];
    Object.assign(app.renderer, {
      background: { colorRgba: [1, 1, 1, 1] },
      render: () => seen.push(travelers.drawn.length),
      extract: { canvas: () => document.createElement('canvas') },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      drawImage: () => undefined,
    })) as unknown as HTMLCanvasElement['getContext']);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
      done(new Blob(['png'])),
    );
    await renderer.exportImage({ area: 'view', scale: 1 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((each) => each === 0)).toBe(true);
  });
});
