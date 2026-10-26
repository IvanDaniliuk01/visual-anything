/**
 * Simplifying flattened contours to a budget of points shared among them, as a named part's outline
 * is past 4,096 points (ADR 0067) and free geometry past its caps (ADR 0066). Each polyline's points
 * are ranked once, by Visvalingam and Whyatt's simplification: points go one by one, the one whose
 * triangle with its neighbours is smallest first, and a point's rank is the area at which it goes,
 * never below the ranks of those gone before it. Keeping the points ranked above a threshold is that
 * simplification stopped there, and it takes O(n log n) whatever the polyline, as Ramer, Douglas and
 * Peucker's does not on a staircase. One threshold is then found for all the polylines, the least
 * whose points fit the budget, so that many parts sharing a shape rank its points only once.
 */

/** A polyline, as x, y pairs, with the rank of each of its points. */
export interface RankedPolyline {
  readonly points: Float64Array;
  /** For each point, the threshold up to which it is kept; its ends are kept at any. */
  readonly rank: Float64Array;
  /** The ranks of its inner points, largest first. */
  readonly sorted: Float64Array;
  /** Whether it is a closed contour, its last point its first: it keeps at least four points. */
  readonly closed: boolean;
}

/** Ranks a polyline's points. A closed one repeats its first point at its end. */
export function rankPolyline(points: Float64Array, closed: boolean): RankedPolyline {
  const count = points.length / 2;
  const rank = new Float64Array(count);
  if (count > 0) {
    rank[0] = Number.POSITIVE_INFINITY;
    rank[count - 1] = Number.POSITIVE_INFINITY;
  }
  if (count > 2) {
    const previous = new Int32Array(count);
    const next = new Int32Array(count);
    const area = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      previous[i] = i - 1;
      next[i] = i + 1;
    }
    const triangle = (i: number) => {
      const p = previous[i] as number;
      const q = next[i] as number;
      const ax = points[2 * p] as number;
      const ay = points[2 * p + 1] as number;
      return (
        Math.abs(
          ((points[2 * i] as number) - ax) * ((points[2 * q + 1] as number) - ay) -
            ((points[2 * q] as number) - ax) * ((points[2 * i + 1] as number) - ay),
        ) / 2
      );
    };
    for (let i = 1; i < count - 1; i += 1) area[i] = triangle(i);
    const heap = new IndexedHeap(area, count);
    for (let i = 1; i < count - 1; i += 1) heap.push(i);
    let last = 0;
    for (let i = heap.pop(); i !== -1; i = heap.pop()) {
      const own = Math.max(area[i] as number, last);
      rank[i] = own;
      last = own;
      const p = previous[i] as number;
      const q = next[i] as number;
      next[p] = q;
      previous[q] = p;
      if (p > 0) {
        area[p] = triangle(p);
        heap.update(p);
      }
      if (q < count - 1) {
        area[q] = triangle(q);
        heap.update(q);
      }
    }
  }
  const sorted = rank
    .slice(1, Math.max(1, count - 1))
    .sort()
    .reverse();
  return { points, rank, sorted, closed };
}

/** A binary heap of indices, smallest key first, whose keys can change while they are in it. */
class IndexedHeap {
  readonly #items: Int32Array;
  readonly #places: Int32Array;
  #size = 0;

  constructor(
    readonly keys: Float64Array,
    capacity: number,
  ) {
    this.#items = new Int32Array(capacity);
    this.#places = new Int32Array(capacity).fill(-1);
  }

  push(index: number): void {
    this.#items[this.#size] = index;
    this.#places[index] = this.#size;
    this.#size += 1;
    this.#up(this.#size - 1);
  }

  /** The index of the smallest key, taken out; -1 when the heap is empty. */
  pop(): number {
    if (this.#size === 0) return -1;
    const top = this.#items[0] as number;
    this.#size -= 1;
    this.#places[top] = -1;
    if (this.#size > 0) {
      const moved = this.#items[this.#size] as number;
      this.#items[0] = moved;
      this.#places[moved] = 0;
      this.#down(0);
    }
    return top;
  }

  /** Moves an index to where its changed key puts it, if it is still in the heap. */
  update(index: number): void {
    const place = this.#places[index] as number;
    if (place < 0) return;
    this.#up(place);
    this.#down(this.#places[index] as number);
  }

  #less(a: number, b: number): boolean {
    const ka = this.keys[this.#items[a] as number] as number;
    const kb = this.keys[this.#items[b] as number] as number;
    return ka < kb || (ka === kb && (this.#items[a] as number) < (this.#items[b] as number));
  }

  #swap(a: number, b: number): void {
    const ia = this.#items[a] as number;
    const ib = this.#items[b] as number;
    this.#items[a] = ib;
    this.#items[b] = ia;
    this.#places[ib] = a;
    this.#places[ia] = b;
  }

  #up(place: number): void {
    let at = place;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.#less(at, parent)) break;
      this.#swap(at, parent);
      at = parent;
    }
  }

  #down(place: number): void {
    let at = place;
    for (;;) {
      const left = 2 * at + 1;
      const right = left + 1;
      let smallest = at;
      if (left < this.#size && this.#less(left, smallest)) smallest = left;
      if (right < this.#size && this.#less(right, smallest)) smallest = right;
      if (smallest === at) return;
      this.#swap(at, smallest);
      at = smallest;
    }
  }
}

/** How many points a ranked polyline keeps at a tolerance. */
function keptAt(polyline: RankedPolyline, tolerance: number): number {
  const ends = Math.min(2, polyline.points.length / 2);
  // The inner points ranked above the tolerance, found in the sorted ranks.
  let low = 0;
  let high = polyline.sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((polyline.sorted[middle] as number) > tolerance) low = middle + 1;
    else high = middle;
  }
  return ends + Math.max(low, least(polyline) - ends);
}

/** The fewest points a polyline keeps and still draws something: four for a closed one, two for a line. */
function least(polyline: RankedPolyline): number {
  return Math.min(polyline.closed ? 4 : 2, polyline.points.length / 2);
}

/**
 * The polylines simplified, with one tolerance, the least at which their points fit `budget` in all.
 * When even their fewest points do not fit, the smallest polylines are left out, as `undefined`.
 */
export function simplifyToBudget(
  polylines: readonly RankedPolyline[],
  budget: number,
): (Float64Array | undefined)[] {
  const total = (tolerance: number, kept: readonly boolean[]) =>
    polylines.reduce((sum, polyline, at) => sum + (kept[at] ? keptAt(polyline, tolerance) : 0), 0);
  let kept = polylines.map(() => true);
  if (total(-1, kept) <= budget) return polylines.map((polyline) => polyline.points);
  if (total(Number.POSITIVE_INFINITY, kept) > budget) {
    // The largest polylines first, as long as their fewest points fit.
    const order = polylines
      .map((polyline, at) => ({ at, size: extent(polyline.points) }))
      .sort((a, b) => b.size - a.size);
    kept = polylines.map(() => false);
    let used = 0;
    for (const { at } of order) {
      const fewest = least(polylines[at] as RankedPolyline);
      if (used + fewest > budget) continue;
      kept[at] = true;
      used += fewest;
    }
  }
  // The least tolerance that fits, among the ranks themselves.
  const ranks = new Set<number>();
  for (const [at, polyline] of polylines.entries()) {
    if (kept[at]) for (const value of polyline.sorted) ranks.add(value);
  }
  const candidates = [...ranks, Number.POSITIVE_INFINITY].sort((a, b) => a - b);
  let low = 0;
  let high = candidates.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (total(candidates[middle] as number, kept) <= budget) high = middle;
    else low = middle + 1;
  }
  const tolerance = candidates[low] as number;
  return polylines.map((polyline, at) => (kept[at] ? pointsAt(polyline, tolerance) : undefined));
}

/** A ranked polyline's points kept at a tolerance, and never fewer than it needs to draw. */
function pointsAt(polyline: RankedPolyline, tolerance: number): Float64Array {
  const { points, rank } = polyline;
  const count = points.length / 2;
  const keep = new Uint8Array(count);
  let inner = 0;
  for (let i = 0; i < count; i += 1) {
    if ((rank[i] as number) > tolerance) {
      keep[i] = 1;
      if (i > 0 && i < count - 1) inner += 1;
    }
  }
  const wanted = least(polyline) - Math.min(2, count);
  if (inner < wanted) {
    const best = [...rank.keys()]
      .filter((i) => i > 0 && i < count - 1)
      .sort((a, b) => (rank[b] as number) - (rank[a] as number))
      .slice(0, wanted);
    for (const i of best) keep[i] = 1;
  }
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) out.push(points[2 * i] as number, points[2 * i + 1] as number);
  }
  return Float64Array.from(out);
}

/** The diagonal of a polyline's points' bounds. */
function extent(points: Float64Array): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let at = 0; at < points.length; at += 2) {
    const x = points[at] as number;
    const y = points[at + 1] as number;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return minX > maxX ? 0 : Math.hypot(maxX - minX, maxY - minY);
}
