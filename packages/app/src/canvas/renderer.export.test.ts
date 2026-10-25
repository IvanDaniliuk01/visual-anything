/**
 * The renderer draws the PNG export of the open view (R27): every tile the image shows, drawn in full
 * and named for the image's scale, in pieces through PixiJS's extraction, without the marks, and the
 * canvas left as it was.
 */
import { Container, Matrix, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { selectionOf } from '../editor/selection';
import { IMAGE_CHUNK, IMAGE_MARGIN, ImageError } from '../export/image';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface TileView {
  kind: 'shapes' | 'relations' | 'free';
  container: Container;
  bounds: { x: number; y: number; width: number; height: number };
  full?: Graphics;
  coarse?: Graphics;
  labels?: Container;
  level: number;
}

interface Inside {
  tiles: Map<string, TileView>;
  world: Container;
  marks: Container;
}

const inside = (renderer: CanvasRenderer) => renderer as unknown as Inside;

/** Labels as plain containers, which jsdom can make. */
const text: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

const project = syntheticProject({ elements: 600 });
const indexed = indexScene(buildScene(project, 'everything'));

/** What each render into a piece saw: the transform, the piece's size and the state of the canvas. */
interface Rendered {
  container: unknown;
  transform: Matrix;
  size: [number, number];
  clearColor: unknown;
  marksShown: boolean;
  culled: number;
  unnamed: number;
  plain: number;
}

let rendered: Rendered[];
let drawnAt: [number, number][];
const png = new Blob(['png'], { type: 'image/png' });

async function started(): Promise<{ renderer: CanvasRenderer; app: FakeApplication }> {
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
    { text },
  );
  const app = FakeApplication.created.at(-1) as FakeApplication;
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  // What the fake application lacks of PixiJS's renderer: rendering into a texture, and extraction.
  Object.assign(app.renderer, {
    background: { colorRgba: [0.086, 0.098, 0.118, 1] },
    render: vi.fn(
      (options: {
        container: Container;
        transform: Matrix;
        target: { width: number; height: number };
        clearColor: unknown;
      }) => {
        const { tiles, marks } = inside(renderer);
        const shown = [...tiles.values()];
        rendered.push({
          container: options.container,
          transform: options.transform.clone(),
          size: [options.target.width, options.target.height],
          clearColor: options.clearColor,
          marksShown: marks.visible,
          culled: shown.filter((tile) => tile.container.culled).length,
          unnamed: shown.filter((tile) => tile.kind === 'shapes' && tile.level !== 2).length,
          plain: shown.filter((tile) => tile.kind === 'shapes' && !tile.full).length,
        });
      },
    ),
    extract: { canvas: vi.fn(() => `piece ${rendered.length}`) },
  });
  return { renderer, app };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  rendered = [];
  drawnAt = [];
  // A 2D context that records where each piece is drawn, as jsdom draws nothing.
  const context = {
    drawImage: (_image: unknown, x: number, y: number) => drawnAt.push([x, y]),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => context) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(png));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CanvasRenderer.exportImage', () => {
  it('draws the whole view, a pixel for each canvas unit, in pieces, in the canvas’s own color', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    const bounds = indexed.scene.bounds as { x: number; y: number; width: number; height: number };

    const image = await renderer.exportImage({ area: 'view', scale: 1 });

    expect(image).toBe(png);
    const width = Math.ceil(bounds.width + 2 * IMAGE_MARGIN);
    const height = Math.ceil(bounds.height + 2 * IMAGE_MARGIN);
    const columns = Math.ceil(width / IMAGE_CHUNK);
    const rows = Math.ceil(height / IMAGE_CHUNK);
    expect(rendered).toHaveLength(columns * rows);
    expect(rendered.every((each) => each.container === inside(renderer).world)).toBe(true);
    expect(rendered[0]?.clearColor).toEqual([0.086, 0.098, 0.118, 1]);
    const left = bounds.x - IMAGE_MARGIN;
    const top = bounds.y - IMAGE_MARGIN;
    expect(rendered[0]?.transform).toMatchObject({ a: 1, d: 1, tx: -left, ty: -top });
    if (columns > 1) {
      expect(rendered[1]?.transform).toMatchObject({ tx: -left - IMAGE_CHUNK, ty: -top });
      expect(drawnAt[1]).toEqual([IMAGE_CHUNK, 0]);
    }
    expect(rendered.at(-1)?.size).toEqual([
      width - (columns - 1) * IMAGE_CHUNK,
      height - (rows - 1) * IMAGE_CHUNK,
    ]);
  });

  it('draws every shape in full and named, far out and off screen too, and leaves the canvas as it was', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    renderer.renderNow();
    const { tiles } = inside(renderer);
    const culledBefore = [...tiles.values()].map((tile) => tile.container.culled);
    expect(culledBefore.some(Boolean)).toBe(true);
    const plainBefore = [...tiles.values()].filter((tile) => tile.kind === 'shapes' && !tile.full);
    expect(plainBefore.length).toBeGreaterThan(0);

    await renderer.exportImage({ area: 'view', scale: 1 });

    expect(rendered[0]).toMatchObject({ culled: 0, unnamed: 0, plain: 0 });
    expect(rendered[0]?.transform).toMatchObject({ a: 1, d: 1 });
    expect([...tiles.values()].map((tile) => tile.container.culled)).toEqual(culledBefore);
  });

  it('draws no mark of the selection, and shows them again after', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setSelection(
      selectionOf(
        project.model.elements.slice(0, 5).map((each) => ({ kind: 'element', id: each.id })),
      ),
      undefined,
    );

    await renderer.exportImage({ area: 'visible', scale: 1 });

    expect(rendered.every((each) => !each.marksShown)).toBe(true);
    expect(inside(renderer).marks.visible).toBe(true);
  });

  it('draws what is visible as the canvas shows it, at the screen’s size or twice it', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setCamera({ x: 40, y: -20, scale: 0.5 });

    await renderer.exportImage({ area: 'visible', scale: 2 });

    expect(rendered).toHaveLength(2);
    expect(rendered.map((each) => each.size)).toEqual([
      [2048, 1600],
      [352, 1600],
    ]);
    expect(rendered[0]?.transform).toMatchObject({ a: 1, d: 1, tx: 80, ty: -40 });
  });

  it('refuses an image that would be too large, drawing nothing', async () => {
    const { renderer } = await started();
    const [first, second] = indexed.scene.shapes;
    if (!first || !second) throw new Error('The synthetic view has shapes.');
    const far = {
      ...second,
      rect: { ...second.rect, x: 20_000 },
      extent: { ...second.extent, x: 20_000 },
    };
    renderer.show(
      indexScene({
        ...indexed.scene,
        shapes: [first, far],
        drawing: [0, 1],
        relations: [],
        notes: [],
        arrows: [],
        bounds: { x: 0, y: 0, width: 20_200, height: 100 },
      }),
    );

    const refused = renderer.exportImage({ area: 'view', scale: 1 });

    await expect(refused).rejects.toBeInstanceOf(ImageError);
    await expect(refused).rejects.toMatchObject({
      problem: { reason: 'too-large', width: 20_264 },
    });
    expect(rendered).toEqual([]);
  });

  it('refuses before the canvas has started', async () => {
    const host = document.createElement('div');
    const renderer = new CanvasRenderer(host, { onFailure: () => {} }, { text });

    await expect(renderer.exportImage({ area: 'view', scale: 1 })).rejects.toMatchObject({
      problem: { reason: 'not-ready' },
    });
  });
});
