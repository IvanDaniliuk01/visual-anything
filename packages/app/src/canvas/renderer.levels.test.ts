/**
 * Levels of detail on the canvas (ADR 0055): tiles hold shapes of one set of levels, each tile shows
 * what its level shows at the scale, entering a level at its scale and leaving it 10% below, and
 * shapes without levels keep the canvas's own steps.
 */
import type { LevelOfDetail } from '@visual-anything/schema';
import { Container, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import type { TextFactory } from './draw';
import type { Rect } from './geometry';
import { indexScene } from './hit';
import { CanvasRenderer, COARSE_BELOW } from './renderer';
import type { ElementShape, Scene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface TileView {
  key: string;
  kind: 'shapes' | 'relations' | 'free';
  shapes: ElementShape[];
  full?: Graphics;
  labels?: Container;
  level: number;
  labelled: number;
  plainShown: boolean;
  imagesHidden?: boolean;
}

const named: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function shapeTiles(renderer: CanvasRenderer): TileView[] {
  const { tiles } = renderer as unknown as { tiles: Map<string, TileView> };
  return [...tiles.values()].filter((tile) => tile.kind === 'shapes');
}

function tileOf(renderer: CanvasRenderer, key: string): TileView {
  const tile = shapeTiles(renderer).find((each) => each.shapes.some((shape) => shape.key === key));
  if (!tile) throw new Error(`No tile draws ${key}.`);
  return tile;
}

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
    { text: named },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

function shapeAt(key: string, rect: Rect, levels?: LevelOfDetail[]): ElementShape {
  return {
    key,
    element: key,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Box',
    detail: 'Box',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
    ...(levels ? { levels } : {}),
  };
}

function sceneOf(shapes: ElementShape[]): Scene {
  return { shapes, relations: [], notes: [], arrows: [], bounds: undefined };
}

/** Draws frames until nothing is left to draw. */
function settle(renderer: CanvasRenderer): void {
  for (let frame = 0; frame < 20; frame++) renderer.renderNow();
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const EARLY: LevelOfDetail[] = [{ from: 0.05, shows: ['name'] }];
const LATE: LevelOfDetail[] = [
  { from: 0.5, shows: ['name'] },
  { from: 2, shows: ['name', 'detail', 'image'] },
];

describe('levels of detail by tile', () => {
  it('puts shapes of one set of levels in tiles of their own', async () => {
    const renderer = await started();
    renderer.show(
      indexScene(
        sceneOf([
          shapeAt('plain', { x: 0, y: 0, width: 100, height: 50 }),
          shapeAt('early', { x: 200, y: 0, width: 100, height: 50 }, EARLY),
          shapeAt('late', { x: 400, y: 0, width: 100, height: 50 }, LATE),
          shapeAt('late too', { x: 600, y: 0, width: 100, height: 50 }, [...LATE]),
        ]),
      ),
    );
    expect(tileOf(renderer, 'plain').key).toBe('shapes 0 0,0');
    expect(tileOf(renderer, 'early').key).toBe('shapes 0 0,0 lod=0.05:n');
    // Equal levels share a tile, whatever object holds them.
    expect(tileOf(renderer, 'late').shapes.map((shape) => shape.key)).toEqual(['late', 'late too']);
  });

  it('shows what each tile’s level shows, far out too, and the canvas’s own steps for the rest', async () => {
    const renderer = await started();
    renderer.show(
      indexScene(
        sceneOf([
          shapeAt('plain', { x: 0, y: 0, width: 100, height: 50 }),
          shapeAt('early', { x: 200, y: 0, width: 100, height: 50 }, EARLY),
        ]),
      ),
    );
    renderer.setCamera({ x: 0, y: 0, scale: COARSE_BELOW / 2 });
    settle(renderer);
    // Far out, the canvas draws plain blocks; the early level names its shapes there already.
    expect(tileOf(renderer, 'plain').plainShown).toBe(true);
    expect(renderer.showsOutline('plain')).toBe(false);
    const early = tileOf(renderer, 'early');
    expect(early.plainShown).toBe(false);
    expect(renderer.showsOutline('early')).toBe(true);
    expect(early.level).toBe(1);
    expect(early.labels?.visible).toBe(true);
    expect(early.labels?.children.map((label) => label.label)).toEqual(['early']);
    // Its level shows no picture.
    expect(early.imagesHidden).toBe(true);
  });

  it('enters a level at its scale and leaves it only 10% below, without flicker', async () => {
    const renderer = await started();
    renderer.show(
      indexScene(sceneOf([shapeAt('late', { x: 0, y: 0, width: 100, height: 50 }, LATE)])),
    );
    const camera = (scale: number) => {
      renderer.setCamera({ x: 0, y: 0, scale });
      settle(renderer);
      return tileOf(renderer, 'late');
    };
    // Below its first level, a silhouette; just below it, still one, on the way in.
    expect(camera(0.3).plainShown).toBe(true);
    expect(camera(0.49).plainShown).toBe(true);
    // Entered at its scale.
    let tile = camera(0.5);
    expect(tile.plainShown).toBe(false);
    expect(tile.level).toBe(1);
    // Hovering just below it keeps it.
    for (const scale of [0.47, 0.49, 0.46, 0.451]) {
      tile = camera(scale);
      expect(tile.plainShown).toBe(false);
      expect(tile.labels?.visible).toBe(true);
    }
    // Left 10% below it.
    expect(camera(0.44).plainShown).toBe(true);
    expect(renderer.showsOutline('late')).toBe(false);
    // The next level, with details and pictures, from 2; kept down to 1.8.
    tile = camera(2);
    expect(tile.level).toBe(2);
    expect(tile.imagesHidden).toBe(false);
    expect(camera(1.81).level).toBe(2);
    expect(camera(1.79).level).toBe(1);
  });

  it('starts a tile afresh when its shapes take other levels', async () => {
    const renderer = await started();
    const at = { x: 0, y: 0, width: 100, height: 50 };
    renderer.show(indexScene(sceneOf([shapeAt('late', at, LATE)])));
    renderer.setCamera({ x: 0, y: 0, scale: 0.5 });
    settle(renderer);
    expect(tileOf(renderer, 'late').plainShown).toBe(false);
    renderer.show(indexScene(sceneOf([shapeAt('late', at, [{ from: 1, shows: ['name'] }])])));
    settle(renderer);
    const tile = tileOf(renderer, 'late');
    expect(tile.key).toBe('shapes 0 0,0 lod=1:n');
    expect(tile.plainShown).toBe(true);
  });
});
