/**
 * The renderer draws the PNG export of the open view (R27): every tile the image shows, drawn in full
 * and named for the image's scale, in pieces through PixiJS's extraction, without the marks, and the
 * canvas left as it was; its formulas drawn once Math's families are installed (ADR 0106).
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { Container, Matrix, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withMathDetail } from '../bench/math';
import { syntheticProject } from '../bench/synthetic';
import { selectionOf } from '../editor/selection';
import { IMAGE_CHUNK, IMAGE_MARGIN, ImageError } from '../export/image';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { withFakeMathFonts } from '../test/math-fonts';
import type { TextFactory } from './draw';
import { EmphasisLabel, emphasisLabel } from './emphasisLabels';
import { forgetMathFonts, mathFontInstalled, mathFontsPending } from './mathFonts';
import { indexScene } from './hit';
import { CanvasRenderer } from './renderer';
import { buildScene, type ElementShape } from './scene';
import { meets } from './spatial';
import { TILE } from './tiles';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface TileView {
  kind: 'shapes' | 'relations' | 'free';
  shapes: ElementShape[];
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
  /** How many glyphs the labels draw, whether Fraktur's family was installed and any was on its way. */
  mathGlyphs: number;
  fraktur: boolean;
  pending: boolean;
}

let rendered: Rendered[];
let drawnAt: [number, number][];
const png = new Blob(['png'], { type: 'image/png' });

async function started(
  factory: TextFactory = text,
): Promise<{ renderer: CanvasRenderer; app: FakeApplication }> {
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
    { text: factory, firstFit: 'whole' },
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
          mathGlyphs: shown.reduce((sum, tile) => sum + glyphQuads(tile.labels), 0),
          fraktur: mathFontInstalled('Fraktur-Regular'),
          pending: mathFontsPending(),
        });
      },
    ),
    extract: { canvas: vi.fn(() => `piece ${rendered.length}`) },
  });
  return { renderer, app };
}

/** How many glyph quads the emphasis labels in a container draw. */
function glyphQuads(container: Container | undefined): number {
  let count = 0;
  for (const child of container?.children ?? []) {
    if (child instanceof EmphasisLabel) {
      count += child.glyphs.context.instructions.filter((each) => each.action === 'texture').length;
    } else count += glyphQuads(child);
  }
  return count;
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
  forgetMathFonts();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as { fonts?: unknown }).fonts;
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

  it('plans every cell for an image of the whole view, and lets go after of what it drew far off', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    // Every shape made again where it was: the cells away from the screen are planned only later.
    const again = indexScene({
      ...indexed.scene,
      shapes: indexed.scene.shapes.map((shape) => ({ ...shape })),
    });
    renderer.show(again);
    renderer.renderNow();
    const tiles = () => [...inside(renderer).tiles.values()];
    const shapes = new Set(again.scene.shapes);
    const current = () => tiles().every((tile) => tile.shapes.every((each) => shapes.has(each)));
    expect(current()).toBe(false);

    await renderer.exportImage({ area: 'view', scale: 1 });

    // Drawn whole, in full and named, from the scene as it is.
    expect(rendered[0]).toMatchObject({ culled: 0, unnamed: 0, plain: 0 });
    expect(current()).toBe(true);
    // Only the tiles near the screen keep what the image drew of them: the screen, half a cell around.
    const near = { x: -TILE / 2, y: -TILE / 2, width: 1200 + TILE, height: 800 + TILE };
    const kept = tiles().filter((tile) => tile.full || tile.labels);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((tile) => meets(tile.bounds, near))).toBe(true);
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

/** Details with runs drawn as the bitmap labels draw them, by their glyph quads; the rest plain. */
const withDetails: TextFactory = (options, kind, room, runs) =>
  runs && kind === 'detail'
    ? emphasisLabel(runs, {
        x: options.x ?? 0,
        y: options.y ?? 0,
        anchor: { x: 0, y: 0 },
        size: 11,
        width: 400,
        align: 'left',
        room,
        fill: '#000000',
      })
    : text(options, kind, room, runs);

/**
 * The synthetic view with a formula in every detail: Math's italic in all of them, and Fraktur only
 * in the last elements', past the formulas a scene's opening scans for their families.
 */
function withLateFraktur(project: ProjectSnapshot): ProjectSnapshot {
  const math = withMathDetail(project, { math: true });
  const elements = math.model.elements;
  return {
    ...math,
    views: project.views,
    model: {
      ...math.model,
      elements: elements.map((element, at) => ({
        ...element,
        attributes: {
          ...element.attributes,
          formula: at >= elements.length - 20 ? String.raw`$\mathfrak{A}$` : '$x$',
        },
      })),
    },
  };
}

describe('CanvasRenderer.exportImage with Math (ADR 0106)', () => {
  const late = indexScene(buildScene(withLateFraktur(project), 'everything'));

  it('waits for the families its drawing asks for, and draws again with their glyphs', async () => {
    const made = withFakeMathFonts({ tasks: 'run' });
    const { renderer } = await started(withDetails);
    renderer.show(late);
    // The families of the formulas the scene's opening scans are installed; Fraktur is not wanted.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mathFontInstalled('Math-Italic')).toBe(true);
    expect(mathFontsPending()).toBe(false);
    expect(made.faces.some((face) => face.family.endsWith('Fraktur-Regular'))).toBe(false);

    await renderer.exportImage({ area: 'view', scale: 1 });

    // Drawn twice: the first draw asked for Fraktur; the second, once it was installed, has its glyphs.
    const pieces = rendered.length / 2;
    expect(Number.isInteger(pieces)).toBe(true);
    expect(rendered.slice(0, pieces).every((each) => !each.fraktur)).toBe(true);
    expect(rendered.slice(pieces).every((each) => each.fraktur)).toBe(true);
    const glyphs = (from: Rendered[]) => Math.max(...from.map((each) => each.mathGlyphs));
    expect(glyphs(rendered.slice(pieces))).toBeGreaterThan(glyphs(rendered.slice(0, pieces)));
    expect(mathFontsPending()).toBe(false);
  });

  it('waits for families still loading before it draws', async () => {
    withFakeMathFonts({ tasks: 'run', loading: 100 });
    const { renderer } = await started(withDetails);
    // Every detail with a formula, and none of the benchmark's notes.
    const math = { ...withMathDetail(project, { math: true }), views: project.views };
    renderer.show(indexScene(buildScene(math, 'everything')));
    expect(mathFontsPending()).toBe(true);

    await renderer.exportImage({ area: 'view', scale: 1 });

    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((each) => !each.pending && each.mathGlyphs > 0)).toBe(true);
  });

  it('does not wait again for a family that fails', async () => {
    withFakeMathFonts({ tasks: 'run', failing: ['Fraktur-Regular'] });
    const { renderer } = await started(withDetails);
    renderer.show(late);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const image = await renderer.exportImage({ area: 'view', scale: 1 });

    // Drawn again once Fraktur failed, and no more.
    expect(image).toBe(png);
    expect(mathFontInstalled('Fraktur-Regular')).toBe(false);
    expect(mathFontsPending()).toBe(false);
    expect(Number.isInteger(rendered.length / 2)).toBe(true);
    rendered = [];
    await renderer.exportImage({ area: 'view', scale: 1 });
    const pieces = rendered.length;
    rendered = [];
    await renderer.exportImage({ area: 'view', scale: 1 });
    expect(rendered).toHaveLength(pieces);
    expect(mathFontsPending()).toBe(false);
  });
});
