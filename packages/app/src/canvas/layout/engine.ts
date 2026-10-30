/**
 * The layout itself, run in the layout worker. Layout of a view or of a container's contents goes in
 * one pass while it fits `WHOLE_SHAPES` and `WHOLE_RELATIONS` (ADR 0080, section 1, `whole.ts`): ELK
 * arranges everything related at once, what no relation reaches is packed in rows beside or below
 * it, and the routes ELK found come back with the places (`arrangeWhole`). Otherwise, as for new
 * shapes and beyond the budget, each container, and World, arranges its own contents,
 * innermost first, so that a container's size is known before it is arranged among its neighbours:
 *
 * 1. At each level, the free shapes form one block. ELK's layered algorithm arranges the block from
 *    the relations between them, each lifted to the level where its ends meet: a relation between the
 *    contents of two containers orders the two containers. A relation that ends on a shape with
 *    connection points ends on a port there; elsewhere it attaches anywhere on the border. A block
 *    with no relation inside it is packed in rows, which needs no ELK.
 * 2. The block is placed clear of the shapes kept at that level (`placeBlock`), and every position
 *    is rounded to the step of 8, relative to the container.
 * 3. A container then takes the size the scene will give it around its contents.
 *
 * Every copy of a container shares its contents' positions (ADR-0019), so each container's contents
 * are arranged once, through its first copy. ELK costs most per run, so every container of one
 * nesting depth is arranged in a single run.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort, LayoutOptions } from 'elkjs/lib/elk-api';
import { boundsOf, type Point, type Rect, type Size } from '../geometry';
import { CONTENTS_ORIGIN } from '../scene';
import {
  ceilToStep,
  measuredSize,
  packInRows,
  placeBlock,
  ROWS_ASPECT,
  roundToStep,
} from './place';
import { withCommunities } from './communities';
import { ELK_SIDES, partPort, pointOnBorder, pointToward } from './ports';
import { segmentThrough } from './quality';
import {
  ELK_TIME_LIMIT,
  ELK_WORK_BUDGET,
  LAYER_GAP,
  LAYOUT_STEP,
  NODE_GAP,
  type LaidOutRoute,
  type LaidOutShape,
  type LayoutConnectionPoint,
  type LayoutInput,
  type LayoutPort,
  type LayoutProgress,
  type LayoutRelation,
  type LayoutResult,
  type LayoutStats,
} from './types';
import {
  COMPOUND_PADDING,
  runWhole,
  WHOLE_RELATIONS,
  WHOLE_SHAPES,
  type Padding,
  type WholeEdge,
  type WholeEnd,
  type WholeLaidOut,
  type WholeNode,
} from './whole';

/** What the layout needs of ELK: elkjs's `layout`, in the worker or, in tests, in the same thread. */
export interface ElkEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
  /** Stops a run under way, whose result never comes; the next run starts afresh. */
  stop?(): void;
}

/** How one layout reports and bounds itself. */
export interface LayOutOptions {
  /** How long ELK may run in all, in milliseconds; `ELK_TIME_LIMIT` by default. */
  timeLimit?: number;
  /** Called each time more of the containers it arranges are done. */
  onProgress?: (progress: LayoutProgress) => void;
  /** How much work one ELK run gets; `CHUNK_WORK` by default. */
  chunkWork?: number;
  now?: () => number;
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
  // ELK's own seed, given so that one input always gives one layout (ADR 0080, Stage 3).
  'elk.randomSeed': '1',
};

/**
 * Beyond this many shapes, a block's flow wraps into rows, so that a long chain of relations reads
 * like lines of text rather than running far off to the right; a shorter flow keeps to one row.
 */
export const WRAP_BEYOND = 12;

/** How a block beyond `WRAP_BEYOND` shapes wraps: at several cuts, toward this aspect ratio. */
const WRAPPED_OPTIONS: LayoutOptions = {
  ...BLOCK_OPTIONS,
  'elk.layered.wrapping.strategy': 'MULTI_EDGE',
  'elk.aspectRatio': '1.6',
};

/** The graph that holds every block of one run: each is arranged on its own, and none moves. */
const RUN_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'org.eclipse.elk.fixed',
  'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
};

/** World, as a level. */
const WORLD = -1;

/** A relation at the level where its ends meet: between two of its contents, by shape index. */
export interface Lifted {
  u: number;
  v: number;
  /** Whether the relation ends on the content itself, rather than on something inside it. */
  uDirect: boolean;
  vDirect: boolean;
  /** Where the end on the content itself is fixed by hand, as a port (ADR 0039). */
  uPort?: LayoutPort;
  vPort?: LayoutPort;
  /**
   * For an end on a row of the content, or on the header of a content that draws rows: where it
   * attaches beside the content, from its top (ADR 0023). The content then gets a port there.
   */
  uAt?: number;
  vAt?: number;
  /**
   * For an end on an anchored part of the content, a drawing with parts: the part's inner point,
   * from the content's top left (ADR 0067). The content then gets a port on its side nearest it.
   */
  uPart?: Point;
  vPart?: Point;
}

/**
 * A relation that leaves a container, at the level of one of its contents (ADR 0080, section 1):
 * beyond the one-pass budget, it becomes a port on the container's side that faces its other end,
 * east for a relation that leaves toward its `to` end, west for one that comes in from its `from`
 * end, as the layered flow runs, so that the content still leans toward it.
 */
export interface Outward {
  node: number;
  toward: 'east' | 'west';
  /** Whether the relation ends on the content itself, rather than on something inside it. */
  direct: boolean;
  /** Where it attaches beside the content, for an end on a row of it or on its header (ADR 0023). */
  at?: number;
  /** For an end on an anchored part of the content, the part's inner point (ADR 0067). */
  part?: Point;
}

/**
 * Arranges the free shapes of `input`, and says where each goes. The containers of one depth go to
 * ELK in chunks of about `CHUNK_WORK` each, which the engines take in turn: given several, as the
 * layout worker gives one per ELK worker it runs, they arrange chunks at the same time. Each chunk
 * done is progress, and the result is the same however many engines there are.
 *
 * It is bounded twice. At each level, ELK gets at most `ELK_WORK_BUDGET` of work
 * (`strongestRelations`). And ELK runs `timeLimit` in all: a run still going then is stopped, and
 * the containers it had, with those not yet given to ELK, are packed in rows.
 */
export async function layOut(
  input: LayoutInput,
  elk: ElkEngine | readonly ElkEngine[],
  options: LayOutOptions = {},
): Promise<LayoutResult> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const ends = started + (options.timeLimit ?? ELK_TIME_LIMIT);
  // Once a run is stopped for time, the time is up for every later one, even when a timer fired a
  // little before the clock reached the end.
  let outOfTime = false;
  const engines = Array.isArray(elk) ? (elk as readonly ElkEngine[]) : [elk as ElkEngine];
  const tree = new Tree(input);
  /** Where a container's contents start from its top: under its face's header, when it has one. */
  const topOf = (level: number): number =>
    level === WORLD
      ? CONTENTS_ORIGIN.y
      : Math.max(CONTENTS_ORIGIN.y, input.shapes[level]?.header ?? 0);
  const stats: LayoutStats = {
    levels: 0,
    shapes: 0,
    relations: 0,
    leftOut: 0,
    packedForTime: 0,
    elkRuns: 0,
    elkMs: 0,
    totalMs: 0,
  };
  const placed: LaidOutShape[] = [];
  const progress = { done: 0, total: tree.levelsToArrange() };
  const report = (done: number) => {
    progress.done += done;
    if (done > 0) options.onProgress?.({ ...progress });
  };

  /**
   * Runs the graphs of blocks in ELK, a chunk at a time on each engine, and gives each block's graph
   * that came back in time.
   */
  const run = async (graphs: readonly ElkNode[]): Promise<Map<string, ElkNode>> => {
    const laid = new Map<string, ElkNode>();
    const chunks = chunksOf(graphs, options.chunkWork ?? CHUNK_WORK);
    let next = 0;
    const runStarted = now();
    const take = async (engine: ElkEngine): Promise<void> => {
      for (let chunk = chunks[next]; chunk !== undefined; chunk = chunks[next]) {
        const left = ends - now();
        if (outOfTime || left <= 0) return;
        next += 1;
        stats.elkRuns += 1;
        const result = await within(
          engine.layout({ id: 'run', layoutOptions: RUN_OPTIONS, children: chunk }),
          left,
        );
        if (result === undefined) {
          outOfTime = true;
          engine.stop?.();
          return;
        }
        for (const graph of result.children ?? []) laid.set(graph.id, graph);
        report(chunk.length);
      }
    };
    await Promise.all(engines.slice(0, chunks.length).map(take));
    stats.elkMs += now() - runStarted;
    return laid;
  };

  // Container by container, beyond the one-pass budget and for new shapes alike, each relation that
  // leaves a container is a port on its side (ADR 0080, section 1, and its clarification of Stage 1b).
  let containerPorts = false;

  /** Arranges the levels given, in ELK at once, and records their contents' new places. */
  const arrange = async (levels: readonly number[]): Promise<void> => {
    const blocks: { level: number; nodes: number[]; places: Map<number, Point> }[] = [];
    const graphs: ElkNode[] = [];
    const inRows = (nodes: readonly number[], places: Map<number, Point>) => {
      const rows = packInRows(nodes.map((node) => tree.sizeOf(node)));
      nodes.forEach((node, at) => places.set(node, rows[at] as Point));
    };
    for (const level of levels) {
      const nodes = tree.childrenOf(level).filter((child) => input.shapes[child]?.free);
      if (nodes.length === 0) continue;
      stats.levels += 1;
      stats.shapes += nodes.length;
      const all = tree.relationsAt(level);
      const lifted = strongestRelations(all, nodes.length);
      stats.leftOut += all.length - lifted.length;
      const block = { level, nodes, places: new Map<number, Point>() };
      blocks.push(block);
      const free = new Set(nodes);
      const outward = containerPorts
        ? tree.outwardAt(level).filter((each) => free.has(each.node))
        : [];
      if (lifted.length === 0 && outward.length === 0) {
        inRows(nodes, block.places);
        report(1);
      } else {
        const sizes = new Map(nodes.map((node) => [node, tree.sizeOf(node)]));
        const graph = blockGraph(
          `level ${level}`,
          nodes,
          sizes,
          (node) => input.shapes[node]?.points,
          lifted,
          outward,
        );
        stats.relations += graph.edges?.length ?? 0;
        graphs.push(graph);
      }
    }
    if (graphs.length > 0) {
      const byId = await run(graphs);
      for (const graph of graphs) {
        const block = blocks.find((each) => `level ${each.level}` === graph.id);
        if (!block) continue;
        const laid = byId.get(graph.id);
        if (!laid) {
          // ELK's time ran out: this container is packed in rows instead.
          inRows(block.nodes, block.places);
          stats.packedForTime += 1;
          report(1);
          continue;
        }
        for (const child of laid.children ?? []) {
          block.places.set(Number(child.id.slice(1)), { x: child.x ?? 0, y: child.y ?? 0 });
        }
      }
    }
    for (const level of levels) {
      // What grew inside this level moves aside what it would cover, before the block is placed.
      const roomMade = makeRoom(level);
      const block = blocks.find((each) => each.level === level);
      if (block) placeAt(block.level, block.nodes, block.places);
      else if (roomMade && level !== WORLD) tree.markChanged(level);
    }
  };

  /**
   * Where a container that expands keeps its corner (ADR 0080, section 4): its top left, unless its
   * own container has more free room to its left, or above it, than to its right, or below it, and
   * room enough there for what it grew; it then keeps its top right, or its bottom left. In World,
   * which has no sides, and when it may not move, it keeps its top left.
   */
  const growToward = (level: number, node: number, before: Rect) => {
    const shape = input.shapes[node];
    if (level === WORLD || shape?.aside !== true) return;
    const now = tree.rectOf(node);
    const grew = { x: now.width - before.width, y: now.height - before.height };
    const holder = tree.keptSizeOf(level);
    const inner = {
      left: CONTENTS_ORIGIN.x,
      top: topOf(level),
      right: holder.width - CONTENTS_ORIGIN.x,
      bottom: holder.height - CONTENTS_ORIGIN.x,
    };
    const others = tree
      .childrenOf(level)
      .filter((child) => child !== node)
      .map((child) => tree.rectOf(child));
    const across = others.filter((r) => r.y < before.y + now.height && before.y < r.y + r.height);
    const along = others.filter((r) => r.x < before.x + now.width && before.x < r.x + r.width);
    const roomLeft =
      before.x -
      Math.max(
        inner.left,
        ...across.filter((r) => r.x + r.width <= before.x).map((r) => r.x + r.width),
      );
    const roomRight =
      Math.min(
        inner.right,
        ...across.filter((r) => r.x >= before.x + before.width).map((r) => r.x),
      ) -
      (before.x + before.width);
    const roomAbove =
      before.y -
      Math.max(
        inner.top,
        ...along.filter((r) => r.y + r.height <= before.y).map((r) => r.y + r.height),
      );
    const roomBelow =
      Math.min(
        inner.bottom,
        ...along.filter((r) => r.y >= before.y + before.height).map((r) => r.y),
      ) -
      (before.y + before.height);
    const place = { x: now.x, y: now.y };
    if (grew.x > 0 && roomLeft > roomRight && roomLeft >= grew.x + NODE_GAP) {
      place.x = Math.floor((before.x - grew.x) / LAYOUT_STEP) * LAYOUT_STEP;
    }
    if (grew.y > 0 && roomAbove > roomBelow && roomAbove >= grew.y + NODE_GAP) {
      place.y = Math.floor((before.y - grew.y) / LAYOUT_STEP) * LAYOUT_STEP;
    }
    if (place.x === now.x && place.y === now.y) return;
    tree.moveTo(node, place);
    tree.markChanged(level);
    const container = input.shapes[level]?.element;
    const entry: LaidOutShape = {
      key: shape.key,
      element: shape.element,
      ...(container === undefined ? {} : { container }),
      ...place,
      aside: true,
    };
    const at = placed.findIndex((each) => each.key === shape.key);
    if (at === -1) placed.push(entry);
    else placed[at] = entry;
  };

  /**
   * Moves aside, right or down, the shapes of a level that may move aside and that a container of the
   * level now covers, since it grew with what layout placed in it; and those that the moved ones then
   * cover, in turn. Shapes that may not move stay, and a shape moved aside goes past them. Says whether
   * it moved any.
   */
  const makeRoom = (level: number): boolean => {
    const children = tree.childrenOf(level);
    const waiting: { node: number; before: Rect }[] = [];
    for (const child of children) {
      const shape = input.shapes[child];
      if (!shape || shape.free) continue;
      // The scene may draw a container grown already around a new shape it put somewhere: what it
      // grew from is its size around what it kept.
      const before = { x: shape.x, y: shape.y, ...tree.keptSizeOf(child) };
      // A container that expands grows toward the free room in its container (ADR 0080, section 4).
      if (shape.grewFrom) growToward(level, child, before);
      const now = tree.rectOf(child);
      if (now.width > before.width || now.height > before.height) {
        waiting.push({ node: child, before });
      }
    }
    if (waiting.length === 0) return false;
    // What holds a container that expanded grew with it, whether or not anything moved aside: it is
    // measured again, from where it was drawn before around what it keeps.
    if (level !== WORLD && waiting.some(({ node }) => input.shapes[node]?.grewFrom !== undefined)) {
      tree.markChanged(level);
    }
    const movable = (node: number) => input.shapes[node]?.aside === true;
    const stays = children
      .filter((child) => !input.shapes[child]?.free && !movable(child))
      .map((child) => tree.rectOf(child));
    if (level === WORLD) stays.push(...input.obstacles);
    const container = level === WORLD ? undefined : input.shapes[level]?.element;
    let moved = false;
    // Each move goes right or down by a step at least, so this many always suffice.
    let budget = children.length * (children.length + stays.length + 1);
    for (let next = waiting.shift(); next !== undefined && budget > 0; next = waiting.shift()) {
      const after = tree.rectOf(next.node);
      for (const other of children) {
        budget -= 1;
        if (other === next.node || !movable(other)) continue;
        const rect = tree.rectOf(other);
        const place = movedAside(next.before, after, rect, stays);
        if (!place) continue;
        tree.moveTo(other, place);
        moved = true;
        waiting.push({ node: other, before: rect });
        const shape = input.shapes[other] as (typeof input.shapes)[number];
        const at = placed.findIndex((each) => each.key === shape.key);
        const entry: LaidOutShape = {
          key: shape.key,
          element: shape.element,
          ...(container === undefined ? {} : { container }),
          ...place,
          aside: true,
        };
        if (at === -1) placed.push(entry);
        else placed[at] = entry;
      }
    }
    return moved;
  };

  /**
   * Moves a block clear of what its level keeps, on the step, and records where its shapes go. With
   * `inPlace`, a block in a container that keeps nothing stays where its places put it, as the one
   * pass over the view put it in its container, so that the routes ELK gave still meet it.
   */
  const placeAt = (
    level: number,
    nodes: readonly number[],
    places: ReadonlyMap<number, Point>,
    inPlace = false,
  ) => {
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
    // In a drawing with parts, below its picture, whatever its parts relate to (ADR 0067).
    const pictureBottom = tree.pictureBottomOf(level);
    if (pictureBottom !== undefined) {
      kept.push({ x: 0, y: 0, width: 1, height: pictureBottom });
    }
    const flow = pictureBottom === undefined ? tree.flowAt(level) : { into: 0, out: 0 };
    const origin =
      inPlace && level !== WORLD && kept.length === 0
        ? {
            x: Math.max(CONTENTS_ORIGIN.x, roundToStep(bounds.x)),
            y: Math.max(topOf(level), roundToStep(bounds.y)),
          }
        : placeBlock(
            bounds,
            level === WORLD
              ? { kind: 'world', now: boundsOf(nodes.map((node) => tree.currentRectOf(node))) }
              : { kind: 'container', top: topOf(level) },
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

  /** The free shapes directly in a level. */
  const freeAt = (level: number) =>
    tree.childrenOf(level).filter((child) => input.shapes[child]?.free === true);

  /** Moves aside what grew at a level, and places its free shapes where `placesOf` puts them. */
  const settle = (level: number, placesOf: (nodes: readonly number[]) => Map<number, Point>) => {
    const roomMade = makeRoom(level);
    const nodes = freeAt(level);
    if (nodes.length === 0) {
      if (roomMade && level !== WORLD) tree.markChanged(level);
      return;
    }
    stats.levels += 1;
    stats.shapes += nodes.length;
    placeAt(level, nodes, placesOf(nodes), true);
    untangle(level);
  };

  /** Places in rows, from (0, 0), in the order given. */
  const rowsOf = (nodes: readonly number[]): Map<number, Point> => {
    const rows = packInRows(nodes.map((node) => tree.sizeOf(node)));
    return new Map(nodes.map((node, at) => [node, rows[at] as Point]));
  };

  /**
   * Moves right or down, by the least, the free shapes of a level that cover another of its shapes,
   * in their order across and down; those kept stay. ELK's arrangement covers nothing, so this moves
   * a shape only where a size the scene gives differs from the one ELK was given, as a container
   * copied elsewhere in the view that grew.
   */
  const untangle = (level: number) => {
    const children = tree.childrenOf(level);
    const settled = children
      .filter((child) => !input.shapes[child]?.free)
      .map((child) => tree.rectOf(child));
    const free = freeAt(level).sort((a, b) => {
      const ra = tree.rectOf(a);
      const rb = tree.rectOf(b);
      return ra.x - rb.x || ra.y - rb.y;
    });
    const container = level === WORLD ? undefined : input.shapes[level]?.element;
    let moved = false;
    for (const node of free) {
      let rect = tree.rectOf(node);
      for (let tries = settled.length; tries >= 0; tries -= 1) {
        const covered = settled.find((each) => overlapping(rect, each));
        if (!covered) break;
        const right = ceilToStep(covered.x + covered.width + NODE_GAP) - rect.x;
        const down = ceilToStep(covered.y + covered.height + NODE_GAP) - rect.y;
        rect = right <= down ? { ...rect, x: rect.x + right } : { ...rect, y: rect.y + down };
      }
      settled.push(rect);
      const shape = input.shapes[node];
      const before = tree.rectOf(node);
      if (!shape || (rect.x === before.x && rect.y === before.y)) continue;
      tree.moveTo(node, { x: rect.x, y: rect.y });
      moved = true;
      const at = placed.findIndex((each) => each.key === shape.key);
      const entry: LaidOutShape = {
        key: shape.key,
        element: shape.element,
        ...(container === undefined ? {} : { container }),
        x: rect.x,
        y: rect.y,
      };
      if (at === -1) placed.push(entry);
      else placed[at] = entry;
    }
    if (moved && level !== WORLD) tree.markChanged(level);
  };

  /**
   * The one pass over the view (ADR 0080, section 1): the levels the run does not reach are packed in
   * rows, innermost first; then ELK arranges everything related at once, in two passes; then each
   * level it reached takes its places, innermost first, what the run left out packed beside or below
   * what it arranged. Gives the routes ELK found that still fit where their ends landed.
   */
  const arrangeWhole = async (plan: WholePlan): Promise<LaidOutRoute[] | undefined> => {
    stats.onePass = true;
    const groups = [...tree.levelsByHeight(), [WORLD]];
    for (const group of groups) {
      for (const level of group) {
        if (plan.levels.has(level)) continue;
        settle(level, rowsOf);
        if (freeAt(level).length > 0) report(1);
      }
    }

    // What each level the run reaches leaves out, packed in rows into one block, at the sizes
    // `sizeOf` gives its shapes.
    const looseAt = (level: number, sizeOf: (node: number) => Size) => {
      const nodes = freeAt(level).filter((node) => !plan.related.has(node));
      if (nodes.length === 0) return undefined;
      const places = packInRows(nodes.map(sizeOf));
      const size = boundsOf(
        nodes.map((node, at) => ({ ...(places[at] as Point), ...sizeOf(node) })),
      ) as Rect;
      return { nodes, places, size: { width: size.width, height: size.height } };
    };
    /**
     * The size a shape left out of the run will have once the run is placed, from the first pass's
     * rectangles: a copy of a container the run arranges takes its first copy's size, since the
     * contents they share move. The size it has now is the one before the layout, which a second
     * layout would no longer find (ADR 0080's clarification of Stage 3).
     */
    const sizeAfterRun =
      (first: ReadonlyMap<number, Rect>) =>
      (node: number): Size => {
        const element = input.shapes[node]?.element;
        const copy = element === undefined ? undefined : tree.firstCopyOf(element);
        const rect = copy === undefined || copy === node ? undefined : first.get(copy);
        return rect && plan.levels.has(copy as number)
          ? { width: rect.width, height: rect.height }
          : tree.sizeOf(node);
      };
    const beside = new Map<number, boolean>();
    const paddingOf = (first: ReadonlyMap<number, Rect>): Map<number, Padding> => {
      const padding = new Map<number, Padding>();
      const sizeOf = sizeAfterRun(first);
      for (const level of plan.levels) {
        if (level === WORLD) continue;
        const rect = first.get(level);
        const shape = input.shapes[level];
        if (!rect || !shape) continue;
        const room: Padding = { ...COMPOUND_PADDING };
        // A face's header, taller than the canvas's own, keeps the same room under it (ADR 0083).
        if (shape.header !== undefined) {
          room.top = Math.max(room.top, shape.header + COMPOUND_PADDING.top - CONTENTS_ORIGIN.y);
        }
        const width = rect.width - room.left - room.right;
        const height = rect.height - room.top - room.bottom;
        const block = looseAt(level, sizeOf);
        if (block) {
          const side = besideIsNearer({ width, height }, block.size);
          beside.set(level, side);
          if (side) {
            room.right += NODE_GAP + block.size.width;
            room.bottom += Math.max(0, block.size.height - height);
          } else {
            room.bottom += NODE_GAP + block.size.height;
            room.right += Math.max(0, block.size.width - width);
          }
        }
        // A container is never smaller than its appearance, nor than the size the view stores.
        const least = {
          width: Math.max(shape.baseWidth ?? 0, shape.storedWidth ?? 0),
          height: Math.max(shape.baseHeight ?? 0, shape.storedHeight ?? 0),
        };
        room.right += Math.max(0, least.width - (room.left + width + room.right));
        room.bottom += Math.max(0, least.height - (room.top + height + room.bottom));
        padding.set(level, room);
      }
      return padding;
    };
    // A large container without containers is arranged as blocks of its communities.
    const nodes = withCommunities(
      plan.nodes.map((node): WholeNode =>
        node.compound ? node : { ...node, size: tree.sizeOf(node.shape) },
      ),
      plan.edges,
    );
    const engine = engines[0] as ElkEngine;
    const runOnce = async (graph: ElkNode): Promise<ElkNode | undefined> => {
      const left = ends - now();
      if (outOfTime || left <= 0) return undefined;
      stats.elkRuns += 1;
      const runStarted = now();
      const result = await within(engine.layout(graph), left);
      stats.elkMs += now() - runStarted;
      if (result === undefined) {
        outOfTime = true;
        engine.stop?.();
      }
      return result;
    };
    stats.relations += plan.edges.length;
    const ran = await runWhole(nodes, plan.edges, runOnce, paddingOf);
    const laid = ran?.laid;

    for (const group of groups) {
      for (const level of group) {
        if (!plan.levels.has(level)) continue;
        settle(level, (free) => {
          if (!laid) {
            stats.packedForTime += 1;
            return rowsOf(free);
          }
          const origin = level === WORLD ? { x: 0, y: 0 } : (laid.rects.get(level) ?? undefined);
          const places = new Map<number, Point>();
          const arranged: Rect[] = [];
          for (const node of free) {
            const rect = laid.rects.get(node);
            if (!rect || !origin || !plan.related.has(node)) continue;
            const place = { x: rect.x - origin.x, y: rect.y - origin.y };
            places.set(node, place);
            arranged.push({ ...place, ...tree.sizeOf(node) });
          }
          // Packed again at the sizes its shapes have now that the levels inside are placed.
          const block = looseAt(level, (node) => tree.sizeOf(node));
          if (block) {
            const around = boundsOf(arranged);
            const start = !around
              ? { x: 0, y: 0 }
              : (beside.get(level) ?? besideIsNearer(around, block.size))
                ? { x: around.x + around.width + NODE_GAP, y: around.y }
                : { x: around.x, y: around.y + around.height + NODE_GAP };
            block.nodes.forEach((node, at) => {
              const offset = block.places[at] as Point;
              places.set(node, { x: start.x + offset.x, y: start.y + offset.y });
            });
          }
          return places;
        });
      }
    }
    report(Math.max(0, progress.total - progress.done));
    return laid ? carriedRoutes(input, tree, plan, laid) : undefined;
  };

  const plan = input.onePass ? planWhole(input, tree) : undefined;
  let routes: LaidOutRoute[] | undefined;
  if (plan) {
    routes = await arrangeWhole(plan);
  } else {
    containerPorts = true;
    // Innermost first: every container of one depth in one run, then World.
    for (const levels of tree.levelsByHeight()) await arrange(levels);
    await arrange([WORLD]);
  }

  stats.totalMs = now() - started;
  return {
    shapes: withoutTagRoom(input, placed),
    ...(routes && routes.length > 0 ? { routes } : {}),
    stats,
  };
}

/**
 * Whether a block left out of the run goes beside what the run arranged, rather than below it: the
 * way that keeps the two nearer 1.6 times wider than tall, as rows are packed (ADR 0080).
 */
function besideIsNearer(arranged: Size, block: Size): boolean {
  const off = (width: number, height: number) =>
    Math.abs(Math.log(width / Math.max(1, height) / ROWS_ASPECT));
  const beside = off(
    arranged.width + NODE_GAP + block.width,
    Math.max(arranged.height, block.height),
  );
  const below = off(
    Math.max(arranged.width, block.width),
    arranged.height + NODE_GAP + block.height,
  );
  return beside < below;
}

/** What one pass over the view runs: see `planWhole`. */
interface WholePlan {
  nodes: WholeNode[];
  edges: WholeEdge[];
  /** For each of `edges`, the relation of the input it stands for. */
  relationOf: number[];
  /** Whether each of `edges` runs between the shapes its relation's line is drawn between. */
  exact: boolean[];
  /** The shapes the run holds: those related, and the containers that hold them. */
  related: Set<number>;
  /** The levels whose contents the run arranges: World and the containers it holds. */
  levels: Set<number>;
}

/**
 * What one pass over the view gives ELK, or undefined when it should arrange the view level by level
 * instead: beyond `WHOLE_SHAPES` or `WHOLE_RELATIONS`, with no relation to order anything, or when a
 * drawing with parts holds shapes to arrange, whose contents go below its picture.
 *
 * Every copy of a container shares its contents' places, so the run holds each container's contents
 * once, in its first copy, and its other copies as shapes of their present size. A relation of the
 * run ends on the shapes of the first copies that stand for its ends: on a shape that draws rows,
 * beside the row; on a drawing with parts, at the part; on a container whose contents layout does not
 * arrange, on it. A relation to a shape layout keeps, inside a container it arranges, orders nothing.
 */
function planWhole(input: LayoutInput, tree: Tree): WholePlan | undefined {
  const { shapes } = input;
  const count = shapes.length;
  // The shape of the first copy that stands for each shape.
  const canon = new Int32Array(count);
  for (let at = 0; at < count; at++) {
    const parent = tree.parentOf(at);
    if (parent === WORLD) {
      canon[at] = at;
      continue;
    }
    const container = canon[parent] as number;
    const first = tree.firstCopyOf(shapes[container]?.element as string) ?? container;
    canon[at] =
      first === parent ? at : (tree.contentOf(first, shapes[at]?.element as string) ?? at);
  }
  const canonical = (at: number) => canon[at] === at;
  // Whether a shape holds, at some depth, shapes layout moves.
  const holdsFree = new Uint8Array(count);
  for (let at = count - 1; at >= 0; at--) {
    if (!canonical(at)) continue;
    if (shapes[at]?.free || holdsFree[at]) {
      const parent = tree.parentOf(at);
      if (parent !== WORLD) holdsFree[parent] = 1;
    }
  }
  const compound = (at: number) => {
    const shape = shapes[at];
    return (
      shape !== undefined &&
      canonical(at) &&
      holdsFree[at] === 1 &&
      tree.firstCopyOf(shape.element) === at &&
      shape.headerAt === undefined
    );
  };
  for (let at = 0; at < count; at++) {
    if (compound(at) && shapes[at]?.pictureBottom !== undefined) return undefined;
  }
  const inRun = (at: number) => canonical(at) && (compound(at) || shapes[at]?.free === true);

  const endOf = (end: number, port: LayoutPort | undefined): WholeEnd | undefined => {
    const at = canon[end] as number;
    const shape = shapes[at];
    if (!shape) return undefined;
    const holder = tree.parentOf(at);
    const leafHolder = holder !== WORLD && inRun(holder) && !compound(holder);
    if (shape.rowAt !== undefined) {
      return leafHolder ? { node: holder, direct: false, at: shape.rowAt } : undefined;
    }
    if (shape.partAt !== undefined) {
      return leafHolder ? { node: holder, direct: false, part: shape.partAt } : undefined;
    }
    if (inRun(at)) {
      return {
        node: at,
        direct: true,
        ...(shape.headerAt === undefined ? {} : { at: shape.headerAt }),
        ...(port ? { port } : {}),
      };
    }
    let up = holder;
    while (up !== WORLD && !inRun(up)) up = tree.parentOf(up);
    if (up === WORLD || compound(up)) return undefined;
    return { node: up, direct: false };
  };
  const holds = (outer: number, inner: number) => {
    for (let up = tree.parentOf(inner); up !== WORLD; up = tree.parentOf(up)) {
      if (up === outer) return true;
    }
    return false;
  };

  const edges: WholeEdge[] = [];
  const relationOf: number[] = [];
  const exact: boolean[] = [];
  input.relations.forEach((relation, at) => {
    const from = endOf(relation.from, relation.fromPort);
    const to = endOf(relation.to, relation.toPort);
    if (!from || !to || from.node === to.node) return;
    if (holds(from.node, to.node) || holds(to.node, from.node)) return;
    edges.push({ from, to });
    relationOf.push(at);
    exact.push(canonical(relation.from) && canonical(relation.to));
  });
  if (edges.length === 0 || edges.length > WHOLE_RELATIONS) return undefined;

  const related = new Set<number>();
  const levels = new Set<number>([WORLD]);
  for (const edge of edges) {
    for (const node of [edge.from.node, edge.to.node]) {
      for (let up = node; up !== WORLD && !related.has(up); up = tree.parentOf(up)) {
        related.add(up);
        if (compound(up)) levels.add(up);
      }
    }
  }
  if (related.size > WHOLE_SHAPES) return undefined;
  const nodes: WholeNode[] = [];
  for (let at = 0; at < count; at++) {
    if (!related.has(at)) continue;
    const shape = shapes[at] as LayoutInput['shapes'][number];
    const parent = tree.parentOf(at);
    nodes.push({
      shape: at,
      parent: parent === WORLD ? undefined : parent,
      compound: compound(at),
      size: { width: shape.width, height: shape.height },
      ...(shape.points ? { points: shape.points } : {}),
    });
  }
  return { nodes, edges, relationOf, exact, related, levels };
}

/** How far the two ends of a route may have landed apart from where ELK put them, each way. */
const CARRY_REACH = 24;

/**
 * The routes ELK gave the relations of one pass, where their ends landed: moved with the end they
 * leave, and carried at the other end by the rounding of its place, its last two bends moved with it.
 * A route is left out when its ends landed further apart than rounding moves them, as when one sits
 * in a container layout kept where it was; when it runs through a shape that is not one of its ends;
 * and for a relation drawn between other copies of its ends.
 */
function carriedRoutes(
  input: LayoutInput,
  tree: Tree,
  plan: WholePlan,
  laid: WholeLaidOut,
): LaidOutRoute[] {
  const { shapes } = input;
  // Where each shape's box lies now relative to World, as the scene will draw it.
  const boxes = new Map<number, Rect>();
  const boxOf = (at: number): Rect => {
    const known = boxes.get(at);
    if (known) return known;
    const parent = tree.parentOf(at);
    const rect = tree.rectOf(at);
    let x = rect.x;
    let y = rect.y;
    if (parent !== WORLD) {
      const holder = boxOf(parent);
      x += holder.x + (shapes[parent]?.tagLeft ?? 0);
      y += holder.y;
    }
    const box = { x, y, width: rect.width, height: rect.height };
    boxes.set(at, box);
    return box;
  };
  const blocks: { at: number; rect: Rect }[] = [];
  shapes.forEach((shape, at) => {
    if (shape.rowAt !== undefined || shape.partAt !== undefined) return;
    if (tree.childrenOf(at).length > 0 && shape.headerAt === undefined) return;
    const box = boxOf(at);
    blocks.push({ at, rect: { ...box, x: box.x + (shape.tagLeft ?? 0) } });
  });
  const obstacles = input.obstacles;
  const routes: LaidOutRoute[] = [];
  plan.edges.forEach((edge, at) => {
    const route = laid.routes.get(at);
    const relation = input.relations[plan.relationOf[at] as number];
    if (!route || !relation || plan.exact[at] !== true || route.length < 2) return;
    const shift = (node: number): Point | undefined => {
      const was = laid.rects.get(node);
      if (!was || shapes[node]?.tagLeft !== undefined) return undefined;
      const now = boxOf(node);
      return { x: now.x - was.x, y: now.y - was.y };
    };
    const start = shift(edge.from.node);
    const end = shift(edge.to.node);
    if (!start || !end) return;
    const apart = { x: end.x - start.x, y: end.y - start.y };
    if (Math.abs(apart.x) > CARRY_REACH || Math.abs(apart.y) > CARRY_REACH) return;
    const points = carried(
      route.map((point) => ({ x: point.x + start.x, y: point.y + start.y })),
      apart,
    );
    // Through nothing but its ends, and what holds them.
    const ends = new Set<number>();
    for (const node of [relation.from, relation.to, edge.from.node, edge.to.node]) {
      for (let up = node; up !== WORLD; up = tree.parentOf(up)) ends.add(up);
    }
    for (let next = 1; next < points.length; next++) {
      const a = points[next - 1] as Point;
      const b = points[next] as Point;
      if (blocks.some((block) => !ends.has(block.at) && segmentThrough(a, b, block.rect))) return;
      if (obstacles.some((rect) => segmentThrough(a, b, rect))) return;
    }
    routes.push({ relation: relation.relation, points });
  });
  return routes;
}

/**
 * An orthogonal route with its last point moved by `by`: the bend before it moves along with it
 * across the last segment, so that every segment stays horizontal or vertical. A route of one
 * segment gets a jog in its middle.
 */
export function carried(route: readonly Point[], by: Point): Point[] {
  const points = route.map((point) => ({ ...point }));
  if (by.x === 0 && by.y === 0) return points;
  const last = points[points.length - 1] as Point;
  const before = points[points.length - 2] as Point;
  const horizontal = Math.abs(last.y - before.y) < Math.abs(last.x - before.x);
  if (points.length === 2 && (horizontal ? by.y !== 0 : by.x !== 0)) {
    const first = points[0] as Point;
    const end = { x: last.x + by.x, y: last.y + by.y };
    if (horizontal) {
      const middle = (first.x + end.x) / 2;
      return [first, { x: middle, y: first.y }, { x: middle, y: end.y }, end];
    }
    const middle = (first.y + end.y) / 2;
    return [first, { x: first.x, y: middle }, { x: end.x, y: middle }, end];
  }
  last.x += by.x;
  last.y += by.y;
  if (horizontal) before.y += by.y;
  else before.x += by.x;
  return points;
}

/**
 * Where layout puts the shapes it moved, rather than the boxes it spaced them by: a shape with a name
 * tag sits `tagLeft` right of its box (ADR 0066's clarification of 2026-10-27).
 */
function withoutTagRoom(input: LayoutInput, placed: LaidOutShape[]): LaidOutShape[] {
  const shifts = new Map<string, number>();
  for (const shape of input.shapes) {
    if (shape.tagLeft !== undefined) shifts.set(shape.key, shape.tagLeft);
  }
  if (shifts.size === 0) return placed;
  return placed.map((each) => {
    const left = shifts.get(each.key);
    return left === undefined ? each : { ...each, x: each.x + left };
  });
}

/**
 * Where a shape goes when a shape beside it grew or moved from `before` to `after`: right, when it lay
 * right of it before, or down, when it lay below it, whichever moves it less, keeping the room it had
 * from it up to `NODE_GAP`, and past every rectangle of `stays` it would land on. Undefined when the
 * shape lay neither right of it nor below it, or `after` does not come closer than it had.
 */
export function movedAside(
  before: Rect,
  after: Rect,
  shape: Rect,
  stays: readonly Rect[],
): Point | undefined {
  const right = shape.x >= before.x + before.width;
  const down = shape.y >= before.y + before.height;
  if (!right && !down) return undefined;
  const gapX = right ? Math.min(NODE_GAP, shape.x - (before.x + before.width)) : 0;
  const gapY = down ? Math.min(NODE_GAP, shape.y - (before.y + before.height)) : 0;
  const reach = { x: after.x, y: after.y, width: after.width + gapX, height: after.height + gapY };
  if (!overlapping(reach, shape)) return undefined;
  const choices: Point[] = [];
  if (right) choices.push(past({ x: ceilToStep(after.x + after.width + gapX), y: shape.y }, 'x'));
  if (down) choices.push(past({ x: shape.x, y: ceilToStep(after.y + after.height + gapY) }, 'y'));
  return choices.reduce((best, each) =>
    each.x - shape.x + (each.y - shape.y) < best.x - shape.x + (best.y - shape.y) ? each : best,
  );

  /** A place moved on along its axis past whatever stays there. */
  function past(place: Point, axis: 'x' | 'y'): Point {
    let at = place;
    for (let more = stays.length; more >= 0; more -= 1) {
      const blocking = stays.find((each) =>
        overlapping({ ...at, width: shape.width, height: shape.height }, each),
      );
      if (!blocking) return at;
      at =
        axis === 'x'
          ? { ...at, x: ceilToStep(blocking.x + blocking.width + NODE_GAP) }
          : { ...at, y: ceilToStep(blocking.y + blocking.height + NODE_GAP) };
    }
    return at;
  }
}

/** Whether two rectangles share some area. */
function overlapping(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
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
  lifted: readonly Lifted[],
  outward: readonly Outward[] = [],
): ElkNode {
  const back = backRelations(nodes, lifted);
  const ports = new Map<number, Map<number | string, ElkPort>>();
  // The ports beside rows and headers (ADR 0023): one on each side of each that a relation ends on.
  const besidePorts = new Map<number, Map<string, ElkPort>>();
  const endOf = (
    node: number,
    direct: boolean,
    toward: 'east' | 'west',
    fixed?: LayoutPort,
    beside?: number,
    part?: Point,
  ): string => {
    const size = sizes.get(node);
    // An end on an anchored part is a port on the side of its drawing nearest the part.
    if (part && size) {
      const port = partPort(part, size);
      const key = `^${port.side} ${port.along}`;
      const portId = `s${node}${key}`;
      const own = ports.get(node) ?? new Map<number | string, ElkPort>();
      ports.set(node, own);
      if (!own.has(key)) {
        own.set(key, {
          id: portId,
          x: port.x,
          y: port.y,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': ELK_SIDES[port.side] },
        });
      }
      return portId;
    }
    // An end on a row, or on the header of a content that draws rows, is a port beside it.
    if (beside !== undefined && size) {
      const portId = `s${node}:${toward}:${beside}`;
      const own = besidePorts.get(node) ?? new Map<string, ElkPort>();
      besidePorts.set(node, own);
      if (!own.has(portId)) {
        own.set(portId, {
          id: portId,
          x: toward === 'east' ? size.width : 0,
          y: beside,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': toward === 'east' ? 'EAST' : 'WEST' },
        });
      }
      return portId;
    }
    // An end chosen by hand is a port where it was put.
    if (direct && fixed && size) {
      const key = `${fixed.side} ${fixed.at}`;
      const portId = `s${node}@${key}`;
      const own = ports.get(node) ?? new Map<number | string, ElkPort>();
      ports.set(node, own);
      if (!own.has(key)) {
        own.set(key, {
          id: portId,
          ...pointOnBorder({ name: key, ...fixed }, size),
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': ELK_SIDES[fixed.side] },
        });
      }
      return portId;
    }
    const points = direct ? pointsOf(node) : undefined;
    if (!points || points.length === 0 || !size) return `s${node}`;
    const at = pointToward(points, size, toward);
    const point = points[at] as LayoutConnectionPoint;
    const portId = `s${node}:${at}`;
    const own = ports.get(node) ?? new Map<number | string, ElkPort>();
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
  lifted.forEach((each, at) => {
    if (each.u === each.v) return;
    const reversed = back.has(at);
    const source = endOf(
      each.u,
      each.uDirect,
      reversed ? 'west' : 'east',
      each.uPort,
      each.uAt,
      each.uPart,
    );
    const target = endOf(
      each.v,
      each.vDirect,
      reversed ? 'east' : 'west',
      each.vPort,
      each.vAt,
      each.vPart,
    );
    const key = `${source}\u0000${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: `e${edges.length}`, sources: [source], targets: [target] });
  });

  // Each relation that leaves the container: an edge to the port on its side, east or west.
  const sides = new Set<'east' | 'west'>();
  for (const each of outward) {
    const end = endOf(each.node, each.direct, each.toward, undefined, each.at, each.part);
    const port = `${id}:${each.toward}`;
    const [source, target] = each.toward === 'east' ? [end, port] : [port, end];
    const key = `${source}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sides.add(each.toward);
    edges.push({ id: `e${edges.length}`, sources: [source], targets: [target] });
  }
  const options = nodes.length > WRAP_BEYOND ? WRAPPED_OPTIONS : BLOCK_OPTIONS;
  const containerSides = (['east', 'west'] as const).filter((side) => sides.has(side));

  return {
    id,
    layoutOptions:
      containerSides.length > 0 ? { ...options, 'elk.portConstraints': 'FIXED_SIDE' } : options,
    ...(containerSides.length > 0
      ? {
          ports: containerSides.map((side): ElkPort => ({
            id: `${id}:${side}`,
            width: 0,
            height: 0,
            layoutOptions: { 'elk.port.side': side === 'east' ? 'EAST' : 'WEST' },
          })),
        }
      : {}),
    children: nodes.map((node) => {
      const size = sizes.get(node) ?? { width: 1, height: 1 };
      const own = ports.get(node);
      const beside = besidePorts.get(node);
      return {
        id: `s${node}`,
        width: size.width,
        height: size.height,
        ...(own || beside
          ? {
              layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
              ports: [
                ...[...(own ?? new Map<number | string, ElkPort>()).entries()]
                  .sort(([a], [b]) => String(a).localeCompare(String(b), 'en', { numeric: true }))
                  .map(([, port]) => port),
                ...(beside?.values() ?? []),
              ],
            }
          : {}),
      };
    }),
    edges,
  };
}

/**
 * The relations ELK gets at one level: all of them while they fit `ELK_WORK_BUDGET`, that is while
 * the shapes times the pairs of ends beyond one per shape stay within it; otherwise the pairs related
 * by the most relations, then the first in the model's order, as many as fit. Every relation of a
 * pair kept is kept.
 */
export function strongestRelations(lifted: readonly Lifted[], shapes: number): Lifted[] {
  const fit = shapes + Math.floor(ELK_WORK_BUDGET / Math.max(1, shapes));
  const pairs = new Map<string, { first: number; weight: number }>();
  lifted.forEach((each, at) => {
    const key = `${each.u}>${each.v}`;
    const pair = pairs.get(key);
    if (pair) pair.weight += 1;
    else pairs.set(key, { first: at, weight: 1 });
  });
  if (pairs.size <= fit) return [...lifted];
  const kept = new Set(
    [...pairs.entries()]
      .sort(([, a], [, b]) => b.weight - a.weight || a.first - b.first)
      .slice(0, fit)
      .map(([key]) => key),
  );
  return lifted.filter((each) => kept.has(`${each.u}>${each.v}`));
}

/** The longest wait timers take; a longer one would fire at once. */
const LONGEST_TIMER = 2_147_483_647;

/** What `promise` gives, unless it takes longer than `ms`: then undefined. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  if (ms >= LONGEST_TIMER) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), Math.max(0, ms));
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * About how much work one ELK run gets, counted as shapes plus relations: some dozen containers of
 * two dozen shapes. A run costs tens of milliseconds besides its work, so chunks this size keep that
 * small, while each one done is a step of progress, and a run stopped for time loses little.
 */
export const CHUNK_WORK = 600;

/**
 * Cuts graphs into chunks, in order, each of at most `work` shapes and relations, or of one graph
 * when that graph alone is more.
 */
export function chunksOf(graphs: readonly ElkNode[], work: number): ElkNode[][] {
  const chunks: ElkNode[][] = [];
  let chunk: ElkNode[] = [];
  let weight = 0;
  for (const graph of graphs) {
    const own = (graph.children?.length ?? 0) + (graph.edges?.length ?? 0);
    if (chunk.length > 0 && weight + own > work) {
      chunks.push(chunk);
      chunk = [];
      weight = 0;
    }
    chunk.push(graph);
    weight += own;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

/**
 * The indexes of the relations that close a cycle: visiting the nodes in order, depth first along the
 * relations in order, those that lead back to a node whose visit has not ended.
 */
function backRelations(nodes: readonly number[], lifted: readonly Lifted[]): Set<number> {
  const out = new Map<number, number[]>();
  lifted.forEach((each, at) => {
    const list = out.get(each.u) ?? [];
    list.push(at);
    out.set(each.u, list);
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
      const target = (lifted[at] as Lifted).v;
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
  private readonly lifted = new Map<number, Lifted[]>();
  private readonly outward = new Map<number, Outward[]>();
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
    for (const relation of input.relations) this.lift(relation.from, relation.to, relation);
  }

  /** How many levels, first copies of containers and World, hold free shapes to arrange. */
  levelsToArrange(): number {
    const levels = [WORLD, ...this.firstCopy.values()];
    return levels.filter((level) =>
      this.childrenOf(level).some((child) => this.input.shapes[child]?.free),
    ).length;
  }

  /** The shapes directly inside a shape, or directly in World. */
  childrenOf(level: number): readonly number[] {
    return this.children.get(level) ?? [];
  }

  relationsAt(level: number): readonly Lifted[] {
    return this.lifted.get(level) ?? [];
  }

  /** The relations that leave a level's container, by the content they leave from (`Outward`). */
  outwardAt(level: number): readonly Outward[] {
    return this.outward.get(level) ?? [];
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

  /**
   * The size a shape had around what layout keeps, before it placed anything: its size now for one
   * whose contents layout leaves alone, and otherwise the size it takes around its kept contents
   * where they were, each at the size it had so, without the shapes layout arranges.
   */
  keptSizeOf(node: number): Size {
    const shape = this.input.shapes[node];
    if (!shape) return { width: 1, height: 1 };
    // A container that expands was drawn collapsed, at this size.
    if (shape.grewFrom) return { ...shape.grewFrom };
    const first = this.firstCopy.get(shape.element);
    if (first === undefined || !this.changed.has(shape.element)) {
      return { width: shape.width, height: shape.height };
    }
    const contents = this.childrenOf(first).flatMap((child) => {
      const content = this.input.shapes[child];
      return !content || content.free
        ? []
        : [{ x: content.x, y: content.y, ...this.keptSizeOf(child) }];
    });
    return measuredSize(
      contents,
      { width: shape.baseWidth ?? shape.width, height: shape.baseHeight ?? shape.height },
      { width: shape.storedWidth, height: shape.storedHeight },
    );
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

  /** The first copy of an element that holds contents, which arranges them for every copy. */
  firstCopyOf(element: string): number | undefined {
    return this.firstCopy.get(element);
  }

  /** The shape a shape sits in, or World. */
  parentOf(node: number): number {
    const parent = this.input.shapes[node]?.parent ?? WORLD;
    return parent >= 0 && parent < node ? parent : WORLD;
  }

  /**
   * Records a relation at the level where its ends meet: between the two contents of their nearest
   * common container that hold them, in that container's first copy.
   */
  private lift(from: number, to: number, ends?: Pick<LayoutRelation, 'fromPort' | 'toPort'>): void {
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
    // Each container the relation leaves on its way up from either end, below where they meet.
    this.leaves(from, belowA, 'east');
    this.leaves(to, belowB, 'west');
    const u = this.contentOf(level, shapes[belowA]?.element as string);
    const v = this.contentOf(level, shapes[belowB]?.element as string);
    if (u === undefined || v === undefined || u === v) return;
    const uFree = shapes[u]?.free === true;
    const vFree = shapes[v]?.free === true;
    if (uFree && vFree) {
      const list = this.lifted.get(level) ?? [];
      const uDirect = belowA === from;
      const vDirect = belowB === to;
      const uAt = this.besideAt(from, belowA);
      const vAt = this.besideAt(to, belowB);
      const uPart = this.partOf(from, belowA);
      const vPart = this.partOf(to, belowB);
      list.push({
        u,
        v,
        uDirect,
        vDirect,
        ...(uDirect && ends?.fromPort ? { uPort: ends.fromPort } : {}),
        ...(vDirect && ends?.toPort ? { vPort: ends.toPort } : {}),
        ...(uAt === undefined ? {} : { uAt }),
        ...(vAt === undefined ? {} : { vAt }),
        ...(uPart === undefined ? {} : { uPart }),
        ...(vPart === undefined ? {} : { vPart }),
      });
      this.lifted.set(level, list);
    } else if (uFree !== vFree) {
      const flow = this.flows.get(level) ?? { into: 0, out: 0 };
      if (vFree) flow.into += 1;
      else flow.out += 1;
      this.flows.set(level, flow);
    }
  }

  /**
   * Records, for each container from `end`'s up to `top`, the content of its first copy the relation
   * leaves it from, when that content is free: a port on the container's side `toward` faces.
   */
  private leaves(end: number, top: number, toward: 'east' | 'west'): void {
    const { shapes } = this.input;
    let below = end;
    for (let holder = this.parentOf(end); below !== top && holder !== WORLD;) {
      const level = this.firstCopy.get(shapes[holder]?.element as string);
      const content =
        level === undefined ? undefined : this.contentOf(level, shapes[below]?.element as string);
      if (level !== undefined && content !== undefined && shapes[content]?.free === true) {
        const at = this.besideAt(end, content);
        const part = this.partOf(end, content);
        const list = this.outward.get(level) ?? [];
        list.push({
          node: content,
          toward,
          direct: below === end,
          ...(at === undefined ? {} : { at }),
          ...(part === undefined ? {} : { part }),
        });
        this.outward.set(level, list);
      }
      below = holder;
      holder = this.parentOf(holder);
    }
  }

  /**
   * Where a relation that ends on `end` attaches beside `below`, the content of the level that holds
   * it: beside the header when the end is that content and draws rows, beside the row when the end
   * is one of its rows; nowhere particular otherwise (ADR 0023).
   */
  private besideAt(end: number, below: number): number | undefined {
    const shape = this.input.shapes[end];
    if (!shape) return undefined;
    if (end === below) return shape.headerAt;
    return shape.rowAt !== undefined && this.parentOf(end) === below ? shape.rowAt : undefined;
  }

  /**
   * Where a relation that ends on `end` attaches on `below`, the content of the level that holds
   * it, when `end` is an anchored part of that content, a drawing with parts (ADR 0067): the part's
   * inner point, from the drawing's top left.
   */
  private partOf(end: number, below: number): Point | undefined {
    const shape = this.input.shapes[end];
    if (end === below || shape?.partAt === undefined || this.parentOf(end) !== below) {
      return undefined;
    }
    return shape.partAt;
  }

  /** Where a level's free contents go below its picture, for a drawing with parts; else none. */
  pictureBottomOf(level: number): number | undefined {
    return level === WORLD ? undefined : this.input.shapes[level]?.pictureBottom;
  }

  private readonly contents = new Map<number, Map<string, number>>();

  /** The content of a level's first copy that is a shape of this element. */
  contentOf(level: number, element: string): number | undefined {
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
