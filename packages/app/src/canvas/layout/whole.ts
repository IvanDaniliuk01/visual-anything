/**
 * One layout pass over a whole view (ADR 0080, section 1): ELK's layered algorithm arranges every
 * shape layout moves, at every depth, in one hierarchical run, so that a relation between the
 * contents of two containers is a relation between those contents, and their containers lean toward
 * each other. Pure, and run in the layout worker; `engine.ts` decides when it runs and stores what it
 * gives.
 *
 * - **Nodes.** Each container whose contents layout arranges is a compound node holding them, with
 *   room around them for its header; every other shape is a node of its own size. A shape that draws
 *   rows is one node, with a port beside each row a relation ends on (ADR 0023).
 * - **Two passes.** The first places each node in the flow, with ports east where relations leave
 *   and west where they arrive. The second puts each row's port on the side of its shape that faces
 *   the other end, east on both ends when the two stand one above the other, and keeps the order the
 *   first found (`semiInteractive`), so ELK never has to turn a port around.
 * - **Coordinates** come back relative to World, the shapes' and the routes' alike.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort, LayoutOptions } from 'elkjs/lib/elk-api';
import type { Point, Rect, Size } from '../geometry';
import { COMMUNITY_PADDING } from './communities';
import { ELK_SIDES, partPort, pointOnBorder, pointToward } from './ports';
import type { LayoutConnectionPoint, LayoutPort } from './types';

/** How ELK arranges the whole view, as ADR 0080 sets it. */
export const WHOLE_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.componentComponent': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.spacing.edgeNode': '16',
  'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.cycleBreaking.strategy': 'DFS_NODE_ORDER',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.thoroughness': '20',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.unnecessaryBendpoints': 'true',
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  // ELK's own seed, given so that one input always gives one layout (ADR 0080, Stage 3).
  'elk.randomSeed': '1',
};

/**
 * The spacings of `WHOLE_OPTIONS`, which every compound node carries too: in a hierarchical run ELK
 * reads the spacings between a compound's contents from that compound, not from the root, so without
 * them the contents of every container and community were spaced by ELK's defaults, 20 between layers
 * rather than 64, and left corridors too narrow for the lines between them (A4, from the user's
 * notes; ADR 0080's clarification of 2026-10-31).
 */
export const WHOLE_SPACINGS: LayoutOptions = Object.fromEntries(
  Object.entries(WHOLE_OPTIONS).filter(([key]) => key.includes('.spacing.')),
);

/**
 * The second pass, semi-interactive, as Stage 0a set it. ELK's semi-interactive crossing minimization
 * keeps the order of the nodes that carry `elk.position`, and only theirs; the second pass gives its
 * nodes the first pass's places as their `x` and `y`, which it does not read, so it minimizes
 * crossings afresh with the sides the first pass gave the ports. Keeping the first pass's order, or
 * the last layout's, crossed more (ADR 0080's clarification of Stage 3).
 */
const SECOND_PASS: LayoutOptions = {
  ...WHOLE_OPTIONS,
  'elk.layered.crossingMinimization.semiInteractive': 'true',
};

/** The room a compound node leaves around its contents, as ADR 0080 sets it. */
export const COMPOUND_PADDING = { top: 56, left: 24, bottom: 24, right: 24 } as const;

/**
 * The room ELK leaves inside a container whose contents keep `padding` from its sides and bottom
 * (the drawing defaults', ADR 0086): `COMPOUND_PADDING` for the canvas's own 24.
 */
export function compoundPaddingOf(
  padding: number = COMPOUND_PADDING.left,
): typeof COMPOUND_PADDING | { top: number; left: number; bottom: number; right: number } {
  if (padding === COMPOUND_PADDING.left) return COMPOUND_PADDING;
  return { top: COMPOUND_PADDING.top, left: padding, bottom: padding, right: padding };
}

/** The most shapes and relations one run is given (ADR 0080); beyond, layout goes level by level. */
export const WHOLE_SHAPES = 1500;
export const WHOLE_RELATIONS = 3000;

/** Room around a compound node's contents. */
export interface Padding {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** One node of the run: a shape, by its index in the layout input. */
export interface WholeNode {
  shape: number;
  /** The node it sits in; undefined for one directly in World. */
  parent: number | undefined;
  /** Whether it holds nodes of the run. */
  compound: boolean;
  /** A leaf's size; a compound takes the size of what it holds. */
  size: Size;
  /** Where relations attach to a leaf, as its appearance sets them. */
  points?: readonly LayoutConnectionPoint[];
  /** A community of references, a layout aid that holds some of a container's contents (`communities.ts`). */
  community?: true;
}

/** One end of a relation of the run. */
export interface WholeEnd {
  node: number;
  /** Whether the relation ends on the node itself, rather than on something it draws or holds. */
  direct: boolean;
  /** Beside a row, or the header of a shape that draws rows: where, from the node's top (ADR 0023). */
  at?: number;
  /** On an anchored part of a drawing with parts: the part's inner point, from its top left. */
  part?: Point;
  /** Where the view routes the end by hand (ADR 0039). */
  port?: LayoutPort;
}

/** One relation of the run. */
export interface WholeEdge {
  from: WholeEnd;
  to: WholeEnd;
}

/** Which side of its node each end of a relation leaves by. */
export interface Sides {
  from: 'east' | 'west';
  to: 'east' | 'west';
}

/** What a run gives back: each node's rectangle and each relation's route, relative to World. */
export interface WholeLaidOut {
  rects: Map<number, Rect>;
  routes: Map<number, Point[]>;
}

/** What the run needs of ELK. */
export interface WholeEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/**
 * Runs both passes, and gives what the second laid out; undefined when either did not come, as when
 * `within` gives up for time. `paddingOf` gives the room each compound leaves in the second pass,
 * which may hold what the run leaves out, with the rectangles of the first.
 */
export async function runWhole(
  nodes: readonly WholeNode[],
  edges: readonly WholeEdge[],
  run: (graph: ElkNode) => Promise<ElkNode | undefined>,
  paddingOf: (first: ReadonlyMap<number, Rect>) => ReadonlyMap<number, Padding>,
): Promise<{ laid: WholeLaidOut; first: WholeLaidOut } | undefined> {
  const back = backEdges(nodes, edges);
  const firstSides = edges.map((_, at): Sides =>
    back.has(at) ? { from: 'west', to: 'east' } : { from: 'east', to: 'west' },
  );
  const firstGraph = wholeGraph(nodes, edges, firstSides, WHOLE_OPTIONS, new Map());
  const firstRun = await run(firstGraph.graph);
  if (!firstRun) return undefined;
  const first = readWhole(firstRun, firstGraph.edgeOf);
  const sides = facingSides(edges, first.rects);
  const second = wholeGraph(nodes, edges, sides, SECOND_PASS, paddingOf(first.rects), first.rects);
  const secondRun = await run(second.graph);
  if (!secondRun) return undefined;
  return { laid: readWhole(secondRun, second.edgeOf), first };
}

/**
 * The side each end of a relation faces, from where the first pass put its nodes: toward the other
 * end, and east on both when the two overlap across, one above the other.
 */
export function facingSides(
  edges: readonly WholeEdge[],
  rects: ReadonlyMap<number, Rect>,
): Sides[] {
  return edges.map((edge): Sides => {
    const a = rects.get(edge.from.node);
    const b = rects.get(edge.to.node);
    if (!a || !b) return { from: 'east', to: 'west' };
    if (a.x < b.x + b.width && b.x < a.x + a.width) return { from: 'east', to: 'east' };
    return b.x + b.width / 2 >= a.x + a.width / 2
      ? { from: 'east', to: 'west' }
      : { from: 'west', to: 'east' };
  });
}

/**
 * The ELK graph of a run: its nodes nested as they sit, each relation once per pair of ports, with
 * the ports each end's side gives, and `hints` as each node's place for the second pass.
 */
export function wholeGraph(
  nodes: readonly WholeNode[],
  edges: readonly WholeEdge[],
  sides: readonly Sides[],
  options: LayoutOptions,
  padding: ReadonlyMap<number, Padding>,
  hints?: ReadonlyMap<number, Rect>,
): { graph: ElkNode; edgeOf: number[] } {
  const byShape = new Map(nodes.map((node) => [node.shape, node]));
  const ports = new Map<number, Map<string, ElkPort>>();
  const portOf = (end: WholeEnd, toward: 'east' | 'west'): string => {
    const node = byShape.get(end.node) as WholeNode;
    const id = `s${end.node}`;
    if (node.compound) return id;
    const own = ports.get(end.node) ?? new Map<string, ElkPort>();
    const add = (key: string, place: Point, side: string): string => {
      const portId = `${id}${key}`;
      if (!own.has(portId)) {
        own.set(portId, {
          id: portId,
          x: place.x,
          y: place.y,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': side },
        });
      }
      ports.set(end.node, own);
      return portId;
    };
    const { size } = node;
    if (end.part) {
      const port = partPort(end.part, size);
      return add(`^${port.side} ${port.along}`, port, ELK_SIDES[port.side]);
    }
    if (end.at !== undefined) {
      const x = toward === 'east' ? size.width : 0;
      return add(`:${toward}:${end.at}`, { x, y: end.at }, toward === 'east' ? 'EAST' : 'WEST');
    }
    if (end.direct && end.port) {
      const key = `${end.port.side} ${end.port.at}`;
      return add(
        `@${key}`,
        pointOnBorder({ name: key, ...end.port }, size),
        ELK_SIDES[end.port.side],
      );
    }
    const points = end.direct ? node.points : undefined;
    if (!points || points.length === 0) return id;
    const at = pointToward(points, size, toward);
    const point = points[at] as LayoutConnectionPoint;
    return add(`:${at}`, pointOnBorder(point, size), ELK_SIDES[point.side]);
  };

  const elkEdges: ElkExtendedEdge[] = [];
  const edgeOf: number[] = [];
  const seen = new Map<string, number>();
  edges.forEach((edge, at) => {
    const side = sides[at] as Sides;
    const source = portOf(edge.from, side.from);
    const target = portOf(edge.to, side.to);
    const key = `${source}\u0000${target}`;
    const known = seen.get(key);
    if (known !== undefined) {
      edgeOf[at] = known;
      return;
    }
    seen.set(key, elkEdges.length);
    edgeOf[at] = elkEdges.length;
    elkEdges.push({ id: `e${elkEdges.length}`, sources: [source], targets: [target] });
  });

  const children = new Map<number | undefined, WholeNode[]>();
  for (const node of nodes) {
    const list = children.get(node.parent) ?? [];
    list.push(node);
    children.set(node.parent, list);
  }
  const build = (node: WholeNode): ElkNode => {
    const hint = hints?.get(node.shape);
    const placed = hint ? { x: hint.x, y: hint.y } : {};
    if (node.compound) {
      const room = node.community
        ? COMMUNITY_PADDING
        : (padding.get(node.shape) ?? COMPOUND_PADDING);
      return {
        id: `s${node.shape}`,
        ...placed,
        layoutOptions: {
          ...WHOLE_SPACINGS,
          'elk.padding': `[top=${room.top},left=${room.left},bottom=${room.bottom},right=${room.right}]`,
        },
        children: (children.get(node.shape) ?? []).map(build),
      };
    }
    const own = ports.get(node.shape);
    return {
      id: `s${node.shape}`,
      ...placed,
      width: node.size.width,
      height: node.size.height,
      ...(own
        ? {
            layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
            ports: [...own.values()].sort((a, b) =>
              a.id.localeCompare(b.id, 'en', { numeric: true }),
            ),
          }
        : {}),
    };
  };
  return {
    graph: {
      id: 'whole',
      layoutOptions: options,
      children: (children.get(undefined) ?? []).map(build),
      edges: elkEdges,
    },
    edgeOf,
  };
}

/** The rectangles and routes of a run as ELK gave them, relative to World. */
export function readWhole(laid: ElkNode, edgeOf: readonly number[]): WholeLaidOut {
  const rects = new Map<number, Rect>();
  const walk = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      rects.set(Number(child.id.slice(1)), {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
      });
      walk(child);
    }
  };
  walk(laid);
  const byEdge = new Map<string, Point[]>();
  const collect = (node: ElkNode) => {
    for (const edge of node.edges ?? []) {
      const section = edge.sections?.[0];
      if (!section || (edge.sections?.length ?? 0) > 1) continue;
      byEdge.set(edge.id, [
        { x: section.startPoint.x, y: section.startPoint.y },
        ...(section.bendPoints ?? []).map((point) => ({ x: point.x, y: point.y })),
        { x: section.endPoint.x, y: section.endPoint.y },
      ]);
    }
    for (const child of node.children ?? []) collect(child);
  };
  collect(laid);
  const routes = new Map<number, Point[]>();
  edgeOf.forEach((edge, at) => {
    const route = byEdge.get(`e${edge}`);
    if (route) routes.set(at, route);
  });
  return { rects, routes };
}

/**
 * The relations that close a cycle, visiting the nodes in order and depth first along the relations
 * in order, as ELK's DFS_NODE_ORDER finds them: their first-pass ports are chosen as reversed.
 */
function backEdges(nodes: readonly WholeNode[], edges: readonly WholeEdge[]): Set<number> {
  const out = new Map<number, number[]>();
  edges.forEach((edge, at) => {
    const list = out.get(edge.from.node) ?? [];
    list.push(at);
    out.set(edge.from.node, list);
  });
  const state = new Map<number, 'open' | 'done'>();
  const back = new Set<number>();
  for (const { shape: root } of nodes) {
    if (state.has(root)) continue;
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
      const target = (edges[at] as WholeEdge).to.node;
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
