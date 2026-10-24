import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../geometry';
import { CONTENTS_ORIGIN } from '../scene';
import { blockGraph, layOut, shareOut, type ElkEngine } from './engine';
import { LAYOUT_STEP, type LaidOutShape, type LayoutInput, type LayoutShape } from './types';

const elk: ElkEngine = new ELK();

/** A shape of an input, free unless told otherwise, 160 by 72 where it is told nothing. */
function shape(
  key: string,
  parent: number,
  options: Partial<Omit<LayoutShape, 'key' | 'parent'>> = {},
): LayoutShape {
  const element = key.split('/').at(-1) as string;
  return { key, element, parent, free: true, x: 0, y: 0, width: 160, height: 72, ...options };
}

const container = { baseWidth: 160, baseHeight: 72, width: 400, height: 300 };

function input(shapes: LayoutShape[], edges: [number, number][] = [], obstacles: Rect[] = []) {
  return {
    shapes,
    edges: edges.map(([from, to], at) => ({ relation: `r${at}`, from, to })),
    obstacles,
  } satisfies LayoutInput;
}

function byElement(shapes: readonly LaidOutShape[]): Map<string, LaidOutShape> {
  return new Map(shapes.map((each) => [`${each.element} in ${each.container ?? 'World'}`, each]));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('layOut', () => {
  it('arranges every free shape on the step of 8, containers growing around their contents', async () => {
    const shapes = [
      shape('a', -1, container),
      shape('a/b', 0),
      shape('a/c', 0),
      shape('d', -1),
      shape('e', -1),
    ];
    const { shapes: placed, stats } = await layOut(
      input(shapes, [
        [1, 2],
        [3, 4],
      ]),
      elk,
    );
    const at = byElement(placed);
    expect([...at.keys()].sort()).toEqual([
      'a in World',
      'b in a',
      'c in a',
      'd in World',
      'e in World',
    ]);
    for (const each of placed) {
      expect(Number.isInteger(each.x / LAYOUT_STEP)).toBe(true);
      expect(Number.isInteger(each.y / LAYOUT_STEP)).toBe(true);
    }
    // The contents start at the container's contents origin, and follow their relation.
    const b = at.get('b in a') as LaidOutShape;
    const c = at.get('c in a') as LaidOutShape;
    expect(Math.min(b.x, c.x)).toBe(CONTENTS_ORIGIN.x);
    expect(Math.min(b.y, c.y)).toBe(CONTENTS_ORIGIN.y);
    expect(c.x).toBeGreaterThan(b.x + 160);
    expect(stats).toMatchObject({ levels: 2, shapes: 5, edges: 2 });
  });

  it('keeps fixed shapes where they are and places the others clear of them', async () => {
    const shapes = [
      shape('kept', -1, { free: false, x: 400, y: 200, width: 300, height: 200 }),
      shape('a', -1),
      shape('b', -1),
      shape('c', -1),
    ];
    const { shapes: placed } = await layOut(input(shapes, [[1, 2]]), elk);
    expect(placed.map((each) => each.element).sort()).toEqual(['a', 'b', 'c']);
    for (const each of placed) {
      expect(
        overlaps({ ...each, width: 160, height: 72 }, { x: 400, y: 200, width: 300, height: 200 }),
      ).toBe(false);
    }
  });

  it('places what relations lead into from a kept shape beside it', async () => {
    const shapes = [
      shape('kept', -1, { free: false, x: 40, y: 200, width: 140, height: 80 }),
      shape('a', -1),
      shape('b', -1),
    ];
    const { shapes: placed } = await layOut(
      input(shapes, [
        [0, 1],
        [1, 2],
      ]),
      elk,
    );
    const at = byElement(placed);
    expect(at.get('a in World')?.x).toBeGreaterThanOrEqual(180);
    expect(at.get('a in World')?.y).toBe(200);
  });

  it('leaves out of the way notes and arrows in World', async () => {
    const note = { x: 0, y: 0, width: 300, height: 100 };
    const { shapes: placed } = await layOut(
      input([shape('a', -1), shape('b', -1)], [], [note]),
      elk,
    );
    for (const each of placed)
      expect(overlaps({ ...each, width: 160, height: 72 }, note)).toBe(false);
  });

  it('keeps a block in World where its shapes are now', async () => {
    const shapes = [shape('a', -1, { x: 1003, y: 517 }), shape('b', -1, { x: 1400, y: 900 })];
    const { shapes: placed } = await layOut(input(shapes), elk);
    expect(Math.min(...placed.map((each) => each.x))).toBe(1000);
    expect(Math.min(...placed.map((each) => each.y))).toBe(520);
  });

  it('orders containers by the relations between their contents', async () => {
    const shapes = [
      shape('a', -1, container),
      shape('a/x', 0, { free: false, x: 24, y: 48 }),
      shape('b', -1, container),
      shape('b/y', 2, { free: false, x: 24, y: 48 }),
    ];
    // y → x, so b comes before a.
    const { shapes: placed } = await layOut(input(shapes, [[3, 1]]), elk);
    const at = byElement(placed);
    expect((at.get('b in World') as LaidOutShape).x + 208).toBeLessThanOrEqual(
      (at.get('a in World') as LaidOutShape).x,
    );
  });

  it('sizes a container from its contents as laid out, so that it never covers its neighbours', async () => {
    const many = Array.from({ length: 12 }, (_, at) => shape(`a/c${at}`, 0));
    const shapes = [shape('a', -1, container), ...many, shape('b', -1), shape('c', -1)];
    const { shapes: placed } = await layOut(input(shapes), elk);
    const at = byElement(placed);
    const contents = placed.filter((each) => each.container === 'a');
    const right = Math.max(...contents.map((each) => each.x + 160)) + CONTENTS_ORIGIN.x;
    const bottom = Math.max(...contents.map((each) => each.y + 72)) + CONTENTS_ORIGIN.x;
    const a = at.get('a in World') as LaidOutShape;
    const box = { x: a.x, y: a.y, width: right, height: bottom };
    for (const other of ['b in World', 'c in World']) {
      expect(overlaps(box, { ...(at.get(other) as LaidOutShape), width: 160, height: 72 })).toBe(
        false,
      );
    }
  });

  it('lays out the contents of every copy of a container once', async () => {
    const shapes = [
      shape('p', -1, container),
      shape('p/shared', 0, container),
      shape('p/shared/x', 1),
      shape('q', -1, container),
      shape('q/shared', 3, container),
      shape('q/shared/x', 4),
    ];
    const { shapes: placed } = await layOut(input(shapes), elk);
    expect(placed.filter((each) => each.element === 'x')).toEqual([
      { key: 'p/shared/x', element: 'x', container: 'shared', x: 24, y: 48 },
    ]);
    expect(
      placed.filter((each) => each.element === 'shared').map((each) => each.container),
    ).toEqual(['p', 'q']);
  });

  it('packs shapes without relations in rows, without running ELK', async () => {
    const layout = vi.fn(elk.layout.bind(elk));
    const shapes = Array.from({ length: 9 }, (_, at) => shape(`s${at}`, -1));
    const { shapes: placed, stats } = await layOut(input(shapes), { layout });
    expect(layout).not.toHaveBeenCalled();
    expect(stats.elkRuns).toBe(0);
    expect(new Set(placed.map((each) => each.y)).size).toBeGreaterThan(1);
  });

  it('runs ELK once for all the containers of one depth', async () => {
    const layout = vi.fn(elk.layout.bind(elk));
    const shapes: LayoutShape[] = [];
    for (let system = 0; system < 3; system++) {
      const at = shapes.length;
      shapes.push(shape(`s${system}`, -1, container));
      shapes.push(shape(`s${system}/a`, at), shape(`s${system}/b`, at));
    }
    const edges: [number, number][] = [
      [1, 2],
      [4, 5],
      [7, 8],
      [2, 4],
    ];
    const { stats } = await layOut(input(shapes, edges), { layout });
    expect(layout).toHaveBeenCalledTimes(2);
    expect(stats.elkRuns).toBe(2);
  });

  it('shares the containers of one depth out among several engines, with the same result', async () => {
    const shapes: LayoutShape[] = [];
    const edges: [number, number][] = [];
    for (let system = 0; system < 5; system++) {
      const at = shapes.length;
      shapes.push(shape(`s${system}`, -1, container));
      shapes.push(shape(`s${system}/a`, at), shape(`s${system}/b`, at), shape(`s${system}/c`, at));
      edges.push([at + 1, at + 2], [at + 2, at + 3]);
    }
    edges.push([1, 5]);
    const alone = await layOut(input(shapes, edges), elk);
    const first = vi.fn(elk.layout.bind(elk));
    const second = vi.fn(new ELK().layout.bind(new ELK()));
    const shared = await layOut(input(shapes, edges), [{ layout: first }, { layout: second }]);
    expect(shared.shapes).toEqual(alone.shapes);
    // The containers go to both; World, a single block, to one.
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
    expect(shared.stats.elkRuns).toBe(3);
  });

  it('gives nothing back when nothing is free', async () => {
    const { shapes: placed } = await layOut(input([shape('a', -1, { free: false })]), elk);
    expect(placed).toEqual([]);
  });
});

describe('shareOut', () => {
  const graph = (id: string, nodes: number): ElkNode => ({
    id,
    children: Array.from({ length: nodes }, (_, at) => ({ id: `${id}${at}` })),
  });

  it('gives each run about the same work, the largest first, and keeps every graph once', () => {
    const graphs = [graph('a', 2), graph('b', 9), graph('c', 4), graph('d', 5), graph('e', 1)];
    const shares = shareOut(graphs, 2);
    expect(shares.map((share) => share.map((each) => each.id))).toEqual([
      ['b', 'a'],
      ['d', 'c', 'e'],
    ]);
  });

  it('never makes more runs than graphs, nor fewer than one', () => {
    expect(shareOut([graph('a', 1)], 3)).toHaveLength(1);
    expect(shareOut([graph('a', 1), graph('b', 1)], 0)).toHaveLength(1);
  });
});

describe('blockGraph', () => {
  const sizes = new Map([
    [0, { width: 200, height: 80 }],
    [1, { width: 200, height: 80 }],
    [2, { width: 200, height: 80 }],
  ]);
  const points = [
    { name: 'in', side: 'left' as const, at: 0.5 },
    { name: 'out', side: 'right' as const, at: 0.5 },
  ];

  it('makes ports of the connection points relations end on, on their sides', () => {
    const graph = blockGraph('level', [0, 1], sizes, (node) => (node === 1 ? points : undefined), [
      { u: 0, v: 1, uDirect: true, vDirect: true },
    ]);
    const target = graph.children?.find((child) => child.id === 's1') as ElkNode;
    expect(target.layoutOptions).toEqual({ 'elk.portConstraints': 'FIXED_POS' });
    expect(target.ports).toEqual([
      { id: 's1:0', x: 0, y: 40, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } },
    ]);
    expect(graph.edges).toEqual([{ id: 'e0', sources: ['s0'], targets: ['s1:0'] }]);
  });

  it('attaches to the border where a shape has no connection points, or a relation reaches inside it', () => {
    const graph = blockGraph('level', [0, 1], sizes, () => points, [
      { u: 0, v: 1, uDirect: false, vDirect: false },
    ]);
    expect(graph.children?.every((child) => child.ports === undefined)).toBe(true);
    expect(graph.edges).toEqual([{ id: 'e0', sources: ['s0'], targets: ['s1'] }]);
  });

  it('turns the ports of a relation that closes a cycle around, so that none has to be reversed', () => {
    const graph = blockGraph('level', [0, 1, 2], sizes, () => points, [
      { u: 0, v: 1, uDirect: true, vDirect: true },
      { u: 1, v: 2, uDirect: true, vDirect: true },
      { u: 2, v: 0, uDirect: true, vDirect: true },
    ]);
    expect(graph.edges).toEqual([
      { id: 'e0', sources: ['s0:1'], targets: ['s1:0'] },
      { id: 'e1', sources: ['s1:1'], targets: ['s2:0'] },
      // The back relation leaves its start westwards and enters its end from the east.
      { id: 'e2', sources: ['s2:0'], targets: ['s0:1'] },
    ]);
  });

  it('gives ELK each relation between the same ends and points once', () => {
    const graph = blockGraph('level', [0, 1], sizes, () => undefined, [
      { u: 0, v: 1, uDirect: true, vDirect: true },
      { u: 0, v: 1, uDirect: false, vDirect: true },
    ]);
    expect(graph.edges).toHaveLength(1);
  });
});
