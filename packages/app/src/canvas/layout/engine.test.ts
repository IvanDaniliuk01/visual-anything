import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../geometry';
import { CONTENTS_ORIGIN } from '../scene';
import { blockGraph, chunksOf, layOut, strongestRelations, type ElkEngine } from './engine';
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
    relations: edges.map(([from, to], at) => ({ relation: `r${at}`, from, to })),
    obstacles,
  } satisfies LayoutInput;
}

function byElement(shapes: readonly LaidOutShape[]): Map<string, LaidOutShape> {
  return new Map(shapes.map((each) => [`${each.element} in ${each.container ?? 'World'}`, each]));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('the automatic layout of new shapes (ADR 0080, Stage 1b)', () => {
  it("gives a relation that leaves a container a port on the container's side, as beyond the budget", async () => {
    // b refers to c inside a; d refers out of a, to e in World. No one pass: new shapes.
    const shapes = [
      shape('a', -1, container),
      shape('a/b', 0),
      shape('a/c', 0),
      shape('a/d', 0),
      shape('e', -1),
    ];
    const graphs: ElkNode[] = [];
    const watching: ElkEngine = {
      layout: (graph) => {
        graphs.push(...(graph.children ?? []));
        return elk.layout(graph);
      },
    };
    const result = await layOut(
      input(shapes, [
        [1, 2],
        [3, 4],
      ]),
      watching,
    );
    expect(result.stats.onePass).toBeUndefined();
    const inside = graphs.find((graph) => graph.id === 'level 0');
    expect(inside?.ports?.map((port) => port.id)).toEqual(['level 0:east']);
    // d leans toward the side its relation leaves by: after b, which comes first in the flow.
    const placed = byElement(result.shapes);
    expect(placed.get('d in a')?.x ?? 0).toBeGreaterThan(placed.get('b in a')?.x ?? Infinity);
  });
});

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
    expect(stats).toMatchObject({ levels: 2, shapes: 5, relations: 2 });
  });

  it('keeps the shapes it may not move where they are and places the others clear of them', async () => {
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
    const other = new ELK();
    const second = vi.fn(other.layout.bind(other));
    const progress: number[] = [];
    // One container a chunk, so that the two engines take them in turn.
    const shared = await layOut(input(shapes, edges), [{ layout: first }, { layout: second }], {
      chunkWork: 5,
      onProgress: ({ done }) => progress.push(done),
    });
    expect(shared.shapes).toEqual(alone.shapes);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(first.mock.calls.length + second.mock.calls.length).toBe(6);
    expect(shared.stats.elkRuns).toBe(6);
    // Each chunk done is a step: the five containers, then World.
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps a short flow in one row, and wraps a long one into rows about 1.6 times wider than tall', async () => {
    const chain = (length: number) => {
      const shapes = Array.from({ length }, (_, at) => shape(`c${at}`, -1));
      const edges = shapes.slice(1).map((_, at): [number, number] => [at, at + 1]);
      return input(shapes, edges);
    };
    const short = await layOut(chain(5), elk);
    expect(new Set(short.shapes.map((each) => each.y)).size).toBe(1);
    const long = await layOut(chain(24), elk);
    const right = Math.max(...long.shapes.map((each) => each.x + 160));
    const bottom = Math.max(...long.shapes.map((each) => each.y + 72));
    expect(right / bottom).toBeGreaterThan(0.8);
    expect(right / bottom).toBeLessThan(3);
  });

  it('reports its progress, container by container, up to all of them', async () => {
    const shapes = [
      shape('a', -1, container),
      shape('a/x', 0),
      shape('a/y', 0),
      shape('b', -1, container),
      shape('b/z', 3),
      shape('c', -1),
    ];
    const seen: { done: number; total: number }[] = [];
    await layOut(input(shapes, [[1, 2]]), elk, { onProgress: (progress) => seen.push(progress) });
    expect(seen.at(-1)).toEqual({ done: 3, total: 3 });
    expect(seen.map((each) => each.done)).toEqual([...seen.map((each) => each.done)].sort());
  });

  it('packs in rows what ELK has not arranged when its time runs out, and stops ELK', async () => {
    const stop = vi.fn();
    const never: ElkEngine = { layout: () => new Promise(() => {}), stop };
    const shapes = [
      shape('a', -1, container),
      shape('a/x', 0),
      shape('a/y', 0),
      shape('b', -1),
      shape('c', -1),
    ];
    const { shapes: placed, stats } = await layOut(
      input(shapes, [
        [1, 2],
        [3, 4],
      ]),
      never,
      {
        timeLimit: 30,
      },
    );
    expect(placed.map((each) => each.element).sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
    // The container's run was stopped; World, after the time ran out, never went to ELK.
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ packedForTime: 2, elkRuns: 1 });
    for (const each of placed) expect(Number.isInteger(each.x / LAYOUT_STEP)).toBe(true);
  });

  it('waits for ELK as long as it takes without a time limit', async () => {
    const slow: ElkEngine = {
      layout: (graph) =>
        new Promise((resolve) => setTimeout(() => resolve(elk.layout(structuredClone(graph))), 20)),
    };
    const shapes = [shape('a', -1), shape('b', -1)];
    const { stats } = await layOut(input(shapes, [[0, 1]]), slow, {
      timeLimit: Number.POSITIVE_INFINITY,
    });
    expect(stats.packedForTime).toBe(0);
  });

  it('gives nothing back when nothing is free', async () => {
    const { shapes: placed } = await layOut(input([shape('a', -1, { free: false })]), elk);
    expect(placed).toEqual([]);
  });
});

describe('strongestRelations', () => {
  const lifted = (pairs: [number, number][]) =>
    pairs.map(([u, v]) => ({ u, v, uDirect: true, vDirect: true }));

  it('keeps every relation of a level within the budget', () => {
    const all = lifted([
      [0, 1],
      [1, 2],
      [2, 0],
      [0, 2],
    ]);
    expect(strongestRelations(all, 3)).toEqual(all);
  });

  it('beyond it, keeps the pairs related by the most relations, then the first ones', () => {
    // 400 shapes may have 410 pairs: 400 + 4000 / 400.
    const pairs: [number, number][] = [];
    // 500 different pairs, each related once.
    for (let at = 0; at < 500; at++) pairs.push([at % 400, (at + 1 + Math.floor(at / 400)) % 400]);
    // The last pair, related three times, is kept before pairs related once.
    pairs.push([5, 9], [5, 9], [5, 9]);
    const kept = strongestRelations(lifted(pairs), 400);
    const keys = new Set(kept.map((each) => `${each.u}>${each.v}`));
    expect(keys.size).toBe(410);
    expect(keys.has('5>9')).toBe(true);
    expect(kept.filter((each) => each.u === 5 && each.v === 9)).toHaveLength(3);
    // The other pairs kept are the first ones.
    expect(keys.has(`${pairs[0]?.[0]}>${pairs[0]?.[1]}`)).toBe(true);
    expect(keys.has(`${pairs[499]?.[0]}>${pairs[499]?.[1]}`)).toBe(false);
  });
});

describe('chunksOf', () => {
  const graph = (id: string, nodes: number): ElkNode => ({
    id,
    children: Array.from({ length: nodes }, (_, at) => ({ id: `${id}${at}` })),
  });

  it('cuts graphs into chunks of at most the work given, in order, keeping every graph once', () => {
    const graphs = [graph('a', 2), graph('b', 9), graph('c', 4), graph('d', 5), graph('e', 1)];
    expect(chunksOf(graphs, 10).map((chunk) => chunk.map((each) => each.id))).toEqual([
      ['a'],
      ['b'],
      ['c', 'd', 'e'],
    ]);
  });

  it('gives a graph larger than the work a chunk of its own', () => {
    expect(chunksOf([graph('a', 30), graph('b', 1)], 10).map((chunk) => chunk.length)).toEqual([
      1, 1,
    ]);
    expect(chunksOf([], 10)).toEqual([]);
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

  it("makes a port on the container's side for each relation that leaves it, beyond the budget", () => {
    // 0 and 1 relate inside; 2 relates to a shape outside, to the east; 1 is related from the west.
    const graph = blockGraph(
      'level 7',
      [0, 1, 2],
      sizes,
      () => undefined,
      [{ u: 0, v: 1, uDirect: true, vDirect: true }],
      [
        { node: 2, toward: 'east', direct: true },
        { node: 1, toward: 'west', direct: true },
      ],
    );
    expect(graph.layoutOptions?.['elk.portConstraints']).toBe('FIXED_SIDE');
    expect(graph.ports).toEqual([
      {
        id: 'level 7:east',
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': 'EAST' },
      },
      {
        id: 'level 7:west',
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': 'WEST' },
      },
    ]);
    expect(graph.edges).toEqual([
      { id: 'e0', sources: ['s0'], targets: ['s1'] },
      { id: 'e1', sources: ['s2'], targets: ['level 7:east'] },
      { id: 'e2', sources: ['level 7:west'], targets: ['s1'] },
    ]);
  });

  it('leans a shape related out of its container toward the side its relation leaves by', async () => {
    const graph = blockGraph(
      'level 7',
      [0, 1, 2],
      sizes,
      () => undefined,
      [{ u: 0, v: 1, uDirect: true, vDirect: true }],
      [{ node: 2, toward: 'east', direct: true }],
    );
    const laid = await elk.layout({
      id: 'run',
      layoutOptions: {
        'elk.algorithm': 'org.eclipse.elk.fixed',
        'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      },
      children: [graph],
    });
    const xs = new Map(laid.children?.[0]?.children?.map((child) => [child.id, child.x ?? 0]));
    expect(xs.get('s2')).toBeGreaterThan(xs.get('s1') ?? Infinity);
  });

  it('gives ELK each relation between the same ends and points once', () => {
    const graph = blockGraph('level', [0, 1], sizes, () => undefined, [
      { u: 0, v: 1, uDirect: true, vDirect: true },
      { u: 0, v: 1, uDirect: false, vDirect: true },
    ]);
    expect(graph.edges).toHaveLength(1);
  });
});
