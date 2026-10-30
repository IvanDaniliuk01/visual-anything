/**
 * The renderer draws Claude's pictures (ADR 0081) through the PNG export's path, at the size the tool
 * gives: a frame of the view at so many pixels a canvas unit, in pieces, without the marks, names
 * written as the canvas writes them at that zoom, and the canvas left as it was: its camera, what it
 * culls and its marks. It says what it draws from, for a canvas off screen.
 */
import { Container, Matrix } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { selectionOf } from '../editor/selection';
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
  full?: unknown;
  level: number;
}

interface Inside {
  tiles: Map<string, TileView>;
  marks: Container;
}

const inside = (renderer: CanvasRenderer) => renderer as unknown as Inside;

const text: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

const project = syntheticProject({ elements: 600 });
const indexed = indexScene(buildScene(project, 'everything'));

interface Rendered {
  transform: Matrix;
  size: [number, number];
  marksShown: boolean;
  unnamed: number;
}

let rendered: Rendered[];
const png = new Blob(['png'], { type: 'image/png' });

async function started(): Promise<{ renderer: CanvasRenderer; host: HTMLElement }> {
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
    { text, firstFit: 'whole' },
  );
  const app = FakeApplication.created.at(-1) as FakeApplication;
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  Object.assign(app.renderer, {
    background: { colorRgba: [1, 1, 1, 1] },
    render: vi.fn((options: { transform: Matrix; target: { width: number; height: number } }) => {
      const shown = [...inside(renderer).tiles.values()];
      rendered.push({
        transform: options.transform.clone(),
        size: [options.target.width, options.target.height],
        marksShown: inside(renderer).marks.visible,
        unnamed: shown.filter((tile) => tile.kind === 'shapes' && tile.level !== 2).length,
      });
    }),
    extract: { canvas: vi.fn(() => `piece ${rendered.length}`) },
  });
  return { renderer, host };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  rendered = [];
  const context = { drawImage: () => undefined };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => context) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(png));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CanvasRenderer.captureImage', () => {
  it('draws the frame given at the pixels a unit given, at the size given', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    const frame = { x: 100, y: 50, width: 800, height: 400 };

    const drawn = await renderer.captureImage({
      frame,
      pixelsPerUnit: 1.5,
      width: 1200,
      height: 600,
      asShown: false,
      whole: false,
    });

    expect(drawn).toEqual({ blob: png, width: 1200, height: 600 });
    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.size).toEqual([1200, 600]);
    expect(rendered[0]?.transform).toMatchObject({ a: 1.5, d: 1.5, tx: -150, ty: -75 });
  });

  it('writes names as the canvas would at the picture’s zoom: none far out, all at 1:1', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    const bounds = indexed.scene.bounds as { x: number; y: number; width: number; height: number };
    const whole = { frame: bounds, asShown: false, whole: true };

    await renderer.captureImage({
      ...whole,
      pixelsPerUnit: 0.05,
      width: Math.ceil(bounds.width * 0.05),
      height: Math.ceil(bounds.height * 0.05),
    });
    expect(rendered[0]?.unnamed).toBeGreaterThan(0);

    rendered = [];
    await renderer.captureImage({ ...whole, pixelsPerUnit: 1, width: 1000, height: 1000 });
    expect(rendered[0]?.unnamed).toBe(0);
  });

  it('draws no mark, and leaves the canvas as it was: camera, culling, marks and host', async () => {
    const { renderer, host } = await started();
    renderer.show(indexed);
    renderer.setCamera({ x: 30, y: 20, scale: 0.7 });
    renderer.setSelection(
      selectionOf(
        project.model.elements.slice(0, 3).map((each) => ({ kind: 'element', id: each.id })),
      ),
      undefined,
    );
    renderer.renderNow();
    const culled = [...inside(renderer).tiles.values()].map((tile) => tile.container.culled);
    const children = [...host.children];

    await renderer.captureImage({
      frame: { x: 0, y: 0, width: 500, height: 500 },
      pixelsPerUnit: 2,
      width: 1000,
      height: 1000,
      asShown: false,
      whole: false,
    });

    expect(rendered.every((each) => !each.marksShown)).toBe(true);
    expect(inside(renderer).marks.visible).toBe(true);
    expect(renderer.camera).toEqual({ x: 30, y: 20, scale: 0.7 });
    expect([...inside(renderer).tiles.values()].map((tile) => tile.container.culled)).toEqual(
      culled,
    );
    expect([...host.children]).toEqual(children);
  });

  it('refuses before the canvas has started', async () => {
    const renderer = new CanvasRenderer(document.createElement('div'), { onFailure: () => {} });
    await expect(
      renderer.captureImage({
        frame: { x: 0, y: 0, width: 10, height: 10 },
        pixelsPerUnit: 1,
        width: 10,
        height: 10,
        asShown: false,
        whole: true,
      }),
    ).rejects.toMatchObject({ problem: { reason: 'not-ready' } });
  });

  it('says what it draws from: the scene, the emphasis, the legend, code’s drawings, a comparison', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    const emphasis = { dimmed: new Set(['x']) };
    renderer.setEmphasis(emphasis);
    const legend = { overlays: [] } as never;
    renderer.setLegend(legend);
    const drawings = new Map();
    renderer.setCodeDrawings(drawings);

    expect(renderer.drawnFrom).toEqual({
      indexed,
      emphasis,
      legend,
      codeDrawings: drawings,
    });
    expect(renderer.drawnFrom.indexed).toBe(indexed);
  });
});
