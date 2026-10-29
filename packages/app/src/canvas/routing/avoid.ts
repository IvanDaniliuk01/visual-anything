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
 * and stand-in routes.
 *
 * Its work is bounded whatever a project file holds, as a file may give shapes sizes up to 100,000 a
 * side: the index of the shapes keeps to `MAX_GRID_CELLS` cells, as large as the scene's extent and
 * the count of its shapes need, files a shape in at most `MAX_SHAPE_CELLS` of them and keeps a larger
 * one on a list every query looks through, and holds at most `MAX_ENTRIES` entries and
 * `MAX_OVERSIZED` shapes so kept; past either, nothing is routed around and every line keeps its
 * stand-in route. A query looks through at most `MAX_QUERY_CELLS` cells and `MAX_QUERY_VISITS`
 * entries, and a line keeps its stand-in route when its region needs more, when it has more shapes
 * around it than `MAX_OBSTACLES`, or when an end is nested deeper than `MAX_DEPTH`.
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
  /**
   * 1 for each shape drawn inside another as a part of it, as a row is inside its table: routes go
   * around its container, never around it alone, so the index leaves it out. Absent: none is.
   */
  inside?: Uint8Array;
  /**
   * 1 for each container drawn open, its contents drawn: a route beside a row runs through it,
   * between what it holds and clear of its name plate, as libavoid is given only blocks and plates
   * (ADR 0080, section 2). Absent: routes go around every container but their ends'.
   */
  open?: Uint8Array;
}

/**
 * An end beside a row, or on a shape that draws rows (ADR 0023, ADR 0080 section 2): the shape whose
 * side it leaves, the way it leaves, 1 to the right and -1 to the left, and the height it leaves at,
 * its row's middle.
 */
export interface AvoidSide {
  shape: number;
  way: 1 | -1;
  y: number;
}

/** A line to route: the indexes of its ends' shapes, how far it runs beside its siblings, its route. */
export interface AvoidLine {
  from: number;
  to: number;
  offset: number;
  /** Its stand-in route, as x and y pairs. */
  route: Float64Array;
  /** Present when its `from` end leaves beside a row: it leaves there, with a stub of `STUB`. */
  fromSide?: AvoidSide;
  /** Present when its `to` end leaves beside a row. */
  toSide?: AvoidSide;
}

/** What routing one line gave: a route around what was in its way, and where it looked. */
export interface Avoided {
  /** The new route, as x and y pairs; absent when the stand-in route crosses nothing, or gave up. */
  route?: Float64Array;
  /** The region it looked in for what is in the route's way. */
  region: Rect;
  /**
   * Present when it gave up: with more shapes around the line than it goes around, a region too large
   * or crowded to look through, an end nested too deep, or more shapes than the index holds. The line
   * keeps its stand-in route, and a change near it would not change that.
   */
  gaveUp?: true;
}

/** How far clear of the shapes a route runs, in canvas units. */
export const CLEARANCE = 16;
/**
 * How far clear of the shapes a route with an end beside a row runs, as libavoid's buffer is set
 * (ADR 0080, section 2): less than the stub, so that a stub's tip lies clear of its own shape.
 */
export const SIDE_CLEARANCE = 12;
/** How far a route with an end beside a row runs straight out of its side before it turns. */
export const STUB = 16;
/**
 * What running along another line's run costs a route beside a row, per unit of length, where the two
 * share no end: so that lines take corridors of their own, as the research's grid router did, and the
 * channel pass has room to spread what still runs together (ADR 0080, section 2).
 */
const SHARE = 2;
/** How near another line's run counts as running along it. */
const NEAR_RUN = 8;
/** What crossing another line's run costs a route beside a row, in canvas units of length. */
const CROSS = 128;
/** The clearances a route with an end beside a row tries, in turn, before it gives up. */
const BESIDE_CLEARANCES = [SIDE_CLEARANCE, 4, 1] as const;
/** How tall a container's name plate is: its name and its detail, at its top. */
export const PLATE_HEIGHT = 44;
/** The most shapes a route goes around; with more near its ends, it keeps its stand-in route. */
export const MAX_OBSTACLES = 60;
/**
 * The most shapes a route beside a row goes around, which runs between the tables of the containers
 * it crosses rather than around those containers.
 */
export const MAX_BESIDE_OBSTACLES = 160;
/** What a turn costs, in canvas units of length, so that a route prefers fewer of them. */
const TURN = 48;
/**
 * What a turn costs a route with an end beside a row, which runs far across a data model: more, so
 * that it bends at most twice on average (ADR 0080's quality thresholds).
 */
const BESIDE_TURN = 240;
/** How far the region a route looks in reaches beyond its ends. */
const REACH = 3 * CLEARANCE;
/** How much of a shape a segment must cross to count, so that lines along a border do not. */
const EPSILON = 0.5;
/** The least side of a cell of the shapes' index, in canvas units. */
const CELL = 256;
/** The most cells the shapes' index has, whatever the scene's extent: its cells grow to keep to it. */
export const MAX_GRID_CELLS = 65_536;
/** The most cells the index files one shape in; a larger shape is kept on a list every query reads. */
export const MAX_SHAPE_CELLS = 256;
/** The most shapes kept on that list; with more, nothing is routed around. */
export const MAX_OVERSIZED = 512;
/** The most entries the index holds, all told; with more, nothing is routed around. */
export const MAX_ENTRIES = 400_000;
/** The most cells one query looks through; a larger region is not routed in. */
export const MAX_QUERY_CELLS = 4_096;
/** The most entries one query reads; a more crowded region is not routed in. */
export const MAX_QUERY_VISITS = 16_384;
/** How deeply an end may be nested for its line to be routed around shapes. */
export const MAX_DEPTH = 64;
/** The depth of a shape whose containers never reach World, which only a broken scene has. */
const NOWHERE = 0x3fffffff;

/**
 * An index of the shapes by the cells of a grid they cover, made once for a batch of lines, with its
 * work bounded however large or many the shapes (see the file's comment).
 */
class ShapeGrid {
  /** Whether the shapes would take the index past its limits: then nothing is routed around. */
  readonly overloaded: boolean;
  private readonly left: number;
  private readonly top: number;
  private readonly side: number;
  private readonly columns: number;
  private readonly rows: number;
  /** Where each cell's entries start in `entries`, and where the last one's end. */
  private readonly starts: Int32Array;
  private readonly entries: Int32Array;
  /** The shapes that cover more cells than one is filed in. */
  private readonly oversized: number[] = [];
  private readonly seen: Uint32Array;
  private stamp = 0;

  constructor(shapes: AvoidShapes) {
    const count = shapes.parents.length;
    this.seen = new Uint32Array(count);
    const { rects } = shapes;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let at = 0; at < count; at++) {
      if (!finiteAt(shapes, at)) continue;
      const base = at * 4;
      const x = rects[base] as number;
      const y = rects[base + 1] as number;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + (rects[base + 2] as number));
      bottom = Math.max(bottom, y + (rects[base + 3] as number));
    }
    if (!(right >= left && bottom >= top)) {
      left = 0;
      top = 0;
      right = 0;
      bottom = 0;
    }
    // Cells as large as the extent and the count of shapes need, so that there are never too many.
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const wanted = Math.min(MAX_GRID_CELLS, Math.max(64, 4 * count));
    let side = Math.max(CELL, Math.sqrt((width * height) / wanted));
    const along = (size: number) => Math.floor(size / side) + 1;
    while (along(width) * along(height) > MAX_GRID_CELLS) side *= 2;
    this.left = left;
    this.top = top;
    this.side = side;
    this.columns = along(width);
    this.rows = along(height);

    // How many cells each shape is filed in, before filing any.
    const spans = new Int32Array(count * 4).fill(-1);
    let entries = 0;
    for (let at = 0; at < count; at++) {
      if (!finiteAt(shapes, at) || shapes.inside?.[at] === 1) continue;
      const base = at * 4;
      const x0 = this.column(rects[base] as number);
      const y0 = this.row(rects[base + 1] as number);
      const x1 = this.column((rects[base] as number) + (rects[base + 2] as number));
      const y1 = this.row((rects[base + 1] as number) + (rects[base + 3] as number));
      const cells = (x1 - x0 + 1) * (y1 - y0 + 1);
      if (cells > MAX_SHAPE_CELLS) {
        this.oversized.push(at);
        continue;
      }
      spans[base] = x0;
      spans[base + 1] = y0;
      spans[base + 2] = x1;
      spans[base + 3] = y1;
      entries += cells;
    }
    this.overloaded = entries > MAX_ENTRIES || this.oversized.length > MAX_OVERSIZED;
    if (this.overloaded) {
      this.starts = new Int32Array(1);
      this.entries = new Int32Array(0);
      return;
    }
    // Filed by cell, each cell's entries one after another.
    const cellCount = this.columns * this.rows;
    const starts = new Int32Array(cellCount + 1);
    const eachCell = (visit: (cell: number, at: number) => void) => {
      for (let at = 0; at < count; at++) {
        const base = at * 4;
        const x0 = spans[base] as number;
        if (x0 < 0) continue;
        const y0 = spans[base + 1] as number;
        const x1 = spans[base + 2] as number;
        const y1 = spans[base + 3] as number;
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) visit(cy * this.columns + cx, at);
        }
      }
    };
    eachCell((cell) => {
      starts[cell + 1] = (starts[cell + 1] as number) + 1;
    });
    for (let cell = 0; cell < cellCount; cell++) {
      starts[cell + 1] = (starts[cell + 1] as number) + (starts[cell] as number);
    }
    const filed = new Int32Array(entries);
    const next = starts.slice(0, cellCount);
    eachCell((cell, at) => {
      const place = next[cell] as number;
      filed[place] = at;
      next[cell] = place + 1;
    });
    this.starts = starts;
    this.entries = filed;
  }

  /**
   * Calls `visit` once for each shape filed in a cell `rect` meets, and each kept apart; it stops when
   * `visit` says true. Says whether it could look: not for a region of more than `MAX_QUERY_CELLS`
   * cells or `MAX_QUERY_VISITS` entries, nor in an index past its limits.
   */
  query(rect: Rect, visit: (at: number) => boolean | void): boolean {
    if (this.overloaded) return false;
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return false;
    this.stamp += 1;
    if (this.stamp === 0xffffffff) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    const x0 = this.column(rect.x);
    const y0 = this.row(rect.y);
    const x1 = this.column(rect.x + rect.width);
    const y1 = this.row(rect.y + rect.height);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_QUERY_CELLS) return false;
    const { starts, entries, seen, stamp } = this;
    let visits = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = cy * this.columns + cx;
        const end = starts[cell + 1] as number;
        for (let entry = starts[cell] as number; entry < end; entry++) {
          visits += 1;
          if (visits > MAX_QUERY_VISITS) return false;
          const at = entries[entry] as number;
          if (seen[at] === stamp) continue;
          seen[at] = stamp;
          if (visit(at) === true) return true;
        }
      }
    }
    for (const at of this.oversized) {
      if (seen[at] === stamp) continue;
      seen[at] = stamp;
      if (visit(at) === true) return true;
    }
    return true;
  }

  /** The column of the grid a canvas x falls in, the first or the last for one beyond them. */
  private column(x: number): number {
    return Math.min(this.columns - 1, Math.max(0, Math.floor((x - this.left) / this.side)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.top) / this.side)));
  }
}

/** Whether the shape at `at` has a rectangle of finite numbers, which the index files. */
function finiteAt(shapes: AvoidShapes, at: number): boolean {
  const base = at * 4;
  for (let each = 0; each < 4; each++) {
    if (!Number.isFinite(shapes.rects[base + each])) return false;
  }
  return true;
}

/**
 * How the shapes nest, read once for a batch of lines: each one's depth, and where it starts and ends
 * in a walk of the containers from World, so that whether one holds another takes no walk.
 */
class Nesting {
  /** Each shape's depth, 0 for one directly in World; `NOWHERE` for one in a loop of containers. */
  readonly depths: Int32Array;
  private readonly enter: Int32Array;
  private readonly exit: Int32Array;

  constructor(parents: Int32Array) {
    const count = parents.length;
    const parentOf = (at: number) => {
      const parent = parents[at] as number;
      return parent >= 0 && parent < count && parent !== at ? parent : -1;
    };
    // Each shape's children, one after another.
    const starts = new Int32Array(count + 1);
    for (let at = 0; at < count; at++) {
      const parent = parentOf(at);
      if (parent !== -1) starts[parent + 1] = (starts[parent + 1] as number) + 1;
    }
    for (let at = 0; at < count; at++) {
      starts[at + 1] = (starts[at + 1] as number) + (starts[at] as number);
    }
    const children = new Int32Array(starts[count] as number);
    const next = starts.slice(0, count);
    for (let at = 0; at < count; at++) {
      const parent = parentOf(at);
      if (parent === -1) continue;
      children[next[parent] as number] = at;
      next[parent] = (next[parent] as number) + 1;
    }
    this.depths = new Int32Array(count).fill(NOWHERE);
    this.enter = new Int32Array(count).fill(-1);
    this.exit = new Int32Array(count).fill(-1);
    // From each shape in World, down: a walk without recursion, however deep the nesting.
    const stack = new Int32Array(count);
    const cursor = new Int32Array(count);
    let clock = 0;
    for (let root = 0; root < count; root++) {
      if ((parents[root] as number) !== -1) continue;
      let height = 0;
      stack[height++] = root;
      this.depths[root] = 0;
      this.enter[root] = clock++;
      cursor[root] = starts[root] as number;
      while (height > 0) {
        const node = stack[height - 1] as number;
        const at = cursor[node] as number;
        if (at < (starts[node + 1] as number)) {
          cursor[node] = at + 1;
          const child = children[at] as number;
          if ((this.enter[child] as number) !== -1) continue;
          this.depths[child] = (this.depths[node] as number) + 1;
          this.enter[child] = clock++;
          cursor[child] = starts[child] as number;
          stack[height++] = child;
        } else {
          this.exit[node] = clock++;
          height -= 1;
        }
      }
    }
  }

  /** Whether the shape at `outer` holds the one at `inner`, at any depth. */
  holds(outer: number, inner: number): boolean {
    const from = this.enter[outer] as number;
    const at = this.enter[inner] as number;
    if (from < 0 || at < 0 || outer === inner) return false;
    return from < at && (this.exit[inner] as number) < (this.exit[outer] as number);
  }
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
  private readonly nesting: Nesting;
  /** The routes lines beside rows run along, which a route beside a row prefers not to share. */
  private readonly tracks = new Tracks();

  /**
   * `existing` are lines already drawn that this avoider does not route, as the canvas's other
   * routes are while some are routed again: routes beside rows keep apart from them too.
   */
  constructor(
    private readonly shapes: AvoidShapes,
    existing: readonly AvoidLine[] = [],
  ) {
    this.grid = new ShapeGrid(shapes);
    this.nesting = new Nesting(shapes.parents);
    if (!this.grid.overloaded) {
      for (const line of existing) this.tracks.add(line.route, line.from, line.to);
    }
  }

  /**
   * Routes one line, as `route` does, and keeps the route of a line beside a row for the routes
   * beside rows after it, which are the only ones that read them.
   */
  avoid(line: AvoidLine): Avoided {
    const avoided = this.route(line);
    if (line.fromSide || line.toSide)
      this.tracks.add(avoided.route ?? line.route, line.from, line.to);
    return avoided;
  }

  /** Whether the shapes are more than the index holds: then every line keeps its stand-in route. */
  get overloaded(): boolean {
    return this.grid.overloaded;
  }

  /** Routes one line: a route around what its stand-in route crosses, or nothing when it crosses none. */
  private route(line: AvoidLine): Avoided {
    const { shapes, nesting } = this;
    const stand = pointsOf(line.route);
    const spanned = boundsOf(stand);
    const nowhere: Avoided = { region: grow(spanned, CLEARANCE) };
    // An end beside a row counts by the shape whose side it leaves: its table.
    const from = line.fromSide?.shape ?? line.from;
    const to = line.toSide?.shape ?? line.to;
    if (from === to || stand.length < 2) return nowhere;
    const count = shapes.parents.length;
    const known = (at: number) => Number.isInteger(at) && at >= 0 && at < count;
    if (!known(from) || !known(to)) return nowhere;
    // Past the index's limits, an end nested too deep, or an end of no finite size: as built.
    if (
      this.grid.overloaded ||
      (nesting.depths[from] as number) > MAX_DEPTH ||
      (nesting.depths[to] as number) > MAX_DEPTH ||
      !finiteAt(shapes, from) ||
      !finiteAt(shapes, to)
    ) {
      return { ...nowhere, gaveUp: true };
    }
    const a = rectAt(shapes, from);
    const b = rectAt(shapes, to);
    const aboveA = ancestorsOf(shapes, from);
    const aboveB = ancestorsOf(shapes, to);
    // A line between a container and what it holds runs inside it, as the stand-in draws it.
    if (aboveA.has(to) || aboveB.has(from)) return nowhere;
    const beside = line.fromSide !== undefined || line.toSide !== undefined;
    const open = (at: number) => beside && shapes.open?.[at] === 1;
    // Beside rows, a shape that covers an end's table, as pinned shapes may, cannot be gone around:
    // the line runs over it, and around what it holds. A container drawn open is run through.
    const excluded = (at: number) =>
      at === from ||
      at === to ||
      aboveA.has(at) ||
      aboveB.has(at) ||
      nesting.holds(from, at) ||
      nesting.holds(to, at) ||
      open(at) ||
      (beside && (covers(rectAt(shapes, at), a) || covers(rectAt(shapes, at), b)));
    // The name plates of the containers the line runs in, which it may not cross either: beside
    // rows, those of every container drawn open it runs through.
    const plates: Rect[] = [];
    for (const at of new Set([...aboveA, ...aboveB])) {
      const plate = plateAt(shapes, at);
      if (plate) plates.push(plate);
    }
    const near = beside ? this.openIn(grow(spanned, CLEARANCE), aboveA, aboveB) : [];
    if (!near) return { ...nowhere, gaveUp: true };
    const crossing = this.crosses(stand, excluded, [...plates, ...near]);
    if (crossing === undefined) return { ...nowhere, gaveUp: true };
    // Beside rows, a stand-in route that crosses nothing is still routed when it runs along another
    // line's run, as the stand-ins through the middle of one gap do.
    if (!crossing && !(beside && this.tracks.shares(line.route, line.from, line.to)))
      return nowhere;

    // Where to look: around both ends, and around the shapes in the way, inside the container that
    // holds both ends.
    const holder = lowestCommon(shapes, aboveA, from, to);
    const inside = holder === -1 ? undefined : rectAt(shapes, holder);
    let region = clip(grow(union(a, b), REACH), inside);
    const most = beside ? MAX_BESIDE_OBSTACLES : MAX_OBSTACLES;
    const first = this.obstaclesIn(region, excluded, most);
    if (!first) return { region, gaveUp: true };
    for (const at of first) region = union(region, rectAt(shapes, at));
    region = clip(grow(region, REACH), inside);
    const obstacles = this.obstaclesIn(region, excluded, most);
    const kept: Avoided = { region, gaveUp: true };
    if (!obstacles || obstacles.length > most) return kept;
    const rects = obstacles.map((at) => rectAt(shapes, at));
    const all = beside ? this.openIn(region, aboveA, aboveB) : [];
    if (!all) return kept;
    for (const plate of [...plates, ...all]) if (meets(plate, region)) rects.push(plate);
    if (beside) {
      const ports: EndPorts = {};
      if (line.fromSide) ports.from = portBeside(a, line.fromSide);
      if (line.toSide) ports.to = portBeside(b, line.toSide);
      // Where a neighbour stands closer than a stub and the clearance, the route keeps less clear.
      const along = this.tracks.near(region, line.from, line.to);
      for (const clearance of BESIDE_CLEARANCES) {
        const route = routeAround(a, b, line.offset, rects, region, stand, ports, clearance, along);
        if (route) return { route: flatten(route), region };
      }
      return kept;
    }
    const route = routeAround(a, b, line.offset, rects, region, stand);
    if (!route) return { region };
    return { route: flatten(route), region };
  }

  /**
   * Whether a route crosses a shape that is not excluded, or one of `plates`; undefined when it runs
   * where there is too much to look through.
   */
  private crosses(
    route: Point[],
    excluded: (at: number) => boolean,
    plates: Rect[],
  ): boolean | undefined {
    for (let each = 1; each < route.length; each++) {
      const p = route[each - 1] as Point;
      const q = route[each] as Point;
      const segment = boundsOf([p, q]);
      let hit = plates.some((plate) => segmentCrosses(p, q, plate));
      if (hit) return true;
      const looked = this.grid.query(segment, (at) => {
        if (excluded(at)) return false;
        hit = segmentCrosses(p, q, rectAt(this.shapes, at));
        return hit;
      });
      if (hit) return true;
      if (!looked) return undefined;
    }
    return false;
  }

  /**
   * The shapes in a region that are not excluded, the outermost of each nest only; undefined past a
   * limit, beyond which there is no use looking further: the line keeps its stand-in route.
   */
  private obstaclesIn(
    region: Rect,
    excluded: (at: number) => boolean,
    most = MAX_OBSTACLES,
  ): number[] | undefined {
    const found = new Set<number>();
    let crowded = false;
    const looked = this.grid.query(region, (at) => {
      if (!excluded(at) && meets(rectAt(this.shapes, at), region)) found.add(at);
      crowded = found.size > most * 4;
      return crowded;
    });
    if (crowded || !looked) return undefined;
    const outermost: number[] = [];
    for (const at of found) {
      // Up to `MAX_DEPTH` containers up, however deep the nesting.
      let parent = this.shapes.parents[at] as number;
      let covered = false;
      for (let up = 0; up < MAX_DEPTH && parent >= 0 && parent !== at; up++) {
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

  /**
   * The name plates of the containers drawn open in a region, but for those `aboveA` and `aboveB`
   * hold, which the caller has; undefined past a limit of the index.
   */
  private openIn(
    region: Rect,
    aboveA: ReadonlySet<number>,
    aboveB: ReadonlySet<number>,
  ): Rect[] | undefined {
    const { shapes } = this;
    if (!shapes.open) return [];
    const plates: Rect[] = [];
    const looked = this.grid.query(region, (at) => {
      if (shapes.open?.[at] !== 1 || aboveA.has(at) || aboveB.has(at)) return;
      const plate = plateAt(shapes, at);
      if (plate && meets(plate, region)) plates.push(plate);
    });
    return looked ? plates : undefined;
  }
}

/** Routes every line, as a worker or the exports do; see `Avoider`. */
export function avoidRoutes(
  shapes: AvoidShapes,
  lines: readonly AvoidLine[],
  existing: readonly AvoidLine[] = [],
): Avoided[] {
  const avoider = new Avoider(shapes, existing);
  return lines.map((line) => avoider.avoid(line));
}

/** The containers of a shape nested no deeper than `MAX_DEPTH`, as `Avoider.avoid` asks. */
function ancestorsOf(shapes: AvoidShapes, at: number): Set<number> {
  const above = new Set<number>();
  let parent = shapes.parents[at] as number;
  while (parent >= 0 && !above.has(parent) && above.size <= MAX_DEPTH) {
    above.add(parent);
    parent = shapes.parents[parent] as number;
  }
  return above;
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
  for (let up = 0; up <= MAX_DEPTH && parent >= 0; up++) {
    if (parent === from || aboveFrom.has(parent)) return parent;
    parent = shapes.parents[parent] as number;
  }
  return -1;
}

/** The runs of the lines routed so far, by the cells of a grid they cover, with their ends. */
class Tracks {
  private readonly cells = new Map<number, number[]>();
  /** Four numbers a run, and its line's two ends after them. */
  private readonly runs: number[] = [];

  /** Keeps the runs of a route between ends `from` and `to`. */
  add(route: Float64Array, from: number, to: number): void {
    for (let at = 2; at + 1 < route.length; at += 2) {
      const x0 = route[at - 2] as number;
      const y0 = route[at - 1] as number;
      const x1 = route[at] as number;
      const y1 = route[at + 1] as number;
      if (x0 !== x1 && y0 !== y1) continue;
      if (x0 === x1 && y0 === y1) continue;
      const index = this.runs.length;
      this.runs.push(x0, y0, x1, y1, from, to);
      const cx0 = Math.floor(Math.min(x0, x1) / CELL);
      const cx1 = Math.floor(Math.max(x0, x1) / CELL);
      const cy0 = Math.floor(Math.min(y0, y1) / CELL);
      const cy1 = Math.floor(Math.max(y0, y1) / CELL);
      if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_QUERY_CELLS) continue;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = (cx + 0x8000) * 0x10000 + (cy + 0x8000);
          const list = this.cells.get(key);
          if (list) list.push(index);
          else this.cells.set(key, [index]);
        }
      }
    }
  }

  /**
   * Whether a route runs along a run of a line that shares no end with `from` and `to`: on the same
   * line, overlapping by more than a few units.
   */
  shares(route: Float64Array, from: number, to: number): boolean {
    for (let at = 2; at + 1 < route.length; at += 2) {
      const x0 = route[at - 2] as number;
      const y0 = route[at - 1] as number;
      const x1 = route[at] as number;
      const y1 = route[at + 1] as number;
      if (x0 !== x1 && y0 !== y1) continue;
      const box = boundsOf([
        { x: x0, y: y0 },
        { x: x1, y: y1 },
      ]);
      const runs = this.near(grow(box, 1), from, to);
      for (let run = 0; run + 3 < runs.length; run += 4) {
        const a0 = runs[run] as number;
        const b0 = runs[run + 1] as number;
        const a1 = runs[run + 2] as number;
        const b1 = runs[run + 3] as number;
        const together =
          x0 === x1
            ? a0 === a1 && Math.abs(a0 - x0) < 0.5 && overlapOf(y0, y1, b0, b1) > 4
            : b0 === b1 && Math.abs(b0 - y0) < 0.5 && overlapOf(x0, x1, a0, a1) > 4;
        if (together) return true;
      }
    }
    return false;
  }

  /** The runs in a region of lines that share no end with `from` and `to`, four numbers each. */
  near(region: Rect, from: number, to: number): number[] {
    const found: number[] = [];
    const seen = new Set<number>();
    const cx0 = Math.floor(region.x / CELL);
    const cx1 = Math.floor((region.x + region.width) / CELL);
    const cy0 = Math.floor(region.y / CELL);
    const cy1 = Math.floor((region.y + region.height) / CELL);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_QUERY_CELLS) return found;
    const { runs } = this;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (const index of this.cells.get((cx + 0x8000) * 0x10000 + (cy + 0x8000)) ?? []) {
          if (seen.has(index)) continue;
          seen.add(index);
          const a = runs[index + 4] as number;
          const b = runs[index + 5] as number;
          if (a === from || a === to || b === from || b === to) continue;
          found.push(
            runs[index] as number,
            runs[index + 1] as number,
            runs[index + 2] as number,
            runs[index + 3] as number,
          );
        }
      }
    }
    return found;
  }
}

/** How far two spans along one line overlap; negative when they lie apart. */
function overlapOf(a0: number, a1: number, b0: number, b1: number): number {
  return (
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1))
  );
}

/** Where a route leaves a shape beside a row: on its side at the row's middle, the way it faces. */
export interface EndPort {
  x: number;
  y: number;
  way: 1 | -1;
}

/** The ports of a route's ends that leave beside rows; an end without one leaves through a side's middle. */
export interface EndPorts {
  from?: EndPort;
  to?: EndPort;
}

/** The port of an end beside a row, on the side of `rect` it leaves. */
function portBeside(rect: Rect, side: AvoidSide): EndPort {
  return { x: side.way > 0 ? rect.x + rect.width : rect.x, y: side.y, way: side.way };
}

/** Where a port's stub ends, `STUB` out of its side. */
function tipOf(port: EndPort): Point {
  return { x: port.x + port.way * STUB, y: port.y };
}

/**
 * The route between two shapes around `obstacles`, inside `region`, or undefined when there is none:
 * it leaves `a` and enters `b` through the middle of a side, moved by `offset`, a clearance away from
 * every obstacle, and turns as little as it can. An end with a port in `ports` leaves at the port
 * instead, straight out of its side for `STUB` before it turns, and its shape is gone around like
 * any other.
 */
export function routeAround(
  a: Rect,
  b: Rect,
  offset: number,
  obstacles: readonly Rect[],
  region: Rect,
  stand?: readonly Point[],
  ports: EndPorts = {},
  besideClearance = SIDE_CLEARANCE,
  along: readonly number[] = [],
): Point[] | undefined {
  const beside = ports.from !== undefined || ports.to !== undefined;
  // Siblings run in lanes of their own around what is in their way.
  const clearance = beside ? besideClearance : Math.max(CLEARANCE / 2, CLEARANCE + offset / 2);
  const blocks = obstacles.map((rect) => grow(rect, clearance));
  // The stand-in route's own shape, its middle run moved to a free channel, when that is enough.
  const moved = stand && movedRun(stand, blocks, a, b, region, ports);
  if (moved) return moved;
  const start = ports.from ? tipOf(ports.from) : portOf(a, offset);
  const end = ports.to ? tipOf(ports.to) : portOf(b, offset);
  const xs = new Set<number>([start.x, end.x, region.x, region.x + region.width]);
  const ys = new Set<number>([start.y, end.y, region.y, region.y + region.height]);
  // A shape left beside a row is gone around a little less than its stub, so its tip lies clear.
  const ownA = ports.from ? grow(a, STUB - 4) : undefined;
  const ownB = ports.to ? grow(b, STUB - 4) : undefined;
  for (const block of [...blocks, grow(a, clearance), grow(b, clearance), ownA, ownB]) {
    if (!block) continue;
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
  if (ownA) grid.block(ownA);
  else grid.blockAllBut(a, start);
  if (ownB) grid.block(ownB);
  else grid.blockAllBut(b, end);
  if (along.length > 0) grid.markUsed(along);
  // A stub's tip is left the way the stub runs, never back along it.
  const found = grid.shortest(
    start,
    end,
    ports.from ? wayOf(ports.from.way) : undefined,
    beside ? BESIDE_TURN : TURN,
  );
  if (!found) return undefined;
  let route = found;
  route = ports.from ? [{ x: ports.from.x, y: ports.from.y }, ...route] : clipStart(route, a);
  route = ports.to ? [...route, { x: ports.to.x, y: ports.to.y }] : clipEnd(route, b);
  route = simplify(route);
  return route.length >= 2 ? route : undefined;
}

/** The index in `STEPS` of a horizontal way: 0 to the right, 1 to the left. */
function wayOf(way: 1 | -1): number {
  return way > 0 ? 0 : 1;
}

/**
 * The stand-in route with its middle run moved, when that clears every block: a straight route moved
 * along the sides its ends share, or the middle of a route that turns twice moved across, to the
 * middle of the free channel nearest where it was. Most routes in the way of a shape or two clear it
 * so, at a fraction of the cost of a search. An end beside a row stays at its row's middle, and its
 * stub keeps `STUB` at least.
 */
function movedRun(
  stand: readonly Point[],
  blocks: readonly Rect[],
  a: Rect,
  b: Rect,
  region: Rect,
  ports: EndPorts,
): Point[] | undefined {
  const clear = (route: Point[]) => !hitsAny(route, blocks) && within(route, region);
  const tops = blocks.flatMap((block) => [block.y, block.y + block.height]);
  const sides = blocks.flatMap((block) => [block.x, block.x + block.width]);
  const beside = ports.from !== undefined || ports.to !== undefined;
  if (stand.length === 2) {
    // A straight line between rows runs at their middles, which it may not leave.
    if (beside) return undefined;
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
    // Each stub out of a row runs `STUB` at least before the middle run.
    let low = Math.min(p.x, q.x);
    let high = Math.max(p.x, q.x);
    for (const [port, at] of [
      [ports.from, p],
      [ports.to, q],
    ] as const) {
      if (!port) continue;
      if (port.way > 0 && at.x === low) low += STUB;
      else if (port.way < 0 && at.x === high) high -= STUB;
      else return undefined;
    }
    for (const x of channels(sides, low, high, m.x)) {
      const route = [p, { x, y: p.y }, { x, y: q.y }, q];
      if (clear(route)) return route;
    }
  } else if (!beside && p.x === m.x && m.y === n.y && n.x === q.x) {
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
  /** How many other lines run along the segment to the right of each point, and below it. */
  private usedRight: Uint16Array | undefined;
  private usedDown: Uint16Array | undefined;
  /** How many other lines' runs the segment to the right of each point, and below it, crosses. */
  private crossRight: Uint16Array | undefined;
  private crossDown: Uint16Array | undefined;

  constructor(
    private readonly xs: number[],
    private readonly ys: number[],
  ) {
    const count = xs.length * ys.length;
    this.nodes = new Uint8Array(count);
    this.right = new Uint8Array(count);
    this.down = new Uint8Array(count);
  }

  /**
   * Marks the segments of the grid that run along other lines' runs, within `NEAR_RUN` of them:
   * `runs` holds four numbers a run, its two points.
   */
  markUsed(runs: readonly number[]): void {
    const { xs, ys } = this;
    const nx = xs.length;
    const usedRight = (this.usedRight ??= new Uint16Array(nx * ys.length));
    const usedDown = (this.usedDown ??= new Uint16Array(nx * ys.length));
    const crossRight = (this.crossRight ??= new Uint16Array(nx * ys.length));
    const crossDown = (this.crossDown ??= new Uint16Array(nx * ys.length));
    for (let at = 0; at + 3 < runs.length; at += 4) {
      const x0 = runs[at] as number;
      const y0 = runs[at + 1] as number;
      const x1 = runs[at + 2] as number;
      const y1 = runs[at + 3] as number;
      const horizontal = y0 === y1;
      if (!horizontal && x0 !== x1) continue;
      const [lines, steps] = horizontal ? [ys, xs] : [xs, ys];
      const place = horizontal ? y0 : x0;
      const low = Math.min(horizontal ? x0 : y0, horizontal ? x1 : y1);
      const high = Math.max(horizontal ? x0 : y0, horizontal ? x1 : y1);
      const [first, last] = span(lines, place - NEAR_RUN, place + NEAR_RUN);
      const [from, to] = span(steps, low, high);
      // The grid's segments across the run, between the lines either side of it.
      const [below] = span(lines, place, place);
      if ((lines[below] as number) < place && below + 1 < lines.length) {
        for (let step = from; step <= to; step++) {
          const value = steps[step] as number;
          if (value <= low || value >= high) continue;
          if (horizontal)
            crossDown[below * nx + step] = (crossDown[below * nx + step] as number) + 1;
          else crossRight[step * nx + below] = (crossRight[step * nx + below] as number) + 1;
        }
      }
      for (let line = first; line <= last; line++) {
        const value = lines[line] as number;
        if (Math.abs(value - place) >= NEAR_RUN) continue;
        for (let step = from; step < to; step++) {
          if (
            (steps[step] as number) < low - EPSILON ||
            (steps[step + 1] as number) > high + EPSILON
          ) {
            continue;
          }
          if (horizontal) usedRight[line * nx + step] = (usedRight[line * nx + step] as number) + 1;
          else usedDown[step * nx + line] = (usedDown[step * nx + line] as number) + 1;
        }
      }
    }
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

  /**
   * The shortest route from one point of the grid to another, with the fewest turns; or none. With
   * `leaving`, an index of `STEPS`, it leaves `from` that way; each turn costs `turn`.
   */
  shortest(from: Point, to: Point, leaving?: number, turn = TURN): Point[] | undefined {
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
    for (let each = 0; each < 4; each++) {
      if (leaving !== undefined && each !== leaving) continue;
      reach(start * 4 + each, 0, -1);
      heap.push(start * 4 + each, guess(fi, fj));
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
        const turned = next === way || node === start ? 0 : turn;
        const used = (di !== 0 ? this.usedRight : this.usedDown)?.[crossing] ?? 0;
        const crossed = (di !== 0 ? this.crossRight : this.crossDown)?.[crossing] ?? 0;
        const reached = here + length * (1 + used * SHARE) + crossed * CROSS + turned;
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

/** The route cut where it leaves `a`, as a line is drawn from border to border. */
function clipStart(found: Point[], a: Rect): Point[] {
  let first = 0;
  while (first + 1 < found.length && strictlyInside(found[first + 1] as Point, a)) first++;
  if (first + 1 >= found.length) return found;
  const leaving = exitPoint(found[first] as Point, found[first + 1] as Point, a);
  return [leaving, ...found.slice(first + 1)];
}

/** The route cut where it enters `b`. */
function clipEnd(found: Point[], b: Rect): Point[] {
  return clipStart([...found].reverse(), b).reverse();
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

/** Whether two rectangles cover each other by more than a unit each way. */
function covers(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1
  );
}

function meets(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
