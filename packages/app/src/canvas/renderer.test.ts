import type { ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { BitmapFont, Cache, Container, Graphics, type GraphicsContext } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import type { TextFactory } from './draw';
import type { Rect } from './geometry';
import { indexScene, type IndexedScene } from './hit';
import { CanvasRenderer, COARSE_BELOW, NAMES_FROM } from './renderer';
import { buildScene, type ElementShape, type RelationLine, type Scene } from './scene';
import { MAX_BANDS } from './tiles';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** What the renderer keeps of each tile, as far as these tests look. */
interface TileView {
  key: string;
  kind: 'shapes' | 'relations' | 'free';
  band: number;
  rank: number;
  container: Container;
  shapes: ElementShape[];
  full?: Graphics;
  coarse?: Graphics;
  labelled: number;
  level: number;
}

interface Inside {
  tiles: Map<string, TileView>;
  elementShapes: Container;
  overflowBand: Container;
  dragged: Container;
  reroutedLines: Graphics;
  selectionChunks: Graphics[];
  movingMarks: Graphics;
  world: Container;
  drag?: { rigid: ReadonlySet<string>; routed: { relation: string }[] };
}

const sample = loadSample();
let labels = 0;
/** Counts the labels made, which jsdom cannot draw. */
const counting: TextFactory = (options) => {
  labels += 1;
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function inside(renderer: CanvasRenderer): Inside {
  return renderer as unknown as Inside;
}

function shapeTiles(renderer: CanvasRenderer): TileView[] {
  return [...inside(renderer).tiles.values()].filter((tile) => tile.kind === 'shapes');
}

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
    { text: counting },
  );
  const app = FakeApplication.created.at(-1) as FakeApplication;
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

/** Draws frames until nothing is left to draw, at most `most` of them. */
function settleFrames(renderer: CanvasRenderer, most = 20): void {
  for (let frame = 0; frame < most; frame++) renderer.renderNow();
}

/** The sample with "Calendar" added directly in World, over Scheduling and the API. */
function withCalendar(stackingOrder?: ViewFile['stackingOrder']): IndexedScene {
  const project: ProjectSnapshot = {
    ...sample,
    model: {
      ...sample.model,
      elements: [
        ...sample.model.elements,
        { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
      ],
    },
    views: sample.views.map((view) => ({
      ...view,
      positions: [
        ...view.positions,
        { element: 'calendar', x: 800, y: 260, width: 180, height: 300 },
      ],
      ...(stackingOrder ? { stackingOrder } : {}),
    })),
  };
  return indexScene(buildScene(project, 'system-overview'));
}

function shapeAt(key: string, rect: Rect): ElementShape {
  const parts = key.split('/');
  return {
    key,
    element: parts.at(-1) as string,
    ...(parts.length > 1 ? { containerShape: parts.slice(0, -1).join('/') } : {}),
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Box',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
  };
}

function sceneOf(shapes: ElementShape[], drawing?: number[]): Scene {
  return {
    shapes,
    ...(drawing ? { drawing } : {}),
    relations: [],
    notes: [],
    arrows: [],
    bounds: undefined,
  };
}

/** The width of the first stroke a drawing makes. */
function strokeWidth(graphics: Graphics): number | undefined {
  const stroke = graphics.context.instructions.find((each) => each.action === 'stroke');
  return stroke?.action === 'stroke' ? stroke.data.style.width : undefined;
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  labels = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CanvasRenderer bands', () => {
  it('draws the bands in increasing order, each by region with its plain drawings under the rest', async () => {
    const renderer = await started();
    renderer.show(withCalendar());
    const { elementShapes, overflowBand } = inside(renderer);
    // Four bands, then the shapes beyond them, of which there are none.
    expect(elementShapes.children).toHaveLength(5);
    expect(elementShapes.children.at(-1)).toBe(overflowBand);
    expect(overflowBand.children).toHaveLength(0);
    for (const tile of shapeTiles(renderer)) {
      const [plain, detail] = (elementShapes.children[tile.band] as Container).children;
      expect(tile.container.parent?.parent).toBe(detail);
      expect(tile.coarse?.parent?.parent).toBe(plain);
    }
    const calendar = shapeTiles(renderer).find((tile) =>
      tile.shapes.some((shape) => shape.element === 'calendar'),
    );
    expect(calendar?.band).toBe(3);
  });

  it('draws the shapes beyond the bands above every band, each tile whole and in drawing order', async () => {
    // A staircase in which each shape lies over the ones before it: one band for each of the first
    // ones, and the rest beyond the bands.
    const shapes = Array.from({ length: MAX_BANDS + 8 }, (_, at) =>
      shapeAt(`s${at}`, { x: at * 10, y: at * 10, width: 100, height: 100 }),
    );
    const renderer = await started();
    renderer.show(
      indexScene(
        sceneOf(
          shapes,
          shapes.map((_, at) => at),
        ),
      ),
    );
    const { elementShapes, overflowBand } = inside(renderer);
    expect(elementShapes.children).toHaveLength(MAX_BANDS + 1);
    expect(elementShapes.children.at(-1)).toBe(overflowBand);
    const beyond = shapeTiles(renderer)
      .filter((tile) => tile.band === MAX_BANDS)
      .sort((a, b) => a.rank - b.rank);
    expect(beyond.flatMap((tile) => tile.shapes.map((shape) => shape.key))).toEqual(
      shapes.slice(MAX_BANDS).map((shape) => shape.key),
    );
    expect(overflowBand.children).toEqual(beyond.map((tile) => tile.container));
    for (const tile of beyond) {
      // Its plain drawing with the rest of it, and drawn on its own.
      expect(tile.coarse?.parent).toBe(tile.container);
      expect(tile.container.isRenderGroup).toBe(true);
    }
  });

  it('keeps every tile’s container when a restack only moves whole tiles to other bands', async () => {
    const shapes = [
      shapeAt('A', { x: 0, y: 0, width: 1500, height: 1000 }),
      shapeAt('A/a', { x: 1100, y: 100, width: 100, height: 50 }),
      shapeAt('B', { x: 1000, y: 600, width: 1500, height: 1000 }),
      shapeAt('B/b', { x: 2100, y: 1400, width: 100, height: 50 }),
    ];
    const renderer = await started();
    renderer.show(indexScene(sceneOf(shapes, [0, 1, 2, 3])));
    const before = new Map(
      shapeTiles(renderer).map((tile) => [tile.shapes[0]?.key, tile.container]),
    );
    renderer.show(indexScene(sceneOf(shapes, [2, 3, 0, 1])));
    const after = new Map(shapeTiles(renderer).map((tile) => [tile.shapes[0]?.key, tile]));
    for (const [key, container] of before) expect(after.get(key)?.container).toBe(container);
    expect(after.get('A')?.band).toBe(1);
    expect(after.get('B')?.band).toBe(0);
  });

  it('draws at once, in full and named, the shapes a band shift puts in new tiles', async () => {
    const renderer = await started();
    renderer.show(withCalendar());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const keys = withCalendar().scene.shapes.map((shape) => shape.key);
    expect(keys.every((key) => renderer.showsOutline(key))).toBe(true);
    labels = 0;
    // Sent to the back: {Patient, Clinic booking} and {Calendar} become {Calendar, Patient} and
    // {Clinic booking}.
    renderer.show(withCalendar({ world: ['calendar'] }));
    expect(keys.every((key) => renderer.showsOutline(key))).toBe(true);
    for (const tile of shapeTiles(renderer)) expect(tile.labelled).toBe(tile.shapes.length);
    // Calendar, Patient and Clinic booking, each with its name and its component's name.
    expect(labels).toBe(6);
  });

  it('says a shape shows its outline only once its tile draws it in full, and not far out', async () => {
    const renderer = await started();
    renderer.show(withCalendar());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    expect(renderer.showsOutline('patient')).toBe(false);
    renderer.renderNow();
    expect(renderer.showsOutline('patient')).toBe(true);
    renderer.setCamera({ x: 0, y: 0, scale: COARSE_BELOW / 2 });
    expect(renderer.showsOutline('patient')).toBe(false);
  });

  it('draws 300 tiles of one shape each in full within two frames', async () => {
    const shapes = Array.from({ length: 300 }, (_, at) =>
      shapeAt(`s${at}`, {
        x: (at % 20) * 1024 + 100,
        y: Math.floor(at / 20) * 1024 + 100,
        width: 100,
        height: 50,
      }),
    );
    // Everything on screen at a scale that draws outlines but no names.
    const renderer = await started({ width: 20 * 1024 * 0.3, height: 15 * 1024 * 0.3 });
    renderer.show(indexScene(sceneOf(shapes)));
    renderer.setCamera({ x: 0, y: 0, scale: 0.3 });
    expect(shapeTiles(renderer)).toHaveLength(300);
    renderer.renderNow();
    expect(shapeTiles(renderer).filter((tile) => tile.full)).toHaveLength(150);
    renderer.renderNow();
    expect(shapeTiles(renderer).every((tile) => tile.full)).toBe(true);
    expect(0.3).toBeLessThan(NAMES_FROM);
  });
});

describe('CanvasRenderer frames', () => {
  it('culls by where the camera is now, tiles made by an edit included', async () => {
    const renderer = await started();
    const indexed = withCalendar();
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 0.1 });
    renderer.renderNow();
    expect(shapeTiles(renderer).every((tile) => !tile.container.culled)).toBe(true);
    // Far away from everything: every tile is left out at once.
    renderer.setCamera({ x: -100_000, y: -100_000, scale: 0.1 });
    renderer.renderNow();
    expect(shapeTiles(renderer).every((tile) => tile.container.culled)).toBe(true);
    // Back, with an edit that makes new tiles: they show in the very next frame.
    renderer.setCamera({ x: 0, y: 0, scale: 0.1 });
    renderer.show(withCalendar({ world: ['calendar'] }));
    renderer.renderNow();
    expect(shapeTiles(renderer).every((tile) => !tile.container.culled)).toBe(true);
  });

  it('leaves out a tile’s full drawing once it is an eighth of a screen off, and a region half a screen', async () => {
    // Two shapes side by side: one tile, in one region.
    const shapes = [
      shapeAt('a', { x: 0, y: 0, width: 100, height: 50 }),
      shapeAt('b', { x: 200, y: 0, width: 100, height: 50 }),
    ];
    const renderer = await started();
    renderer.show(indexScene(sceneOf(shapes)));
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    renderer.renderNow();
    const [tile] = shapeTiles(renderer) as (TileView & { bounds: Rect })[];
    const region = tile?.coarse?.parent as Container;
    expect(tile?.container.culled).toBe(false);
    // The screen, 1200 wide, starts 400 past the tile: more than an eighth of its width, less than half.
    const right = (tile?.bounds.x ?? 0) + (tile?.bounds.width ?? 0);
    renderer.setCamera({ x: -(right + 400), y: 0, scale: 1 });
    renderer.renderNow();
    expect(tile?.container.culled).toBe(true);
    expect(region.culled).toBe(false);
    renderer.setCamera({ x: -(right + 700), y: 0, scale: 1 });
    renderer.renderNow();
    expect(region.culled).toBe(true);
  });

  it('leaves out of the frame whole regions of plain drawings, never one tile’s alone', async () => {
    const renderer = await started();
    renderer.show(withCalendar());
    renderer.setCamera({ x: 0, y: 0, scale: 0.1 });
    renderer.renderNow();
    const plain = shapeTiles(renderer).map((tile) => tile.coarse as Graphics);
    const regions = new Set(plain.map((drawing) => drawing.parent as Container));
    expect([...regions].every((region) => !region.culled)).toBe(true);
    renderer.setCamera({ x: -100_000, y: -100_000, scale: 0.1 });
    renderer.renderNow();
    expect([...regions].every((region) => region.culled)).toBe(true);
    expect(plain.every((drawing) => !drawing.culled)).toBe(true);
    renderer.setCamera({ x: 0, y: 0, scale: 0.1 });
    renderer.renderNow();
    expect([...regions].every((region) => !region.culled)).toBe(true);
  });

  it('hides a plain drawing under its full one by making it clear, never by leaving it out', async () => {
    const renderer = await started();
    renderer.show(withCalendar());
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    renderer.renderNow();
    const tiles = shapeTiles(renderer);
    expect(tiles.every((tile) => tile.full?.visible === true)).toBe(true);
    expect(tiles.every((tile) => tile.coarse?.visible === true && tile.coarse.alpha === 0)).toBe(
      true,
    );
    renderer.setCamera({ x: 0, y: 0, scale: COARSE_BELOW / 2 });
    renderer.renderNow();
    expect(tiles.every((tile) => tile.full?.visible === false && tile.coarse?.alpha === 1)).toBe(
      true,
    );
  });

  it('draws a long relation in the tile of each cell it crosses, and leaves out those off screen', async () => {
    const route = [
      { x: 100, y: 100 },
      { x: 10_000, y: 100 },
    ];
    const line: RelationLine = {
      relation: 'long',
      route,
      from: route[0] as { x: number; y: number },
      to: route[1] as { x: number; y: number },
      middle: { x: 5050, y: 100 },
      stroke: '#000000',
      width: 2,
      dash: 'solid',
    };
    const renderer = await started();
    renderer.show(indexScene({ ...sceneOf([]), relations: [line] }));
    const tiles = [...inside(renderer).tiles.values()].filter((tile) => tile.kind === 'relations');
    expect(tiles).toHaveLength(10);
    // Looking at the middle of the line, 1200 units across: the cells near it, and none further.
    renderer.setCamera({ x: 600 - 5000, y: 300, scale: 1 });
    renderer.renderNow();
    const shown = tiles.filter((tile) => !tile.container.culled);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(4);
  });

  it('destroys the drawings of the tiles it drops, their geometry included', async () => {
    const renderer = await started();
    renderer.show(withCalendar());
    const calendar = shapeTiles(renderer).find((tile) =>
      tile.shapes.some((shape) => shape.element === 'calendar'),
    );
    const context = calendar?.coarse?.context as GraphicsContext;
    expect(context.destroyed).toBe(false);
    renderer.show(withCalendar({ world: ['calendar'] }));
    expect(context.destroyed).toBe(true);
  });

  it('moves the camera as one transform', async () => {
    const renderer = await started();
    expect(inside(renderer).world.isRenderGroup).toBe(true);
  });

  it('draws note text again for the new zoom when a pan follows the zoom', async () => {
    vi.useFakeTimers();
    const renderer = await started();
    renderer.show(indexScene(buildScene(sample, 'system-overview')));
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    settleFrames(renderer);
    const free = inside(renderer).tiles.get('free');
    const text = free && (free as unknown as { labels: Container }).labels.children[0];
    expect(text).toBeDefined();
    // Zoomed in on the note, then panned along it before the camera rests.
    renderer.setCamera({ x: -340, y: -792, scale: 2 });
    renderer.setCamera({ x: -390, y: -792, scale: 2 });
    vi.advanceTimersByTime(500);
    expect((text as unknown as { resolution: number }).resolution).toBe(2);
  });
});

describe('CanvasRenderer selection marks', () => {
  const project = syntheticProject({ elements: 1200 });
  const indexed = indexScene(buildScene(project, 'everything'));
  const all: Selection = selectionOf(
    project.model.elements.map((element) => ({ kind: 'element', id: element.id })),
  );

  it('draws many marks again for a zoom only once the camera rests', async () => {
    vi.useFakeTimers();
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(all, undefined);
    const marks = inside(renderer).selectionChunks[0] as Graphics;
    const before = strokeWidth(marks);
    renderer.setCamera({ ...renderer.camera, scale: renderer.camera.scale * 1.1 });
    renderer.setCamera({ ...renderer.camera, scale: renderer.camera.scale * 1.1 });
    expect(strokeWidth(marks)).toBe(before);
    vi.advanceTimersByTime(500);
    expect(strokeWidth(marks)).toBeCloseTo(2 / renderer.camera.scale);
  });

  it('draws a few marks again at once for a zoom', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'system-0' }]), undefined);
    const marks = inside(renderer).selectionChunks[0] as Graphics;
    const before = strokeWidth(marks);
    renderer.setCamera({ ...renderer.camera, scale: renderer.camera.scale * 2 });
    expect(strokeWidth(marks)).toBeCloseTo((before ?? 0) / 2);
  });

  it('moves the marks of what a drag carries with it, without drawing them again', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(all, undefined);
    const keys = new Set(indexed.scene.shapes.map((shape) => shape.key));
    renderer.startDrag(keys, new Set());
    const { selectionChunks, movingMarks } = inside(renderer);
    const moving = movingMarks.context.instructions;
    expect(selectionChunks.every((chunk) => chunk.context.instructions.length === 0)).toBe(true);
    expect(moving.length).toBeGreaterThan(0);
    renderer.dragTo({ x: 40, y: 10 });
    renderer.dragTo({ x: 80, y: 20 });
    expect(movingMarks.context.instructions).toBe(moving);
    expect(movingMarks.position.x).toBe(80);
  });
});

describe('CanvasRenderer labels', () => {
  it('shows the labels written before again a few hundred a frame when zooming back in', async () => {
    const indexed = indexScene(buildScene(syntheticProject({ elements: 1200 }), 'everything'));
    // Big enough to show the whole view at a scale that shows names.
    const renderer = await started({ width: 8000, height: 6000 });
    renderer.show(indexed);
    const named = { x: 0, y: 0, scale: 0.6 };
    renderer.setCamera(named);
    settleFrames(renderer, 200);
    const shownLabels = () =>
      [...inside(renderer).tiles.values()].reduce((sum, tile) => {
        const written = (tile as unknown as { labels?: Container }).labels;
        return sum + (written?.visible ? written.children.length : 0);
      }, 0);
    const all = shownLabels();
    expect(all).toBeGreaterThan(1000);
    renderer.setCamera({ ...named, scale: 0.3 });
    renderer.renderNow();
    expect(shownLabels()).toBe(0);
    labels = 0;
    renderer.setCamera(named);
    renderer.renderNow();
    const first = shownLabels();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(all);
    settleFrames(renderer, 10);
    expect(shownLabels()).toBe(all);
    // Shown again, not written again.
    expect(labels).toBe(0);
  });
});

describe('CanvasRenderer selection marks of thousands of shapes', () => {
  it('clears only the chunks the marks drawn before used', async () => {
    const project = syntheticProject({ elements: 4500 });
    const renderer = await started();
    renderer.show(indexScene(buildScene(project, 'everything')));
    const all = selectionOf(
      project.model.elements.map((element) => ({ kind: 'element', id: element.id })),
    );
    renderer.setSelection(all, undefined);
    while (renderer.drawingMarks) renderer.renderNow();
    const chunks = inside(renderer).selectionChunks;
    expect(chunks.length).toBeGreaterThan(2);
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'system-0' }]), undefined);
    const clears = chunks.map((chunk) => vi.spyOn(chunk, 'clear'));
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'system-1' }]), undefined);
    // One chunk held the one mark; the others, already clear, are left alone.
    expect(clears.map((clear) => clear.mock.calls.length)).toEqual(
      chunks.map((_, at) => (at === 0 ? 1 : 0)),
    );
  });

  it('draws them a chunk a frame, so that no frame draws them all', async () => {
    const project = syntheticProject({ elements: 4500 });
    const renderer = await started();
    renderer.show(indexScene(buildScene(project, 'everything')));
    renderer.setSelection(
      selectionOf(project.model.elements.map((element) => ({ kind: 'element', id: element.id }))),
      undefined,
    );
    const shown = () =>
      inside(renderer).selectionChunks.filter(
        (chunk) => chunk.visible && chunk.context.instructions.length > 0,
      ).length;
    expect(shown()).toBe(1);
    renderer.renderNow();
    expect(shown()).toBe(2);
    renderer.renderNow();
    expect(shown()).toBe(3);
  });
});

describe('CanvasRenderer fonts', () => {
  const keys = ['name', 'detail', 'relation'].map((kind) => `visual-anything-${kind}-bitmap`);

  /** Installs as PixiJS does, into its cache, which warns of a key already there; draws nothing. */
  function installing() {
    return vi.spyOn(BitmapFont, 'install').mockImplementation((options) => {
      const font = {} as BitmapFont;
      Cache.set(`${options?.name ?? ''}-bitmap`, font);
      return font;
    });
  }

  afterEach(() => {
    for (const key of keys) Cache.remove(key);
  });

  it('installs the label fonts once, however many renderers start one after another', async () => {
    vi.useFakeTimers();
    const installs = installing();
    const warnings = vi.spyOn(console, 'warn');
    for (let each = 0; each < 3; each++) {
      const renderer = await started();
      // Fonts are installed just after the canvas starts.
      vi.runOnlyPendingTimers();
      renderer.destroy();
    }
    expect(installs).toHaveBeenCalledTimes(3);
    expect(warnings.mock.calls.flat().join(' ')).not.toContain('already has key');
  });

  it('keeps the fonts an earlier load of the labels left, as after a hot reload', async () => {
    // What the labels installed before a reload is still in PixiJS's cache, which is not reloaded.
    for (const key of keys) Cache.set(key, {} as BitmapFont);
    const installs = installing();
    const warnings = vi.spyOn(console, 'warn');
    // A second load of the labels, as a hot reload makes, beside the same PixiJS.
    const reloaded = './labels?reload';
    const labels = (await import(/* @vite-ignore */ reloaded)) as typeof import('./labels');
    labels.installFonts();
    labels.installFonts();
    expect(installs).not.toHaveBeenCalled();
    expect(warnings.mock.calls.flat().join(' ')).not.toContain('already has key');
  });
});

describe('CanvasRenderer drags', () => {
  const indexed = indexScene(buildScene(sample, 'system-overview'));

  it('moves selected notes with the drag, out of the tile of free shapes', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(selectionOf([{ kind: 'free-shape', id: 'calendar-note' }]), undefined);
    expect(inside(renderer).tiles.has('free')).toBe(true);
    renderer.startDrag(new Set(), new Set());
    expect(inside(renderer).tiles.has('free')).toBe(false);
    expect(inside(renderer).dragged.children.length).toBeGreaterThan(0);
    renderer.dragTo({ x: 100, y: 0 });
    expect(inside(renderer).dragged.position.x).toBe(100);
    renderer.endDrag();
    expect(inside(renderer).tiles.has('free')).toBe(true);
  });

  it('moves relations among dragged shapes with them, and routes again those to shapes that stay', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const carried = new Set(
      indexed.scene.shapes
        .filter((shape) => shape.key.startsWith('clinic-booking'))
        .map((shape) => shape.key),
    );
    const relations = new Set(indexed.scene.relations.map((line) => line.relation));
    renderer.setSelection(EMPTY_SELECTION, undefined);
    renderer.startDrag(carried, relations);
    const drag = inside(renderer).drag;
    expect([...(drag?.rigid ?? [])]).toContain('whatsapp-to-agent');
    expect(drag?.routed.map((line) => line.relation)).toEqual(['patient-to-whatsapp']);
    const rerouted = inside(renderer).reroutedLines;
    const before = rerouted.context.instructions.length;
    expect(before).toBeGreaterThan(0);
    renderer.dragTo({ x: 0, y: 300 });
    renderer.renderNow();
    // Patient stays where it is; WhatsApp went down, so the route now turns.
    const [stroke] = rerouted.context.instructions;
    expect(stroke?.action).toBe('stroke');
    expect(renderer.dragging).toBe(true);
  });

  it('ends only the drag it is told to end', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const first = renderer.startDrag(new Set(['patient']), new Set());
    const second = renderer.startDrag(new Set(['clinic-booking/whatsapp']), new Set());
    renderer.endDrag(first);
    expect(renderer.dragging).toBe(true);
    expect(renderer.showsOutline('clinic-booking/whatsapp')).toBe(false);
    renderer.endDrag(second);
    expect(renderer.dragging).toBe(false);
  });

  it('draws a drop’s change with one rebuild, leaving the end of the drag to the scene shown next', async () => {
    const renderer = await started();
    renderer.show(indexed);
    settleFrames(renderer);
    const drag = renderer.startDrag(new Set(['patient']), new Set());
    const moved = indexScene(
      buildScene(
        {
          ...sample,
          views: sample.views.map((view) => ({
            ...view,
            positions: view.positions.map((position) =>
              position.element === 'patient' ? { ...position, x: 90 } : position,
            ),
          })),
        },
        'system-overview',
      ),
    );
    const rebuilds = vi.spyOn(renderer as unknown as { rebuild: () => void }, 'rebuild');
    renderer.endDrag(drag, { redraw: false });
    expect(rebuilds).not.toHaveBeenCalled();
    renderer.show(moved);
    expect(rebuilds).toHaveBeenCalledTimes(1);
    expect(renderer.dragging).toBe(false);
    // Drawn in full at once, as it was before the drag took it out of its tile.
    expect(renderer.showsOutline('patient')).toBe(true);
  });

  it('leaves the canvas alone once destroyed, when a drag starts or ends late', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const drag = renderer.startDrag(new Set(['patient']), new Set());
    renderer.destroy();
    const removed = vi.spyOn(inside(renderer).dragged, 'removeChildren');
    const rebuilds = vi.spyOn(renderer as unknown as { rebuild: () => void }, 'rebuild');
    expect(() => renderer.endDrag(drag)).not.toThrow();
    expect(() => renderer.startDrag(new Set(['patient']), new Set())).not.toThrow();
    expect(removed).not.toHaveBeenCalled();
    expect(rebuilds).not.toHaveBeenCalled();
  });
});
