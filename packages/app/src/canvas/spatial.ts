/**
 * A uniform grid over the canvas that finds what lies at a point or across a rectangle by looking only
 * at the cells involved, so that pointing at one shape among 10,000 stays cheap.
 */
import type { Point, Rect } from './geometry';

/** How many rows a column of cells holds before its cell numbers repeat; a repeat only adds candidates. */
const ROWS = 1_048_576;

export class SpatialIndex<T> {
  private readonly items: T[] = [];
  private readonly bounds: Rect[] = [];
  /** The rectangles an item covers when it covers several, such as the segments of a route. */
  private readonly parts: (readonly Rect[] | undefined)[] = [];
  private readonly cells = new Map<number, number[]>();
  /** Which query last found each item, so that a query lists each item once without a set. */
  private readonly seen: number[] = [];
  private queries = 0;

  constructor(private readonly cellSize = 256) {}

  /** How many items it holds. */
  get size(): number {
    return this.items.length;
  }

  /** Adds an item that covers `rect`. */
  insert(item: T, rect: Rect): void {
    const index = this.add(item, rect, undefined);
    this.enter(index, rect);
  }

  /**
   * Adds an item that covers several rectangles, such as a route by its segments: it is found where
   * any of them is, and enters only the cells they cover, not every cell of the rectangle around them.
   */
  insertParts(item: T, parts: readonly Rect[]): void {
    const [first] = parts;
    if (!first) return;
    if (parts.length === 1) {
      this.insert(item, first);
      return;
    }
    const index = this.add(item, enclosing(parts), parts);
    for (const part of parts) this.enter(index, part);
  }

  /** The items whose rectangle meets `rect`, each once, in the order they were added. */
  query(rect: Rect): T[] {
    const stamp = ++this.queries;
    const found: number[] = [];
    this.eachCell(rect, (cell) => {
      for (const index of cell) {
        if (this.seen[index] === stamp) continue;
        if (this.covers(index, rect, meets)) {
          this.seen[index] = stamp;
          found.push(index);
        }
      }
    });
    found.sort((a, b) => a - b);
    return found.map((index) => this.items[index] as T);
  }

  /** The items whose rectangle holds `point`, grown by `tolerance` on every side. */
  at(point: Point, tolerance = 0): T[] {
    return this.query({
      x: point.x - tolerance,
      y: point.y - tolerance,
      width: 2 * tolerance,
      height: 2 * tolerance,
    });
  }

  /**
   * The highest score among the items that overlap `rect`, sharing more than a side with it; -1 when
   * none does. It makes no list, so it can run once for each of thousands of items.
   */
  highest(rect: Rect, score: (item: T) => number): number {
    let best = -1;
    this.eachCell(rect, (cell) => {
      for (const index of cell) {
        if (!this.covers(index, rect, overlaps)) continue;
        const value = score(this.items[index] as T);
        if (value > best) best = value;
      }
    });
    return best;
  }

  private add(item: T, rect: Rect, parts: readonly Rect[] | undefined): number {
    const index = this.items.length;
    this.items.push(item);
    this.bounds.push(rect);
    this.parts.push(parts);
    this.seen.push(0);
    return index;
  }

  private enter(index: number, rect: Rect): void {
    this.eachCellKey(rect, (key) => {
      const cell = this.cells.get(key);
      // The parts of one item are entered one after another, so a repeat is always the last one.
      if (!cell) this.cells.set(key, [index]);
      else if (cell[cell.length - 1] !== index) cell.push(index);
    });
  }

  private covers(index: number, rect: Rect, test: (a: Rect, b: Rect) => boolean): boolean {
    if (!test(this.bounds[index] as Rect, rect)) return false;
    const parts = this.parts[index];
    return parts === undefined || parts.some((part) => test(part, rect));
  }

  private eachCell(rect: Rect, visit: (cell: readonly number[]) => void): void {
    this.eachCellKey(rect, (key) => {
      const cell = this.cells.get(key);
      if (cell) visit(cell);
    });
  }

  private eachCellKey(rect: Rect, visit: (key: number) => void): void {
    const size = this.cellSize;
    const left = Math.floor(rect.x / size);
    const right = Math.floor((rect.x + rect.width) / size);
    const top = Math.floor(rect.y / size);
    const bottom = Math.floor((rect.y + rect.height) / size);
    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) visit(column * ROWS + row);
    }
  }
}

/** Whether two rectangles share at least a point: touching ones do. */
export function meets(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

/** Whether the insides of two rectangles share a point. Rectangles that only touch do not overlap. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether `inner` lies entirely inside `outer`. */
export function within(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** The rectangle spanned by two corners, whichever way they were dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** The bounding rectangle of some points. */
export function rectAround(points: readonly Point[]): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The rectangles along a route, one for each of its segments. */
export function segmentsOf(points: readonly Point[]): Rect[] {
  if (points.length < 2) return points.length === 1 ? [rectAround(points)] : [];
  const parts: Rect[] = [];
  for (let each = 1; each < points.length; each++) {
    parts.push(rectBetween(points[each - 1] as Point, points[each] as Point));
  }
  return parts;
}

function enclosing(rects: readonly Rect[]): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
