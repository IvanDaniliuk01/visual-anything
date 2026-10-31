import {
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { Container, Graphics } from 'pixi.js';
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import type { Emphasis } from '../editor/emphasis';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import type { TextFactory } from './draw';
import { hitAt, indexScene, type IndexedScene } from './hit';
import { DIMMED_ALPHA } from './colors';
import { MARK_UNIT, type LitLines, type MarkerDiscs } from './emphasisMarks';
import { CanvasRenderer, emphasize } from './renderer';
import { pointAlong } from './route';
import { buildScene, shapeKeyOf, shownBy, standsFor, type RelationLine, type Scene } from './scene';
import { MAX_TILE_LINES, MAX_TILE_SHAPES } from './tiles';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface TileView {
  key: string;
  kind: 'shapes' | 'relations' | 'free';
  signature: string;
  dim: boolean;
  container: Container;
  shapes: { key: string }[];
  lines: { relation: string }[];
  coarse?: { alpha: number };
}

interface Inside {
  tiles: Map<string, TileView>;
  tileOfShape: Map<string, TileView>;
  tilesOfLine: Map<string, Set<TileView>>;
  emphasisShapeMarks: Graphics;
  litLines: LitLines;
  markerMarks: Graphics;
  markerDiscs: MarkerDiscs;
}

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function inside(renderer: CanvasRenderer): Inside {
  return renderer as unknown as Inside;
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
    { text: counting, firstFit: 'whole' },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

/**
 * What the tiles draw, in an order that does not depend on how they were made, once every cell is
 * planned: a change that plans only the cells near the screen plans the others later.
 */
function drawnBy(renderer: CanvasRenderer): string[] {
  (renderer as unknown as { planEverything(): void }).planEverything();
  const { tiles, tileOfShape, tilesOfLine } = inside(renderer);
  const rows = [...tiles.values()].map(
    (tile) =>
      `${tile.kind} ${tile.key} ${tile.dim} ${tile.container.alpha} ${tile.coarse?.alpha} ${tile.signature} ${
        tile.kind === 'relations' ? tile.lines.map((line) => line.relation).join(',') : ''
      }`,
  );
  for (const [key, tile] of tileOfShape) rows.push(`shape ${key} in ${tile.key}`);
  for (const [key, each] of tilesOfLine) {
    for (const tile of each) rows.push(`line ${key} in ${tile.key}`);
  }
  return rows.sort();
}

const sample = loadSample();
const VIEW = 'system-overview';

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('CanvasRenderer after an edit', () => {
  it('plans again only the tiles a rename or a move touches', async () => {
    const big = syntheticProject({ elements: 600 });
    const renderer = await started();
    renderer.show(indexScene(buildScene(big, 'everything')));
    const before = new Map([...inside(renderer).tiles].map(([key, tile]) => [key, tile.container]));
    const renamed = executeCommand(big, {
      type: 'update-element',
      id: 'element-3-3',
      changes: { name: 'Renamed' },
    });
    if (!renamed.ok) throw new Error('The rename was refused.');
    renderer.show(indexScene(buildScene(renamed.state, 'everything')));
    const changed = [...inside(renderer).tiles].filter(
      ([key, tile]) => before.get(key) !== tile.container,
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]?.[1].shapes.some((shape) => shape.key === 'system-3/element-3-3')).toBe(true);

    const fresh = await started();
    fresh.show(indexScene(buildScene(renamed.state, 'everything')));
    expect(drawnBy(renderer)).toEqual(drawnBy(fresh));
  });

  it('shares out a crowded cell in chunks, and draws what a renderer made afresh draws after edits', async () => {
    // Two hundred Services to a cell, side by side: each cell's tiles are drawn in chunks.
    let project = syntheticProject({ elements: 1_200, overlap: 'grid' });
    const renderer = await started();
    renderer.show(indexScene(buildScene(project, 'everything')));
    const tiles = [...inside(renderer).tiles.values()];
    expect(tiles.some((tile) => tile.key.includes(' #'))).toBe(true);
    expect(tiles.every((tile) => tile.shapes.length <= MAX_TILE_SHAPES)).toBe(true);
    expect(
      tiles
        .filter((tile) => tile.kind === 'relations')
        .every((tile) => tile.lines.length <= MAX_TILE_LINES),
    ).toBe(true);
    const step = fc.oneof(
      fc.record({
        kind: fc.constant('move' as const),
        shape: fc.nat(1_199),
        dx: fc.integer({ min: -1_500, max: 1_500 }),
        dy: fc.integer({ min: -300, max: 300 }),
      }),
      fc.record({ kind: fc.constant('rename' as const), element: fc.nat(1_199) }),
      fc.record({ kind: fc.constant('delete' as const), element: fc.nat(1_199) }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 6 }), async (steps) => {
        project = syntheticProject({ elements: 1_200, overlap: 'grid' });
        renderer.show(indexScene(buildScene(project, 'everything')));
        for (const each of steps) {
          const scene = buildScene(project, 'everything');
          const elements = project.model.elements;
          let command: Command | undefined;
          if (each.kind === 'move') {
            const shape = scene.shapes[each.shape % scene.shapes.length];
            if (shape) {
              command = {
                type: 'set-positions',
                view: 'everything',
                positions: [
                  {
                    element: shape.element,
                    x: shape.offset.x + each.dx,
                    y: shape.offset.y + each.dy,
                    ...shape.storedSize,
                    pinned: true,
                  },
                ],
              };
            }
          } else {
            const element = elements[each.element % elements.length];
            if (element) {
              command =
                each.kind === 'rename'
                  ? {
                      type: 'update-element',
                      id: element.id,
                      changes: { name: `${element.name}!` },
                    }
                  : { type: 'delete', elements: [element.id] };
            }
          }
          if (command) {
            const outcome = executeCommand(project, command);
            if (outcome.ok) project = applyOperations(project, outcome.operations).state;
          }
          renderer.show(indexScene(buildScene(project, 'everything')));
          const fresh = await started();
          fresh.show(indexScene(buildScene(project, 'everything')));
          expect(drawnBy(renderer)).toEqual(drawnBy(fresh));
          fresh.destroy();
        }
      }),
      { numRuns: 8 },
    );
  }, 120_000);

  it('draws what a renderer made afresh draws, after any edits and emphasis', async () => {
    const renderer = await started();
    let project: ProjectSnapshot = sample;
    renderer.show(indexScene(buildScene(project, VIEW)));
    const step = fc.oneof(
      fc.record({
        kind: fc.constant('move' as const),
        shape: fc.nat(40),
        dx: fc.integer({ min: -900, max: 900 }),
        dy: fc.integer({ min: -600, max: 600 }),
      }),
      fc.record({ kind: fc.constant('rename' as const), element: fc.nat(40) }),
      fc.record({ kind: fc.constant('relate' as const), from: fc.nat(40), to: fc.nat(40) }),
      fc.record({
        kind: fc.constant('emphasis' as const),
        hide: fc.array(fc.nat(40), { maxLength: 3 }),
        dim: fc.array(fc.nat(40), { maxLength: 6 }),
        dash: fc.array(fc.nat(40), { maxLength: 4 }),
      }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 12 }), async (steps) => {
        project = sample;
        let emphasis: Emphasis = {};
        renderer.setEmphasis(emphasis);
        renderer.show(indexScene(buildScene(project, VIEW)));
        for (const each of steps) {
          const scene = buildScene(project, VIEW);
          const keys = [
            ...scene.shapes.map((shape) => shape.key),
            ...scene.relations.map((line) => line.relation),
          ];
          const elements = project.model.elements;
          let command: Command | undefined;
          if (each.kind === 'move') {
            const shape = scene.shapes[each.shape % scene.shapes.length];
            if (shape) {
              command = {
                type: 'set-positions',
                view: VIEW,
                positions: [
                  {
                    element: shape.element,
                    ...(shape.container ? { container: shape.container } : {}),
                    x: shape.offset.x + each.dx,
                    y: shape.offset.y + each.dy,
                    ...shape.storedSize,
                    pinned: true,
                  },
                ],
              };
            }
          } else if (each.kind === 'rename') {
            const element = elements[each.element % elements.length];
            if (element)
              command = {
                type: 'update-element',
                id: element.id,
                changes: { name: `${element.name}!` },
              };
          } else if (each.kind === 'relate') {
            const from = elements[each.from % elements.length]?.id as Id;
            const to = elements[(each.to + 1) % elements.length]?.id as Id;
            if (from !== to)
              command = {
                type: 'create-relation',
                relation: { relationType: 'systems.communicates-with', from, to },
              };
          } else {
            emphasis = {
              hidden: new Set(each.hide.map((at) => keys[at % keys.length] as string)),
              dimmed: new Set(each.dim.map((at) => keys[at % keys.length] as string)),
              dashed: new Set(each.dash.map((at) => keys[at % keys.length] as string)),
            };
            renderer.setEmphasis(emphasis);
          }
          if (command) {
            const outcome = executeCommand(project, command);
            if (outcome.ok) project = applyOperations(project, outcome.operations).state;
          }
          renderer.show(indexScene(buildScene(project, VIEW)));
          const fresh = await started();
          fresh.setEmphasis(emphasis);
          fresh.show(indexScene(buildScene(project, VIEW)));
          expect(drawnBy(renderer)).toEqual(drawnBy(fresh));
          fresh.destroy();
        }
      }),
      { numRuns: 25 },
    );
  }, 60_000);
});

describe('CanvasRenderer emphasis (I2)', () => {
  const indexed: IndexedScene = indexScene(buildScene(sample, VIEW));
  const { scene } = indexed;

  it('leaves out of the tiles and of pointing what it hides, and the lines drawn to it', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const patient = scene.shapes.find((shape) => shape.key === 'patient');
    const toPatient = scene.relations.filter(
      (line) =>
        (line.ends?.from.kind === 'shape' && line.ends.from.key === 'patient') ||
        (line.ends?.to.kind === 'shape' && line.ends.to.key === 'patient'),
    );
    expect(toPatient.length).toBeGreaterThan(0);
    renderer.setEmphasis({ hidden: new Set(['patient', 'calendar-note']) });
    const { tileOfShape, tilesOfLine, tiles } = inside(renderer);
    expect(tileOfShape.has('patient')).toBe(false);
    for (const line of toPatient) expect(tilesOfLine.get(line.relation)?.size ?? 0).toBe(0);
    expect(tiles.has('free')).toBe(false);
    const rect = patient?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
    const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.75 };
    expect(hitAt(indexed, middle, 6)?.kind).toBe('shape');
    expect(hitAt(indexed, middle, 6, () => true, renderer.hiddenByEmphasis)).toBeUndefined();
    expect(renderer.showsOutline('patient')).toBe(false);

    renderer.setEmphasis({});
    expect(inside(renderer).tileOfShape.has('patient')).toBe(true);
    expect(inside(renderer).tiles.has('free')).toBe(true);
  });

  it('draws faintly what it dims, keeping the drawing of a tile that is dimmed whole', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const before = inside(renderer).tileOfShape.get('patient');
    const container = before?.container;
    const keys = new Set(scene.shapes.map((shape) => shape.key));
    renderer.setEmphasis({ dimmed: keys });
    const after = inside(renderer).tileOfShape.get('patient');
    expect(after?.dim).toBe(true);
    expect(after?.key.endsWith(' dim')).toBe(true);
    expect(after?.container).toBe(container);
    expect(after?.container.alpha).toBe(DIMMED_ALPHA);
    // Highlighting wins over dimming.
    renderer.setEmphasis({ dimmed: keys, highlighted: new Set(['patient']) });
    expect(inside(renderer).tileOfShape.get('patient')?.dim).toBe(false);
    expect(inside(renderer).tileOfShape.get('patient')?.container.alpha).toBe(1);
  });

  it('draws dashed the lines it dashes, planning again only their tiles (ADR 0078)', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const line = scene.relations.find((each) => !each.aggregate && each.dash === 'solid');
    if (!line) throw new Error('No solid line.');
    const dashOf = (relation: string) =>
      [...(inside(renderer).tilesOfLine.get(relation) ?? [])].flatMap((tile) =>
        (tile.lines as unknown as RelationLine[])
          .filter((each) => each.relation === relation)
          .map((each) => each.dash),
      );
    expect(dashOf(line.relation)).not.toContain('dashed');
    const before = new Map([...inside(renderer).tiles].map(([key, tile]) => [key, tile.container]));
    renderer.setEmphasis({ dashed: new Set([line.relation]), dimmed: new Set([line.relation]) });
    expect(dashOf(line.relation).length).toBeGreaterThan(0);
    expect(new Set(dashOf(line.relation))).toEqual(new Set(['dashed']));
    // The tiles of shapes stay as they were.
    for (const [key, tile] of inside(renderer).tiles) {
      if (tile.kind === 'shapes') expect(before.get(key)).toBe(tile.container);
    }
    renderer.setEmphasis({});
    expect(new Set(dashOf(line.relation))).toEqual(new Set(['solid']));
  });

  it('dashes a line when every relation it stands for is dashed, and never a hidden one', () => {
    const line = scene.relations.find((each) => !each.aggregate);
    if (!line) throw new Error('No line.');
    expect(emphasize(scene, { dashed: new Set([line.relation]) }).dashed).toEqual(
      new Set([line.relation]),
    );
    expect(
      emphasize(scene, { dashed: new Set([line.relation]), hidden: new Set([line.relation]) })
        .dashed.size,
    ).toBe(0);
    expect(emphasize(scene, {}).dashed.size).toBe(0);
  });

  it('marks what it highlights above the scene, with a cue beside the color', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const line = scene.relations[0];
    renderer.setEmphasis({ highlighted: new Set(['patient', line?.relation as string]) });
    const shapeMarks = inside(renderer).emphasisShapeMarks.context.instructions;
    const lineMarks =
      inside(renderer).litLines.graphicsOf(line?.relation as string)?.context.instructions ?? [];
    // Halo, ring and corner marks for the shape; halo and line for the relation; dots at its ends.
    expect(shapeMarks.filter((each) => each.action === 'stroke')).toHaveLength(3);
    expect(lineMarks.filter((each) => each.action === 'stroke')).toHaveLength(2);
    expect(lineMarks.filter((each) => each.action === 'fill')).toHaveLength(1);
    renderer.setEmphasis({});
    expect(inside(renderer).emphasisShapeMarks.context.instructions).toHaveLength(0);
    expect(inside(renderer).litLines.shownLines).toHaveLength(0);
  });

  it('strokes its marks on screen, so that far out a round cap takes no more segments', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const line = scene.relations[0];
    if (!line) throw new Error('The sample draws no relation.');
    renderer.setCamera({ x: 0, y: 0, scale: 0.05 });
    renderer.setEmphasis({
      highlighted: new Set(['patient', line.relation]),
      markers: [{ relation: line.relation, progress: 0.5, trail: 0.2 }],
    });
    const { emphasisShapeMarks, litLines, markerMarks } = inside(renderer);
    const emphasisLineMarks = litLines.graphicsOf(line.relation) as Graphics;
    const widths = (graphics: Graphics) =>
      graphics.context.instructions
        .filter((each) => each.action === 'stroke')
        .map((each) => (each.data as { style: { width: number } }).style.width);
    // A 10-pixel halo, a 2.5-pixel ring and 3-pixel corners, whatever the zoom, in the marks' unit.
    const inPixels = (graphics: Graphics) => widths(graphics).map((width) => width * MARK_UNIT);
    expect(inPixels(emphasisShapeMarks)).toEqual([10, 2.5, 3]);
    expect(inPixels(emphasisLineMarks)[0]).toBeCloseTo(line.width * 0.05 + 12);
    expect(Math.max(...inPixels(markerMarks))).toBeCloseTo(14);
    for (const graphics of [emphasisShapeMarks, emphasisLineMarks, markerMarks]) {
      expect(graphics.scale.x).toBeCloseTo(MARK_UNIT / 0.05);
    }
    // Where the camera shows them: around the shape, 5 pixels out, back in the world's units.
    const bounds = emphasisShapeMarks.getLocalBounds();
    const patient = indexed.byKey.get(shapeKeyOf(['patient']));
    const left = bounds.x * emphasisShapeMarks.scale.x;
    expect(left).toBeLessThan(patient?.rect.x as number);
    expect(left).toBeGreaterThan((patient?.rect.x as number) - 30 / 0.05);
  });

  it('keeps its highlights when the scene changes only the fill of what it highlights', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const line = scene.relations[0];
    if (!line) throw new Error('The sample draws no relation.');
    renderer.setEmphasis({ highlighted: new Set(['patient', line.relation]) });
    const { emphasisShapeMarks, litLines } = inside(renderer);
    const emphasisLineMarks = litLines.graphicsOf(line.relation) as Graphics;
    const shapesCleared = vi.spyOn(emphasisShapeMarks, 'clear');
    const linesCleared = vi.spyOn(emphasisLineMarks, 'clear');
    const refilled = indexScene({
      ...scene,
      shapes: scene.shapes.map((shape) => ({ ...shape, fill: '#123456' })),
      relations: scene.relations.map((each) => ({ ...each, route: [...each.route] })),
    });
    renderer.show(refilled);
    expect(shapesCleared).not.toHaveBeenCalled();
    expect(linesCleared).not.toHaveBeenCalled();
    // A shape that moves is marked where it is now.
    const moved = indexScene({
      ...scene,
      shapes: scene.shapes.map((shape) => ({
        ...shape,
        rect: { ...shape.rect, x: shape.rect.x + 40 },
      })),
    });
    renderer.show(moved);
    expect(shapesCleared).toHaveBeenCalled();
  });

  it('draws markers along their relations, alone when only they move, moving their discs', async () => {
    const renderer = await started();
    renderer.show(indexed);
    const line = scene.relations[0];
    if (!line) throw new Error('The sample draws no relation.');
    const tiles = new Map(inside(renderer).tiles);
    renderer.setEmphasis({ markers: [{ relation: line.relation, progress: 0.25 }] });
    const { markerDiscs } = inside(renderer);
    const at = pointAlong(line.route, 0.25);
    expect(markerDiscs.points).toHaveLength(1);
    expect(markerDiscs.points[0]?.x).toBeCloseTo(at.x);
    expect(markerDiscs.points[0]?.y).toBeCloseTo(at.y);
    const disc = (markerDiscs.container.children[0] as Graphics).context;
    renderer.setEmphasis({ markers: [{ relation: line.relation, progress: 0.75 }] });
    expect(new Map(inside(renderer).tiles)).toEqual(tiles);
    const later = pointAlong(line.route, 0.75);
    expect(markerDiscs.points[0]?.x).toBeCloseTo(later.x);
    // The same disc, moved: nothing of it drawn again.
    expect((markerDiscs.container.children[0] as Graphics).context).toBe(disc);
    renderer.setEmphasis({});
    expect(markerDiscs.points).toHaveLength(0);
  });
});

describe('emphasize', () => {
  /** A system collapsed, so that its contents' relations are aggregated. */
  function collapsed(): Scene {
    const view = sample.views.find((each) => each.id === VIEW);
    const project: ProjectSnapshot = {
      ...sample,
      views: sample.views.map((each) =>
        each === view ? { ...each, collapsed: ['scheduling'] } : each,
      ),
    };
    return buildScene(project, VIEW);
  }

  it('hides, dims and highlights an aggregated relation through the relations it stands for', () => {
    const scene = collapsed();
    const aggregate = scene.relations.find((line) => line.aggregate);
    if (!aggregate?.aggregate) throw new Error('The scene aggregates no relation.');
    const members = new Set(aggregate.aggregate.relations);
    expect(emphasize(scene, { hidden: members }).hidden.relations.has(aggregate.relation)).toBe(
      true,
    );
    expect(emphasize(scene, { dimmed: members }).dimmed.relations.has(aggregate.relation)).toBe(
      true,
    );
    const [one] = members;
    const lit = emphasize(scene, { highlighted: new Set([one as string]) });
    expect(lit.highlighted.lines).toEqual([aggregate]);
    // Its ends show the relation's ends, one of which the collapsed container hides: lit too.
    const ends = [aggregate.ends?.from, aggregate.ends?.to].map((end) =>
      end?.kind === 'shape' ? end.key : undefined,
    );
    expect(lit.highlighted.shapes.map((shape) => shape.key).sort()).toEqual(
      ends.filter((key) => key !== undefined).sort(),
    );
    expect(ends).toContain('clinic-booking/scheduling');
    expect(standsFor(aggregate)).toEqual(aggregate.aggregate.relations);
    expect(shownBy(scene, 'appointments-api')?.key).toBe('clinic-booking/scheduling');
    expect(shownBy(scene, 'patient')?.key).toBe(shapeKeyOf(['patient']));
    expect(shownBy(scene, 'no-such-element')).toBeUndefined();
    const moving = emphasize(scene, { markers: [{ relation: one as string, progress: 0.4 }] });
    expect(moving.markers).toEqual([{ line: aggregate, along: 0.4 }]);
  });

  it('tells what arrives apart from what it highlights, an aggregated line by what it stands for', () => {
    const scene = collapsed();
    const aggregate = scene.relations.find((line) => line.aggregate);
    const plain = scene.relations.find((line) => !line.aggregate);
    if (!aggregate?.aggregate || !plain) throw new Error('The scene aggregates no relation.');
    const [one] = aggregate.aggregate.relations;
    const lit = emphasize(scene, {
      highlighted: new Set(['patient', plain.relation, one as string]),
      arriving: { keys: new Set([plain.relation, one as string]), duration: 200 },
    });
    expect(lit.highlighted.lines).toContain(plain);
    expect(lit.highlighted.lines).toContain(aggregate);
    expect(lit.arriving.lines).toEqual(
      scene.relations.filter((line) => line === plain || line === aggregate),
    );
    expect(lit.arriving.shapes).toEqual([]);
    expect(lit.arrivingFor).toBe(200);
    const settled = emphasize(scene, { highlighted: new Set(['patient']) });
    expect(settled.arriving.lines).toEqual([]);
    expect(settled.arrivingFor).toBe(0);
  });

  it('places a marker’s trail along its line, the way its relation runs', () => {
    const scene = collapsed();
    const aggregate = scene.relations.find((line) => line.aggregate);
    if (!aggregate?.aggregate) throw new Error('The scene aggregates no relation.');
    const [one] = aggregate.aggregate.relations;
    const reversed = aggregate.aggregate.reversed?.includes(one as string) ?? false;
    const moving = emphasize(scene, {
      markers: [{ relation: one as string, progress: 0.4, trail: 0.1 }],
    });
    expect(moving.markers).toEqual([
      reversed
        ? { line: aggregate, along: 0.6, from: 0.9 }
        : { line: aggregate, along: 0.4, from: 0.1 },
    ]);
  });

  it('leaves out keys the scene does not draw, and needs nothing when there is no emphasis', () => {
    const scene = collapsed();
    const nothing = emphasize(scene, {});
    expect(emphasize(scene, { hidden: new Set() })).toBe(nothing);
    const unknown = emphasize(scene, {
      hidden: new Set(['clinic-booking/scheduling/appointments-api']),
    });
    expect(unknown.hidden.shapes.size).toBe(0);
  });
});
