/**
 * The canvas in the person's theme (ADR-0033): what a switch draws again and when it shows, and how a
 * recolor restyles tiles in place.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { Color, Container, type Graphics, type GraphicsContext } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEMES } from '../theme/themes';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import type { TextFactory } from './draw';
import type { Rect } from './geometry';
import { indexScene, type IndexedScene } from './hit';
import { CanvasRenderer, type RendererCallbacks, type RendererOptions } from './renderer';
import { buildScene, type ElementShape, type Scene } from './scene';
import { SWAP_WITHIN } from './theme/restyle';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** What the renderer keeps of each tile, as far as these tests look. */
interface TileView {
  key: string;
  kind: 'shapes' | 'relations' | 'free';
  container: Container;
  shapes: ElementShape[];
  full?: Graphics;
  coarse?: Graphics;
  casing?: Graphics;
  labels?: Container;
  fullStamp: string;
}

interface Inside {
  tiles: Map<string, TileView>;
  dragged: Container;
  rebuild(): void;
}

const VIEW = 'system-overview';
// Containers drawn as their kind, in their built-in colors; regions are `clean.test.ts`'s (A5.2).
const loaded = loadSample();
const sample = {
  ...loaded,
  project: { ...loaded.project, drawing: { containers: { drawn: 'as-kind' as const } } },
};
const DARK = THEMES.dark.canvas;
const LIGHT = THEMES.light.canvas;

/** Labels as plain containers named by their text, which jsdom can make. */
const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function inside(renderer: CanvasRenderer): Inside {
  return renderer as unknown as Inside;
}

function tiles(renderer: CanvasRenderer): TileView[] {
  return [...inside(renderer).tiles.values()];
}

function appOf(): FakeApplication {
  return FakeApplication.created.at(-1) as FakeApplication;
}

function makeRenderer(
  options: RendererOptions = {},
  callbacks: Partial<RendererCallbacks> = {},
  size = { width: 1200, height: 800 },
): CanvasRenderer {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: size.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: size.height });
  return new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
      ...callbacks,
    },
    { text: counting, ...options },
  );
}

async function ready(renderer: CanvasRenderer): Promise<CanvasRenderer> {
  appOf().finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

function settleFrames(renderer: CanvasRenderer, most = 20): void {
  for (let frame = 0; frame < most; frame++) renderer.renderNow();
}

/** Draws frames until a switch or a recolor shows; says how many it took. */
function untilShown(renderer: CanvasRenderer): number {
  for (let frame = 1; frame <= SWAP_WITHIN + 2; frame++) {
    renderer.renderNow();
    if (!renderer.switching) return frame;
  }
  throw new Error('The switch never showed.');
}

/** A clock that runs out after every look at it, so that each frame restyles one tile only. */
function slowClock(): void {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
}

/** The colors a drawing fills and strokes with, in order. */
function colorsOf(context: GraphicsContext): string[] {
  return context.instructions.map((instruction) => {
    const { color } = (instruction.data as { style: { color: number } }).style;
    return `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
  });
}

function contextsOf(renderer: CanvasRenderer): Map<TileView, (GraphicsContext | undefined)[]> {
  return new Map(tiles(renderer).map((tile) => [tile, [tile.coarse?.context, tile.full?.context]]));
}

function sampleIndexed(project: ProjectSnapshot = sample): IndexedScene {
  return indexScene(buildScene(project, VIEW));
}

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function tileOf(renderer: CanvasRenderer, element: string): TileView {
  const tile = tiles(renderer).find((each) =>
    each.shapes.some((shape) => shape.element === element),
  );
  if (!tile) throw new Error(`No tile draws ${element}.`);
  return tile;
}

function shapeAt(key: string, rect: Rect, dark?: ElementShape['dark']): ElementShape {
  return {
    key,
    element: key,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Box',
    kind: 'rectangle',
    fill: '#FFE8D6',
    stroke: '#8A4B12',
    ...(dark ? { dark } : {}),
    rect,
    extent: rect,
    holdsContents: false,
  };
}

function sceneOf(shapes: ElementShape[], extra: Partial<Scene> = {}): Scene {
  return { shapes, relations: [], notes: [], arrows: [], bounds: undefined, ...extra };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CanvasRenderer themes', () => {
  it('starts in the theme it is given, and in one given before it started', async () => {
    const shown: string[] = [];
    const renderer = makeRenderer({ theme: DARK }, { onThemeShown: (theme) => shown.push(theme) });
    expect(appOf().initOptions?.background).toBe(DARK.background);
    // Before the start is done, a theme is only kept: PixiJS has no background to set yet.
    expect(() => renderer.setTheme(LIGHT)).not.toThrow();
    await ready(renderer);
    expect(appOf().renderer.background?.color).toBe(LIGHT.background);
    expect(renderer.theme).toBe('light');
    expect(shown).toEqual(['light']);
  });

  it('draws built-in colors in their dark shades, and stored colors as stored', async () => {
    const renderer = await ready(makeRenderer({ theme: DARK }));
    renderer.show(sampleIndexed());
    const scheduling = tileOf(renderer, 'scheduling');
    const dark = scheduling.shapes.find((shape) => shape.element === 'scheduling')?.dark;
    expect(dark).toBeDefined();
    expect(colorsOf(scheduling.coarse?.context as GraphicsContext)).toContain(dark?.fill);
    expect(colorsOf(scheduling.coarse?.context as GraphicsContext)).not.toContain('#F3F5F8');

    const stored = await ready(makeRenderer({ theme: DARK }));
    stored.show(indexScene(sceneOf([shapeAt('a', { x: 0, y: 0, width: 100, height: 50 })])));
    const [tile] = tiles(stored);
    expect(colorsOf(tile?.coarse?.context as GraphicsContext)).toContain('#FFE8D6');
  });

  it('switches without building the scene again, and shows it all in one frame', async () => {
    const shown: string[] = [];
    const renderer = await ready(makeRenderer({}, { onThemeShown: (theme) => shown.push(theme) }));
    shown.length = 0;
    renderer.show(sampleIndexed());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const before = contextsOf(renderer);
    const background = appOf().renderer.background;
    const rebuild = vi.spyOn(inside(renderer), 'rebuild');
    const built = appOf().renderer.graphicsContext.built;

    slowClock();
    renderer.setTheme(DARK);
    renderer.renderNow();
    // Drawn behind what shows: nothing changed yet.
    expect(renderer.switching).toBe(true);
    expect(background?.color).toBe(LIGHT.background);
    for (const [tile, contexts] of before) {
      expect([tile.coarse?.context, tile.full?.context]).toEqual(contexts);
    }
    expect(shown).toEqual([]);

    untilShown(renderer);
    expect(background?.color).toBe(DARK.background);
    expect(shown).toEqual(['dark']);
    // Every tile on screen that follows the theme shows its new drawing.
    const scheduling = tileOf(renderer, 'scheduling');
    expect(scheduling.full?.context).not.toBe(before.get(scheduling)?.[1]);
    expect(colorsOf(scheduling.full?.context as GraphicsContext)).toContain('#1C2027');
    // Casings and relation labels take the dark canvas's colors.
    const relations = tiles(renderer).filter((tile) => tile.kind === 'relations' && tile.casing);
    expect(relations.length).toBeGreaterThan(0);
    for (const tile of relations) {
      expect(tile.casing?.tint).toBe(new Color(DARK.background).toNumber());
    }
    const named = relations.flatMap((tile) => tile.labels?.children ?? []);
    expect(named.length).toBeGreaterThan(0);
    for (const label of named) {
      expect(label.tint).toBe(new Color(DARK.relationLabelText).toNumber());
    }
    // Their geometry was built ahead, never by building the scene again.
    expect(appOf().renderer.graphicsContext.built).toBeGreaterThan(built);
    expect(rebuild).not.toHaveBeenCalled();
    expect(renderer.stats.swapAfter.at(-1)).toBeGreaterThan(1);
  });

  it('tints the names again when it switches back', async () => {
    const renderer = await ready(makeRenderer());
    renderer.show(sampleIndexed());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    renderer.setTheme(DARK);
    untilShown(renderer);
    renderer.setTheme(LIGHT);
    untilShown(renderer);
    const scheduling = tileOf(renderer, 'scheduling');
    const name = scheduling.labels?.children.find((label) => label.label === 'Scheduling');
    // Dark text on the light theme's System fill.
    expect(name?.tint).toBe(new Color('#1F2933').toNumber());
  });

  it('keeps the drawings of tiles in stored colors as they are', async () => {
    const shown: string[] = [];
    const renderer = await ready(makeRenderer({}, { onThemeShown: (theme) => shown.push(theme) }));
    renderer.show(
      indexScene(
        sceneOf([
          shapeAt('a', { x: 0, y: 0, width: 100, height: 50 }),
          shapeAt('b', { x: 300, y: 0, width: 100, height: 50 }),
        ]),
      ),
    );
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const before = contextsOf(renderer);
    renderer.setTheme(DARK);
    expect(untilShown(renderer)).toBe(1);
    for (const [tile, contexts] of before) {
      expect([tile.coarse?.context, tile.full?.context]).toEqual(contexts);
    }
    expect(shown.at(-1)).toBe('dark');
  });

  it('keeps a stale full drawing off screen, and draws it again before it shows', async () => {
    const dark = { fill: '#172B45', stroke: '#78A8EE' };
    const renderer = await ready(makeRenderer());
    renderer.show(
      indexScene(
        sceneOf([
          shapeAt('near', { x: 100, y: 100, width: 100, height: 50 }, dark),
          shapeAt('far', { x: 20_000, y: 100, width: 100, height: 50 }, dark),
        ]),
      ),
    );
    // Seen close up at both, so that both are drawn in full.
    renderer.setCamera({ x: -19_900, y: 0, scale: 1 });
    settleFrames(renderer);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const far = tileOf(renderer, 'far');
    const full = far.full;
    const context = full?.context;
    expect(full).toBeDefined();

    renderer.setTheme(DARK);
    untilShown(renderer);
    // Off screen, it keeps its drawing until it comes near.
    expect(far.full).toBe(full);
    expect(far.full?.context).toBe(context);

    renderer.setCamera({ x: -19_900, y: 0, scale: 1 });
    renderer.renderNow();
    expect(far.full).toBe(full);
    expect(far.full?.context).not.toBe(context);
    expect(colorsOf(far.full?.context as GraphicsContext)).toContain(dark.fill);
    expect(renderer.stats.staleShown).toBe(0);
    expect(renderer.stats.fallbacks).toBe(0);
  });

  it('draws again what a drag carries when a switch shows', async () => {
    const renderer = await ready(makeRenderer());
    const indexed = sampleIndexed();
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const shape = indexed.scene.shapes.find((each) => each.element === 'booking-agent');
    renderer.startDrag(new Set([shape?.key as string]), new Set());
    renderer.dragTo({ x: 40, y: 0 });
    const { dragged } = inside(renderer);
    const carried = [...dragged.children];
    expect(carried.length).toBeGreaterThan(0);
    renderer.setTheme(DARK);
    untilShown(renderer);
    expect(dragged.children.length).toBeGreaterThan(0);
    expect(dragged.children.some((child) => carried.includes(child))).toBe(false);
    expect(dragged.position.x).toBe(40);
  });

  it('shows nothing of a switch taken back before it showed', async () => {
    const shown: string[] = [];
    const renderer = await ready(makeRenderer({}, { onThemeShown: (theme) => shown.push(theme) }));
    shown.length = 0;
    renderer.show(sampleIndexed());
    settleFrames(renderer);
    renderer.setTheme(DARK);
    renderer.setTheme(LIGHT);
    untilShown(renderer);
    expect(appOf().renderer.background?.color).toBe(LIGHT.background);
    expect(renderer.theme).toBe('light');
    expect(shown).toEqual([]);
  });
});

describe('CanvasRenderer recolors', () => {
  it('restyles in place a tile whose shapes changed only their colors', async () => {
    const shown: string[] = [];
    const renderer = await ready(makeRenderer({}, { onThemeShown: (theme) => shown.push(theme) }));
    shown.length = 0;
    renderer.show(sampleIndexed());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const tile = tileOf(renderer, 'booking-agent');
    const { container, full } = tile;
    const context = full?.context;
    const rebuilt = applied(sample, {
      type: 'update-element',
      id: 'booking-agent',
      changes: { appearance: { fill: '#FFD8A8' } },
    });
    renderer.show(sampleIndexed(rebuilt));
    // The same tile, still showing what it showed, until its new drawing is ready.
    expect(tileOf(renderer, 'booking-agent')).toBe(tile);
    expect(tile.container).toBe(container);
    expect(tile.full).toBe(full);
    expect(tile.full?.context).toBe(context);
    untilShown(renderer);
    expect(tile.full?.context).not.toBe(context);
    expect(colorsOf(tile.full?.context as GraphicsContext)).toContain('#FFD8A8');
    expect(renderer.stats.fallbacks).toBe(0);
    expect(shown).toEqual([]);
  });

  it('restyles in place the tile of free shapes when a note changes only its colors', async () => {
    const renderer = await ready(makeRenderer());
    renderer.show(sampleIndexed());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const free = tiles(renderer).find((tile) => tile.kind === 'free') as TileView;
    const context = free.full?.context;
    const view = sample.views.find((each) => each.id === VIEW);
    const note = view?.freeShapes.find((shape) => shape.kind === 'note');
    if (!note) throw new Error('The sample has no note.');
    const recolored = applied(sample, {
      type: 'update-free-shape',
      view: VIEW,
      shape: { ...note, fill: '#D3F9D8' },
    });
    renderer.show(sampleIndexed(recolored));
    expect(tiles(renderer).find((tile) => tile.kind === 'free')).toBe(free);
    expect(free.full?.context).toBe(context);
    untilShown(renderer);
    expect(colorsOf(free.full?.context as GraphicsContext)).toContain('#D3F9D8');
  });

  it('makes a tile again when what it draws moved, as before', async () => {
    const renderer = await ready(makeRenderer());
    renderer.show(sampleIndexed());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const tile = tileOf(renderer, 'booking-agent');
    const shape = tile.shapes.find((each) => each.element === 'booking-agent') as ElementShape;
    const moved = applied(sample, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        {
          element: 'booking-agent',
          ...(shape.container === undefined ? {} : { container: shape.container }),
          x: shape.offset.x + 8,
          y: shape.offset.y,
        },
      ],
    });
    renderer.show(sampleIndexed(moved));
    expect(tileOf(renderer, 'booking-agent')).not.toBe(tile);
  });
});
