/**
 * How the renderer spreads its work over frames: after a change that touches most of the view it
 * plans at once only the cells near the screen, the others before they come near or while the camera
 * rests, and ends with the tiles a plan of the whole view makes; a switch far out shows each region
 * of plain drawings put together behind the one that showed; and a frame draws again what a switch
 * left off screen only in what its own work leaves of its clock.
 */
import { Container, type Graphics, type GraphicsContext } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import { THEMES } from '../theme/themes';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import type { TextFactory } from './draw';
import type { Point, Rect } from './geometry';
import { indexScene, type IndexedScene } from './hit';
import { CanvasRenderer, COARSE_BELOW } from './renderer';
import { midpointOf } from './route';
import { meets } from './spatial';
import { buildScene, type ElementShape, type RelationLine } from './scene';
import { SWAP_WITHIN } from './theme/restyle';
import { TILE } from './tiles';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** What the renderer keeps of each tile, as far as these tests look. */
interface TileView {
  key: string;
  signature: string;
  kind: 'shapes' | 'relations' | 'free';
  cell: string;
  container: Container;
  bounds: Rect;
  shapes: ElementShape[];
  touching: RelationLine[];
  coarse?: Graphics;
  full?: Graphics;
}

interface Inside {
  tiles: Map<string, TileView>;
  shadows: Map<Container, unknown>;
}

const DARK = THEMES.dark.canvas;
/** Cells across and down the spread-out view. */
const SIDE = 12;

/** Labels as plain containers, which jsdom can make. */
const text: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

const inside = (renderer: CanvasRenderer) => renderer as unknown as Inside;
const tilesOf = (renderer: CanvasRenderer) => [...inside(renderer).tiles.values()];

async function started(size = { width: 1200, height: 800 }): Promise<CanvasRenderer> {
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
    { text, firstFit: 'whole' },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
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

function lineAlong(relation: string, route: Point[]): RelationLine {
  return {
    relation,
    route,
    from: route[0] as Point,
    to: route.at(-1) as Point,
    middle: midpointOf(route),
    stroke: '#000000',
    width: 2,
    dash: 'solid',
  };
}

/**
 * A view of a shape and a short relation in every cell of `SIDE` by `SIDE`, and a relation along each
 * row, everything `by` units to the right of where it is at 0.
 */
function spread(by = 0): IndexedScene {
  const shapes: ElementShape[] = [];
  const relations: RelationLine[] = [];
  for (let row = 0; row < SIDE; row++) {
    for (let column = 0; column < SIDE; column++) {
      const x = column * TILE + 100 + by;
      const y = row * TILE + 100;
      shapes.push(shapeAt(`s${row}-${column}`, { x, y, width: 100, height: 50 }));
      relations.push(
        lineAlong(`r${row}-${column}`, [
          { x: x + 200, y: y + 300 },
          { x: x + 600, y: y + 300 },
        ]),
      );
    }
    relations.push(
      lineAlong(`row${row}`, [
        { x: 50 + by, y: row * TILE + 700 },
        { x: SIDE * TILE - 50 + by, y: row * TILE + 700 },
      ]),
    );
  }
  return indexScene({
    shapes,
    relations,
    notes: [],
    arrows: [],
    bounds: { x: by, y: 0, width: SIDE * TILE, height: SIDE * TILE },
  });
}

/** Every tile, by key, with what it draws: the same for two renderers that drew the same scene. */
function planOf(renderer: CanvasRenderer): Map<string, string> {
  return new Map(
    tilesOf(renderer)
      .filter((tile) => tile.kind !== 'free')
      .map((tile) => [tile.key, `${tile.cell} ${tile.signature}`]),
  );
}

/** Whether every tile draws only what this scene holds. */
function drawsOnly(tiles: readonly TileView[], indexed: IndexedScene): boolean {
  const shapes = new Set(indexed.scene.shapes);
  const lines = new Set(indexed.scene.relations);
  return tiles.every(
    (tile) =>
      tile.shapes.every((shape) => shapes.has(shape)) &&
      tile.touching.every((line) => lines.has(line)),
  );
}

/** What the screen shows of the canvas, in canvas units. */
function screenOf(renderer: CanvasRenderer): Rect {
  const { x, y, scale } = renderer.camera;
  const { width, height } = renderer.viewport;
  return { x: -x / scale, y: -y / scale, width: width / scale, height: height / scale };
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

describe('CanvasRenderer planning near the screen', () => {
  it('plans at once only the cells near the screen, and the rest while the camera rests', async () => {
    vi.useFakeTimers();
    const before = spread();
    const after = spread(10);
    const whole = await started();
    whole.show(after);
    const full = planOf(whole);

    const renderer = await started();
    // Fitted, the first scene is planned whole.
    renderer.show(before);
    expect(drawsOnly(tilesOf(renderer), before)).toBe(true);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    // Everything moved: only the cells around the screen are planned at once.
    renderer.show(after);
    const fresh = tilesOf(renderer).filter((tile) => drawsOnly([tile], after));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThan(full.size / 4);
    const screen = screenOf(renderer);
    const shown = tilesOf(renderer).filter((tile) => meets(tile.bounds, screen));
    expect(drawsOnly(shown, after)).toBe(true);

    // While the camera rests, the rest a region at a time, until the tiles are those of a whole plan.
    vi.advanceTimersByTime(1000);
    for (let frame = 0; frame < 100; frame++) renderer.renderNow();
    expect(drawsOnly(tilesOf(renderer), after)).toBe(true);
    expect(planOf(renderer)).toEqual(full);
  });

  it('plans the cells a pan brings near before the frame draws them', async () => {
    const before = spread();
    const after = spread(10);
    const renderer = await started();
    renderer.show(before);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    renderer.show(after);
    renderer.renderNow();
    // Far across the view, at once, with the camera still moving.
    renderer.setCamera({ x: -8 * TILE, y: -8 * TILE, scale: 1 });
    renderer.renderNow();
    const screen = screenOf(renderer);
    const showing = tilesOf(renderer).filter(
      (tile) => !tile.container.culled && meets(tile.bounds, screen),
    );
    expect(showing.length).toBeGreaterThan(0);
    expect(drawsOnly(showing, after)).toBe(true);
    // What lies further off is still to be planned.
    expect(drawsOnly(tilesOf(renderer), after)).toBe(false);
  });
});

describe('CanvasRenderer switches far out', () => {
  it('shows each region of plain drawings whole, put together behind the one that showed', async () => {
    const renderer = await started();
    renderer.show(indexScene(buildScene(loadSample(), 'system-overview')));
    renderer.setCamera({ x: 0, y: 0, scale: COARSE_BELOW / 2 });
    for (let frame = 0; frame < 10; frame++) renderer.renderNow();
    const shapeTiles = tilesOf(renderer).filter((tile) => tile.kind === 'shapes');
    const regions = new Set(shapeTiles.map((tile) => tile.coarse?.parent as Container));
    const contexts = new Map(shapeTiles.map((tile) => [tile, tile.coarse?.context]));

    renderer.setTheme(DARK);
    let shadowed = false;
    let frames = 0;
    while (renderer.switching && frames < SWAP_WITHIN + 2) {
      renderer.renderNow();
      frames += 1;
      if (renderer.switching && inside(renderer).shadows.size > 0) shadowed = true;
    }
    expect(renderer.switching).toBe(false);
    // Put together a frame before it showed, hidden.
    expect(shadowed).toBe(true);
    expect(inside(renderer).shadows.size).toBe(0);
    // The tiles in built-in colors show their new drawings, in copies of their regions, which left.
    const drawnAgain = shapeTiles.filter((tile) => tile.coarse?.context !== contexts.get(tile));
    expect(drawnAgain.length).toBeGreaterThan(0);
    for (const tile of drawnAgain) {
      expect(regions.has(tile.coarse?.parent as Container)).toBe(false);
      expect(tile.coarse?.parent?.visible).toBe(true);
    }
    const left = [...regions].filter((region) => region.parent === null);
    expect(left.length).toBeGreaterThan(0);
    expect(renderer.stats.staleShown).toBe(0);
  });
});

describe('CanvasRenderer catching up while the camera rests', () => {
  const dark = { fill: '#172B45', stroke: '#78A8EE' };

  /** A switch shown with one tile on screen and one far off it, both drawn in full before. */
  async function switchedWithOneFar() {
    vi.useFakeTimers();
    const renderer = await started();
    renderer.show(
      indexScene({
        shapes: [
          shapeAt('near', { x: 100, y: 100, width: 100, height: 50 }, dark),
          shapeAt('far', { x: 20_000, y: 100, width: 100, height: 50 }, dark),
        ],
        relations: [],
        notes: [],
        arrows: [],
        bounds: undefined,
      }),
    );
    renderer.setCamera({ x: -19_900, y: 0, scale: 1 });
    for (let frame = 0; frame < 5; frame++) renderer.renderNow();
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    for (let frame = 0; frame < 5; frame++) renderer.renderNow();
    renderer.setTheme(DARK);
    while (renderer.switching) renderer.renderNow();
    const far = tilesOf(renderer).find((tile) => tile.shapes[0]?.key === 'far') as TileView;
    return { renderer, far, context: far.full?.context as GraphicsContext };
  }

  it('draws again what is off screen in what the frame leaves of its clock', async () => {
    const { renderer, far, context } = await switchedWithOneFar();
    expect(far.full?.context).toBe(context);
    // A clock that stands still: the frame's own work takes none of it.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.advanceTimersByTime(1000);
    renderer.renderNow();
    expect(far.full?.context).not.toBe(context);
  });

  it('waits, to draw again what is off screen, until nothing else happens on the canvas', async () => {
    const { renderer, far, context } = await switchedWithOneFar();
    // At rest, but every frame kept busy: nothing is drawn again yet.
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
    vi.advanceTimersByTime(1000);
    expect(far.full?.context).toBe(context);
    // A selection made now: the frames it asks for are the person's, however idle.
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'near' }]), undefined);
    clock.mockReturnValue(0);
    renderer.renderNow();
    expect(far.full?.context).toBe(context);
    vi.advanceTimersByTime(1000);
    renderer.renderNow();
    expect(far.full?.context).not.toBe(context);
  });

  it('draws nothing more again in a frame its own work keeps busy', async () => {
    const { renderer, far, context } = await switchedWithOneFar();
    // A clock on which every look takes 10 ms: the frame's work uses up its time.
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
    vi.advanceTimersByTime(1000);
    renderer.renderNow();
    renderer.renderNow();
    expect(far.full?.context).toBe(context);
    // Brought on screen, it is drawn again before it shows, whatever the clock.
    renderer.setCamera({ x: -19_900, y: 0, scale: 1 });
    renderer.renderNow();
    expect(far.full?.context).not.toBe(context);
    expect(renderer.stats.staleShown).toBe(0);
  });
});
