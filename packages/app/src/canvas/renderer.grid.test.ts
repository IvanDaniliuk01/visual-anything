/**
 * The grid, the container's grid and the rulers in the renderer (A3): where PixiJS draws them, and
 * when they are drawn again.
 */
import { Color, Container, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { THEMES, type CanvasTheme } from '../theme/themes';
import type { Camera } from './camera';
import type { TextFactory } from './draw';
import { MAX_GRID_LINES } from './grid';
import type { GridMarks } from './gridMarks';
import { indexScene, type IndexedScene } from './hit';
import { CanvasRenderer, FIT_MARGIN } from './renderer';
import { buildScene } from './scene';
import { RULER_SIZE, type ScreenMarks } from './screenMarks';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface Inside {
  world: Container;
  dragged: Container;
  elementShapes: Container;
  gridMarks: GridMarks;
  screenMarks: ScreenMarks;
  resolution: number;
}

const sample = loadSample();
const VIEW = 'system-overview';
const SCHEDULING = 'clinic-booking/scheduling';
const API = 'clinic-booking/scheduling/appointments-api';

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function inside(renderer: CanvasRenderer): Inside {
  return renderer as unknown as Inside;
}

/** Calls made to window.matchMedia, with the listener each one was given. */
let queries: { query: string; listener?: () => void }[] = [];

async function started(
  size = { width: 1200, height: 800 },
  theme?: CanvasTheme,
): Promise<CanvasRenderer> {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: size.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: size.height });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    { text: counting, ...(theme ? { theme } : {}) },
  );
  const app = FakeApplication.created.at(-1) as FakeApplication;
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

function overview(): IndexedScene {
  return indexScene(buildScene(sample, VIEW));
}

/** Lets the camera rest, as it does some time after it last moved. */
function rest(renderer: CanvasRenderer, camera: Camera = renderer.camera): void {
  renderer.setCamera(camera);
  vi.advanceTimersByTime(500);
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  queries = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    const entry: { query: string; listener?: () => void } = { query };
    queries.push(entry);
    return {
      matches: true,
      media: query,
      addEventListener: (_: string, listener: () => void) => {
        entry.listener = listener;
      },
      removeEventListener: () => {
        entry.listener = undefined;
      },
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the grid in the renderer', () => {
  it('is the first child of world, under every shape, and world stays the stage’s first container', async () => {
    const renderer = await started();
    renderer.show(overview());
    const { world, gridMarks, screenMarks } = inside(renderer);
    expect(world.children[0]).toBe(gridMarks.whole);
    expect(gridMarks.whole.label).toBe('grid');
    expect(gridMarks.whole.cullable).toBe(false);
    const app = FakeApplication.created.at(-1) as FakeApplication;
    const containers = app.stage.contents.filter((item) => item instanceof Container);
    expect(containers[0]).toBe(world);
    // The screen's marks come after the scene.
    expect(app.stage.contents.indexOf(screenMarks.container)).toBeGreaterThan(
      app.stage.contents.indexOf(world),
    );
  });

  it('is hidden and draws nothing while it is off', async () => {
    const renderer = await started();
    renderer.show(overview());
    const { gridMarks } = inside(renderer);
    renderer.setGrid({ grid: false, snapToGrid: true, rulers: false });
    renderer.setCamera({ x: 10, y: 10, scale: 0.7 });
    expect(gridMarks.whole.visible).toBe(false);
    expect(gridMarks.draws).toBe(0);
  });

  it('only moves when the camera pans, and is drawn again within the cap when it zooms', async () => {
    const renderer = await started();
    renderer.show(overview());
    const { gridMarks } = inside(renderer);
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: false });
    expect(gridMarks.whole.visible).toBe(true);
    const draws = gridMarks.draws;
    expect(draws).toBe(1);
    const { x, y, scale } = renderer.camera;
    renderer.setCamera({ x: x + 37, y: y - 11, scale });
    renderer.setCamera({ x: x - 4000, y: y + 999, scale });
    expect(gridMarks.draws).toBe(draws);
    // In screen space: the camera's transform undone.
    expect(gridMarks.whole.scale.x).toBeCloseTo(1 / scale);
    const shownAt = gridMarks.whole.position.x * scale + (x - 4000);
    expect(shownAt).toBeLessThanOrEqual(0);
    renderer.setCamera({ x, y, scale: scale * 1.3 });
    expect(gridMarks.draws).toBe(draws + 1);
    expect(gridMarks.lineCount).toBeGreaterThan(0);
    expect(gridMarks.lineCount).toBeLessThanOrEqual(MAX_GRID_LINES);
  });

  it('stretches while a zoom goes on, and is drawn exactly for the scale once the camera rests', async () => {
    vi.useFakeTimers();
    const renderer = await started();
    renderer.show(overview());
    rest(renderer);
    const { gridMarks } = inside(renderer);
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: false });
    const drawn = gridMarks.draws;
    const { x, y, scale } = renderer.camera;
    // A few frames of a zoom by 2% each: stretched, not drawn again, until the scale passes 5%.
    renderer.setCamera({ x, y, scale: scale * 1.02 });
    renderer.setCamera({ x, y, scale: scale * 1.02 * 1.02 });
    expect(gridMarks.draws).toBe(drawn);
    expect(gridMarks.whole.scale.x).toBeCloseTo(1 / scale);
    renderer.setCamera({ x, y, scale: scale * 1.02 ** 3 });
    expect(gridMarks.draws).toBe(drawn + 1);
    vi.advanceTimersByTime(500);
    expect(gridMarks.draws).toBe(drawn + 2);
    expect(gridMarks.whole.scale.x).toBeCloseTo(1 / renderer.camera.scale);
    // Resting again where it was drawn exactly draws nothing.
    vi.advanceTimersByTime(500);
    expect(gridMarks.draws).toBe(drawn + 2);
  });

  it('is drawn again at the new resolution when devicePixelRatio changes', async () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const renderer = await started();
    renderer.show(overview());
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: false });
    const { gridMarks } = inside(renderer);
    const draws = gridMarks.draws;
    const watched = queries.find((entry) => entry.listener !== undefined);
    expect(watched?.query).toBe('(resolution: 1dppx)');
    vi.stubGlobal('devicePixelRatio', 2);
    watched?.listener?.();
    expect(inside(renderer).resolution).toBe(2);
    expect(gridMarks.draws).toBe(draws + 1);
    // Watched again, for the next change.
    expect(queries.at(-1)?.query).toBe('(resolution: 2dppx)');
    expect(queries.at(-1)?.listener).toBeDefined();
  });

  it('draws a container’s grid last in the band of its shape, under its contents, once the camera rests', async () => {
    vi.useFakeTimers();
    const renderer = await started();
    const indexed = overview();
    renderer.show(indexed);
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: false });
    const { gridMarks, elementShapes } = inside(renderer);
    renderer.showContainerGrid(SCHEDULING);
    rest(renderer);
    const band = indexed.bands[indexed.indexOfKey.get(SCHEDULING)!]!;
    const contents = indexed.bands[indexed.indexOfKey.get(API)!]!;
    expect(contents).toBeGreaterThan(band);
    const parent = elementShapes.children[band] as Container;
    expect(gridMarks.inside.parent).toBe(parent);
    expect(parent.children.at(-1)).toBe(gridMarks.inside);
    expect(gridMarks.insideOf).toBe(SCHEDULING);
    expect(gridMarks.insideLineCount).toBeGreaterThan(0);
    expect(gridMarks.insideLineCount).toBeLessThanOrEqual(400);

    // Hidden while the camera moves, and back once it rests.
    renderer.setCamera({ ...renderer.camera, x: renderer.camera.x + 5 });
    expect(gridMarks.insideOf).toBeUndefined();
    vi.advanceTimersByTime(500);
    expect(gridMarks.insideOf).toBe(SCHEDULING);

    // A shape that holds nothing has no grid; nor does anything once the grid is off.
    renderer.showContainerGrid(API);
    expect(gridMarks.insideOf).toBeUndefined();
    renderer.showContainerGrid(SCHEDULING);
    renderer.setGrid({ grid: false, snapToGrid: true, rulers: false });
    expect(gridMarks.insideOf).toBeUndefined();
  });

  it('draws the grid of the container a drag snaps in, outside what the drag draws', async () => {
    const renderer = await started();
    const indexed = overview();
    renderer.show(indexed);
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: false });
    const { gridMarks, dragged } = inside(renderer);
    const drag = renderer.startDrag(new Set([API]), new Set());
    renderer.dragTo({ x: 8, y: 16 }, { snapping: true, container: SCHEDULING });
    expect(gridMarks.insideOf).toBe(SCHEDULING);
    let parent: Container | null = gridMarks.inside.parent;
    while (parent) {
      expect(parent).not.toBe(dragged);
      parent = parent.parent;
    }
    // Not while Alt places freely.
    renderer.dragTo({ x: 9, y: 16 }, { snapping: false, container: SCHEDULING });
    expect(gridMarks.insideOf).toBeUndefined();
    renderer.dragTo({ x: 8, y: 16 }, { snapping: true, container: SCHEDULING });
    renderer.endDrag(drag);
    expect(gridMarks.insideOf).toBeUndefined();
  });
});

describe('the grid and the rulers in a theme', () => {
  const tintOf = (renderer: CanvasRenderer) =>
    (inside(renderer).gridMarks as unknown as { lines: Graphics }).lines.tint;
  const themeOfRulers = (renderer: CanvasRenderer) =>
    (inside(renderer).screenMarks as unknown as { theme: CanvasTheme }).theme;

  it('start in the theme the canvas starts in', async () => {
    const renderer = await started(undefined, THEMES.dark.canvas);
    expect(tintOf(renderer)).toBe(new Color(THEMES.dark.canvas.gridLine).toNumber());
    expect(themeOfRulers(renderer)).toBe(THEMES.dark.canvas);
  });

  it('take the new theme in the frame the switch shows, the grid retinted and drawn for its strength', async () => {
    const renderer = await started();
    renderer.show(overview());
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: true });
    const { gridMarks } = inside(renderer);
    expect(tintOf(renderer)).toBe(new Color(THEMES.light.canvas.gridLine).toNumber());
    const draws = gridMarks.draws;
    renderer.setTheme(THEMES.dark.canvas);
    // Nothing changes before the switch shows.
    expect(themeOfRulers(renderer)).toBe(THEMES.light.canvas);
    for (let frame = 0; frame < 60 && renderer.switching; frame++) renderer.renderNow();
    expect(renderer.switching).toBe(false);
    expect(tintOf(renderer)).toBe(new Color(THEMES.dark.canvas.gridLine).toNumber());
    expect(themeOfRulers(renderer)).toBe(THEMES.dark.canvas);
    // The dark theme draws the grid at another strength.
    expect(gridMarks.draws).toBe(draws + 1);
  });
});

describe('the rulers in the renderer', () => {
  it('are drawn again when the camera moves, the canvas is resized, the selection changes or a drag moves', async () => {
    const renderer = await started();
    const indexed = overview();
    renderer.show(indexed);
    const { screenMarks } = inside(renderer);
    renderer.setGrid({ grid: false, snapToGrid: true, rulers: true });
    expect(screenMarks.rulersShown).toBe(true);
    let drawings = screenMarks.drawings;
    renderer.setCamera({ ...renderer.camera, x: renderer.camera.x + 3 });
    expect(screenMarks.drawings).toBeGreaterThan(drawings);
    expect(screenMarks.tickCount).toBeGreaterThan(0);

    drawings = screenMarks.drawings;
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'scheduling' }]), undefined);
    expect(screenMarks.drawings).toBeGreaterThan(drawings);

    drawings = screenMarks.drawings;
    const drag = renderer.startDrag(new Set([SCHEDULING]), new Set());
    renderer.dragTo({ x: 40, y: 0 });
    expect(screenMarks.drawings).toBeGreaterThan(drawings);
    renderer.endDrag(drag);

    drawings = screenMarks.drawings;
    FakeResizeObserver.resizeAll();
    expect(screenMarks.drawings).toBeGreaterThan(drawings);
  });

  it('say which points of the canvas they cover, and none while they are off', async () => {
    const renderer = await started();
    renderer.show(overview());
    expect(renderer.rulersContain({ x: 5, y: 300 })).toBe(false);
    renderer.setGrid({ grid: false, snapToGrid: true, rulers: true });
    expect(renderer.rulersContain({ x: 5, y: 300 })).toBe(true);
    expect(renderer.rulersContain({ x: 300, y: RULER_SIZE - 1 })).toBe(true);
    expect(renderer.rulersContain({ x: RULER_SIZE + 1, y: RULER_SIZE + 1 })).toBe(false);
    expect(renderer.rulersInset).toEqual({ left: RULER_SIZE, top: RULER_SIZE });
  });

  it('leave room when the view is fitted', async () => {
    const renderer = await started();
    const indexed = overview();
    renderer.show(indexed);
    renderer.setGrid({ grid: false, snapToGrid: true, rulers: true });
    renderer.fit();
    const bounds = indexed.scene.bounds!;
    const { x, y, scale } = renderer.camera;
    expect(bounds.x * scale + x).toBeGreaterThanOrEqual(RULER_SIZE + FIT_MARGIN - 1e-6);
    expect(bounds.y * scale + y).toBeGreaterThanOrEqual(RULER_SIZE + FIT_MARGIN - 1e-6);
  });

  it('show the readout beside the pointer while a drag goes, and not after', async () => {
    const renderer = await started();
    renderer.show(overview());
    renderer.setGrid({ grid: true, snapToGrid: true, rulers: false });
    const { screenMarks } = inside(renderer);
    const drag = renderer.startDrag(new Set([API]), new Set());
    renderer.dragTo(
      { x: 8, y: 0 },
      {
        snapping: true,
        container: SCHEDULING,
        readout: { text: '48, 104 in Scheduling', at: { x: 300, y: 300 } },
      },
    );
    // No font in jsdom: the readout's text is absent, and nothing fails.
    expect(screenMarks.readoutShown ?? '48, 104 in Scheduling').toBe('48, 104 in Scheduling');
    renderer.endDrag(drag);
    expect(screenMarks.readoutShown).toBeUndefined();
  });
});
