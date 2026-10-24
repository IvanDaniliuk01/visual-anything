/**
 * The layout itself, run in the layout worker. Each container, and World, arranges its own contents,
 * innermost first, so that a container's size is known before it is arranged among its neighbours:
 *
 * 1. At each level, the free shapes form one block. ELK's layered algorithm arranges the block from
 *    the relations between them, each lifted to the level where its ends meet: a relation between the
 *    contents of two containers orders the two containers. A relation that ends on a shape with
 *    connection points ends on a port there; elsewhere it attaches anywhere on the border. A block
 *    with no relation inside it is packed in rows, which needs no ELK.
 * 2. The block is placed clear of the fixed shapes at that level (`placeBlock`), and every position
 *    is rounded to the step of 8, relative to the container.
 * 3. A container then takes the size the scene will give it around its contents.
 *
 * Every copy of a container shares its contents' positions (ADR-0019), so each container's contents
 * are arranged once, through its first copy. ELK costs most per run, so every container of one
 * nesting depth is arranged in a single run.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort, LayoutOptions } from 'elkjs/lib/elk-api';
import { boundsOf, type Point, type Rect, type Size } from '../geometry';
import { measuredSize, packInRows, placeBlock, roundToStep } from './place';
import { ELK_SIDES, pointOnBorder, pointToward } from './ports';
import {
  LAYER_GAP,
  NODE_GAP,
  type LaidOutShape,
  type LayoutConnectionPoint,
  type LayoutInput,
  type LayoutResult,
} from './types';

/** What the layout needs of ELK: elkjs's `layout`, in the worker or, in tests, in the same thread. */
export interface ElkEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/** How ELK arranges one block: left to right along the relations, in the model's order. */
const BLOCK_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  'elk.spacing.nodeNode': String(NODE_GAP),
  'elk.spacing.componentComponent': String(NODE_GAP),
  'elk.spacing.edgeNode': '24',
  'elk.spacing.edgeEdge': '16',
  'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // Only the relations that close a cycle are reversed, found depth first in the model's order, as
  // `blockGraph` finds them to choose their ports; MODEL_ORDER would reverse every relation that
  // goes against the model's order, cycle or not.
  'elk.layered.cycleBreaking.strategy': 'DFS_NODE_ORDER',
};

/** The graph that holds every block of one run: each is arranged on its own, and none moves. */
const RUN_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'org.eclipse.elk.fixed',
  'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
};

/** World, as a level. */
const WORLD = -1;

/** A relation at the level where its ends meet: between two of its contents, by shape index. */
export interface Link {
  u: number;
  v: number;
  /** Whether the relation ends on the content itself, rather than on something inside it. */
  uDirect: boolean;
  vDirect: boolean;
}

/** Arranges the free shapes of `input`, and says where each goes. */
export async function layOut(
  input: LayoutInput,
  elk: ElkEngine,
  now: () => number = () => performance.now(),
): Promise<LayoutResult> {
  const started = now();
  const tree = new Tree(input);
  const stats = { levels: 0, shapes: 0, edges: 0, elkRuns: 0, elkMs: 0, totalMs: 0 };
  const placed: LaidOutShape[] = [];

  /** Arranges the levels given, one ELK run for all of them, and records their contents' new places. */
  const arrange = async (levels: readonly number[]): Promise<void> => {
    const blocks: { level: number; nodes: number[]; places: Map<number, Point> }[] = [];
    const graphs: ElkNode[] = [];
    for (const level of levels) {
      const nodes = tree.childrenOf(level).filter((child) => input.shapes[child]?.free);
      if (nodes.length === 0) continue;
      stats.levels += 1;
      stats.shapes += nodes.length;
      const links = tree.linksAt(level);
      const block = { level, nodes, places: new Map<number, Point>() };
      blocks.push(block);
      if (links.length === 0) {
        const rows = packInRows(nodes.map((node) => tree.sizeOf(node)));
        nodes.forEach((node, at) => block.places.set(node, rows[at] as Point));
      } else {
        const sizes = new Map(nodes.map((node) => [node, tree.sizeOf(node)]));
        const graph = blockGraph(
          `level ${level}`,
          nodes,
          sizes,
          (node) => input.shapes[node]?.points,
          links,
        );
        stats.edges += graph.edges?.length ?? 0;
        graphs.push(graph);
      }
    }
    if (graphs.length > 0) {
      const runStarted = now();
      const result = await elk.layout({ id: 'run', layoutOptions: RUN_OPTIONS, children: graphs });
      stats.elkRuns += 1;
      stats.elkMs += now() - runStarted;
      const byId = new Map((result.children ?? []).map((graph) => [graph.id, graph]));
      for (const block of blocks) {
        const graph = byId.get(`level ${block.level}`);
        for (const child of graph?.children ?? []) {
          block.places.set(Number(child.id.slice(1)), { x: child.x ?? 0, y: child.y ?? 0 });
        }
      }
    }
    for (const block of blocks) placeAt(block.level, block.nodes, block.places);
  };

  /** Moves a block clear of what its level keeps, on the step, and records where its shapes go. */
  const placeAt = (level: number, nodes: readonly number[], places: ReadonlyMap<number, Point>) => {
    const rects = nodes.map((node) => ({
      ...(places.get(node) ?? { x: 0, y: 0 }),
      ...tree.sizeOf(node),
    }));
    const bounds = boundsOf(rects) as Rect;
    const kept = tree
      .childrenOf(level)
      .filter((child) => !input.shapes[child]?.free)
      .map((child) => tree.rectOf(child));
    if (level === WORLD) kept.push(...input.obstacles);
    const flow = tree.flowAt(level);
    const origin = placeBlock(
      bounds,
      level === WORLD
        ? { kind: 'world', now: boundsOf(nodes.map((node) => tree.currentRectOf(node))) }
        : { kind: 'container' },
      kept,
      flow,
    );
    const container = level === WORLD ? undefined : input.shapes[level]?.element;
    nodes.forEach((node, at) => {
      const shape = input.shapes[node];
      const rect = rects[at];
      if (!shape || !rect) return;
      const x = origin.x + roundToStep(rect.x - bounds.x);
      const y = origin.y + roundToStep(rect.y - bounds.y);
      tree.moveTo(node, { x, y });
      placed.push({
        key: shape.key,
        element: shape.element,
        ...(container === undefined ? {} : { container }),
        x,
        y,
      });
    });
    if (level !== WORLD) tree.markChanged(level);
  };

  // Innermost first: every container of one depth in one run, then World.
  for (const levels of tree.levelsByHeight()) await arrange(levels);
  await arrange([WORLD]);

  stats.totalMs = now() - started;
  return { shapes: placed, stats };
}

/**
 * The ELK graph of one block: its free shapes, with ports where relations end on connection points,
 * and its relations, each pair of ends and points once. The relations are taken in order, and the
 * shapes visited in order: a relation that leads back to a shape the visit has not left yet closes a
 * cycle, and ELK reverses it, so its ports are chosen as reversed. So ELK never has to reverse a port.
 */
export function blockGraph(
  id: string,
  nodes: readonly number[],
  sizes: ReadonlyMap<number, Size>,
  pointsOf: (node: number) => readonly LayoutConnectionPoint[] | undefined,
  links: readonly Link[],
): ElkNode {
  const back = backLinks(nodes, links);
  const ports = new Map<number, Map<number, ElkPort>>();
  const endOf = (node: number, direct: boolean, toward: 'east' | 'west'): string => {
    const points = direct ? pointsOf(node) : undefined;
    const size = sizes.get(node);
    if (!points || points.length === 0 || !size) return `s${node}`;
    const at = pointToward(points, size, toward);
    const point = points[at] as LayoutConnectionPoint;
    const portId = `s${node}:${at}`;
    const own = ports.get(node) ?? new Map<number, ElkPort>();
    ports.set(node, own);
    if (!own.has(at)) {
      own.set(at, {
        id: portId,
        ...pointOnBorder(point, size),
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': ELK_SIDES[point.side] },
      });
    }
    return portId;
  };

  const edges: ElkExtendedEdge[] = [];
  const seen = new Set<string>();
  links.forEach((link, at) => {
    if (link.u === link.v) return;
    const reversed = back.has(at);
    const source = endOf(link.u, link.uDirect, reversed ? 'west' : 'east');
    const target = endOf(link.v, link.vDirect, reversed ? 'east' : 'west');
    const key = `${source}\u0000${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: `e${edges.length}`, sources: [source], targets: [target] });
  });

  return {
    id,
    layoutOptions: BLOCK_OPTIONS,
    children: nodes.map((node) => {
      const size = sizes.get(node) ?? { width: 1, height: 1 };
      const own = ports.get(node);
      return {
        id: `s${node}`,
        width: size.width,
        height: size.height,
        ...(own
          ? {
              layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
              ports: [...own.entries()].sort(([a], [b]) => a - b).map(([, port]) => port),
            }
          : {}),
      };
    }),
    edges,
  };
}

/**
 * The indexes of the links that close a cycle: visiting the nodes in order, depth first along the
 * links in order, those that lead back to a node whose visit has not ended.
 */
function backLinks(nodes: readonly number[], links: readonly Link[]): Set<number> {
  const out = new Map<number, number[]>();
  links.forEach((link, at) => {
    const list = out.get(link.u) ?? [];
    list.push(at);
    out.set(link.u, list);
  });
  const state = new Map<number, 'open' | 'done'>();
  const back = new Set<number>();
  for (const root of nodes) {
    if (state.has(root)) continue;
    // An explicit stack, so that long chains never overflow the call stack.
    const stack: { node: number; next: number }[] = [{ node: root, next: 0 }];
    state.set(root, 'open');
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as { node: number; next: number };
      const leaving = out.get(top.node) ?? [];
      if (top.next >= leaving.length) {
        state.set(top.node, 'done');
        stack.pop();
        continue;
      }
      const at = leaving[top.next] as number;
      top.next += 1;
      const target = (links[at] as Link).v;
      const seen = state.get(target);
      if (seen === 'open') back.add(at);
      else if (seen === undefined) {
        state.set(target, 'open');
        stack.push({ node: target, next: 0 });
      }
    }
  }
  return back;
}

/**
 * The shapes of the input as a tree, with what layout works out on it: each container's first copy,
 * which arranges the contents of every copy; how deep each container's contents go; the relations at
 * each level; and the places and sizes as layout changes them.
 */
class Tree {
  private readonly children = new Map<number, number[]>();
  private readonly depth: number[] = [];
  /** The first copy of each element that holds contents, by element. */
  private readonly firstCopy = new Map<string, number>();
  /** Every shape of each element that holds contents. */
  private readonly copies = new Map<string, number[]>();
  private readonly links = new Map<number, Link[]>();
  private readonly flows = new Map<number, { into: number; out: number }>();
  /** The places layout gave, by shape index. */
  private readonly moved = new Map<number, Point>();
  /** The elements whose contents layout changed, directly or deeper. */
  private readonly changed = new Set<string>();
  private readonly sizes = new Map<number, Size>();

  constructor(private readonly input: LayoutInput) {
    const { shapes } = input;
    shapes.forEach((shape, at) => {
      const parent = shape.parent >= 0 && shape.parent < at ? shape.parent : WORLD;
      this.depth[at] = parent === WORLD ? 0 : (this.depth[parent] ?? 0) + 1;
      const list = this.children.get(parent) ?? [];
      list.push(at);
      this.children.set(parent, list);
    });
    shapes.forEach((shape, at) => {
      if (!this.children.has(at)) return;
      if (!this.firstCopy.has(shape.element)) this.firstCopy.set(shape.element, at);
      const copies = this.copies.get(shape.element) ?? [];
      copies.push(at);
      this.copies.set(shape.element, copies);
    });
    for (const edge of input.edges) this.lift(edge.from, edge.to);
  }

  /** The shapes directly inside a shape, or directly in World. */
  childrenOf(level: number): readonly number[] {
    return this.children.get(level) ?? [];
  }

  linksAt(level: number): readonly Link[] {
    return this.links.get(level) ?? [];
  }

  /** How many relations lead from kept shapes into free ones at a level, and from free ones out. */
  flowAt(level: number): { into: number; out: number } {
    return this.flows.get(level) ?? { into: 0, out: 0 };
  }

  /**
   * The first copies of the containers that hold free shapes, grouped by how deep their contents go,
   * shallowest first, so that each group comes after every container inside its members.
   */
  levelsByHeight(): number[][] {
    const heights = new Map<string, number>();
    const heightOf = (element: string, path: Set<string>): number => {
      const known = heights.get(element);
      if (known !== undefined) return known;
      const first = this.firstCopy.get(element);
      if (first === undefined || path.has(element)) return 0;
      path.add(element);
      let height = 1;
      for (const child of this.childrenOf(first)) {
        const content = this.input.shapes[child]?.element as string;
        if (this.firstCopy.has(content)) height = Math.max(height, heightOf(content, path) + 1);
      }
      path.delete(element);
      heights.set(element, height);
      return height;
    };
    const groups: number[][] = [];
    for (const [element, first] of this.firstCopy) {
      const height = heightOf(element, new Set());
      (groups[height] ??= []).push(first);
    }
    return groups
      .filter((group) => group !== undefined)
      .map((group) => group.sort((a, b) => a - b));
  }

  /** The size of a shape: as layout leaves it for a container whose contents changed, else as it is. */
  sizeOf(node: number): Size {
    const shape = this.input.shapes[node];
    if (!shape) return { width: 1, height: 1 };
    const first = this.firstCopy.get(shape.element);
    if (first === undefined || !this.changed.has(shape.element)) {
      return { width: shape.width, height: shape.height };
    }
    const known = this.sizes.get(node);
    if (known) return known;
    const contents = this.childrenOf(first).map((child) => this.rectOf(child));
    const size = measuredSize(
      contents,
      { width: shape.baseWidth ?? shape.width, height: shape.baseHeight ?? shape.height },
      { width: shape.storedWidth, height: shape.storedHeight },
    );
    this.sizes.set(node, size);
    return size;
  }

  /** Where a shape is after layout so far, with its size, relative to its container. */
  rectOf(node: number): Rect {
    const shape = this.input.shapes[node];
    const place = this.moved.get(node) ?? { x: shape?.x ?? 0, y: shape?.y ?? 0 };
    return { ...place, ...this.sizeOf(node) };
  }

  /** Where a shape is before layout, with its size then. */
  currentRectOf(node: number): Rect {
    const shape = this.input.shapes[node];
    return shape
      ? { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
      : { x: 0, y: 0, width: 1, height: 1 };
  }

  moveTo(node: number, place: Point): void {
    this.moved.set(node, place);
  }

  /** Says that a container's contents changed: it, and every container it sits in, may change size. */
  markChanged(level: number): void {
    const waiting = [level];
    const seen = new Set<string>();
    for (let at = waiting.pop(); at !== undefined; at = waiting.pop()) {
      const element = this.input.shapes[at]?.element;
      if (element === undefined || seen.has(element)) continue;
      seen.add(element);
      this.changed.add(element);
      // Every copy of it may change size, and so may every container a copy sits in.
      for (const copy of this.copies.get(element) ?? []) {
        this.sizes.delete(copy);
        const parent = this.parentOf(copy);
        if (parent !== WORLD) waiting.push(parent);
      }
    }
  }

  private parentOf(node: number): number {
    const parent = this.input.shapes[node]?.parent ?? WORLD;
    return parent >= 0 && parent < node ? parent : WORLD;
  }

  /**
   * Records a relation at the level where its ends meet: between the two contents of their nearest
   * common container that hold them, in that container's first copy.
   */
  private lift(from: number, to: number): void {
    const { shapes } = this.input;
    if (from === to || !shapes[from] || !shapes[to]) return;
    let a = from;
    let b = to;
    let belowA = from;
    let belowB = to;
    while ((this.depth[a] ?? 0) > (this.depth[b] ?? 0)) [belowA, a] = [a, this.parentOf(a)];
    while ((this.depth[b] ?? 0) > (this.depth[a] ?? 0)) [belowB, b] = [b, this.parentOf(b)];
    // One end holds the other: such a relation orders nothing.
    if (a === to || b === from) return;
    while (a !== b) {
      belowA = a;
      belowB = b;
      a = this.parentOf(a);
      b = this.parentOf(b);
    }
    const level = a === WORLD ? WORLD : this.firstCopy.get(shapes[a]?.element as string);
    if (level === undefined) return;
    const u = this.contentOf(level, shapes[belowA]?.element as string);
    const v = this.contentOf(level, shapes[belowB]?.element as string);
    if (u === undefined || v === undefined || u === v) return;
    const uFree = shapes[u]?.free === true;
    const vFree = shapes[v]?.free === true;
    if (uFree && vFree) {
      const list = this.links.get(level) ?? [];
      list.push({ u, v, uDirect: belowA === from, vDirect: belowB === to });
      this.links.set(level, list);
    } else if (uFree !== vFree) {
      const flow = this.flows.get(level) ?? { into: 0, out: 0 };
      if (vFree) flow.into += 1;
      else flow.out += 1;
      this.flows.set(level, flow);
    }
  }

  private readonly contents = new Map<number, Map<string, number>>();

  /** The content of a level's first copy that is a shape of this element. */
  private contentOf(level: number, element: string): number | undefined {
    let byElement = this.contents.get(level);
    if (!byElement) {
      byElement = new Map();
      for (const child of this.childrenOf(level)) {
        const each = this.input.shapes[child]?.element;
        if (each !== undefined && !byElement.has(each)) byElement.set(each, child);
      }
      this.contents.set(level, byElement);
    }
    return byElement.get(element);
  }
}
