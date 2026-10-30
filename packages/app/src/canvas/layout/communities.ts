/**
 * Communities of references (ADR 0080, section 1): a container that holds more than
 * `COMMUNITY_BEYOND` related contents and no containers is split into groups of contents that refer
 * to one another, so that the one-pass layout arranges each group as a block and tables that refer to
 * one another sit together. The groups are a layout aid only: they are never model data, nothing
 * draws them, and nothing stores them.
 *
 * The groups are found with Louvain's method (Blondel, Guillaume, Lambiotte and Lefebvre, 2008),
 * written here in a few dozen lines rather than taken from a package: each node in turn joins the
 * neighbouring group that raises modularity most, until none moves; then each group becomes one node
 * and it starts again, until nothing changes. Leiden refines Louvain's groups so that each stays
 * connected; here a group that is not connected is split into its connected parts afterwards, which
 * gives that guarantee for what layout needs. It visits nodes in their order, so the same graph gives
 * the same groups every time.
 */
import type { WholeEdge, WholeNode } from './whole';

/** Beyond this many related contents, a container with no containers is split into communities. */
export const COMMUNITY_BEYOND = 30;

/** How many passes over the nodes one level makes at most, whatever the graph. */
const MOST_PASSES = 32;
/** How many levels of grouping at most. */
const MOST_LEVELS = 16;

/** A relation between two nodes, by index, with its weight. */
export type WeightedEdge = readonly [number, number, number];

/**
 * The community of each of `count` nodes, numbered from 0 in the order of their first node; a node
 * no edge reaches is a community of its own.
 */
export function louvain(count: number, edges: readonly WeightedEdge[]): number[] {
  // Each node's community at the start: itself.
  let membership = Array.from({ length: count }, (_, at) => at);
  let graph = graphOf(count, edges);
  for (let level = 0; level < MOST_LEVELS; level++) {
    const groups = oneLevel(graph);
    const moved = groups.some((group, at) => group !== at);
    if (!moved) break;
    membership = membership.map((node) => groups[node] as number);
    graph = aggregated(graph, groups);
  }
  return connectedParts(count, edges, renumbered(membership));
}

/** An undirected weighted graph: each node's neighbours and weights, its self-loops apart. */
interface Graph {
  count: number;
  neighbours: Map<number, number>[];
  /** Twice the sum of every edge's weight: each edge counted from both ends. */
  total: number;
  /** The sum of the weights of each node's edges, a self-loop counted twice. */
  degree: number[];
}

function graphOf(count: number, edges: readonly WeightedEdge[]): Graph {
  const neighbours = Array.from({ length: count }, () => new Map<number, number>());
  const degree = new Array<number>(count).fill(0);
  let total = 0;
  for (const [a, b, weight] of edges) {
    if (!(weight > 0) || a < 0 || b < 0 || a >= count || b >= count) continue;
    const na = neighbours[a] as Map<number, number>;
    const nb = neighbours[b] as Map<number, number>;
    na.set(b, (na.get(b) ?? 0) + weight);
    if (a !== b) nb.set(a, (nb.get(a) ?? 0) + weight);
    degree[a] = (degree[a] as number) + weight;
    degree[b] = (degree[b] as number) + weight;
    total += 2 * weight;
  }
  return { count, neighbours, total, degree };
}

/**
 * One level of Louvain: each node, in order, moves to the neighbouring community that gains most
 * modularity, until a pass moves none. Gives each node's community, as the index of a node in it.
 */
function oneLevel(graph: Graph): number[] {
  const { count, neighbours, total, degree } = graph;
  const community = Array.from({ length: count }, (_, at) => at);
  if (total === 0) return community;
  // The sum of the degrees of the nodes in each community.
  const sum = degree.slice();
  for (let pass = 0; pass < MOST_PASSES; pass++) {
    let moved = false;
    for (let node = 0; node < count; node++) {
      const own = community[node] as number;
      const k = degree[node] as number;
      // The weight from this node into each neighbouring community.
      const into = new Map<number, number>();
      for (const [other, weight] of neighbours[node] as Map<number, number>) {
        if (other === node) continue;
        const group = community[other] as number;
        into.set(group, (into.get(group) ?? 0) + weight);
      }
      sum[own] = (sum[own] as number) - k;
      // The gain of joining a community, up to a factor common to all: k_in - sum * k / m.
      const gain = (group: number) => (into.get(group) ?? 0) - ((sum[group] as number) * k) / total;
      let best = own;
      let bestGain = gain(own);
      // In the order of the communities, so that a tie goes the same way every time.
      for (const group of [...into.keys()].sort((a, b) => a - b)) {
        const value = gain(group);
        if (value > bestGain + 1e-12) {
          best = group;
          bestGain = value;
        }
      }
      sum[best] = (sum[best] as number) + k;
      if (best !== own) {
        community[node] = best;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return community;
}

/** The graph whose nodes are the communities of `graph`, by the index `groups` gives each. */
function aggregated(graph: Graph, groups: readonly number[]): Graph {
  const ids = new Map<number, number>();
  for (const group of groups) if (!ids.has(group)) ids.set(group, ids.size);
  const edges: [number, number, number][] = [];
  graph.neighbours.forEach((list, node) => {
    const a = ids.get(groups[node] as number) as number;
    for (const [other, weight] of list) {
      // Each edge once: from its lower end, or a self-loop as it is.
      if (other < node) continue;
      const b = ids.get(groups[other] as number) as number;
      edges.push([a, b, weight]);
    }
  });
  const next = graphOf(ids.size, edges);
  return next;
}

/** Communities numbered from 0 in the order of their first node. */
function renumbered(membership: readonly number[]): number[] {
  const ids = new Map<number, number>();
  return membership.map((group) => {
    let id = ids.get(group);
    if (id === undefined) {
      id = ids.size;
      ids.set(group, id);
    }
    return id;
  });
}

/** Each community split into its connected parts, numbered again in the order of their first node. */
function connectedParts(
  count: number,
  edges: readonly WeightedEdge[],
  membership: readonly number[],
): number[] {
  const parent = Array.from({ length: count }, (_, at) => at);
  const find = (at: number): number => {
    let root = at;
    while (parent[root] !== root) root = parent[root] as number;
    while (parent[at] !== root) {
      const next = parent[at] as number;
      parent[at] = root;
      at = next;
    }
    return root;
  };
  for (const [a, b, weight] of edges) {
    if (!(weight > 0) || a < 0 || b < 0 || a >= count || b >= count) continue;
    if (membership[a] !== membership[b]) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  return renumbered(Array.from({ length: count }, (_, at) => find(at)));
}

/** The room a community leaves around its contents: blocks read apart, 40 + 2 × 16 between them. */
export const COMMUNITY_PADDING = { top: 16, left: 16, bottom: 16, right: 16 } as const;

/** The first shape number given to a community's node; shapes are numbered from 0 up. */
const FIRST_COMMUNITY = -1000;

/**
 * The nodes of a one-pass run with communities (ADR 0080, section 1): in each container of the run,
 * World included, that holds more than `COMMUNITY_BEYOND` nodes and no compound one, the nodes of
 * each community of two or more are moved into a compound node of their own, numbered from
 * `FIRST_COMMUNITY` down. A node alone in its community stays where it was. The run arranges each
 * community as a block; nothing reads the communities' own places.
 */
export function withCommunities(
  nodes: readonly WholeNode[],
  edges: readonly WholeEdge[],
): WholeNode[] {
  const children = new Map<number | undefined, WholeNode[]>();
  for (const node of nodes) {
    const list = children.get(node.parent);
    if (list) list.push(node);
    else children.set(node.parent, [node]);
  }
  const moved = new Map<number, number>();
  const added: WholeNode[] = [];
  let next = FIRST_COMMUNITY;
  for (const [parent, list] of children) {
    if (list.length <= COMMUNITY_BEYOND || list.some((node) => node.compound)) continue;
    const index = new Map(list.map((node, at) => [node.shape, at]));
    const weighted: WeightedEdge[] = [];
    for (const edge of edges) {
      const a = index.get(edge.from.node);
      const b = index.get(edge.to.node);
      if (a === undefined || b === undefined || a === b) continue;
      weighted.push([a, b, 1]);
    }
    const groups = louvain(list.length, weighted);
    const sizes = new Map<number, number>();
    for (const group of groups) sizes.set(group, (sizes.get(group) ?? 0) + 1);
    // One community of two or more orders nothing.
    if ([...sizes.values()].filter((size) => size >= 2).length < 2) continue;
    const ids = new Map<number, number>();
    groups.forEach((group, at) => {
      if ((sizes.get(group) ?? 0) < 2) return;
      let id = ids.get(group);
      if (id === undefined) {
        id = next;
        next -= 1;
        ids.set(group, id);
        added.push({
          shape: id,
          parent,
          compound: true,
          community: true,
          size: { width: 0, height: 0 },
        });
      }
      moved.set((list[at] as WholeNode).shape, id);
    });
  }
  if (added.length === 0) return [...nodes];
  return [
    ...added,
    ...nodes.map((node) => {
      const community = moved.get(node.shape);
      return community === undefined ? node : { ...node, parent: community };
    }),
  ];
}
