/**
 * The boundary of what several fills cover together, for writing a named part's outline as free
 * geometry (ADR 0066, ADR 0067). Free geometry is read by the even-odd rule over all its contours, so
 * the fills of shapes that overlap, or a fill read by the nonzero rule, cannot be written as their
 * contours: a shape drawn over another would read as a hole in it. Here the polygons' edges are split
 * where they cross, each piece is kept when what the fills hold differs on its two sides, and the
 * pieces kept are joined into closed loops, whose even-odd reading is exactly what the fills cover.
 *
 * When no two edges cross, whole polygons are kept or left out instead, so that their curves can be
 * written as they are.
 *
 * The work is bounded whatever the polygons, by {@link UNION_CAPS}: the edges are counted before
 * anything is built, each edge is kept only in the cells of a uniform grid that it crosses, and every
 * step after that, from comparing two edges in a cell to following a ray, is paid from one budget.
 * Past a cap the boundary is given up, and the caller writes something linear instead.
 */

/** A closed polygon, as x, y pairs without its first point repeated, with the fill it belongs to. */
export interface FillPolygon {
  readonly points: Float64Array;
  /** Its fill: polygons of one fill hold by its rule together, and the fills join. */
  readonly group: number;
  /** Its fill holds by the nonzero rule, otherwise by the even-odd rule. */
  readonly nonzero: boolean;
}

/** The boundary of what fills cover: which polygons bound it, when none cross, or loops of it. */
export type FillBoundary =
  | { readonly crossing: false; readonly bounding: readonly boolean[] }
  | { readonly crossing: true; readonly loops: readonly Float64Array[] };

/** The caps on finding the boundary of what fills cover. */
export const UNION_CAPS = {
  /** Edges of all the polygons, counted before anything is built; the caller simplifies to them. */
  edges: 16_384,
  /** Points where edges cross or run along one another. */
  crossings: 16_384,
  /**
   * Steps of work in all: each cell an edge is kept in, each pair of edges compared in a cell, each
   * cell and edge a ray from a point meets, and each piece joined into a loop.
   */
  work: 4_000_000,
} as const;

const T_EPSILON = 1e-10;

/** Thrown inside the walk when a cap is passed; the walk then gives up. */
class OverCap extends Error {
  override name = 'OverCap';
}

/**
 * The boundary of what the polygons' fills cover together; `undefined` when the polygons have more
 * edges than {@link UNION_CAPS.edges}, or finding it would pass another cap.
 */
export function fillBoundary(polygons: readonly FillPolygon[]): FillBoundary | undefined {
  let edges = 0;
  for (const polygon of polygons) edges += polygon.points.length / 2;
  if (edges > UNION_CAPS.edges) return undefined;
  try {
    const field = new Field(polygons, edges);
    const splits = field.crossings();
    if (splits.size === 0) {
      // Polygons that lie on one another bound once: read twice by the even-odd rule, they cancel.
      const seen = new Set<string>();
      return {
        crossing: false,
        bounding: polygons.map((polygon) => {
          if (!field.bounds(polygon)) return false;
          const key = ringKey(polygon.points);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      };
    }
    return { crossing: true, loops: field.loops(splits) };
  } catch (error) {
    if (error instanceof OverCap) return undefined;
    throw error;
  }
}

/** The same text for rings of the same points in the same cyclic order, whichever way they run. */
function ringKey(points: Float64Array): string {
  const count = points.length / 2;
  const before = (i: number, j: number) => {
    const dx = (points[2 * i] as number) - (points[2 * j] as number);
    return dx !== 0 ? dx < 0 : (points[2 * i + 1] as number) < (points[2 * j + 1] as number);
  };
  let first = 0;
  for (let i = 1; i < count; i += 1) if (before(i, first)) first = i;
  const forward = (first + 1) % count;
  const backward = (first + count - 1) % count;
  const step = before(backward, forward) ? count - 1 : 1;
  const parts: number[] = [];
  for (let k = 0, i = first; k < count; k += 1, i = (i + step) % count) {
    parts.push(points[2 * i] as number, points[2 * i + 1] as number);
  }
  return parts.join(' ');
}

/** A point where an edge is split, at `t` along it. */
interface Split {
  t: number;
  x: number;
  y: number;
}

/** The polygons' edges in a grid, what their fills hold, and the work done so far. */
class Field {
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
  /** The polygon of each edge. */
  readonly owner: Int32Array;
  readonly groups: number[];
  readonly nonzero: boolean[];
  readonly minX: number;
  readonly minY: number;
  readonly size: number;
  readonly side: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** The edges that cross each cell, row by row. */
  readonly cells: number[][];
  #work: number = UNION_CAPS.work;
  #crossings = 0;
  readonly #stamp: Int32Array;
  #query = 0;

  constructor(
    readonly polygons: readonly FillPolygon[],
    readonly count: number,
  ) {
    this.x0 = new Float64Array(count);
    this.y0 = new Float64Array(count);
    this.x1 = new Float64Array(count);
    this.y1 = new Float64Array(count);
    this.owner = new Int32Array(count);
    this.groups = polygons.map((polygon) => polygon.group);
    this.nonzero = polygons.map((polygon) => polygon.nonzero);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let edge = 0;
    for (const [at, polygon] of polygons.entries()) {
      const points = polygon.points;
      const n = points.length / 2;
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const ax = points[2 * i] as number;
        const ay = points[2 * i + 1] as number;
        this.x0[edge] = ax;
        this.y0[edge] = ay;
        this.x1[edge] = points[2 * j] as number;
        this.y1[edge] = points[2 * j + 1] as number;
        this.owner[edge] = at;
        edge += 1;
        if (ax < minX) minX = ax;
        if (ay < minY) minY = ay;
        if (ax > maxX) maxX = ax;
        if (ay > maxY) maxY = ay;
      }
    }
    if (!(minX <= maxX && minY <= maxY)) {
      minX = 0;
      minY = 0;
      maxX = 1;
      maxY = 1;
    }
    this.minX = minX;
    this.minY = minY;
    this.size = Math.max(maxX - minX, maxY - minY, Number.MIN_VALUE);
    // About one edge to a cell when they are spread out.
    this.side = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(count))));
    this.cellWidth = (maxX - minX) / this.side || 1;
    this.cellHeight = (maxY - minY) / this.side || 1;
    this.cells = Array.from({ length: this.side * this.side }, () => []);
    for (let e = 0; e < count; e += 1) this.#index(e);
    this.#stamp = new Int32Array(count);
  }

  /** Pays for steps of work, and gives up past the budget. */
  spend(steps: number): void {
    this.#work -= steps;
    if (this.#work < 0) throw new OverCap();
  }

  column(x: number): number {
    const at = Math.floor((x - this.minX) / this.cellWidth);
    return at < 0 ? 0 : at >= this.side ? this.side - 1 : at;
  }

  row(y: number): number {
    const at = Math.floor((y - this.minY) / this.cellHeight);
    return at < 0 ? 0 : at >= this.side ? this.side - 1 : at;
  }

  /**
   * Keeps an edge in the cells it crosses, walking the grid from cell to cell along it, as a
   * digital differential analyser does: as many cells as the columns and rows it spans, not the
   * square of them.
   */
  #index(edge: number): void {
    const gx0 = ((this.x0[edge] as number) - this.minX) / this.cellWidth;
    const gy0 = ((this.y0[edge] as number) - this.minY) / this.cellHeight;
    const gx1 = ((this.x1[edge] as number) - this.minX) / this.cellWidth;
    const gy1 = ((this.y1[edge] as number) - this.minY) / this.cellHeight;
    const clamp = (value: number) => (value < 0 ? 0 : value >= this.side ? this.side - 1 : value);
    let c = clamp(Math.floor(gx0));
    let r = clamp(Math.floor(gy0));
    const endC = clamp(Math.floor(gx1));
    const endR = clamp(Math.floor(gy1));
    const dx = gx1 - gx0;
    const dy = gy1 - gy0;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    let nextX = stepX === 0 ? Number.POSITIVE_INFINITY : ((stepX > 0 ? c + 1 : c) - gx0) / dx;
    let nextY = stepY === 0 ? Number.POSITIVE_INFINITY : ((stepY > 0 ? r + 1 : r) - gy0) / dy;
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : stepX / dx;
    const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : stepY / dy;
    const steps = Math.abs(endC - c) + Math.abs(endR - r);
    let last = -1;
    const keep = (cell: number) => {
      if (cell === last) return;
      last = cell;
      this.spend(1);
      (this.cells[cell] as number[]).push(edge);
    };
    keep(r * this.side + c);
    for (let k = 0; k < steps; k += 1) {
      if (nextX < nextY) {
        c = clamp(c + stepX);
        nextX += deltaX;
      } else {
        r = clamp(r + stepY);
        nextY += deltaY;
      }
      keep(r * this.side + c);
    }
    keep(endR * this.side + endC);
  }

  /** Whether the fills hold a point: whether any fill does, by its rule, along a ray toward +x. */
  holds(x: number, y: number): boolean {
    this.#query += 1;
    const query = this.#query;
    const sums = new Map<number, number>();
    const r = this.row(y);
    for (let c = this.column(x); c < this.side; c += 1) {
      const cell = this.cells[r * this.side + c] as number[];
      this.spend(1 + cell.length);
      for (const e of cell) {
        if (this.#stamp[e] === query) continue;
        this.#stamp[e] = query;
        const ax = this.x0[e] as number;
        const ay = this.y0[e] as number;
        const bx = this.x1[e] as number;
        const by = this.y1[e] as number;
        if (by > y === ay > y) continue;
        if (!(x < ((ax - bx) * (y - by)) / (ay - by) + bx)) continue;
        const polygon = this.owner[e] as number;
        const group = this.groups[polygon] as number;
        const sum = sums.get(group) ?? 0;
        sums.set(group, this.nonzero[polygon] ? sum + (by > ay ? 1 : -1) : sum ^ 1);
      }
    }
    for (const sum of sums.values()) if (sum !== 0) return true;
    return false;
  }

  /** Whether what the fills hold differs on the two sides of a piece, and which side holds. */
  sides(ax: number, ay: number, bx: number, by: number): 'left' | 'right' | undefined {
    const length = Math.hypot(bx - ax, by - ay);
    if (!(length > 0)) return undefined;
    const step = Math.max(this.size * 1e-12, Math.min(length * 1e-3, this.size * 1e-6));
    const nx = (-(by - ay) / length) * step;
    const ny = ((bx - ax) / length) * step;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const left = this.holds(mx + nx, my + ny);
    const right = this.holds(mx - nx, my - ny);
    return left === right ? undefined : left ? 'left' : 'right';
  }

  /** Whether a polygon that crosses none bounds what the fills cover, tried on its longest edge. */
  bounds(polygon: FillPolygon): boolean {
    const points = polygon.points;
    const n = points.length / 2;
    this.spend(n);
    let best = -1;
    let longest = 0;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const length = Math.hypot(
        (points[2 * j] as number) - (points[2 * i] as number),
        (points[2 * j + 1] as number) - (points[2 * i + 1] as number),
      );
      if (length > longest) {
        longest = length;
        best = i;
      }
    }
    if (best < 0) return false;
    const j = (best + 1) % n;
    return (
      this.sides(
        points[2 * best] as number,
        points[2 * best + 1] as number,
        points[2 * j] as number,
        points[2 * j + 1] as number,
      ) !== undefined
    );
  }

  /**
   * Where edges cross or run along one another, as the points each edge is split at. Two edges are
   * compared in each cell they share, and a point is kept only in the cell that holds it, so that
   * each is found once.
   */
  crossings(): Map<number, Split[]> {
    const splits = new Map<number, Split[]>();
    for (let r = 0; r < this.side; r += 1) {
      for (let c = 0; c < this.side; c += 1) {
        const cell = this.cells[r * this.side + c] as number[];
        const add = (edge: number, t: number, x: number, y: number) => {
          if (!(t > T_EPSILON && t < 1 - T_EPSILON)) return;
          if (this.column(x) !== c || this.row(y) !== r) return;
          this.#crossings += 1;
          if (this.#crossings > UNION_CAPS.crossings) throw new OverCap();
          const list = splits.get(edge);
          if (list) list.push({ t, x, y });
          else splits.set(edge, [{ t, x, y }]);
        };
        for (let i = 0; i < cell.length; i += 1) {
          const a = cell[i] as number;
          this.spend(cell.length - i);
          for (let k = i + 1; k < cell.length; k += 1) this.cross(a, cell[k] as number, add);
        }
      }
    }
    return splits;
  }

  /** Splits two edges where they cross, or where one runs along the other. */
  cross(a: number, b: number, add: (edge: number, t: number, x: number, y: number) => void): void {
    const ax = this.x0[a] as number;
    const ay = this.y0[a] as number;
    const ex = this.x1[a] as number;
    const ey = this.y1[a] as number;
    const bx = this.x0[b] as number;
    const by = this.y0[b] as number;
    const fx = this.x1[b] as number;
    const fy = this.y1[b] as number;
    // Edges whose bounds are apart meet nothing: most pairs in a crowded cell end here.
    if (Math.max(ax, ex) < Math.min(bx, fx) || Math.max(bx, fx) < Math.min(ax, ex)) return;
    if (Math.max(ay, ey) < Math.min(by, fy) || Math.max(by, fy) < Math.min(ay, ey)) return;
    const adx = ex - ax;
    const ady = ey - ay;
    const bdx = fx - bx;
    const bdy = fy - by;
    const aLength = Math.sqrt(adx * adx + ady * ady);
    const bLength = Math.sqrt(bdx * bdx + bdy * bdy);
    if (aLength === 0 || bLength === 0) return;
    const denominator = adx * bdy - ady * bdx;
    const wx = bx - ax;
    const wy = by - ay;
    if (Math.abs(denominator) > 1e-12 * aLength * bLength) {
      const t = (wx * bdy - wy * bdx) / denominator;
      const u = (wx * ady - wy * adx) / denominator;
      if (t < -T_EPSILON || t > 1 + T_EPSILON || u < -T_EPSILON || u > 1 + T_EPSILON) return;
      // Where one edge ends on the other, split the other at that very end.
      const uEnd = u <= T_EPSILON ? 0 : u >= 1 - T_EPSILON ? 1 : undefined;
      const tEnd = t <= T_EPSILON ? 0 : t >= 1 - T_EPSILON ? 1 : undefined;
      const x =
        uEnd !== undefined ? bx + uEnd * bdx : tEnd !== undefined ? ax + tEnd * adx : ax + t * adx;
      const y =
        uEnd !== undefined ? by + uEnd * bdy : tEnd !== undefined ? ay + tEnd * ady : ay + t * ady;
      add(a, t, x, y);
      add(b, u, x, y);
      return;
    }
    // Parallel: split each where the other's ends lie on it, when they lie along one line.
    const offset = Math.abs(wx * ady - wy * adx) / aLength;
    if (offset > 1e-9 * Math.max(this.size, aLength)) return;
    for (const [ex, ey] of [
      [bx, by],
      [bx + bdx, by + bdy],
    ] as const) {
      add(a, ((ex - ax) * adx + (ey - ay) * ady) / (aLength * aLength), ex, ey);
    }
    for (const [ex, ey] of [
      [ax, ay],
      [ax + adx, ay + ady],
    ] as const) {
      add(b, ((ex - bx) * bdx + (ey - by) * bdy) / (bLength * bLength), ex, ey);
    }
  }

  /** The pieces of every edge, split where edges cross, that bound what the fills cover, as loops. */
  loops(splits: Map<number, Split[]>): Float64Array[] {
    const pieces: [number, number, number, number][] = [];
    const seen = new Set<string>();
    for (let e = 0; e < this.count; e += 1) {
      const points: [number, number][] = [[this.x0[e] as number, this.y0[e] as number]];
      for (const split of (splits.get(e) ?? []).sort((p, q) => p.t - q.t)) {
        points.push([split.x, split.y]);
      }
      points.push([this.x1[e] as number, this.y1[e] as number]);
      for (let i = 0; i + 1 < points.length; i += 1) {
        const [px, py] = points[i] as [number, number];
        const [qx, qy] = points[i + 1] as [number, number];
        const side = this.sides(px, py, qx, qy);
        if (side === undefined) continue;
        // Each piece runs with what the fills hold on its left.
        const piece: [number, number, number, number] =
          side === 'left' ? [px, py, qx, qy] : [qx, qy, px, py];
        const key = piece.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        pieces.push(piece);
      }
    }
    const leaving = new Map<string, number[]>();
    for (const [at, [px, py]] of pieces.entries()) {
      const key = `${px} ${py}`;
      const list = leaving.get(key);
      if (list) list.push(at);
      else leaving.set(key, [at]);
    }
    const used = new Uint8Array(pieces.length);
    const loops: Float64Array[] = [];
    for (let first = 0; first < pieces.length; first += 1) {
      if (used[first]) continue;
      used[first] = 1;
      const [sx, sy, fx, fy] = pieces[first] as [number, number, number, number];
      const loop: number[] = [sx, sy];
      let [x, y] = [fx, fy];
      // Each piece is followed once, so loops cost as many steps as there are pieces.
      for (;;) {
        if (x === sx && y === sy) break;
        loop.push(x, y);
        const leavingHere = leaving.get(`${x} ${y}`) ?? [];
        this.spend(1 + leavingHere.length);
        const next = leavingHere.find((at) => !used[at]);
        // A loop that cannot be followed further is closed where it stands.
        if (next === undefined) break;
        used[next] = 1;
        const piece = pieces[next] as [number, number, number, number];
        x = piece[2];
        y = piece[3];
      }
      if (loop.length >= 6) loops.push(Float64Array.from(loop));
    }
    return loops;
  }
}
