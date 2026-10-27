/**
 * Layout of shapes beyond boxes (ADR 0015's clarification of 2026-10-26): a shape with free geometry
 * by its box and its connection points as ports, and a drawing with parts as one block whose size
 * comes from its header, its picture and its other contents, with a port for each related anchored
 * part on the block's side nearest that part. Anchored parts get no positions of their own.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it } from 'vitest';
import { beyondBoxes } from '../../test/beyond';
import { loadSample } from '../../test/sample';
import { buildScene, type ElementShape, type Scene } from '../scene';
import { layoutCommand } from './command';
import { blockGraph, layOut, type ElkEngine } from './engine';
import { layoutInput, tagReachOf, waitsForLayout } from './input';
import type { LayoutInput } from './types';

const VIEW = 'anatomy';
const elk = new ELK();

/**
 * The beyond-boxes fixture, its frame given a connection point, related from the anatomy's right
 * part and to its left one, and nothing in World positioned but the body.
 */
function project(): ProjectSnapshot {
  const base = beyondBoxes(VIEW);
  const elements = base.model.elements.map((element): Element =>
    element.id === 'framed'
      ? {
          ...element,
          appearance: {
            ...element.appearance,
            connectionPoints: [{ name: 'in', side: 'left', at: 0.5 }],
          },
        }
      : element,
  );
  const view = base.views[0] as (typeof base.views)[number];
  return {
    ...base,
    model: {
      ...base.model,
      elements,
      relations: [
        ...base.model.relations,
        { id: 'feeds', relationType: 'anatomy.flows', from: 'framed', to: 'right' },
        { id: 'drains', relationType: 'anatomy.flows', from: 'left', to: 'loose' },
      ],
    },
    views: [
      {
        ...view,
        positions: view.positions.filter(
          (position) => position.element === 'body' || position.container === 'body',
        ),
      },
    ],
  };
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function inputOf(state: ProjectSnapshot): { scene: Scene; input: LayoutInput } {
  const scene = buildScene(state, VIEW);
  const input = layoutInput(scene, state, { kind: 'view' });
  if (!input) throw new Error('Nothing to lay out.');
  return { scene, input };
}

describe('the layout input beyond boxes', () => {
  it('gives a shape with free geometry by its box, its connection points as ports', () => {
    const { scene, input } = inputOf(project());
    const framed = input.shapes.find((shape) => shape.key === 'framed');
    const shape = shapeOf(scene, 'framed');
    const { rect } = shape;
    // With the room its name tag takes, which its name, too long for the frame, hangs under it.
    const reach = tagReachOf(shape);
    expect(reach.bottom).toBeGreaterThan(0);
    expect(framed).toMatchObject({
      free: true,
      x: shape.offset.x - reach.left,
      width: rect.width + reach.left + reach.right,
      height: rect.height + reach.bottom,
    });
    expect(framed?.points).toEqual([{ name: 'in', side: 'left', at: 0.5 }]);
  });

  it('gives anchored parts no place of their own, with where their relations attach', () => {
    const { scene, input } = inputOf(project());
    for (const key of ['body/left', 'body/right']) {
      const part = input.shapes.find((shape) => shape.key === key);
      expect(part?.free, key).toBe(false);
      expect(part?.aside, key).toBeUndefined();
      const shape = shapeOf(scene, key);
      // A square part's inner point is its middle, from the top left of its drawing.
      expect(part?.partAt?.x).toBeCloseTo(shape.rect.x + shape.rect.width / 2, 0);
      expect(part?.partAt?.y).toBeCloseTo(shape.rect.y + shape.rect.height / 2, 0);
    }
    for (const key of ['body/twin', 'body/extra']) {
      expect(input.shapes.find((shape) => shape.key === key)?.free, key).toBe(true);
    }
  });

  it('sizes a drawing with parts from its header and its picture, its contents arranged below', () => {
    const { input } = inputOf(project());
    const body = input.shapes.find((shape) => shape.key === 'body');
    expect(body?.pictureBottom).toBe(48 + 100);
    expect(body?.baseWidth).toBeGreaterThanOrEqual(24 + 300 + 24);
    expect(body?.baseHeight).toBeGreaterThanOrEqual(48 + 100 + 24);
  });
});

describe('blockGraph and anchored parts', () => {
  it('gives a block a port for each related part, on its side nearest the part', () => {
    const graph = blockGraph(
      'level',
      [0, 1],
      new Map([
        [0, { width: 348, height: 200 }],
        [1, { width: 100, height: 100 }],
      ]),
      () => undefined,
      [
        { u: 0, v: 1, uDirect: false, vDirect: false, uPart: { x: 300, y: 98 } },
        { u: 1, v: 0, uDirect: false, vDirect: false, vPart: { x: 74, y: 30 } },
      ],
    );
    const [block] = graph.children ?? [];
    expect(block?.layoutOptions).toEqual({ 'elk.portConstraints': 'FIXED_POS' });
    expect(
      block?.ports?.map((port) => [port.x, port.y, port.layoutOptions?.['elk.port.side']]),
    ).toEqual([
      [348, 98, 'EAST'],
      [74, 0, 'NORTH'],
    ]);
    expect(graph.edges?.map((edge) => [edge.sources[0], edge.targets[0]])).toEqual([
      ['s0^right 98', 's1'],
      ['s1', 's0^top 74'],
    ]);
  });
});

describe('the beyond-boxes sample’s heart', () => {
  const sample = loadSample('beyond-boxes');

  it('waits for no layout of its anchored parts, which have no positions of their own', () => {
    const scene = buildScene(sample, 'heart');
    const anchored = scene.shapes.filter((shape) => shape.part?.inDrawing === true);
    expect(anchored.length).toBeGreaterThan(10);
    expect(anchored.every((shape) => !waitsForLayout(shape))).toBe(true);
    const waiting = scene.shapes.filter(waitsForLayout).map((shape) => shape.key);
    expect(waiting).toEqual([]);
    // Placing new shapes, given every anchored part as new, has nothing to place.
    const keys = new Set(anchored.map((shape) => shape.key));
    expect(layoutInput(scene, sample, { kind: 'new', keys })).toBeUndefined();
  });

  it('lays the view out without giving an anchored part a position', async () => {
    const scene = buildScene(sample, 'heart');
    const input = layoutInput(scene, sample, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    const result = await layOut(input, elk);
    const anchored = new Set(
      scene.shapes.filter((shape) => shape.part?.inDrawing === true).map((shape) => shape.key),
    );
    expect(result.shapes.filter((shape) => anchored.has(shape.key))).toEqual([]);
    const action = layoutCommand(sample, 'heart', scene, { kind: 'view' }, result.shapes);
    const command = action?.command;
    const positions =
      command?.type === 'batch' && command.commands[0]?.type === 'set-positions'
        ? command.commands[0].positions
        : [];
    const anchoredElements = new Set(
      scene.shapes.filter((shape) => shape.part?.inDrawing === true).map((shape) => shape.element),
    );
    expect(positions.filter((position) => anchoredElements.has(position.element))).toEqual([]);
  });
});

describe('laying out a view with a drawing with parts', () => {
  it('moves the drawing as one block, its parts in place and its other contents below its picture', async () => {
    const state = project();
    const { scene, input } = inputOf(state);
    const graphs: ElkNode[] = [];
    const watching: ElkEngine = {
      layout: (graph) => {
        graphs.push(...(graph.children ?? []));
        return elk.layout(graph);
      },
    };
    const result = await layOut(input, watching);
    const keys = result.shapes.map((shape) => shape.key);
    expect(keys).not.toContain('body/left');
    expect(keys).not.toContain('body/right');
    for (const key of ['body/twin', 'body/extra']) {
      const placed = result.shapes.find((shape) => shape.key === key);
      expect(placed?.y, key).toBeGreaterThanOrEqual(48 + 100 + 40);
    }
    // In World, the drawing has a port for each of its related parts.
    const world = graphs.find((graph) => graph.id === 'level -1');
    const body = world?.children?.find(
      (node) => input.shapes[Number(node.id.slice(1))]?.key === 'body',
    );
    expect(body?.ports).toHaveLength(2);

    const action = layoutCommand(state, VIEW, scene, { kind: 'view' }, result.shapes);
    if (!action) throw new Error('Nothing moved.');
    const outcome = executeCommand(state, action.command);
    if (!outcome.ok) throw new Error('Refused.');
    const after = buildScene(outcome.state, VIEW);
    const drawing = shapeOf(after, 'body');
    // The parts lie over the picture where it is now.
    expect(shapeOf(after, 'body/left').rect.x - drawing.rect.x).toBe(34);
    expect(shapeOf(after, 'body/left').rect.y - drawing.rect.y).toBe(58);
    const view = outcome.state.views[0];
    expect(view?.positions.some((position) => position.element === 'right')).toBe(false);
  });
});
