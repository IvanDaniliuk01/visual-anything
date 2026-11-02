/**
 * libavoid as a router (ADR 0080, section 2): Adaptagrams' libavoid, through `libavoid-js`
 * (LGPL-2.1-or-later, a development dependency). Only the quality tests use it, to measure it against
 * the program's own router on the fixture; no module that ships imports this file, and the app routes
 * with the program's router alone (ADR 0080's clarification of 2026-10-30, "libavoid leaves the
 * shipped app"). When a container is over its budget, or its time runs out, the program's router
 * (`avoid.ts`) routes those lines instead.
 *
 * It routes container by container, incrementally: each container that holds both ends of some
 * lines keeps a libavoid router of its own, whose obstacles are the shapes drawn as one block inside
 * it and the name plates of the containers drawn open there, and whose connectors are the lines it
 * holds. A later request moves the obstacles that moved (`moveShape`), adds and drops connectors, and
 * lets `processTransaction` route again what that changed. A container whose obstacles change in
 * number or size is built again.
 *
 * Each related row gets a pin on each side of its table, and libavoid takes the cheaper one. An end
 * at a connection point gets one pin there, facing out of its side; an end on a plain shape gets a pin
 * at the middle of each side, moved by its offset among the lines between the same two shapes.
 * Nudging spreads parallel runs apart, but leaves the runs that touch a shape at their pins, so that
 * an end stays at its row's middle, and leaves lines with a common end together, as one trunk
 * (ADR 0080's clarification of 2026-10-30, Stage 1b).
 *
 * It works on numbers alone, as `avoid.ts` does, so that it runs in a worker or in Node.
 */
import type { Rect } from '../geometry';
import {
  Avoider,
  PLATE_HEIGHT,
  SIDE_CLEARANCE,
  type Avoided,
  type AvoidLine,
  type AvoidShapes,
} from './avoid';

/** A C++ object of libavoid's that JavaScript made and must delete. */
interface Owned {
  delete(): void;
}

interface LibPoint extends Owned {
  x: number;
  y: number;
}

interface LibRoute extends Owned {
  size(): number;
  at(index: number): LibPoint;
}

interface LibShape {
  readonly __shape?: never;
}

interface LibConnector {
  displayRoute(): LibRoute;
  setRoutingType(type: unknown): void;
  setHateCrossings(value: boolean): void;
}

interface LibRouter extends Owned {
  processTransaction(): void;
  moveShape_delta(shape: LibShape, dx: number, dy: number): void;
  deleteConnector(connector: LibConnector): void;
  setRoutingParameter(parameter: unknown, value: number): void;
  setRoutingOption(option: unknown, value: boolean): void;
}

/** What this file uses of the module `libavoid-js` loads. */
export interface Libavoid {
  Router: new (flags: number) => LibRouter;
  Point: new (x: number, y: number) => LibPoint;
  Rectangle: new (topLeft: LibPoint, bottomRight: LibPoint) => Owned;
  ShapeRef: new (router: LibRouter, polygon: Owned) => LibShape;
  ShapeConnectionPin: new (
    shape: LibShape,
    classId: number,
    xOffset: number,
    yOffset: number,
    proportional: boolean,
    insideOffset: number,
    directions: number,
  ) => { setExclusive(exclusive: boolean): void };
  ConnEnd: new (shape: LibShape, classId: number) => Owned;
  ConnRef: new (router: LibRouter, from: Owned, to: Owned) => LibConnector;
  RouterFlag: { OrthogonalRouting: { value: number } };
  ConnType: { ConnType_Orthogonal: unknown };
  RoutingParameter: Record<
    | 'segmentPenalty'
    | 'crossingPenalty'
    | 'shapeBufferDistance'
    | 'idealNudgingDistance'
    | 'fixedSharedPathPenalty',
    unknown
  >;
  RoutingOption: Record<
    | 'nudgeOrthogonalSegmentsConnectedToShapes'
    | 'nudgeSharedPathsWithCommonEndPoint'
    | 'nudgeOrthogonalTouchingColinearSegments'
    | 'penaliseOrthogonalSharedPathsAtConnEnds',
    unknown
  >;
}

/** libavoid's directions a pin may be left by. */
const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

let loading: Promise<Libavoid | undefined> | undefined;

/**
 * Loads libavoid once, from `wasm` when given, from beside the module otherwise, as in Node;
 * undefined when it fails to load, as it does under a policy that refuses to compile WebAssembly or to
 * make functions from text.
 */
export function loadLibavoid(wasm?: string): Promise<Libavoid | undefined> {
  loading ??= (async () => {
    try {
      const { AvoidLib } = (await import('libavoid-js')) as {
        AvoidLib: { load(path?: string): Promise<void>; getInstance(): unknown };
      };
      await AvoidLib.load(wasm);
      const lib = AvoidLib.getInstance() as Libavoid;
      // A router made and dropped, so that a module that loads but cannot route counts as failed.
      new lib.Router(lib.RouterFlag.OrthogonalRouting.value).delete();
      return lib;
    } catch {
      return undefined;
    }
  })();
  return loading;
}

/** What limits libavoid's work; past them, the program's own router routes. */
export interface LibavoidBudget {
  /** The most lines one container routes with libavoid. */
  lines: number;
  /** The most obstacles one container's router holds. */
  shapes: number;
  /** How long one request may spend in libavoid, in milliseconds, before the rest falls back. */
  time: number;
  /** How long one container may take before it falls back from then on, at that many lines. */
  slow: number;
  /** Up to how many lines in a container libavoid weighs crossings, which makes it far slower. */
  crossingLines: number;
}

/** The budget libavoid was given when it was tried in the routing worker (Stage 1b of ADR 0080). */
export const LIBAVOID_BUDGET: LibavoidBudget = {
  lines: 40,
  shapes: 400,
  time: 2_000,
  slow: 1_000,
  // Weighing crossings made libavoid run lines together on the fixture (7 shared segments to 105 on
  // `overview`): it is off, though the router keeps it for a budget that wants it.
  crossingLines: 0,
};

/** How one container was routed, for the measures. */
export interface ContainerRun {
  /** The container's index among the shapes, or -1 for World. */
  holder: number;
  lines: number;
  shapes: number;
  /** How long libavoid took, in milliseconds; 0 for one that fell back. */
  took: number;
  by: 'libavoid' | 'fallback';
  /** Why it fell back: over the budget, out of time, or slow before. */
  why?: 'budget' | 'time' | 'slow';
  /** How many of its lines libavoid found no route for, which the program's router routes. */
  unrouted?: number;
}

/** What libavoid gave a request: a route for each line it routed, undefined for the rest. */
export interface LibavoidRouted {
  /** For each line asked for. */
  results: (Avoided | undefined)[];
  /** For each line drawn already, in a container libavoid routed again: its route now. */
  others: (Avoided | undefined)[];
  containers: ContainerRun[];
}

/** What a container's router is made of. */
interface Obstacle {
  /** The shape's index, or a negative number for a name plate (-2 - index) or a wall (-1 - side). */
  key: number;
  rect: Rect;
}

/** One end of a connector: its shape's index among the obstacles, and its pins. */
interface End {
  shape: number;
  /** What tells this end's pins from another's on the same shape. */
  key: string;
  pins: { x: number; y: number; directions: number }[];
}

interface ContainerState {
  router: LibRouter;
  /** The obstacles' keys and sizes, and whether crossings are weighed: a change builds it again. */
  signature: string;
  shapes: Map<number, { ref: LibShape; x: number; y: number }>;
  classes: Map<string, number>;
  connectors: Map<string, LibConnector>;
  /** How long it last took, and at how many lines. */
  took: number;
  lines: number;
}

/** A line of a request, asked for or drawn already, with where it goes. */
interface Entry {
  line: AvoidLine;
  /** Its index among the lines asked for, or -1 - its index among those drawn already. */
  at: number;
}

/**
 * Routes lines with libavoid, container by container, keeping each container's router for the next
 * request while the scene keeps its shapes.
 */
export class LibavoidRouter {
  private readonly containers = new Map<number, ContainerState>();
  /** The scene's nesting the routers were made for: another one makes them again. */
  private parents: Int32Array | undefined;

  constructor(
    private readonly lib: Libavoid,
    private readonly budget: LibavoidBudget = LIBAVOID_BUDGET,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Routes `lines`, in the containers that hold both their ends, with `existing` in the same
   * containers as connectors too, so that they keep apart; a line libavoid does not route is left
   * undefined, for the program's router. `order` gives the containers' order by a line in each, the
   * first ones first.
   */
  route(
    shapes: AvoidShapes,
    lines: readonly AvoidLine[],
    existing: readonly AvoidLine[] = [],
    onContainer?: (routed: LibavoidRouted) => void,
  ): LibavoidRouted {
    if (!sameArray(this.parents, shapes.parents)) {
      this.dispose();
      this.parents = shapes.parents.slice();
    }
    const tree = new Tree(shapes);
    const routed: LibavoidRouted = {
      results: new Array<Avoided | undefined>(lines.length).fill(undefined),
      others: new Array<Avoided | undefined>(existing.length).fill(undefined),
      containers: [],
    };
    // The lines by the container that holds both their ends, in the order asked.
    const groups = new Map<number, Entry[]>();
    const asked = new Set<number>();
    const add = (line: AvoidLine, at: number) => {
      const holder = tree.holderOf(line);
      if (holder === undefined) return;
      if (at >= 0) asked.add(holder);
      const group = groups.get(holder);
      if (group) group.push({ line, at });
      else groups.set(holder, [{ line, at }]);
    };
    lines.forEach((line, at) => add(line, at));
    existing.forEach((line, at) => add(line, -1 - at));
    const began = this.now();
    for (const [holder, entries] of groups) {
      if (!asked.has(holder)) continue;
      const run = this.routeContainer(tree, holder, entries, routed, began);
      routed.containers.push(run);
      onContainer?.(routed);
    }
    return routed;
  }

  /** Drops every container's router. */
  dispose(): void {
    for (const state of this.containers.values()) state.router.delete();
    this.containers.clear();
    this.parents = undefined;
  }

  private routeContainer(
    tree: Tree,
    holder: number,
    entries: readonly Entry[],
    routed: LibavoidRouted,
    began: number,
  ): ContainerRun {
    const { budget } = this;
    const obstacles = tree.obstaclesOf(holder);
    const blocks = new Set<number>();
    for (const each of obstacles) if (each.key >= 0) blocks.add(each.key);
    // Lines whose ends libavoid can pin: on blocks of this container that no other block covers.
    const covered = tree.coveredIn(obstacles);
    const usable = entries.filter((entry) => {
      const [a, b] = endShapes(entry.line);
      return blocks.has(a) && blocks.has(b) && !covered.has(a) && !covered.has(b);
    });
    const run: ContainerRun = {
      holder,
      lines: usable.length,
      shapes: obstacles.length,
      took: 0,
      by: 'fallback',
    };
    if (usable.length === 0) return run;
    if (usable.length > budget.lines || obstacles.length > budget.shapes) {
      run.why = 'budget';
      this.drop(holder);
      return run;
    }
    if (this.now() - began > budget.time) {
      run.why = 'time';
      return run;
    }
    const known = this.containers.get(holder);
    if (known && known.took > budget.slow && usable.length >= known.lines) {
      run.why = 'slow';
      return run;
    }
    const hates = usable.length <= budget.crossingLines;
    const state = this.stateFor(holder, obstacles, hates);
    const ends = usable.map((entry) => endsOf(tree.shapes, entry.line));
    // Connectors by what they join; two lines between the same pins are told apart by their count.
    const wanted = new Map<string, number>();
    const seen = new Map<string, number>();
    usable.forEach((entry, at) => {
      const [from, to] = ends[at] as [End, End];
      const base = `${from.shape}:${from.key}>${to.shape}:${to.key}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      wanted.set(`${base}#${count}`, at);
    });
    for (const [key, connector] of state.connectors) {
      if (wanted.has(key)) continue;
      state.router.deleteConnector(connector);
      state.connectors.delete(key);
    }
    for (const [key, at] of wanted) {
      if (state.connectors.has(key)) continue;
      const [from, to] = ends[at] as [End, End];
      state.connectors.set(key, this.connect(state, from, to, hates));
    }
    const start = this.now();
    state.router.processTransaction();
    const took = this.now() - start;
    state.took = took;
    state.lines = usable.length;
    run.took = took;
    run.by = 'libavoid';
    for (const [key, at] of wanted) {
      const connector = state.connectors.get(key) as LibConnector;
      const entry = usable[at] as Entry;
      const route = routeOf(connector);
      // A connector libavoid found no route for is left to the program's router.
      if (route.length < 4 || !orthogonal(route)) {
        run.unrouted = (run.unrouted ?? 0) + 1;
        continue;
      }
      const avoided: Avoided = { route, region: boundsOf(route) };
      if (entry.at >= 0) routed.results[entry.at] = avoided;
      else routed.others[-1 - entry.at] = avoided;
    }
    return run;
  }

  /** The container's router, made again when its obstacles changed in number or size. */
  private stateFor(holder: number, obstacles: readonly Obstacle[], hates: boolean): ContainerState {
    const signature = `${hates ? 'x' : '-'}|${obstacles
      .map(({ key, rect }) => `${key}:${rect.width}:${rect.height}`)
      .join(',')}`;
    const known = this.containers.get(holder);
    if (known?.signature === signature) {
      for (const { key, rect } of obstacles) {
        const shape = known.shapes.get(key);
        if (!shape || (shape.x === rect.x && shape.y === rect.y)) continue;
        known.router.moveShape_delta(shape.ref, rect.x - shape.x, rect.y - shape.y);
        shape.x = rect.x;
        shape.y = rect.y;
      }
      return known;
    }
    this.drop(holder);
    const { lib } = this;
    const router = new lib.Router(lib.RouterFlag.OrthogonalRouting.value);
    const parameter = lib.RoutingParameter;
    const option = lib.RoutingOption;
    router.setRoutingParameter(parameter.shapeBufferDistance, SIDE_CLEARANCE);
    router.setRoutingParameter(parameter.idealNudgingDistance, 10);
    router.setRoutingParameter(parameter.segmentPenalty, SEGMENT_PENALTY);
    router.setRoutingParameter(parameter.crossingPenalty, hates ? CROSSING_PENALTY : 0);
    router.setRoutingParameter(parameter.fixedSharedPathPenalty, 0);
    // Runs that touch a shape stay at their pins, so that an end stays at its row's middle; lines
    // with a common end stay together, as a trunk.
    router.setRoutingOption(option.nudgeOrthogonalSegmentsConnectedToShapes, false);
    router.setRoutingOption(option.nudgeSharedPathsWithCommonEndPoint, false);
    router.setRoutingOption(option.nudgeOrthogonalTouchingColinearSegments, true);
    router.setRoutingOption(option.penaliseOrthogonalSharedPathsAtConnEnds, false);
    const shapes = new Map<number, { ref: LibShape; x: number; y: number }>();
    for (const { key, rect } of obstacles) {
      const topLeft = new lib.Point(rect.x, rect.y);
      const bottomRight = new lib.Point(rect.x + rect.width, rect.y + rect.height);
      const polygon = new lib.Rectangle(topLeft, bottomRight);
      topLeft.delete();
      bottomRight.delete();
      shapes.set(key, { ref: new lib.ShapeRef(router, polygon), x: rect.x, y: rect.y });
      polygon.delete();
    }
    const state: ContainerState = {
      router,
      signature,
      shapes,
      classes: new Map(),
      connectors: new Map(),
      took: 0,
      lines: 0,
    };
    this.containers.set(holder, state);
    return state;
  }

  private drop(holder: number): void {
    const known = this.containers.get(holder);
    if (!known) return;
    known.router.delete();
    this.containers.delete(holder);
  }

  /** A connector between two ends, their pins made the first time an end is met. */
  private connect(state: ContainerState, from: End, to: End, hates: boolean): LibConnector {
    const { lib } = this;
    const ends = [from, to].map((end) => {
      const shape = state.shapes.get(end.shape) as { ref: LibShape };
      const key = `${end.shape}:${end.key}`;
      let id = state.classes.get(key);
      if (id === undefined) {
        id = state.classes.size + 1;
        state.classes.set(key, id);
        for (const pin of end.pins) {
          // A pin may be shared: the lines from one row leave it together.
          new lib.ShapeConnectionPin(
            shape.ref,
            id,
            pin.x,
            pin.y,
            false,
            0,
            pin.directions,
          ).setExclusive(false);
        }
      }
      return new lib.ConnEnd(shape.ref, id);
    });
    const connector = new lib.ConnRef(state.router, ends[0] as Owned, ends[1] as Owned);
    for (const end of ends) end.delete();
    connector.setRoutingType(lib.ConnType.ConnType_Orthogonal);
    if (hates) connector.setHateCrossings(true);
    return connector;
  }
}

/** What `routeLines` gave: a route for every line asked for, and new routes for some drawn already. */
export interface RoutedLines {
  results: Avoided[];
  others: (Avoided | undefined)[];
  containers: ContainerRun[];
}

/**
 * Routes `lines` all at once: with libavoid, where it is given and within
 * its budget, and with the program's router (`Avoider`) the rest, which keep apart from what libavoid
 * routed and from `existing`.
 */
export function routeLines(
  shapes: AvoidShapes,
  lines: readonly AvoidLine[],
  existing: readonly AvoidLine[] = [],
  libavoid?: LibavoidRouter,
): RoutedLines {
  const routed = libavoid?.route(shapes, lines, existing);
  const drawn = existing.map((line, at) => {
    const route = routed?.others[at]?.route;
    return route ? { ...line, route } : line;
  });
  const done: AvoidLine[] = [];
  lines.forEach((line, at) => {
    const route = routed?.results[at]?.route;
    if (route) done.push({ ...line, route });
  });
  const avoider = new Avoider(shapes, [...drawn, ...done]);
  return {
    results: lines.map((line, at) => routed?.results[at] ?? avoider.avoid(line)),
    others: routed?.others ?? [],
    containers: routed?.containers ?? [],
  };
}

/** What a turn costs libavoid, so that a route bends at most twice on average. */
const SEGMENT_PENALTY = 200;
/** What crossing another line costs, where crossings are weighed. */
const CROSSING_PENALTY = 200;
/** How thick the walls are that keep a container's lines inside it. */
const WALL = 8;

/** The shapes a line's ends leave: a row's table, or the shape itself. */
function endShapes(line: AvoidLine): [number, number] {
  return [line.fromSide?.shape ?? line.from, line.toSide?.shape ?? line.to];
}

/** A line's two ends, with their pins, relative to the shapes they leave. */
function endsOf(shapes: AvoidShapes, line: AvoidLine): [End, End] {
  const [a, b] = endShapes(line);
  return [endOf(shapes, a, line.fromSide, line.offset), endOf(shapes, b, line.toSide, line.offset)];
}

function endOf(shapes: AvoidShapes, at: number, side: AvoidLine['fromSide'], offset: number): End {
  const rect = rectAt(shapes, at);
  if (side?.vertical) {
    const x = (side.x ?? rect.x + rect.width / 2) - rect.x;
    const y = side.way > 0 ? rect.height : 0;
    return {
      shape: at,
      key: `v${x}:${side.way}`,
      pins: [{ x, y, directions: side.way > 0 ? DOWN : UP }],
    };
  }
  if (side) {
    const y = side.y - rect.y;
    // A connection point is left by its own side alone; a row by either side of its table.
    if (side.point) {
      const x = side.way > 0 ? rect.width : 0;
      return {
        shape: at,
        key: `p${y}:${side.way}`,
        pins: [{ x, y, directions: side.way > 0 ? RIGHT : LEFT }],
      };
    }
    return {
      shape: at,
      key: `r${y}`,
      pins: [
        { x: 0, y, directions: LEFT },
        { x: rect.width, y, directions: RIGHT },
      ],
    };
  }
  // A plain shape is left at the middle of a side, moved by the line's offset, as the router does.
  const inset = (size: number, value: number) => Math.min(size - 6, Math.max(6, value));
  const x = inset(rect.width, rect.width / 2 + offset);
  const y = inset(rect.height, rect.height / 2 + offset);
  return {
    shape: at,
    key: `m${offset}`,
    pins: [
      { x: 0, y, directions: LEFT },
      { x: rect.width, y, directions: RIGHT },
      { x, y: 0, directions: UP },
      { x, y: rect.height, directions: DOWN },
    ],
  };
}

/** A connector's route, its points rounded to a quarter and its runs kept straight. */
function routeOf(connector: LibConnector): Float64Array {
  const polyline = connector.displayRoute();
  const points: number[] = [];
  const count = polyline.size();
  for (let at = 0; at < count; at++) {
    const point = polyline.at(at);
    const x = Math.round(point.x * 4) / 4;
    const y = Math.round(point.y * 4) / 4;
    point.delete();
    const n = points.length;
    if (n >= 2) {
      // A run nudged by a hair off straight is made straight.
      if (Math.abs((points[n - 2] as number) - x) < 0.5) points[n - 2] = x;
      if (Math.abs((points[n - 1] as number) - y) < 0.5) points[n - 1] = y;
    }
    points.push(x, y);
  }
  polyline.delete();
  return Float64Array.from(simplified(points));
}

/** A route as x and y pairs without repeated points and the points that do not turn it. */
function simplified(points: readonly number[]): number[] {
  const kept: number[] = [];
  for (let at = 0; at + 1 < points.length; at += 2) {
    const x = points[at] as number;
    const y = points[at + 1] as number;
    const n = kept.length;
    if (n >= 2 && kept[n - 2] === x && kept[n - 1] === y) continue;
    if (n >= 4) {
      const px = kept[n - 4] as number;
      const py = kept[n - 3] as number;
      const mx = kept[n - 2] as number;
      const my = kept[n - 1] as number;
      if ((px === mx && mx === x) || (py === my && my === y)) {
        kept[n - 2] = x;
        kept[n - 1] = y;
        continue;
      }
    }
    kept.push(x, y);
  }
  return kept;
}

/** The shapes of a scene as containers and what they hold, read once for a request. */
class Tree {
  private readonly children = new Map<number, number[]>();

  constructor(readonly shapes: AvoidShapes) {
    const { parents } = shapes;
    for (let at = 0; at < parents.length; at++) {
      const parent = parents[at] as number;
      const key = parent >= 0 && parent < parents.length && parent !== at ? parent : -1;
      const list = this.children.get(key);
      if (list) list.push(at);
      else this.children.set(key, [at]);
    }
  }

  /** The containers of a shape, innermost first, without loops. */
  private ancestors(at: number): number[] {
    const { parents } = this.shapes;
    const found: number[] = [];
    const seen = new Set<number>([at]);
    let parent = parents[at] as number;
    while (parent >= 0 && parent < parents.length && !seen.has(parent) && found.length < 64) {
      found.push(parent);
      seen.add(parent);
      parent = parents[parent] as number;
    }
    return found;
  }

  /**
   * The innermost container that holds both ends of a line, -1 for World; undefined for a line
   * libavoid does not route: one between a container and what it holds, or with an end unknown.
   */
  holderOf(line: AvoidLine): number | undefined {
    const [a, b] = endShapes(line);
    const count = this.shapes.parents.length;
    const known = (at: number) => Number.isInteger(at) && at >= 0 && at < count;
    if (!known(a) || !known(b) || a === b) return undefined;
    const aboveA = this.ancestors(a);
    const aboveB = this.ancestors(b);
    if (aboveA.includes(b) || aboveB.includes(a)) return undefined;
    const set = new Set(aboveA);
    return aboveB.find((at) => set.has(at)) ?? -1;
  }

  /**
   * What a container's lines go around: the shapes drawn as one block inside it, through the
   * containers drawn open, the name plates of those and of the container itself, and walls just
   * outside it, so that its lines stay inside.
   */
  obstaclesOf(holder: number): Obstacle[] {
    const { shapes } = this;
    const found: Obstacle[] = [];
    const plate = (at: number) => {
      const rect = plateAt(shapes, at);
      if (rect) found.push({ key: -2 - at, rect });
    };
    const visit = (at: number) => {
      if (shapes.inside?.[at] === 1 || !finiteAt(shapes, at)) return;
      if (shapes.open?.[at] === 1) {
        plate(at);
        for (const child of this.children.get(at) ?? []) visit(child);
        return;
      }
      found.push({ key: at, rect: rectAt(shapes, at) });
    };
    for (const child of this.children.get(holder) ?? []) visit(child);
    if (holder >= 0 && finiteAt(shapes, holder)) {
      plate(holder);
      const { x, y, width, height } = rectAt(shapes, holder);
      // Each wall's inner side lies a buffer out, less 4: the lines keep 4 inside the border.
      const out = SIDE_CLEARANCE - 4;
      const left = x - out - WALL;
      const top = y - out - WALL;
      const right = x + width + out;
      const bottom = y + height + out;
      const across = width + 2 * (out + WALL);
      const down = height + 2 * (out + WALL);
      found.push(
        { key: -1 - 0x10000000, rect: { x: left, y: top, width: across, height: WALL } },
        { key: -2 - 0x10000000, rect: { x: left, y: bottom, width: across, height: WALL } },
        { key: -3 - 0x10000000, rect: { x: left, y: top, width: WALL, height: down } },
        { key: -4 - 0x10000000, rect: { x: right, y: top, width: WALL, height: down } },
      );
    }
    return found;
  }

  /** The blocks among `obstacles` that another obstacle covers whole, as a pinned shape may. */
  coveredIn(obstacles: readonly Obstacle[]): Set<number> {
    const covered = new Set<number>();
    for (const inner of obstacles) {
      if (inner.key < 0) continue;
      for (const outer of obstacles) {
        if (outer === inner || outer.key < -0x10000000) continue;
        if (covers(outer.rect, inner.rect)) {
          covered.add(inner.key);
          break;
        }
      }
    }
    return covered;
  }
}

function covers(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height
  );
}

function finiteAt(shapes: AvoidShapes, at: number): boolean {
  for (let each = 0; each < 4; each++) {
    if (!Number.isFinite(shapes.rects[at * 4 + each])) return false;
  }
  return true;
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

function plateAt(shapes: AvoidShapes, at: number): Rect | undefined {
  const width = shapes.plates[at] as number;
  if (!(width > 0)) return undefined;
  const rect = rectAt(shapes, at);
  return {
    x: rect.x,
    y: rect.y,
    width: Math.min(width, rect.width),
    height: Math.min(shapes.plateHeight ?? PLATE_HEIGHT, rect.height),
  };
}

function boundsOf(route: Float64Array): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let at = 0; at + 1 < route.length; at += 2) {
    const x = route[at] as number;
    const y = route[at + 1] as number;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Whether every run of a route is horizontal or vertical. */
function orthogonal(route: Float64Array): boolean {
  for (let at = 2; at + 1 < route.length; at += 2) {
    if (route[at] !== route[at - 2] && route[at + 1] !== route[at - 1]) return false;
  }
  return true;
}

function sameArray(a: Int32Array | undefined, b: Int32Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
  return true;
}
