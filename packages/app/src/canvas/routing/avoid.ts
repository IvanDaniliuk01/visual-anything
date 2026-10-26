/**
 * Automatic orthogonal routes that go around the shapes between their ends (ADR 0039's clarification
 * of 2026-10-26). A line's stand-in route (`route.ts`) is kept when it crosses nothing; otherwise it
 * is routed again, inside the container that holds both its ends, around every other shape there and
 * the name plates of the containers it runs in, a clearance away from them: the shortest route with
 * the fewest turns through an orthogonal visibility grid, A* over the grid's points and the way the
 * route faces. It leaves and enters its ends' shapes where the stand-in does, through the middle of a
 * side, moved by its offset among the lines between the same two shapes.
 *
 * It works on numbers alone, so that it runs in a worker as it runs in the page or in Node: the
 * shapes as rectangles with the index of the shape each sits in, and the lines as their ends' indexes
 * and stand-in routes. A line with more shapes around it than `MAX_OBSTACLES` keeps its stand-in
 * route, which keeps the cost of each line bounded however large the view.
 */
import type { Point, Rect } from '../geometry';

/** The shapes of a scene, as the avoider reads them. */
export interface AvoidShapes {
  /** The rectangle of each shape, four numbers a shape: x, y, width and height. */
  rects: Float64Array;
  /** The index of the shape each one sits in, or -1 for one directly in World. */
  parents: Int32Array;
  /**
   * How wide the name plate at the top left of each shape is, where a container writes its name and
   * detail; 0 for one that holds no shapes, whose name is inside it.
   */
  plates: Float64Array;
}

/** A line to route: the indexes of its ends' shapes, how far it runs beside its siblings, its route. */
export interface AvoidLine {
  from: number;
  to: number;
  offset: number;
  /** Its stand-in route, as x and y pairs. */
  route: Float64Array;
}

/** What routing one line gave: a route around what was in its way, and where it looked. */
export interface Avoided {
  /** The new route, as x and y pairs; absent when the stand-in route crosses nothing, or gave up. */
  route?: Float64Array;
  /** The region it looked in for what is in the route's way. */
  region: Rect;
  /**
   * Present when it gave up, with more shapes around the line than it goes around: the line keeps
   * its stand-in route, and a change near it would not change that.
   */
  gaveUp?: true;
}

/** How far clear of the shapes a route runs, in canvas units. */
export const CLEARANCE = 16;
/** How tall a container's name plate is: its name and its detail, at its top. */
export const PLATE_HEIGHT = 44;
/** The most shapes a route goes around; with more near its ends, it keeps its stand-in route. */
export const MAX_OBSTACLES = 60;
/** What a turn costs, in canvas units of length, so that a route prefers fewer of them. */
const TURN = 48;
/** How far the region a route looks in reaches beyond its ends. */
const REACH = 3 * CLEARANCE;
/** How much of a shape a segment must cross to count, so that lines along a border do not. */
const EPSILON = 0.5;
/** The side of a cell of the shapes' index, in canvas units. */
const CELL = 256;

/** An index of the shapes by the cells of a grid they cover, made once for a batch of lines. */
class ShapeGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly seen: Uint32Array;
  private stamp = 0;

  constructor(private readonly shapes: AvoidShapes) {
    const count = shapes.parents.length;
    this.seen = new Uint32Array(count);
    for (let at = 0; at < count; at++) {
      const { x0, y0, x1, y1 } = this.cellsOf(rectAt(shapes, at));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const key = cellKey(cx, cy);
          const list = this.cells.get(key);
          if (list) list.push(at);
          else this.cells.set(key, [at]);
        }
      }
    }
  }

  /** Calls `visit` once for each shape whose cells meet `rect`; it stops when `visit` says true. */
  query(rect: Rect, visit: (at: number) => boolean | void): void {
    this.stamp += 1;
    if (this.stamp === 0xffffffff) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    const { x0, y0, x1, y1 } = this.cellsOf(rect);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const at of this.cells.get(cellKey(cx, cy)) ?? []) {
          if (this.seen[at] === this.stamp) continue;
          this.seen[at] = this.stamp;
          if (visit(at) === true) return;
        }
      }
    }
  }

  private cellsOf(rect: Rect): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: Math.floor(rect.x / CELL),
      y0: Math.floor(rect.y / CELL),
      x1: Math.floor((rect.x + rect.width) / CELL),
      y1: Math.floor((rect.y + rect.height) / CELL),
    };
  }
}

function cellKey(cx: number, cy: number): number {
  // Cells far apart enough for any canvas: 2^21 each way.
  return (cy + 1_048_576) * 2_097_152 + (cx + 1_048_576);
}

function rectAt(shapes: AvoidShapes, at: number): Rect {
  const base = at * 4;
  return {
    x: shapes.rects[base] as number,
    y: shapes.rects[base + 1] as number,
    width: shapes.rects[base + 2] as number,
    height: shapes.rects[base + 3] as number,
  };
}

/** The name plate of the shape at `at`, or undefined for one that holds nothing. */
function plateAt(shapes: AvoidShapes, at: number): Rect | undefined {
  const width = shapes.plates[at] as number;
  if (!(width > 0)) return undefined;
  const rect = rectAt(shapes, at);
  return {
    x: rect.x,
    y: rect.y,
    width: Math.min(width, rect.width),
    height: Math.min(PLATE_HEIGHT, rect.height),
  };
}

/** Routes the lines of one scene around the shapes in their way. */
export class Avoider {
  private readonly grid: ShapeGrid;

  constructor(private readonly shapes: AvoidShapes) {
    this.grid = new ShapeGrid(shapes);
  }

  /** Routes one line: a route around what its stand-in route crosses, or nothing when it crosses none. */
  avoid(line: AvoidLine): Avoided {
    const { shapes } = this;
    const stand = pointsOf(line.route);
    const spanned = boundsOf(stand);
    const nowhere: Avoided = { region: grow(spanned, CLEARANCE) };
    if (line.from === line.to || stand.length < 2) return nowhere;
    const a = rectAt(shapes, line.from);
    const b = rectAt(shapes, line.to);
    const aboveA = ancestorsOf(shapes, line.from);
    const aboveB = ancestorsOf(shapes, line.to);
    // A line between a container and what it holds runs inside it, as the stand-in draws it.
    if (aboveA.has(line.to) || aboveB.has(line.from)) return nowhere;
    const excluded = (at: number) =>
      at === line.from ||
      at === line.to ||
      aboveA.has(at) ||
      aboveB.has(at) ||
      holds(shapes, line.from, at) ||
      holds(shapes, line.to, at);
    // The name plates of the containers the line runs in, which it may not cross either.
    const plates: Rect[] = [];
    for (const at of new Set([...aboveA, ...aboveB])) {
      const plate = plateAt(shapes, at);
      if (plate) plates.push(plate);
    }
    if (!this.crosses(stand, excluded, plates)) return nowhere;

    // Where to look: around both ends, and around the shapes in the way, inside the container that
    // holds both ends.
    const holder = lowestCommon(shapes, aboveA, line.from, line.to);
    const inside = holder === -1 ? undefined : rectAt(shapes, holder);
    let region = clip(grow(union(a, b), REACH), inside);
    const first = this.obstaclesIn(region, excluded);
    if (!first) return { region, gaveUp: true };
    for (const at of first) region = union(region, rectAt(shapes, at));
    region = clip(grow(region, REACH), inside);
    const obstacles = this.obstaclesIn(region, excluded);
    const kept: Avoided = { region, gaveUp: true };
    if (!obstacles || obstacles.length > MAX_OBSTACLES) return kept;
    const rects = obstacles.map((at) => rectAt(shapes, at));
    for (const plate of plates) if (meets(plate, region)) rects.push(plate);
    const route = routeAround(a, b, line.offset, rects, region, stand);
    if (!route) return { region };
    return { route: flatten(route), region };
  }

  /** Whether a route crosses a shape that is not excluded, or one of `plates`. */
  private crosses(route: Point[], excluded: (at: number) => boolean, plates: Rect[]): boolean {
    for (let each = 1; each < route.length; each++) {
      const p = route[each - 1] as Point;
      const q = route[each] as Point;
      const segment = boundsOf([p, q]);
      let hit = plates.some((plate) => segmentCrosses(p, q, plate));
      if (hit) return true;
      this.grid.query(segment, (at) => {
        if (excluded(at)) return false;
        hit = segmentCrosses(p, q, rectAt(this.shapes, at));
        return hit;
      });
      if (hit) return true;
    }
    return false;
  }

  /**
   * The shapes in a region that are not excluded, the outermost of each nest only; undefined past a
   * limit, beyond which there is no use looking further: the line keeps its stand-in route.
   */
  private obstaclesIn(region: Rect, excluded: (at: number) => boolean): number[] | undefined {
    const found = new Set<number>();
    let crowded = false;
    this.grid.query(region, (at) => {
      if (!excluded(at) && meets(rectAt(this.shapes, at), region)) found.add(at);
      crowded = found.size > MAX_OBSTACLES * 4;
      return crowded;
    });
    if (crowded) return undefined;
    const outermost: number[] = [];
    for (const at of found) {
      let parent = this.shapes.parents[at] as number;
      let covered = false;
      while (parent !== -1) {
        if (found.has(parent)) {
          covered = true;
          break;
        }
        parent = this.shapes.parents[parent] as number;
      }
      if (!covered) outermost.push(at);
    }
    return outermost;
  }
}

/** Routes every line, as a worker or the exports do; see `Avoider`. */
export function avoidRoutes(shapes: AvoidShapes, lines: readonly AvoidLine[]): Avoided[] {
  const avoider = new Avoider(shapes);
  return lines.map((line) => avoider.avoid(line));
}

function ancestorsOf(shapes: AvoidShapes, at: number): Set<number> {
  const above = new Set<number>();
  let parent = shapes.parents[at] as number;
  while (parent !== -1 && !above.has(parent)) {
    above.add(parent);
    parent = shapes.parents[parent] as number;
  }
  return above;
}

/** Whether the shape at `outer` holds the one at `inner`, at any depth. */
function holds(shapes: AvoidShapes, outer: number, inner: number): boolean {
  let parent = shapes.parents[inner] as number;
  while (parent !== -1) {
    if (parent === outer) return true;
    parent = shapes.parents[parent] as number;
  }
  return false;
}

/** The innermost shape that holds both ends, or -1 for World. */
function lowestCommon(
  shapes: AvoidShapes,
  aboveFrom: Set<number>,
  from: number,
  to: number,
): number {
  if (aboveFrom.has(to)) return to;
  let parent = shapes.parents[to] as number;
  while (parent !== -1) {
    if (parent === from || aboveFrom.has(parent)) return parent;
    parent = shapes.parents[parent] as number;
  }
  return -1;
}

/**
 * The route between two shapes around `obstacles`, inside `region`, or undefined when there is none:
 * it leaves `a` and enters `b` through the middle of a side, moved by `offset`, a clearance away from
 * every obstacle, and turns as little as it can.
 */
export function routeAround(
  a: Rect,
  b: Rect,
  offset: number,
  obstacles: readonly Rect[],
  region: Rect,
  stand?: readonly Point[],
): Point[] | undefined {
  // Siblings run in lanes of their own around what is in their way.
  const clearance = Math.max(CLEARANCE / 2, CLEARANCE + offset / 2);
  const blocks = obstacles.map((rect) => grow(rect, clearance));
  // The stand-in route's own shape, its middle run moved to a free channel, when that is enough.
  const moved = stand && movedRun(stand, blocks, a, b, region);
  if (moved) return moved;
  const start = portOf(a, offset);
  const end = portOf(b, offset);
  const xs = new Set<number>([start.x, end.x, region.x, region.x + region.width]);
  const ys = new Set<number>([start.y, end.y, region.y, region.y + region.height]);
  for (const block of [...blocks, grow(a, clearance), grow(b, clearance)]) {
    xs.add(block.x).add(block.x + block.width);
    ys.add(block.y).add(block.y + block.height);
  }
  const inRegion = (value: number, from: number, size: number) =>
    value >= from - EPSILON && value <= from + size + EPSILON;
  const gx = [...xs].filter((x) => inRegion(x, region.x, region.width)).sort((p, q) => p - q);
  const gy = [...ys].filter((y) => inRegion(y, region.y, region.height)).sort((p, q) => p - q);
  const grid = new VisibilityGrid(gx, gy);
  for (const block of blocks) grid.block(block);
  // Inside its ends' shapes, a route runs only along the lines through its ports.
  grid.blockAllBut(a, start);
  grid.blockAllBut(b, end);
  const found = grid.shortest(start, end);
  if (!found) return undefined;
  const route = simplify(clipEnds(found, a, b));
  return route.length >= 2 ? route : undefined;
}

/**
 * The stand-in route with its middle run moved, when that clears every block: a straight route moved
 * along the sides its ends share, or the middle of a route that turns twice moved across, to the
 * middle of the free channel nearest where it was. Most routes in the way of a shape or two clear it
 * so, at a fraction of the cost of a search.
 */
function movedRun(
  stand: readonly Point[],
  blocks: readonly Rect[],
  a: Rect,
  b: Rect,
  region: Rect,
): Point[] | undefined {
  const clear = (route: Point[]) => !hitsAny(route, blocks) && within(route, region);
  const tops = blocks.flatMap((block) => [block.y, block.y + block.height]);
  const sides = blocks.flatMap((block) => [block.x, block.x + block.width]);
  if (stand.length === 2) {
    const [p, q] = stand as [Point, Point];
    if (p.y === q.y) {
      const low = Math.max(a.y, b.y) + 6;
      const high = Math.min(a.y + a.height, b.y + b.height) - 6;
      for (const y of channels(tops, low, high, p.y)) {
        const route = [
          { x: p.x, y },
          { x: q.x, y },
        ];
        if (clear(route)) return route;
      }
    } else if (p.x === q.x) {
      const low = Math.max(a.x, b.x) + 6;
      const high = Math.min(a.x + a.width, b.x + b.width) - 6;
      for (const x of channels(sides, low, high, p.x)) {
        const route = [
          { x, y: p.y },
          { x, y: q.y },
        ];
        if (clear(route)) return route;
      }
    }
    return undefined;
  }
  if (stand.length !== 4) return undefined;
  const [p, m, n, q] = stand as [Point, Point, Point, Point];
  if (p.y === m.y && m.x === n.x && n.y === q.y) {
    for (const x of channels(sides, Math.min(p.x, q.x), Math.max(p.x, q.x), m.x)) {
      const route = [p, { x, y: p.y }, { x, y: q.y }, q];
      if (clear(route)) return route;
    }
  } else if (p.x === m.x && m.y === n.y && n.x === q.x) {
    for (const y of channels(tops, Math.min(p.y, q.y), Math.max(p.y, q.y), m.y)) {
      const route = [p, { x: p.x, y }, { x: q.x, y }, q];
      if (clear(route)) return route;
    }
  }
  return undefined;
}

/**
 * Where a run may go between `low` and `high`: the middles of the channels the blocks' sides leave
 * there, nearest `near` first.
 */
function channels(sides: readonly number[], low: number, high: number, near: number): number[] {
  if (!(high > low)) return [];
  const cuts = [low, high, ...sides.filter((side) => side > low && side < high)].sort(
    (p, q) => p - q,
  );
  const middles: number[] = [];
  for (let at = 1; at < cuts.length; at++) {
    const from = cuts[at - 1] as number;
    const to = cuts[at] as number;
    if (to - from > 2 * EPSILON) middles.push((from + to) / 2);
  }
  return middles.sort((p, q) => Math.abs(p - near) - Math.abs(q - near));
}

function hitsAny(route: readonly Point[], blocks: readonly Rect[]): boolean {
  for (let each = 1; each < route.length; each++) {
    const p = route[each - 1] as Point;
    const q = route[each] as Point;
    for (const block of blocks) if (segmentCrosses(p, q, block)) return true;
  }
  return false;
}

function within(route: readonly Point[], region: Rect): boolean {
  return route.every(
    ({ x, y }) =>
      x >= region.x - EPSILON &&
      x <= region.x + region.width + EPSILON &&
      y >= region.y - EPSILON &&
      y <= region.y + region.height + EPSILON,
  );
}

/** Where a route through a shape crosses its middle: its center, moved by `offset` both ways. */
function portOf(rect: Rect, offset: number): Point {
  const inset = (from: number, size: number, value: number) =>
    Math.min(from + size - 6, Math.max(from + 6, value));
  return {
    x: inset(rect.x, rect.width, rect.x + rect.width / 2 + offset),
    y: inset(rect.y, rect.height, rect.y + rect.height / 2 + offset),
  };
}

/** The ways a route faces on the grid: right, left, down, up. */
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The points of a grid made of the lines along every side of what a route goes around. */
class VisibilityGrid {
  private readonly nodes: Uint8Array;
  /** Blocked segments to the right of each point, and below it. */
  private readonly right: Uint8Array;
  private readonly down: Uint8Array;

  constructor(
    private readonly xs: number[],
    private readonly ys: number[],
  ) {
    const count = xs.length * ys.length;
    this.nodes = new Uint8Array(count);
    this.right = new Uint8Array(count);
    this.down = new Uint8Array(count);
  }

  /** Blocks what lies strictly inside `rect`: its points, and the segments through its inside. */
  block(rect: Rect): void {
    const [i0, i1] = span(this.xs, rect.x, rect.x + rect.width);
    const [j0, j1] = span(this.ys, rect.y, rect.y + rect.height);
    const nx = this.xs.length;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const at = j * nx + i;
        const x = this.xs[i] as number;
        const y = this.ys[j] as number;
        const insideX = x > rect.x + EPSILON && x < rect.x + rect.width - EPSILON;
        const insideY = y > rect.y + EPSILON && y < rect.y + rect.height - EPSILON;
        if (insideX && insideY) this.nodes[at] = 1;
        const nextX = this.xs[i + 1];
        if (
          insideY &&
          nextX !== undefined &&
          x >= rect.x - EPSILON &&
          nextX <= rect.x + rect.width + EPSILON
        ) {
          this.right[at] = 1;
        }
        const nextY = this.ys[j + 1];
        if (
          insideX &&
          nextY !== undefined &&
          y >= rect.y - EPSILON &&
          nextY <= rect.y + rect.height + EPSILON
        ) {
          this.down[at] = 1;
        }
      }
    }
  }

  /** Blocks the inside of `rect` but for the two lines through `port`. */
  blockAllBut(rect: Rect, port: Point): void {
    const [i0, i1] = span(this.xs, rect.x, rect.x + rect.width);
    const [j0, j1] = span(this.ys, rect.y, rect.y + rect.height);
    const nx = this.xs.length;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const at = j * nx + i;
        const x = this.xs[i] as number;
        const y = this.ys[j] as number;
        const insideX = x > rect.x + EPSILON && x < rect.x + rect.width - EPSILON;
        const insideY = y > rect.y + EPSILON && y < rect.y + rect.height - EPSILON;
        const onPort = x === port.x || y === port.y;
        if (insideX && insideY && !onPort) this.nodes[at] = 1;
        const nextX = this.xs[i + 1];
        if (
          insideY &&
          y !== port.y &&
          nextX !== undefined &&
          x >= rect.x &&
          nextX <= rect.x + rect.width
        ) {
          this.right[at] = 1;
        }
        const nextY = this.ys[j + 1];
        if (
          insideX &&
          x !== port.x &&
          nextY !== undefined &&
          y >= rect.y &&
          nextY <= rect.y + rect.height
        ) {
          this.down[at] = 1;
        }
      }
    }
  }

  /** The shortest route from one point of the grid to another, with the fewest turns; or none. */
  shortest(from: Point, to: Point): Point[] | undefined {
    const { xs, ys } = this;
    const nx = xs.length;
    const fi = xs.indexOf(from.x);
    const fj = ys.indexOf(from.y);
    const ti = xs.indexOf(to.x);
    const tj = ys.indexOf(to.y);
    if (fi < 0 || fj < 0 || ti < 0 || tj < 0) return undefined;
    const { cost, before, seen, stamp } = searchBuffers(nx * ys.length * 4);
    const costOf = (state: number) => (seen[state] === stamp ? (cost[state] as number) : Infinity);
    const reach = (state: number, value: number, from: number) => {
      seen[state] = stamp;
      cost[state] = value;
      before[state] = from;
    };
    const heap = new StateHeap();
    const guess = (i: number, j: number) =>
      Math.abs((xs[i] as number) - to.x) + Math.abs((ys[j] as number) - to.y);
    const start = fj * nx + fi;
    for (let way = 0; way < 4; way++) {
      reach(start * 4 + way, 0, -1);
      heap.push(start * 4 + way, guess(fi, fj));
    }
    const goal = tj * nx + ti;
    while (heap.size > 0) {
      const state = heap.pop() as number;
      const node = state >> 2;
      const way = state & 3;
      if (node === goal) return this.routeTo(state, before);
      const i = node % nx;
      const j = (node - i) / nx;
      const here = costOf(state);
      for (let next = 0; next < 4; next++) {
        // A route never turns back on itself.
        if ((next ^ 1) === way) continue;
        const [di, dj] = STEPS[next] as readonly [number, number];
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ys.length) continue;
        const target = nj * nx + ni;
        if (this.nodes[target] === 1 && target !== goal) continue;
        const crossing = di === 1 ? node : di === -1 ? target : dj === 1 ? node : target;
        if ((di !== 0 ? this.right : this.down)[crossing] === 1) continue;
        const length =
          Math.abs((xs[ni] as number) - (xs[i] as number)) +
          Math.abs((ys[nj] as number) - (ys[j] as number));
        const turned = next === way || node === start ? 0 : TURN;
        const reached = here + length + turned;
        const nextState = target * 4 + next;
        if (reached >= costOf(nextState)) continue;
        reach(nextState, reached, state);
        heap.push(nextState, reached + guess(ni, nj));
      }
    }
    return undefined;
  }

  private routeTo(state: number, before: Int32Array): Point[] {
    const nx = this.xs.length;
    const points: Point[] = [];
    for (let at = state; at !== -1; at = before[at] as number) {
      const node = at >> 2;
      const i = node % nx;
      const j = (node - i) / nx;
      points.push({ x: this.xs[i] as number, y: this.ys[j] as number });
    }
    return points.reverse();
  }
}

/** The search's buffers, kept from one search to the next and grown as needed: a stamp says which entries are this search's. */
const buffers = {
  cost: new Float64Array(0),
  before: new Int32Array(0),
  seen: new Uint32Array(0),
  stamp: 0,
};

function searchBuffers(states: number): {
  cost: Float64Array;
  before: Int32Array;
  seen: Uint32Array;
  stamp: number;
} {
  if (buffers.seen.length < states) {
    const size = Math.max(states, buffers.seen.length * 2, 4096);
    buffers.cost = new Float64Array(size);
    buffers.before = new Int32Array(size);
    buffers.seen = new Uint32Array(size);
    buffers.stamp = 0;
  }
  buffers.stamp += 1;
  if (buffers.stamp === 0xffffffff) {
    buffers.seen.fill(0);
    buffers.stamp = 1;
  }
  return buffers;
}

/** The indexes of the grid lines from the last at or before `from` to the first at or after `to`. */
function span(values: number[], from: number, to: number): [number, number] {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((values[middle] as number) <= from) low = middle;
    else high = middle - 1;
  }
  let last = low;
  while (last < values.length - 1 && (values[last] as number) < to) last++;
  return [low, last];
}

/** A binary heap of states by their estimated cost, smallest first. */
class StateHeap {
  private readonly states: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.states.length;
  }

  push(state: number, key: number): void {
    const { states, keys } = this;
    let at = states.length;
    states.push(state);
    keys.push(key);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      states[at] = states[parent] as number;
      keys[at] = keys[parent] as number;
      at = parent;
    }
    states[at] = state;
    keys[at] = key;
  }

  pop(): number | undefined {
    const { states, keys } = this;
    const top = states[0];
    const lastState = states.pop();
    const lastKey = keys.pop();
    if (states.length === 0 || lastState === undefined || lastKey === undefined) return top;
    let at = 0;
    for (;;) {
      const left = 2 * at + 1;
      if (left >= states.length) break;
      const right = left + 1;
      const child =
        right < states.length && (keys[right] as number) < (keys[left] as number) ? right : left;
      if ((keys[child] as number) >= lastKey) break;
      states[at] = states[child] as number;
      keys[at] = keys[child] as number;
      at = child;
    }
    states[at] = lastState;
    keys[at] = lastKey;
    return top;
  }
}

/**
 * The route cut at its ends' borders: from where it leaves `a` to where it enters `b`, as a line is
 * drawn from border to border.
 */
function clipEnds(found: Point[], a: Rect, b: Rect): Point[] {
  const points = [...found];
  // From the start, the last point still inside `a`, and where its segment leaves it.
  let first = 0;
  while (first + 1 < points.length && strictlyInside(points[first + 1] as Point, a)) first++;
  const leaving = exitPoint(points[first] as Point, points[first + 1] as Point, a);
  let last = points.length - 1;
  while (last - 1 > first && strictlyInside(points[last - 1] as Point, b)) last--;
  const entering = exitPoint(points[last] as Point, points[last - 1] as Point, b);
  return [leaving, ...points.slice(first + 1, last), entering];
}

/** Where the segment from `inside`, a point in `rect`, to `outside` crosses the border of `rect`. */
function exitPoint(inside: Point, outside: Point, rect: Rect): Point {
  if (inside.y === outside.y) {
    const x = outside.x > inside.x ? rect.x + rect.width : rect.x;
    return { x, y: inside.y };
  }
  const y = outside.y > inside.y ? rect.y + rect.height : rect.y;
  return { x: inside.x, y };
}

function strictlyInside(point: Point, rect: Rect): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}

/** A route without the points that do not turn it. */
function simplify(route: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of route) {
    const previous = kept.at(-1);
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    const before = kept.at(-2);
    if (
      before &&
      previous &&
      ((before.x === previous.x && previous.x === point.x) ||
        (before.y === previous.y && previous.y === point.y))
    ) {
      kept[kept.length - 1] = point;
      continue;
    }
    kept.push(point);
  }
  return kept;
}

/** Whether a horizontal or vertical segment runs through the inside of `rect`. */
export function segmentCrosses(p: Point, q: Point, rect: Rect): boolean {
  const left = rect.x + EPSILON;
  const right = rect.x + rect.width - EPSILON;
  const top = rect.y + EPSILON;
  const bottom = rect.y + rect.height - EPSILON;
  if (p.y === q.y) {
    if (p.y <= top || p.y >= bottom) return false;
    return Math.max(p.x, q.x) > left && Math.min(p.x, q.x) < right;
  }
  if (p.x === q.x) {
    if (p.x <= left || p.x >= right) return false;
    return Math.max(p.y, q.y) > top && Math.min(p.y, q.y) < bottom;
  }
  // A slanting segment, as of a line drawn straight: by its bounds.
  return (
    Math.max(p.x, q.x) > left &&
    Math.min(p.x, q.x) < right &&
    Math.max(p.y, q.y) > top &&
    Math.min(p.y, q.y) < bottom
  );
}

function pointsOf(route: Float64Array): Point[] {
  const points: Point[] = [];
  for (let at = 0; at + 1 < route.length; at += 2) {
    points.push({ x: route[at] as number, y: route[at + 1] as number });
  }
  return points;
}

function flatten(route: readonly Point[]): Float64Array {
  const flat = new Float64Array(route.length * 2);
  route.forEach((point, at) => {
    flat[2 * at] = point.x;
    flat[2 * at + 1] = point.y;
  });
  return flat;
}

function boundsOf(points: readonly Point[]): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { x, y } of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** `rect` within `inside`, when there is an inside to keep to. */
function clip(rect: Rect, inside: Rect | undefined): Rect {
  if (!inside) return rect;
  const x = Math.max(rect.x, inside.x);
  const y = Math.max(rect.y, inside.y);
  const right = Math.min(rect.x + rect.width, inside.x + inside.width);
  const bottom = Math.min(rect.y + rect.height, inside.y + inside.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function meets(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
