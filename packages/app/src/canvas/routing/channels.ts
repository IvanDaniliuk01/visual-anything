/**
 * The channel pass after routing (ADR 0080, section 2), as libavoid's nudging does: the runs of
 * different lines that lie on one line in one corridor, or nearer than `IDEAL`, are ordered so that
 * they do not cross where the lines turn away, then spread across the corridor `IDEAL` apart, or
 * `LEAST` where there is less room, staying `CLEAR` away from the shapes beside them. The runs of
 * lines with a common end that lie on one line stay together, as one trunk, until they part.
 *
 * Only the inner runs of a line move: its first and last runs, which leave and enter its ends, stay
 * where they are, and are shortened or lengthened along themselves, never below a line's stub. A run
 * never moves past the runs it joins, so a route keeps its shape. Lines that may not move, as routes
 * by hand or ELK's kept routes, keep their places, and the runs that move keep clear of theirs.
 *
 * Before spreading, lines that leave one place of one end the same way and turn the same way are
 * gathered into a trunk (`gatherTrunks`, ADR 0080's clarification of Stage 1b): their first turns
 * move onto one place, so that they share their first run until they part, whatever router routed them
 * (the program's, or libavoid in the quality tests that compare the two).
 *
 * It works on numbers alone, so that it runs in the routing worker as it runs in the page or in Node.
 */

/** What the pass is given: the lines' routes, their ends, which of them move, and the shapes. */
export interface ChannelInput {
  /** The rectangles lines keep clear of, four numbers each: x, y, width, height. */
  obstacles: Float64Array;
  /** Every line's route, one after another, as x and y pairs. */
  points: Float64Array;
  /** Where each line's route starts in `points`, counted in points; the last entry is where they end. */
  starts: Int32Array;
  /** Each line's two ends, as numbers: lines with an end in common may share a run. */
  ends: Int32Array;
  /** 1 for each line whose inner runs may move. */
  movable: Uint8Array;
  /** How long each line's first and last runs must stay at least, two numbers a line. */
  stubs: Float64Array;
}

/** How far apart the pass spreads runs, where there is room. */
export const IDEAL = 12;
/** The least it spreads them apart. */
export const LEAST = 8;
/** How far runs that move keep clear of the shapes beside them. */
export const CLEAR = 12;
/** The clearances tried in turn when runs already lie nearer a shape than `CLEAR`. */
const CLEARANCES = [CLEAR, 4, 1] as const;
/** How much two runs must overlap along their line to be in one corridor. */
const OVERLAP = 4;
/** How near two coordinates count as the same. */
const SAME = 0.5;
/** How many times the pass goes over both directions. */
const ROUNDS = 3;
/** The side of a cell of the shapes' index. */
const CELL = 256;
/** The most units one corridor orders; a larger one is left as it is. */
const MOST_UNITS = 256;

/** One run of a line: horizontal or vertical, between two of its points. */
interface Run {
  line: number;
  /** The index of its first point in `points`, counted in points. */
  at: number;
  /** Its place across: x for a vertical run, y for a horizontal one. */
  c: number;
  /** Where it spans along. */
  lo: number;
  hi: number;
  /** Where it may move across, from the runs it joins and the stubs. */
  min: number;
  max: number;
  /** Which way the line turns at its `lo` and `hi` ends: -1 toward lower places across, +1 higher. */
  turnLo: number;
  turnHi: number;
}

/** Runs moved as one: those of lines with a common end on the same place, or one alone. */
interface Unit {
  runs: Run[];
  c: number;
  lo: number;
  hi: number;
  min: number;
  max: number;
  turnLo: number;
  turnHi: number;
  /** The ends every run of it shares, which a fixed run of a line with one of them may lie on. */
  ends: number[];
}

/** The routes after the pass, in the layout of `points`. */
export function spreadChannels(input: ChannelInput): ChannelOutput {
  const index = new ObstacleIndex(input.obstacles);
  const routes = straightened(input, index);
  const working: ChannelInput = { ...input, points: routes.points, starts: routes.starts };
  const { points } = working;
  for (let round = 0; round < ROUNDS; round++) {
    let moved = spreadAxis(working, points, index, 'x');
    moved = spreadAxis(working, points, index, 'y') || moved;
    if (!moved) break;
  }
  return routes;
}

/** The routes after the pass: each line's, one after another, which may hold fewer points than before. */
export interface ChannelOutput {
  points: Float64Array;
  /** Where each line's route starts in `points`, counted in points; the last entry is where they end. */
  starts: Int32Array;
}

/** How short a jog between two runs of a line that go on the same way is, to be straightened. */
const JOG = 16;

/**
 * The routes with their jogs straightened: where a line steps aside by less than `JOG` between two
 * runs that go on the same way, as a search on a grid of nearby sides leaves it, the run after the
 * step moves onto the run before it, or that one onto it, when the straight run keeps clear of the
 * shapes it did not cross and the first and last runs stay where they are. A line whose runs cannot
 * move keeps its route.
 */
function straightened(input: ChannelInput, index: ObstacleIndex): ChannelOutput {
  const { starts, movable } = input;
  const lines = starts.length - 1;
  const routes: number[][] = [];
  for (let line = 0; line < lines; line++) {
    const from = starts[line] as number;
    const to = starts[line + 1] as number;
    const route = Array.from(input.points.subarray(2 * from, 2 * to));
    if (movable[line] === 1) straighten(route, index);
    routes.push(route);
  }
  gatherTrunks(routes, input, index);
  let total = 0;
  for (const route of routes) total += route.length;
  const points = new Float64Array(total);
  const out = new Int32Array(lines + 1);
  let at = 0;
  routes.forEach((route, line) => {
    out[line] = at / 2;
    points.set(route, at);
    at += route.length;
  });
  out[lines] = at / 2;
  return { points, starts: out };
}

/**
 * Gathers trunks, in place (ADR 0080, section 2): the movable lines that leave one place of one end
 * the same way, and turn the same way at their first turn, move that turn onto one place, so that
 * they run together from their end until they part, as a trunk the spreading then keeps whole. The
 * place is the one most of them can take, nearest the end where as many can: a line takes it when
 * its first run keeps its stub, the run after its turn keeps its way, and nothing it would sweep over
 * stands in the way. It works at both ends of each line, its `from` end, then its `to` end.
 */
function gatherTrunks(routes: number[][], input: ChannelInput, index: ObstacleIndex): void {
  const { movable, ends, stubs } = input;
  const gathered = new Set<number>();
  for (const side of [0, 1] as const) {
    // The lines by their end, the point they leave and the way their first run goes.
    const groups = new Map<string, number[]>();
    routes.forEach((route, line) => {
      const count = route.length / 2;
      // A first turn onto an inner run: four points at least.
      if (movable[line] !== 1 || count < 4) return;
      // A line of four points has one inner run: gathered at its `from` end, it stays there.
      if (side === 1 && count === 4 && gathered.has(line)) return;
      const p0 = pointOf(route, side, 0);
      const p1 = pointOf(route, side, 1);
      const p2 = pointOf(route, side, 2);
      const horizontal = p0.y === p1.y && p0.x !== p1.x;
      const vertical = p0.x === p1.x && p0.y !== p1.y;
      if (horizontal === vertical) return;
      const along = horizontal ? Math.sign(p1.x - p0.x) : Math.sign(p1.y - p0.y);
      const turn = horizontal ? Math.sign(p2.y - p1.y) : Math.sign(p2.x - p1.x);
      if (turn === 0) return;
      const key = `${ends[2 * line + side] ?? -1}|${p0.x}|${p0.y}|${horizontal ? 'h' : 'v'}${along}|${turn}`;
      const group = groups.get(key);
      if (group) group.push(line);
      else groups.set(key, [line]);
    });
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const line of gatherOne(routes, group, side, stubs, index)) gathered.add(line);
    }
  }
}

/** Gathers one group of `gatherTrunks` onto the place most of it can take. */
function gatherOne(
  routes: number[][],
  group: readonly number[],
  side: 0 | 1,
  stubs: Float64Array,
  index: ObstacleIndex,
): number[] {
  const first = routes[group[0] as number] as number[];
  const p0 = pointOf(first, side, 0);
  const p1 = pointOf(first, side, 1);
  const horizontal = p0.y === p1.y;
  // Across is the coordinate the first turn's run lies at: x after a horizontal first run.
  const across = horizontal ? 'x' : 'y';
  const start = p0[across];
  const placeOf = (line: number) => pointOf(routes[line] as number[], side, 1)[across];
  const candidates = [...new Set(group.map(placeOf))].sort(
    (a, b) => Math.abs(a - start) - Math.abs(b - start),
  );
  /** Whether a line's first turn may move to `to`. */
  const takes = (line: number, to: number): boolean => {
    const route = routes[line] as number[];
    const count = route.length / 2;
    const was = placeOf(line);
    if (was === to) return true;
    // Its first run keeps its stub and its way.
    const stub = stubs[2 * line + side] as number;
    if (Math.sign(to - start) !== Math.sign(was - start) || Math.abs(to - start) < stub) {
      return false;
    }
    // The run after its turn keeps its way, and its stub when it is the last.
    const p3 = pointOf(route, side, 3)[across];
    const least = count === 4 ? (stubs[2 * line + 1 - side] as number) : 1;
    if (Math.sign(p3 - to) !== Math.sign(p3 - was) || Math.abs(p3 - to) < least) return false;
    // Nothing stands where it would sweep.
    const a = pointOf(route, side, 1)[across === 'x' ? 'y' : 'x'];
    const b = pointOf(route, side, 2)[across === 'x' ? 'y' : 'x'];
    return (
      index.clearAlong(across, was, to, Math.min(a, b), Math.max(a, b)) &&
      index.clearAcross(across, was, to, a) &&
      index.clearAcross(across, was, to, b)
    );
  };
  let best: { to: number; lines: number[] } | undefined;
  for (const to of candidates) {
    const lines = group.filter((line) => takes(line, to));
    if (!best || lines.length > best.lines.length) best = { to, lines };
  }
  if (!best || best.lines.length < 2) return [];
  const gathered: number[] = [];
  const originals = new Map<number, number[]>();
  for (const line of best.lines) {
    const route = routes[line] as number[];
    const was = route.slice();
    originals.set(line, was);
    const before = crossingsOf(was, routes, line);
    const offset = across === 'x' ? 0 : 1;
    for (const point of [1, 2]) {
      const at = side === 0 ? point : route.length / 2 - 1 - point;
      route[2 * at + offset] = best.to;
    }
    dropStraight(route);
    // A line joins the trunk only when it crosses no more lines for it.
    if (crossingsOf(route, routes, line) > before) {
      route.length = 0;
      route.push(...was);
    } else gathered.push(line);
  }
  if (gathered.length < 2) {
    // Alone at the place, a line is no trunk: it keeps its route.
    for (const line of gathered) {
      const route = routes[line] as number[];
      route.length = 0;
      route.push(...(originals.get(line) as number[]));
    }
    return [];
  }
  return gathered;
}

/** How many runs of the other routes a route crosses properly. */
function crossingsOf(route: readonly number[], routes: readonly number[][], own: number): number {
  let count = 0;
  for (let at = 2; at + 1 < route.length; at += 2) {
    const ax = route[at - 2] as number;
    const ay = route[at - 1] as number;
    const bx = route[at] as number;
    const by = route[at + 1] as number;
    const vertical = ax === bx;
    if (vertical === (ay === by)) continue;
    const lo = vertical ? Math.min(ay, by) : Math.min(ax, bx);
    const hi = vertical ? Math.max(ay, by) : Math.max(ax, bx);
    const c = vertical ? ax : ay;
    routes.forEach((other, line) => {
      if (line === own) return;
      for (let each = 2; each + 1 < other.length; each += 2) {
        const px = other[each - 2] as number;
        const py = other[each - 1] as number;
        const qx = other[each] as number;
        const qy = other[each + 1] as number;
        // A run across this one: horizontal against vertical, or vertical against horizontal.
        if (vertical ? py !== qy : px !== qx) continue;
        const d = vertical ? py : px;
        const from = vertical ? Math.min(px, qx) : Math.min(py, qy);
        const to = vertical ? Math.max(px, qx) : Math.max(py, qy);
        if (d > lo && d < hi && c > from && c < to) count += 1;
      }
    });
  }
  return count;
}

/** The point `at` of a route counted from its `from` end (side 0) or its `to` end (side 1). */
function pointOf(route: readonly number[], side: 0 | 1, at: number): { x: number; y: number } {
  const index = side === 0 ? at : route.length / 2 - 1 - at;
  return { x: route[2 * index] as number, y: route[2 * index + 1] as number };
}

/** Straightens the jogs of one route, as x and y pairs, in place: see `straightened`. */
function straighten(route: number[], index: ObstacleIndex): void {
  let changed = true;
  while (changed) {
    changed = false;
    const count = route.length / 2;
    // The jog is the run from point `at` to `at + 1`; the runs before and after it are inner or not.
    for (let at = 1; at + 2 < count; at++) {
      const x = (point: number) => route[2 * point] as number;
      const y = (point: number) => route[2 * point + 1] as number;
      const vertical = x(at) === x(at + 1);
      const horizontal = y(at) === y(at + 1);
      if (vertical === horizontal) continue;
      // Across is the jog's own direction; along is the runs' beside it.
      const across = vertical ? 1 : 0;
      const along = 1 - across;
      const step = Math.abs(
        (route[2 * (at + 1) + across] as number) - (route[2 * at + across] as number),
      );
      if (step === 0 || step >= JOG) continue;
      const before = (route[2 * at + along] as number) - (route[2 * (at - 1) + along] as number);
      const after =
        (route[2 * (at + 2) + along] as number) - (route[2 * (at + 1) + along] as number);
      if (Math.sign(before) !== Math.sign(after) || before === 0) continue;
      const axis = across === 0 ? 'x' : 'y';
      // Moving the run after the jog onto the one before it, when it is an inner run.
      if (
        at + 2 < count - 1 &&
        moveRun(route, at + 1, route[2 * at + across] as number, across, axis, index)
      ) {
        changed = true;
        break;
      }
      // Or the run before onto the one after.
      if (
        at - 1 > 0 &&
        moveRun(route, at - 1, route[2 * (at + 1) + across] as number, across, axis, index)
      ) {
        changed = true;
        break;
      }
    }
  }
}

/**
 * Moves the run from point `at` to `at + 1` of a route to `to` across, when it and the runs it joins
 * stay clear of the shapes they did not cross; then drops the points that no longer turn. Says
 * whether it moved.
 */
function moveRun(
  route: number[],
  at: number,
  to: number,
  across: number,
  axis: 'x' | 'y',
  index: ObstacleIndex,
): boolean {
  const along = 1 - across;
  const was = route[2 * at + across] as number;
  const a = route[2 * at + along] as number;
  const b = route[2 * (at + 1) + along] as number;
  // The run itself at its new place, and each run it joins over the length it gains.
  if (!index.clearAlong(axis, was, to, Math.min(a, b), Math.max(a, b))) return false;
  if (!index.clearAcross(axis, was, to, a) || !index.clearAcross(axis, was, to, b)) return false;
  route[2 * at + across] = to;
  route[2 * (at + 1) + across] = to;
  dropStraight(route);
  return true;
}

/** Drops a route's repeated points and the points in the middle of a straight run, in place. */
function dropStraight(route: number[]): void {
  const kept: number[] = [];
  for (let at = 0; at < route.length; at += 2) {
    const x = route[at] as number;
    const y = route[at + 1] as number;
    const count = kept.length / 2;
    if (count > 0 && kept[2 * count - 2] === x && kept[2 * count - 1] === y) continue;
    if (count >= 2) {
      const px = kept[2 * count - 4] as number;
      const py = kept[2 * count - 3] as number;
      const mx = kept[2 * count - 2] as number;
      const my = kept[2 * count - 1] as number;
      const through =
        (px === mx && mx === x && (my - py) * (y - my) > 0) ||
        (py === my && my === y && (mx - px) * (x - mx) > 0);
      if (through) {
        kept[2 * count - 2] = x;
        kept[2 * count - 1] = y;
        continue;
      }
    }
    kept.push(x, y);
  }
  route.length = 0;
  route.push(...kept);
}

/**
 * One direction of the pass: the vertical runs, moved across in x, or the horizontal ones, in y.
 * Says whether anything moved.
 */
function spreadAxis(
  input: ChannelInput,
  points: Float64Array,
  index: ObstacleIndex,
  axis: 'x' | 'y',
): boolean {
  const across = axis === 'x' ? 0 : 1;
  const along = 1 - across;
  const { starts, movable, stubs, ends } = input;
  const lines = starts.length - 1;
  const free: Run[] = [];
  const fixed: Run[] = [];
  for (let line = 0; line < lines; line++) {
    const first = starts[line] as number;
    const last = (starts[line + 1] as number) - 1;
    for (let at = first; at < last; at++) {
      const c = points[2 * at + across] as number;
      if (Math.abs((points[2 * (at + 1) + across] as number) - c) > 1e-6) continue;
      const a = points[2 * at + along] as number;
      const b = points[2 * (at + 1) + along] as number;
      if (Math.abs(a - b) < 1e-6) continue;
      const run: Run = {
        line,
        at,
        c,
        lo: Math.min(a, b),
        hi: Math.max(a, b),
        min: -Infinity,
        max: Infinity,
        turnLo: 0,
        turnHi: 0,
      };
      const inner = movable[line] === 1 && at > first && at + 1 < last;
      if (!inner) {
        fixed.push(run);
        continue;
      }
      // The runs it joins: never moved past their far ends, nor a stub below its least length.
      const before = points[2 * (at - 1) + across] as number;
      const after = points[2 * (at + 2) + across] as number;
      const stubBefore = at - 1 === first ? (stubs[2 * line] as number) : 1;
      const stubAfter = at + 2 === last ? (stubs[2 * line + 1] as number) : 1;
      bound(run, before, stubBefore);
      bound(run, after, stubAfter);
      // Which way it turns at each end along.
      const lowFirst = a <= b;
      run.turnLo = Math.sign((lowFirst ? before : after) - c);
      run.turnHi = Math.sign((lowFirst ? after : before) - c);
      if (run.min > run.max) fixed.push(run);
      else free.push(run);
    }
  }
  if (free.length === 0) return false;
  const fixedIndex = new RunIndex(fixed);
  const moving = new RunBuckets(free);
  const context: Corridors = { fixed: fixedIndex, moving, obstacles: index, ends, axis, points };
  let moved = false;
  for (const cluster of corridors(free)) {
    const units = unitsOf(cluster, ends);
    if (units.length > MOST_UNITS) continue;
    // A unit alone moves only off a fixed run it lies on or beside.
    if (units.length === 1 && !cluster.some((run) => fixedIndex.near(run, ends))) continue;
    if (place(units, context)) moved = true;
  }
  return moved;
}

/** Keeps a run on the side of `other`, the far end of a run it joins, `least` away at least. */
function bound(run: Run, other: number, least: number): void {
  if (other > run.c) run.max = Math.min(run.max, other - least);
  else if (other < run.c) run.min = Math.max(run.min, other + least);
  else {
    // A run that joins one of no length cannot move.
    run.min = Math.max(run.min, run.c);
    run.max = Math.min(run.max, run.c);
  }
}

/** The runs that share a corridor: nearer each other than `IDEAL` across, and overlapping along. */
function corridors(runs: Run[]): Run[][] {
  const sorted = [...runs].sort((p, q) => p.c - q.c || p.lo - q.lo);
  const parent = sorted.map((_, at) => at);
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
  let windowStart = 0;
  for (let at = 0; at < sorted.length; at++) {
    const run = sorted[at] as Run;
    while ((sorted[windowStart] as Run).c < run.c - IDEAL + SAME) windowStart++;
    for (let other = windowStart; other < at; other++) {
      const near = sorted[other] as Run;
      if (near.line === run.line) continue;
      if (overlap(near, run) > OVERLAP) parent[find(other)] = find(at);
    }
  }
  const groups = new Map<number, Run[]>();
  sorted.forEach((run, at) => {
    const root = find(at);
    const list = groups.get(root);
    if (list) list.push(run);
    else groups.set(root, [run]);
  });
  return [...groups.values()];
}

function overlap(a: { lo: number; hi: number }, b: { lo: number; hi: number }): number {
  return Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);
}

function endsOf(ends: Int32Array, line: number): [number, number] {
  return [ends[2 * line] as number, ends[2 * line + 1] as number];
}

/**
 * The units of a corridor: runs on the same place of lines with a common end go together, as one
 * trunk, each gathered under the end most of them share; every other run is a unit of its own.
 */
function unitsOf(runs: readonly Run[], ends: Int32Array): Unit[] {
  const units: Unit[] = [];
  const byPlace = new Map<number, Run[]>();
  for (const run of runs) {
    const key = Math.round(run.c / SAME);
    const list = byPlace.get(key);
    if (list) list.push(run);
    else byPlace.set(key, [run]);
  }
  for (const list of byPlace.values()) {
    if (list.length === 1) {
      units.push(unitOf(list, endsOf(ends, (list[0] as Run).line)));
      continue;
    }
    // Each run under the end of its line the most runs here share, when another shares it.
    const counts = new Map<number, number>();
    for (const run of list) {
      for (const end of new Set(endsOf(ends, run.line))) {
        counts.set(end, (counts.get(end) ?? 0) + 1);
      }
    }
    const byEnd = new Map<number, Run[]>();
    const alone: Run[] = [];
    for (const run of list) {
      const [from, to] = endsOf(ends, run.line);
      const best = (counts.get(from) ?? 0) >= (counts.get(to) ?? 0) ? from : to;
      if ((counts.get(best) ?? 0) < 2) {
        alone.push(run);
        continue;
      }
      const group = byEnd.get(best);
      if (group) group.push(run);
      else byEnd.set(best, [run]);
    }
    for (const [end, group] of byEnd) {
      // Runs of one line in a trunk move apart: a line never shares a run with itself.
      const lines = new Set(group.map((run) => run.line));
      if (lines.size === group.length) units.push(unitOf(group, [end]));
      else for (const run of group) units.push(unitOf([run], endsOf(ends, run.line)));
    }
    for (const run of alone) units.push(unitOf([run], endsOf(ends, run.line)));
  }
  return units;
}

function unitOf(runs: Run[], shared: readonly number[]): Unit {
  let lo = Infinity;
  let hi = -Infinity;
  let min = -Infinity;
  let max = Infinity;
  let turnLo = 0;
  let turnHi = 0;
  for (const run of runs) {
    if (run.lo < lo) {
      lo = run.lo;
      turnLo = run.turnLo;
    }
    if (run.hi > hi) {
      hi = run.hi;
      turnHi = run.turnHi;
    }
    min = Math.max(min, run.min);
    max = Math.min(max, run.max);
  }
  return { runs, c: (runs[0] as Run).c, lo, hi, min, max, turnLo, turnHi, ends: [...shared] };
}

/**
 * Whether unit `a` goes before `b`, at a lower place across, so that neither crosses the other
 * where it turns away: the one that starts later along turns toward its side, and so does the one
 * that ends sooner. Negative when `a` goes first.
 */
function order(a: Unit, b: Unit): number {
  let score = 0;
  if (a.lo > b.lo + SAME) score += a.turnLo;
  else if (b.lo > a.lo + SAME) score -= b.turnLo;
  if (a.hi < b.hi - SAME) score += a.turnHi;
  else if (b.hi < a.hi - SAME) score -= b.turnHi;
  if (score !== 0) return score;
  return a.c - b.c || (a.runs[0] as Run).line - (b.runs[0] as Run).line;
}

/**
 * Places the units of one corridor apart, in order, inside the room the shapes and the fixed runs
 * beside it leave, in the free stretch nearest where they are; says whether any moved. A corridor
 * already spread is left. When its units cannot all move, as when the runs they join hold one of them
 * where it is, the one with the least room stays, and the rest are placed apart from it.
 */
function place(units: Unit[], context: Corridors, staying: readonly Unit[] = []): boolean {
  if (units.length === 0) return false;
  if (placeAll(units, context, staying)) return true;
  if (units.length === 1) return false;
  let tightest = 0;
  units.forEach((unit, at) => {
    const best = units[tightest] as Unit;
    if (unit.max - unit.min < best.max - best.min) tightest = at;
  });
  const stays = units[tightest] as Unit;
  const rest = units.filter((_, at) => at !== tightest);
  return place(rest, context, [...staying, stays]);
}

/** What placing the corridors of one direction reads and writes. */
interface Corridors {
  fixed: RunIndex;
  /** Every run that may move, at its place now. */
  moving: RunBuckets;
  obstacles: ObstacleIndex;
  ends: Int32Array;
  axis: 'x' | 'y';
  points: Float64Array;
}

/** Places every unit of a corridor apart, beside those `staying`; says whether any moved. */
function placeAll(units: Unit[], context: Corridors, staying: readonly Unit[]): boolean {
  const { obstacles, axis, points } = context;
  let lo = Infinity;
  let hi = -Infinity;
  let mean = 0;
  for (const unit of units) {
    lo = Math.min(lo, unit.lo);
    hi = Math.max(hi, unit.hi);
    mean += unit.c;
  }
  mean /= units.length;
  // In the order that crosses least, and failing that as they lie.
  const orders = [[...units].sort(order), [...units].sort((p, q) => p.c - q.c)];
  const across = axis === 'x' ? 0 : 1;
  for (const clearance of CLEARANCES) {
    const rooms = roomsAround(mean, lo, hi, units, context, clearance, staying);
    for (const room of rooms) {
      for (const ordered of orders) {
        for (const spacing of spacingsFor(ordered, room, mean)) {
          const places = placesFor(ordered, spacing, room, mean);
          if (!places) continue;
          if (places.every((at, unit) => Math.abs(at - (ordered[unit] as Unit).c) < 1e-6)) {
            return staying.length > 0;
          }
          if (!joinsClear(ordered, places, obstacles, axis)) continue;
          ordered.forEach((unit, at) => {
            const to = places[at] as number;
            for (const run of unit.runs) {
              points[2 * run.at + across] = to;
              points[2 * (run.at + 1) + across] = to;
              context.moving.move(run, to);
            }
            unit.c = to;
          });
          return true;
        }
      }
    }
  }
  return false;
}

/** The least spacing the pass squeezes runs to, where the room and their bounds leave no more. */
const SQUEEZED = 2;

/**
 * The spacings to try for units in a room, in their order: `IDEAL`, `LEAST`, then the most the room
 * and their own bounds leave, down to `SQUEEZED`.
 */
function spacingsFor(
  units: readonly Unit[],
  room: { from: number; to: number },
  mean: number,
): number[] {
  if (units.length === 1) return [IDEAL];
  const spacings: number[] = [IDEAL, LEAST];
  if (placesFor(units, LEAST, room, mean)) return spacings;
  let low = 0;
  let high = LEAST;
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (placesFor(units, middle, room, mean)) low = middle;
    else high = middle;
  }
  if (low >= SQUEEZED) spacings.push(low);
  return spacings;
}

/**
 * Where each unit goes, `spacing` apart in their order, as near their middle `mean` as the room and
 * each unit's own bounds allow; undefined when they do not fit.
 */
function placesFor(
  units: readonly Unit[],
  spacing: number,
  room: { from: number; to: number },
  mean: number,
): number[] | undefined {
  const count = units.length;
  let low = room.from;
  let high = room.to - (count - 1) * spacing;
  units.forEach((unit, at) => {
    low = Math.max(low, unit.min - at * spacing);
    high = Math.min(high, unit.max - at * spacing);
  });
  if (!(high >= low - 1e-9)) return undefined;
  const wanted = mean - ((count - 1) * spacing) / 2;
  const start = Math.min(high, Math.max(low, wanted));
  return units.map((_, at) => start + at * spacing);
}

/**
 * Whether the runs a unit joins stay clear of the shapes as it moves to its place: each is lengthened
 * or shortened along itself, and the length it gains may not run into a shape it did not run in.
 */
function joinsClear(
  units: readonly Unit[],
  places: readonly number[],
  obstacles: ObstacleIndex,
  axis: 'x' | 'y',
): boolean {
  return units.every((unit, at) => {
    const to = places[at] as number;
    return unit.runs.every((run) =>
      [run.lo, run.hi].every((along) => obstacles.clearAcross(axis, run.c, to, along)),
    );
  });
}

/**
 * The stretches across a corridor around `mean`, nearest first: between the shapes, `clearance` away,
 * and the fixed runs of lines that share no end with every unit, that overlap its span along. A shape
 * the corridor already runs over is left out, since moving cannot clear it.
 */
function roomsAround(
  mean: number,
  lo: number,
  hi: number,
  units: readonly Unit[],
  context: Corridors,
  clearance: number,
  staying: readonly Unit[],
): { from: number; to: number }[] {
  const { fixed, moving, obstacles, ends, axis } = context;
  const reach = IDEAL * (units.length + 4) + clearance;
  const blocked: [number, number][] = [];
  obstacles.forEachIn(axis, mean - reach, mean + reach, lo + SAME, hi - SAME, (from, to) => {
    if (from < mean && to > mean) return;
    blocked.push([from - clearance, to + clearance]);
  });
  const shared = (line: number) => {
    const [a, b] = endsOf(ends, line);
    return units.every((unit) => unit.runs.every((run) => sharesEnd(ends, run.line, a, b)));
  };
  const own = new Set(units.flatMap((unit) => unit.runs.map((run) => run.line)));
  const mine = new Set(units.flatMap((unit) => unit.runs));
  for (const unit of staying) for (const run of unit.runs) mine.add(run);
  for (const run of [
    ...fixed.within(mean - reach, mean + reach),
    ...moving.within(mean - reach, mean + reach),
  ]) {
    if (mine.has(run) || own.has(run.line) || overlap(run, { lo, hi }) <= OVERLAP) continue;
    if (shared(run.line)) continue;
    blocked.push([run.c - LEAST, run.c + LEAST]);
  }
  for (const unit of staying) blocked.push([unit.c - LEAST, unit.c + LEAST]);
  blocked.sort((p, q) => p[0] - q[0]);
  const rooms: { from: number; to: number }[] = [];
  let from = mean - reach;
  for (const [a, b] of blocked) {
    if (a > from) rooms.push({ from, to: a });
    from = Math.max(from, b);
  }
  if (mean + reach > from) rooms.push({ from, to: mean + reach });
  const distance = (room: { from: number; to: number }) =>
    mean < room.from ? room.from - mean : mean > room.to ? mean - room.to : 0;
  return rooms.sort((p, q) => distance(p) - distance(q));
}

function sharesEnd(ends: Int32Array, line: number, a: number, b: number): boolean {
  const [from, to] = endsOf(ends, line);
  return from === a || from === b || to === a || to === b;
}

/** The fixed runs of one direction, by their place across, to find those near a place. */
class RunIndex {
  private readonly sorted: Run[];

  constructor(runs: readonly Run[]) {
    this.sorted = [...runs].sort((p, q) => p.c - q.c);
  }

  /** The fixed runs whose place across lies between `from` and `to`. */
  within(from: number, to: number): Run[] {
    const { sorted } = this;
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((sorted[middle] as Run).c < from) low = middle + 1;
      else high = middle;
    }
    const found: Run[] = [];
    for (let at = low; at < sorted.length && (sorted[at] as Run).c <= to; at++) {
      found.push(sorted[at] as Run);
    }
    return found;
  }

  /**
   * A fixed run of another line that shares no end with `run`'s, nearer it than `LEAST` across and
   * overlapping it along; undefined when none is.
   */
  near(run: Run, ends: Int32Array): Run | undefined {
    const [a, b] = endsOf(ends, run.line);
    return this.within(run.c - LEAST + SAME, run.c + LEAST - SAME).find(
      (other) =>
        other.line !== run.line &&
        overlap(other, run) > OVERLAP &&
        !sharesEnd(ends, other.line, a, b),
    );
  }
}

/** The runs that may move, by buckets of their place across, kept as they move. */
class RunBuckets {
  private readonly buckets = new Map<number, Set<Run>>();

  constructor(runs: readonly Run[]) {
    for (const run of runs) this.add(run);
  }

  /** The runs whose place across lies between `from` and `to`. */
  within(from: number, to: number): Run[] {
    const found: Run[] = [];
    for (let bucket = Math.floor(from / BUCKET); bucket <= Math.floor(to / BUCKET); bucket++) {
      for (const run of this.buckets.get(bucket) ?? []) {
        if (run.c >= from && run.c <= to) found.push(run);
      }
    }
    return found;
  }

  move(run: Run, to: number): void {
    this.buckets.get(Math.floor(run.c / BUCKET))?.delete(run);
    run.c = to;
    this.add(run);
  }

  private add(run: Run): void {
    const bucket = Math.floor(run.c / BUCKET);
    let set = this.buckets.get(bucket);
    if (!set) {
      set = new Set();
      this.buckets.set(bucket, set);
    }
    set.add(run);
  }
}

/** How wide a bucket of `RunBuckets` is, across. */
const BUCKET = 64;

/** The shapes runs keep clear of, by the cells of a grid they cover. */
class ObstacleIndex {
  /**
   * Whether the stretch across from `from` to `to`, at `along`, runs into no shape that the place
   * `from` was not inside already: as a joined run grows when the run it joins moves.
   */
  clearAcross(axis: 'x' | 'y', from: number, to: number, along: number): boolean {
    return this.clearAlong(axis, from, to, along, along);
  }

  /**
   * Whether a run at `to` across, from `lo` to `hi` along, and the stretch across from `from` to it,
   * run into no shape that the run at `from` was not inside already.
   */
  clearAlong(axis: 'x' | 'y', from: number, to: number, lo: number, hi: number): boolean {
    if (from === to) return true;
    let clear = true;
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    this.forEachIn(axis, low, high, lo - SAME, hi + SAME, (start, end) => {
      if (!(start < from && end > from)) clear = false;
    });
    return clear;
  }

  private readonly cells = new Map<number, number[]>();
  /** The shapes too large to file cell by cell, which every query reads. */
  private readonly oversized: number[] = [];
  private readonly seen: Uint32Array;
  private stamp = 0;

  constructor(private readonly rects: Float64Array) {
    const count = rects.length >> 2;
    this.seen = new Uint32Array(count);
    for (let at = 0; at < count; at++) {
      const x = rects[4 * at] as number;
      const y = rects[4 * at + 1] as number;
      const width = rects[4 * at + 2] as number;
      const height = rects[4 * at + 3] as number;
      if (![x, y, width, height].every(Number.isFinite)) continue;
      const x0 = Math.floor(x / CELL);
      const x1 = Math.floor((x + width) / CELL);
      const y0 = Math.floor(y / CELL);
      const y1 = Math.floor((y + height) / CELL);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) {
        this.oversized.push(at);
        continue;
      }
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

  /**
   * Calls `each` with the span across of every shape that meets the strip from `from` to `to`
   * across and from `lo` to `hi` along.
   */
  forEachIn(
    axis: 'x' | 'y',
    from: number,
    to: number,
    lo: number,
    hi: number,
    each: (from: number, to: number) => void,
  ): void {
    const [x0, x1, y0, y1] = axis === 'x' ? [from, to, lo, hi] : [lo, hi, from, to];
    this.stamp += 1;
    const { rects, seen, stamp } = this;
    const visit = (at: number) => {
      if (seen[at] === stamp) return;
      seen[at] = stamp;
      const x = rects[4 * at] as number;
      const y = rects[4 * at + 1] as number;
      const right = x + (rects[4 * at + 2] as number);
      const bottom = y + (rects[4 * at + 3] as number);
      if (right <= x0 || x >= x1 || bottom <= y0 || y >= y1) return;
      if (axis === 'x') each(x, right);
      else each(y, bottom);
    };
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (const at of this.cells.get(cellKey(cx, cy)) ?? []) visit(at);
      }
    }
    for (const at of this.oversized) visit(at);
  }
}

function cellKey(x: number, y: number): number {
  return (x + 0x8000) * 0x10000 + (y + 0x8000);
}
