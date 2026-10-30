import ELK from 'elkjs/lib/elk.bundled.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { boundsOf, type Rect } from '../geometry';
import { COMMUNITY_BEYOND, louvain, withCommunities, type WeightedEdge } from './communities';
import { layOut } from './engine';
import type { LaidOutShape, LayoutInput, LayoutShape } from './types';
import type { WholeEdge, WholeNode } from './whole';

/** Every pair of `nodes`, joined. */
function clique(nodes: readonly number[]): WeightedEdge[] {
  const edges: WeightedEdge[] = [];
  nodes.forEach((a, at) => {
    for (const b of nodes.slice(at + 1)) edges.push([a, b, 1]);
  });
  return edges;
}

describe('louvain', () => {
  it('finds two cliques joined by one relation as two communities', () => {
    const edges = [...clique([0, 1, 2, 3, 4]), ...clique([5, 6, 7, 8, 9]), [4, 5, 1] as const];
    const groups = louvain(10, edges);
    expect(groups.slice(0, 5).every((group) => group === groups[0])).toBe(true);
    expect(groups.slice(5).every((group) => group === groups[5])).toBe(true);
    expect(groups[0]).not.toBe(groups[5]);
    // Numbered in the order of their first node.
    expect(groups[0]).toBe(0);
    expect(groups[5]).toBe(1);
  });

  it('leaves a node no relation reaches in a community of its own', () => {
    const groups = louvain(4, clique([0, 1, 2]));
    expect(groups[3]).not.toBe(groups[0]);
    expect(groups[0]).toBe(groups[1]);
  });

  it('gives the same communities for the same graph, each one connected', () => {
    const graph = fc.integer({ min: 2, max: 40 }).chain((count) =>
      fc.record({
        count: fc.constant(count),
        edges: fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: count - 1 }),
            fc.integer({ min: 0, max: count - 1 }),
            fc.integer({ min: 1, max: 3 }),
          ),
          { maxLength: 120 },
        ),
      }),
    );
    fc.assert(
      fc.property(graph, ({ count, edges }) => {
        const groups = louvain(count, edges);
        expect(louvain(count, edges)).toEqual(groups);
        expect(groups).toHaveLength(count);
        // Each community is connected by the edges inside it.
        const byGroup = new Map<number, number[]>();
        groups.forEach((group, node) => byGroup.set(group, [...(byGroup.get(group) ?? []), node]));
        for (const members of byGroup.values()) {
          const inside = new Set(members);
          const reached = new Set([members[0] as number]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const [a, b] of edges) {
              if (!inside.has(a) || !inside.has(b)) continue;
              if (reached.has(a) !== reached.has(b)) {
                reached.add(a);
                reached.add(b);
                grew = true;
              }
            }
          }
          expect(reached.size).toBe(members.length);
        }
      }),
    );
  });
});

/**
 * A container of 40 tables, numbered 1 to 40 after it, in two groups that refer within themselves
 * alone, their members taking turns in the model's order: odd ones, and even ones.
 */
function twoGroups(): { input: LayoutInput; odd: string[]; even: string[] } {
  const shapes: LayoutShape[] = [
    { key: 'c', element: 'c', parent: -1, free: true, x: 0, y: 0, width: 400, height: 300 },
  ];
  for (let at = 1; at <= 40; at++) {
    shapes.push({
      key: `c/t${at}`,
      element: `t${at}`,
      parent: 0,
      free: true,
      x: 0,
      y: 0,
      width: 160,
      height: 72,
    });
  }
  // Each group refers among itself closely: each table to the next four of its group.
  const relations: LayoutInput['relations'] = [];
  for (let at = 1; at <= 40; at++) {
    for (let step = 2; step <= 8 && at + step <= 40; step += 2) {
      relations.push({ relation: `r${at}-${step}`, from: at, to: at + step });
    }
  }
  // And one reference across, so that the groups are one graph.
  relations.push({ relation: 'across', from: 1, to: 2 });
  const keys = (odd: boolean) =>
    Array.from({ length: 20 }, (_, at) => `c/t${odd ? 2 * at + 1 : 2 * at + 2}`);
  return {
    input: { shapes, relations, obstacles: [], onePass: true },
    odd: keys(true),
    even: keys(false),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('communities in the one-pass layout (ADR 0080, section 1)', () => {
  it(`splits a container of more than ${COMMUNITY_BEYOND} related contents and no containers`, () => {
    const leaf = (shape: number): WholeNode => ({
      shape,
      parent: 0,
      compound: false,
      size: { width: 160, height: 72 },
    });
    const nodes: WholeNode[] = [
      { shape: 0, parent: undefined, compound: true, size: { width: 0, height: 0 } },
      ...Array.from({ length: 40 }, (_, at) => leaf(at + 1)),
    ];
    const end = (node: number) => ({ node, direct: true });
    const edges: WholeEdge[] = [];
    for (let at = 1; at + 2 <= 40; at++) edges.push({ from: end(at), to: end(at + 2) });
    const split = withCommunities(nodes, edges);
    const communities = split.filter((node) => node.community);
    expect(communities.length).toBeGreaterThanOrEqual(2);
    expect(communities.every((node) => node.parent === 0 && node.compound)).toBe(true);
    // Odd and even tables never share a community.
    const of = new Map(split.map((node) => [node.shape, node.parent]));
    for (let at = 1; at + 1 <= 40; at += 2) expect(of.get(at)).not.toBe(of.get(at + 1));
    // With 30 contents, nothing is split.
    expect(withCommunities(nodes.slice(0, 31), edges).some((node) => node.community)).toBe(false);
  });

  it('arranges each community as a block of its own', async () => {
    const { input, odd, even } = twoGroups();
    const result = await layOut(input, new ELK());
    expect(result.stats.onePass).toBe(true);
    const placed = new Map(result.shapes.map((each: LaidOutShape) => [each.key, each]));
    const block = (keys: string[]) =>
      boundsOf(
        keys.map((key) => {
          const each = placed.get(key) as LaidOutShape;
          return { x: each.x, y: each.y, width: 160, height: 72 };
        }),
      ) as Rect;
    expect(overlaps(block(odd), block(even))).toBe(false);
  });
});
