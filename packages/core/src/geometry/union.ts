/**
 * The boundary of what several fills cover together, for writing a named part's outline as free
 * geometry (ADR 0066, ADR 0067). Free geometry is read by the even-odd rule over all its contours, so
 * the fills of shapes that overlap, or a fill read by the nonzero rule, cannot be written as their
 * contours: a shape drawn over another would read as a hole in it. Here the polygons' edges are split
 * where they cross, each piece is kept when what the fills hold differs on its two sides, and the
 * pieces kept are joined into closed loops, whose even-odd reading is exactly what the fills cover.
 *
 * When no two edges cross, whole polygons are kept or left out instead, so that their curves can be
 * written as they are. A uniform grid finds crossings and answers whether the fills hold a point, so
 * the work grows with the edges near each other rather than with every pair.
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

const T_EPSILON = 1e-10;

/** The boundary of what the polygons' fills cover together. */
export function fillBoundary(polygons: readonly FillPolygon[]): FillBoundary {
  const field = new Field(polygons);
  const splits = field.crossings();
  if (splits.size === 0) {
    // Polygons that lie on one another bound once: read twice by the even-odd rule, they would cancel.
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

/** The polygons' edges in a grid, and what their fills hold. */
class Field {
  readonly count: number;
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
  readonly cells: number[][];
  /** Each edge's columns and rows, first and last. */
  readonly spans: Int32Array;
  #stamp: Int32Array;
  #query = 0;

  constructor(readonly polygons: readonly FillPolygon[]) {
    let count = 0;
    for (const polygon of polygons) count += polygon.points.length / 2;
    this.count = count;
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
    if (minX > maxX) {
      minX = 0;
      minY = 0;
      maxX = 1;
      maxY = 1;
    }
    this.minX = minX;
    this.minY = minY;
    this.size = Math.max(maxX - minX, maxY - minY, Number.MIN_VALUE);
    this.side = Math.max(1, Math.min(512, Math.ceil(Math.sqrt(count) / 2)));
    this.cellWidth = (maxX - minX) / this.side || 1;
    this.cellHeight = (maxY - minY) / this.side || 1;
    this.cells = Array.from({ length: this.side * this.side }, () => []);
    this.spans = new Int32Array(count * 4);
    for (let e = 0; e < count; e += 1) {
      const c0 = this.column(Math.min(this.x0[e] as number, this.x1[e] as number));
      const c1 = this.column(Math.max(this.x0[e] as number, this.x1[e] as number));
      const r0 = this.row(Math.min(this.y0[e] as number, this.y1[e] as number));
      const r1 = this.row(Math.max(this.y0[e] as number, this.y1[e] as number));
      this.spans.set([c0, c1, r0, r1], e * 4);
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) (this.cells[r * this.side + c] as number[]).push(e);
      }
    }
    this.#stamp = new Int32Array(count);
  }

  column(x: number): number {
    return Math.max(0, Math.min(this.side - 1, Math.floor((x - this.minX) / this.cellWidth)));
  }

  row(y: number): number {
    return Math.max(0, Math.min(this.side - 1, Math.floor((y - this.minY) / this.cellHeight)));
  }

  /** Whether the fills hold a point: whether any fill does, by its rule, along a ray toward +x. */
  holds(x: number, y: number): boolean {
    this.#query += 1;
    const query = this.#query;
    const sums = new Map<number, number>();
    const r = this.row(y);
    for (let c = this.column(x); c < this.side; c += 1) {
      for (const e of this.cells[r * this.side + c] as number[]) {
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

  /** Where edges cross or overlap, as the points each edge is split at. */
  crossings(): Map<number, Split[]> {
    const splits = new Map<number, Split[]>();
    const add = (edge: number, t: number, x: number, y: number) => {
      if (!(t > T_EPSILON && t < 1 - T_EPSILON)) return;
      const list = splits.get(edge);
      if (list) list.push({ t, x, y });
      else splits.set(edge, [{ t, x, y }]);
    };
    const { spans } = this;
    for (let r = 0; r < this.side; r += 1) {
      for (let c = 0; c < this.side; c += 1) {
        const cell = this.cells[r * this.side + c] as number[];
        for (let i = 0; i < cell.length; i += 1) {
          const a = cell[i] as number;
          for (let k = i + 1; k < cell.length; k += 1) {
            const b = cell[k] as number;
            // Each pair once: in the first cell the two share.
            if (
              Math.max(spans[a * 4] as number, spans[b * 4] as number) !== c ||
              Math.max(spans[a * 4 + 2] as number, spans[b * 4 + 2] as number) !== r
            ) {
              continue;
            }
            this.cross(a, b, add);
          }
        }
      }
    }
    return splits;
  }

  /** Splits two edges where they cross, or where one runs along the other. */
  cross(a: number, b: number, add: (edge: number, t: number, x: number, y: number) => void): void {
    const ax = this.x0[a] as number;
    const ay = this.y0[a] as number;
    const adx = (this.x1[a] as number) - ax;
    const ady = (this.y1[a] as number) - ay;
    const bx = this.x0[b] as number;
    const by = this.y0[b] as number;
    const bdx = (this.x1[b] as number) - bx;
    const bdy = (this.y1[b] as number) - by;
    const aLength = Math.hypot(adx, ady);
    const bLength = Math.hypot(bdx, bdy);
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
      for (;;) {
        if (x === sx && y === sy) break;
        loop.push(x, y);
        const next = (leaving.get(`${x} ${y}`) ?? []).find((at) => !used[at]);
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
