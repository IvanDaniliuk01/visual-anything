/**
 * The canvas's marks and tiles for shapes with their own outlines (M8b, ADR 0066): the hover mark and
 * the selection's marks run along the outline, the names a shape cannot write inside itself are
 * written beside it, and its tiles draw its outline, plain far out and full close in.
 */
import { Container, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { FRAME, TRIANGLE } from '../test/beyond';
import { outlinedShape } from '../test/outlined';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { NamesBeside } from './namesBeside';
import { CanvasRenderer } from './renderer';
import type { ElementShape, Scene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Inside {
  hoverMark: Graphics;
  selectionChunks: Graphics[];
  namesBeside: NamesBeside;
  tiles: Map<string, { kind: string; shapes: ElementShape[]; coarse?: Graphics; full?: Graphics }>;
}

const named: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

const inside = (renderer: CanvasRenderer) => renderer as unknown as Inside;

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

function sceneOf(shapes: ElementShape[]): Scene {
  return {
    shapes,
    relations: [],
    notes: [],
    arrows: [],
    bounds: { x: 0, y: 0, width: 800, height: 400 },
  };
}

/** The kinds of the shapes in the paths a drawing strokes or fills. */
function primitives(graphics: Graphics): string[] {
  return graphics.context.instructions.flatMap((each) =>
    (
      each.data as { path: { shapePath: { shapePrimitives: { shape: { type: string } }[] } } }
    ).path.shapePath.shapePrimitives.map(({ shape }) => shape.type),
  );
}

const frame = outlinedShape('frame', FRAME, { x: 0, y: 0, width: 200, height: 100 });
const tiny = outlinedShape('tiny', TRIANGLE, { x: 300, y: 0, width: 30, height: 24 });
const indexed = indexScene(sceneOf([frame, tiny]));

describe('marks along the outline', () => {
  it('draws the hover mark along a shape’s outline, its hole included', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(selectionOf([]), 'frame');
    const kinds = primitives(inside(renderer).hoverMark);
    expect(kinds).toEqual(['polygon', 'polygon']);
  });

  it('draws the selection’s marks along the outline', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'frame' }]), undefined);
    expect(primitives(inside(renderer).selectionChunks[0] as Graphics)).toEqual([
      'polygon',
      'polygon',
    ]);
  });
});

describe('names beside a shape', () => {
  it('writes the name of a hovered shape that writes none inside beside it, and of none other', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setSelection(selectionOf([]), 'tiny');
    expect(inside(renderer).namesBeside.written).toEqual(['tiny']);
    renderer.setSelection(selectionOf([]), 'frame');
    expect(inside(renderer).namesBeside.written).toEqual([]);
  });

  it('writes the names of a few selected shapes beside them, the hovered one first', async () => {
    const other = outlinedShape('other', TRIANGLE, { x: 400, y: 0, width: 30, height: 24 });
    const renderer = await started();
    renderer.show(indexScene(sceneOf([frame, tiny, other])));
    renderer.setSelection(
      selectionOf([
        { kind: 'element', id: 'tiny' },
        { kind: 'element', id: 'other' },
        { kind: 'element', id: 'frame' },
      ]),
      'other',
    );
    expect(inside(renderer).namesBeside.written).toEqual(['other', 'tiny']);
  });

  it('writes none beside the shapes of a large selection', async () => {
    const many = Array.from({ length: 70 }, (_, at) =>
      outlinedShape(`s${at}`, TRIANGLE, {
        x: (at % 10) * 40,
        y: Math.floor(at / 10) * 40,
        width: 30,
        height: 24,
      }),
    );
    const renderer = await started();
    renderer.show(indexScene(sceneOf(many)));
    renderer.setSelection(
      selectionOf(many.map((shape) => ({ kind: 'element', id: shape.element }))),
      undefined,
    );
    expect(inside(renderer).namesBeside.written).toEqual([]);
  });
});

describe('tiles of outlines', () => {
  it('draws a shape’s outline, never its box, plain far out and in full close in', async () => {
    const renderer = await started();
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 2 });
    for (let at = 0; at < 20; at++) renderer.renderNow();
    const tile = [...inside(renderer).tiles.values()].find((each) =>
      each.shapes.some((shape) => shape.key === 'frame'),
    );
    expect(tile?.coarse && primitives(tile.coarse)).not.toContain('rectangle');
    expect(tile?.full && primitives(tile.full)).not.toContain('rectangle');
    expect(tile?.full && primitives(tile.full)).toContain('polygon');
  });
});
