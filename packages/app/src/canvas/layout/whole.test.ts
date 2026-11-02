/** Layout in one pass over the view (ADR 0080, section 1), and expanding in place (section 4). */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../geometry';
import { CONTENTS_ORIGIN } from '../scene';
import { carried, layOut, type ElkEngine } from './engine';
import { segmentThrough } from './quality';
import { LAYOUT_STEP, type LaidOutShape, type LayoutInput, type LayoutShape } from './types';
import { WHOLE_SHAPES, WHOLE_SPACINGS, facingSides, type WholeEdge } from './whole';

const elk: ElkEngine = new ELK();

function shape(
  key: string,
  parent: number,
  options: Partial<Omit<LayoutShape, 'key' | 'parent'>> = {},
): LayoutShape {
  const element = key.split('/').at(-1) as string;
  return { key, element, parent, free: true, x: 0, y: 0, width: 160, height: 72, ...options };
}

const container = { baseWidth: 160, baseHeight: 72, width: 400, height: 300 };

function onePass(shapes: LayoutShape[], edges: [number, number][] = []): LayoutInput {
  return {
    shapes,
    relations: edges.map(([from, to], at) => ({ relation: `r${at}`, from, to })),
    obstacles: [],
    onePass: true,
  };
}

/** Where each shape went, relative to World, from what layout gave and what it kept. */
function placedRects(input: LayoutInput, placed: readonly LaidOutShape[]): Map<string, Rect> {
  const at = new Map(placed.map((each) => [each.key, each]));
  const rects = new Map<string, Rect>();
  input.shapes.forEach((each) => {
    const holder = each.parent >= 0 ? rects.get(input.shapes[each.parent]?.key ?? '') : undefined;
    const own = at.get(each.key) ?? each;
    rects.set(each.key, {
      x: (holder?.x ?? 0) + own.x,
      y: (holder?.y ?? 0) + own.y,
      width: each.width,
      height: each.height,
    });
  });
  return rects;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('facingSides', () => {
  const end = (node: number) => ({ node, direct: false, at: 44 });
  const edges: WholeEdge[] = [
    { from: end(0), to: end(1) },
    { from: end(1), to: end(0) },
    { from: end(0), to: end(2) },
  ];
  it('puts each end on the side of its shape that faces the other, east on both one above the other', () => {
    const rects = new Map<number, Rect>([
      [0, { x: 0, y: 0, width: 200, height: 100 }],
      [1, { x: 400, y: 0, width: 200, height: 100 }],
      [2, { x: 100, y: 300, width: 200, height: 100 }],
    ]);
    expect(facingSides(edges, rects)).toEqual([
      { from: 'east', to: 'west' },
      { from: 'west', to: 'east' },
      { from: 'east', to: 'east' },
    ]);
  });
});

describe('carried', () => {
  it('moves the last point and the bend before it, keeping every segment straight', () => {
    const route: Point[] = [
      { x: 0, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 80 },
      { x: 100, y: 80 },
    ];
    expect(carried(route, { x: 4, y: -4 })).toEqual([
      { x: 0, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 76 },
      { x: 104, y: 76 },
    ]);
  });

  it('gives a straight route a jog in its middle, and none when it moves along it', () => {
    const route: Point[] = [
      { x: 0, y: 10 },
      { x: 100, y: 10 },
    ];
    expect(carried(route, { x: 0, y: 4 })).toEqual([
      { x: 0, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 14 },
      { x: 100, y: 14 },
    ]);
    expect(carried(route, { x: 4, y: 0 })).toEqual([
      { x: 0, y: 10 },
      { x: 104, y: 10 },
    ]);
  });
});

describe('layOut in one pass', () => {
  it('arranges the contents of two containers in one ELK run, related across them', async () => {
    const shapes = [
      shape('a', -1, container),
      shape('a/x', 0),
      shape('a/y', 0),
      shape('b', -1, container),
      shape('b/z', 3),
    ];
    const graphs: ElkNode[] = [];
    const watching: ElkEngine = {
      layout: (graph) => {
        graphs.push(structuredClone(graph));
        return elk.layout(graph);
      },
    };
    const given = onePass(shapes, [
      [1, 4],
      [4, 2],
    ]);
    const result = await layOut(given, watching);
    expect(result.stats).toMatchObject({ onePass: true, elkRuns: 2 });
    // The relations run between the contents themselves, at World, with the containers holding them.
    const [first] = graphs;
    expect(first?.layoutOptions?.['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
    expect(first?.edges?.map((edge) => [edge.sources[0], edge.targets[0]])).toEqual([
      ['s1', 's4'],
      ['s4', 's2'],
    ]);
    expect(first?.children?.map((node) => node.children?.map((child) => child.id))).toEqual([
      ['s1', 's2'],
      ['s4'],
    ]);
    for (const each of result.shapes) {
      expect(Number.isInteger(each.x / LAYOUT_STEP)).toBe(true);
      expect(Number.isInteger(each.y / LAYOUT_STEP)).toBe(true);
    }
    // Every route runs between its ends, through no other shape.
    const rects = placedRects(given, result.shapes);
    expect(result.routes?.map((route) => route.relation).sort()).toEqual(['r0', 'r1']);
    for (const route of result.routes ?? []) {
      const [from, to] = route.relation === 'r0' ? ['a/x', 'b/z'] : ['b/z', 'a/y'];
      for (const [key, rect] of rects) {
        if (key === from || key === to || !key.includes('/')) continue;
        for (let at = 1; at < route.points.length; at++) {
          expect(
            segmentThrough(route.points[at - 1] as Point, route.points[at] as Point, rect),
          ).toBe(false);
        }
      }
    }
  });

  it('packs what no relation reaches in rows, beside or below what ELK arranged', async () => {
    const shapes = [
      shape('a', -1, container),
      shape('a/x', 0),
      shape('a/y', 0),
      ...Array.from({ length: 8 }, (_, at) => shape(`a/loose${at}`, 0, { width: 120, height: 48 })),
    ];
    const given = onePass(shapes, [[1, 2]]);
    const result = await layOut(given, elk);
    const rects = placedRects(given, result.shapes);
    const related = [rects.get('a/x'), rects.get('a/y')] as Rect[];
    const around = {
      x: Math.min(...related.map((rect) => rect.x)),
      y: Math.min(...related.map((rect) => rect.y)),
      right: Math.max(...related.map((rect) => rect.x + rect.width)),
      bottom: Math.max(...related.map((rect) => rect.y + rect.height)),
    };
    const loose = [...rects.entries()].filter(([key]) => key.includes('loose'));
    const beside = loose.every(([, rect]) => rect.x >= around.right + 40);
    const below = loose.every(([, rect]) => rect.y >= around.bottom + 40);
    expect(beside || below).toBe(true);
    // In rows, not one column: several share a row.
    expect(new Set(loose.map(([, rect]) => rect.y)).size).toBeLessThan(loose.length);
    for (const [key, rect] of loose) {
      for (const other of related) expect(overlaps(rect, other), key).toBe(false);
    }
  });

  it("spaces a container's contents as World's, 64 between layers and 40 within one (A4)", async () => {
    const shapes = [shape('a', -1, container), shape('a/x', 0), shape('a/y', 0), shape('a/z', 0)];
    const graphs: ElkNode[] = [];
    const watching: ElkEngine = {
      layout: (graph) => {
        graphs.push(structuredClone(graph));
        return elk.layout(graph);
      },
    };
    const given = onePass(shapes, [
      [1, 2],
      [1, 3],
    ]);
    const result = await layOut(given, watching);
    // ELK reads a compound's spacings from the compound itself, not from the root.
    for (const graph of graphs) {
      const options = graph.children?.[0]?.layoutOptions ?? {};
      for (const [key, value] of Object.entries(WHOLE_SPACINGS)) expect(options[key]).toBe(value);
    }
    const rects = placedRects(given, result.shapes);
    const x = rects.get('a/x') as Rect;
    const y = rects.get('a/y') as Rect;
    const z = rects.get('a/z') as Rect;
    // y and z follow x in the next layer, one above the other.
    expect(y.x - (x.x + x.width)).toBeGreaterThanOrEqual(64);
    const [upper, lower] = y.y < z.y ? [y, z] : [z, y];
    expect(lower.y - (upper.y + upper.height)).toBeGreaterThanOrEqual(40);
  });

  it('packs what the run leaves out beside a tall block as narrow as its height allows (A4)', async () => {
    // A star: x in one layer, six shapes in the next, a block 6 × 72 + 5 × 40 = 632 tall.
    const shapes = [
      shape('a', -1, container),
      shape('a/x', 0),
      ...Array.from({ length: 6 }, (_, at) => shape(`a/y${at}`, 0)),
      ...Array.from({ length: 4 }, (_, at) => shape(`a/loose${at}`, 0)),
    ];
    const given = onePass(
      shapes,
      Array.from({ length: 6 }, (_, at): [number, number] => [1, 2 + at]),
    );
    const result = await layOut(given, elk);
    const rects = placedRects(given, result.shapes);
    const related = [...rects.entries()].filter(([key]) => /a\/(x|y)/.test(key));
    const right = Math.max(...related.map(([, rect]) => rect.x + rect.width));
    const bottom = Math.max(...related.map(([, rect]) => rect.y + rect.height));
    const loose = [...rects.entries()].filter(([key]) => key.includes('loose'));
    // Beside it, in one column no taller than it, rather than two rows that leave a hole below them.
    for (const [, rect] of loose) expect(rect.x).toBeGreaterThanOrEqual(right + 40);
    expect(new Set(loose.map(([, rect]) => rect.x)).size).toBe(1);
    for (const [, rect] of loose) expect(rect.y + rect.height).toBeLessThanOrEqual(bottom);
  });

  it('never moves a pinned shape, and places the rest clear of it', async () => {
    const shapes = [
      shape('kept', -1, { free: false, x: 0, y: 0, width: 300, height: 200 }),
      shape('a', -1),
      shape('b', -1),
      shape('c', -1),
    ];
    const given = onePass(shapes, [
      [1, 2],
      [2, 3],
    ]);
    const result = await layOut(given, elk);
    expect(result.shapes.map((each) => each.key).sort()).toEqual(['a', 'b', 'c']);
    const rects = placedRects(given, result.shapes);
    for (const key of ['a', 'b', 'c']) {
      expect(overlaps(rects.get(key) as Rect, rects.get('kept') as Rect)).toBe(false);
    }
  });

  it('arranges level by level beyond its budget', async () => {
    const count = WHOLE_SHAPES + 1;
    const shapes = Array.from({ length: count }, (_, at) => shape(`s${at}`, -1));
    const edges = Array.from({ length: count - 1 }, (_, at): [number, number] => [at, at + 1]);
    // ELK is not needed to tell which way it went: this one places nothing.
    const placing: ElkEngine = { layout: (graph) => Promise.resolve(graph) };
    const result = await layOut(onePass(shapes, edges), placing);
    expect(result.stats.onePass).toBeUndefined();
  });

  it("beyond its budget, gives each relation that leaves a container a port on the container's facing side", async () => {
    // A container holding a and b, b related to a shape in World after it, and a long chain in World.
    const count = WHOLE_SHAPES + 1;
    const shapes = [
      shape('box', -1, { ...container, free: true }),
      shape('box/a', 0),
      shape('box/b', 0),
      ...Array.from({ length: count }, (_, at) => shape(`s${at}`, -1)),
    ];
    const edges: [number, number][] = [
      [1, 2],
      [2, 3],
      ...Array.from({ length: count - 1 }, (_, at): [number, number] => [at + 3, at + 4]),
    ];
    const graphs: ElkNode[] = [];
    const placing: ElkEngine = {
      layout: (graph) => {
        graphs.push(...(graph.children ?? []));
        return Promise.resolve(graph);
      },
    };
    const result = await layOut(onePass(shapes, edges), placing);
    expect(result.stats.onePass).toBeUndefined();
    const box = graphs.find((graph) => graph.id === 'level 0');
    expect(box?.ports?.map((port) => port.layoutOptions?.['elk.port.side'])).toEqual(['EAST']);
    expect(box?.edges).toContainEqual({
      id: expect.any(String) as string,
      sources: ['s2'],
      targets: ['level 0:east'],
    });
  });

  it('packs in rows what ELK did not arrange in time, and still ends', async () => {
    const shapes = [shape('a', -1), shape('b', -1), shape('c', -1)];
    const never: ElkEngine = { layout: () => new Promise<ElkNode>(() => {}), stop: () => {} };
    const result = await layOut(
      onePass(shapes, [
        [0, 1],
        [1, 2],
      ]),
      never,
      { timeLimit: 20 },
    );
    expect(result.stats.packedForTime).toBe(1);
    expect(result.shapes).toHaveLength(3);
    expect(result.routes).toBeUndefined();
  });
});

describe('expanding in place', () => {
  /** A container that expanded from 160 by 72, with two shapes inside, and its neighbours. */
  function expanding(beside: LayoutShape[], at = { x: 24, y: 48 }) {
    return [
      shape('world', -1, { ...container, free: false, width: 2000, height: 1200 }),
      shape('world/box', 0, {
        ...container,
        free: false,
        aside: true,
        ...at,
        width: 400,
        height: 300,
        grewFrom: { width: 160, height: 72 },
      }),
      shape('world/box/x', 1),
      shape('world/box/y', 1),
      ...beside,
    ];
  }

  it('keeps its top left and moves what it now covers right or down by the least, in order', async () => {
    const shapes = expanding([
      shape('world/right', 0, { free: false, aside: true, x: 224, y: 48 }),
      shape('world/farther', 0, { free: false, aside: true, x: 424, y: 48 }),
      shape('world/below', 0, { free: false, aside: true, x: 24, y: 160 }),
      shape('world/pinned', 0, { free: false, x: 1200, y: 600 }),
    ]);
    const given = onePass(shapes, [[2, 3]]);
    const result = await layOut(given, elk);
    const at = new Map(result.shapes.map((each) => [each.key, each]));
    expect(at.has('world/box')).toBe(false);
    expect(at.has('world/pinned')).toBe(false);
    const box = placedRects(given, result.shapes).get('world/box') as Rect;
    expect([box.x, box.y]).toEqual([24, 48]);
    const rects = placedRects(given, result.shapes);
    const grownBox = {
      ...box,
      width:
        Math.max(
          ...['x', 'y'].map((key) => {
            const rect = rects.get(`world/box/${key}`) as Rect;
            return rect.x + rect.width - box.x;
          }),
        ) + CONTENTS_ORIGIN.x,
    };
    // What lay right of it moves right, what lay below moves down, each clear of what moved before.
    const right = at.get('world/right') as LaidOutShape;
    const farther = at.get('world/farther') as LaidOutShape;
    expect(right.y).toBe(48);
    expect(right.x).toBeGreaterThanOrEqual(grownBox.x + grownBox.width);
    expect(farther.x).toBeGreaterThanOrEqual(right.x + 160);
    expect(at.get('world/below')?.x).toBe(24);
    expect(right.aside).toBe(true);
  });

  it('grows toward the free room on its left inside its container, keeping its top right', async () => {
    const shapes = expanding(
      [
        shape('world/left', 0, { free: false, aside: true, x: 24, y: 48, width: 80 }),
        shape('world/right', 0, { free: false, aside: true, x: 1880, y: 48, width: 80 }),
      ],
      { x: 1680, y: 48 },
    );
    const given = onePass(shapes, [[2, 3]]);
    const result = await layOut(given, elk);
    const box = result.shapes.find((each) => each.key === 'world/box');
    const rects = placedRects(given, result.shapes);
    const right = Math.max(
      ...['x', 'y'].map((key) => {
        const rect = rects.get(`world/box/${key}`) as Rect;
        return rect.x + rect.width;
      }),
    );
    // It moved left by what it grew, so that its right side stays where it was, about.
    expect(box?.x).toBeLessThan(1680);
    expect(right + CONTENTS_ORIGIN.x).toBeLessThanOrEqual(1680 + 160 + LAYOUT_STEP);
    expect(result.shapes.some((each) => each.key === 'world/right')).toBe(false);
  });
});
