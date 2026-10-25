/**
 * A uniform grid over the canvas that finds what lies at a point or across a rectangle by looking only
 * at the cells involved, so that pointing at one shape among 10,000 stays cheap.
 *
 * Each item has a slot, the order it was added in, which it keeps when it moves: a query lists items
 * in slot order. A copy (`clone`) shares the cells with the index it was made from until either
 * changes one, so that an edit that moves a few items copies only the cells they leave and enter.
 */
import type { Point, Rect } from './geometry';

/** How many rows a column of cells holds before its cell numbers repeat; a repeat only adds candidates. */
const ROWS = 1_048_576;
/**
 * The most cells an item enters, or a query visits. Positions come from project files and from
 * Claude, so a rectangle can be a billion units wide: an item that would enter more cells is kept
 * apart and looked at by every query, and a query over more cells looks at every item instead, so
 * that the work stays bounded whatever the coordinates.
 */
const MAX_CELLS = 4096;

export class SpatialIndex<T> {
  private items: T[] = [];
  /** Each slot's rectangle; undefined once its item is removed. */
  private bounds: (Rect | undefined)[] = [];
  /** The rectangles an item covers when it covers several, such as the segments of a route. */
  private parts: (readonly Rect[] | undefined)[] = [];
  private cells = new Map<number, number[]>();
  /**
   * The cells whose lists this index may change in place; undefined when it may change them all.
   * Cells shared with a copy are copied before they change.
   */
  private owned: Set<number> | undefined;
  /** The slots of the items that cover too many cells to enter them. */
  private large = new Set<number>();
  /** Which query last found each item, so that a query lists each item once without a set. */
  private seen: number[] = [];
  private queries = 0;
  private live = 0;

  constructor(private readonly cellSize = 256) {}

  /** How many items it holds. */
  get size(): number {
    return this.live;
  }

  /** Adds an item that covers `rect`, and says its slot. */
  insert(item: T, rect: Rect): number {
    const index = this.add(item, rect, undefined);
    this.place(index, [rect]);
    return index;
  }

  /**
   * Adds an item that covers several rectangles, such as a route by its segments: it is found where
   * any of them is, and enters only the cells they cover, not every cell of the rectangle around them.
   * Says its slot; an item with no rectangle gets none, -1.
   */
  insertParts(item: T, parts: readonly Rect[]): number {
    const [first] = parts;
    if (!first) return -1;
    if (parts.length === 1) return this.insert(item, first);
    const index = this.add(item, enclosing(parts), parts);
    this.place(index, parts);
    return index;
  }

  /** A copy that changes apart from this index, sharing its cells until either changes them. */
  clone(): SpatialIndex<T> {
    const copy = new SpatialIndex<T>(this.cellSize);
    copy.items = this.items.slice();
    copy.bounds = this.bounds.slice();
    copy.parts = this.parts.slice();
    copy.cells = new Map(this.cells);
    copy.owned = new Set();
    copy.seen = new Array<number>(this.items.length).fill(0);
    copy.live = this.live;
    copy.large = new Set(this.large);
    // The lists are now shared both ways.
    this.owned = new Set();
    return copy;
  }

  /** Moves the item in a slot to cover `rect` instead, keeping its slot. */
  replace(slot: number, rect: Rect): void {
    this.replaceParts(slot, [rect]);
  }

  /** Moves the item in a slot to cover these rectangles instead, keeping its slot. */
  replaceParts(slot: number, parts: readonly Rect[]): void {
    if (this.bounds[slot] === undefined) return;
    if (!this.large.delete(slot)) this.leave(slot);
    const [first] = parts;
    if (!first) {
      this.bounds[slot] = undefined;
      this.parts[slot] = undefined;
      this.live -= 1;
      return;
    }
    this.bounds[slot] = parts.length === 1 ? first : enclosing(parts);
    this.parts[slot] = parts.length === 1 ? undefined : parts;
    this.place(slot, parts);
  }

  /** Takes the item in a slot out; its slot stays empty. */
  remove(slot: number): void {
    this.replaceParts(slot, []);
  }

  /** The items whose rectangle meets `rect`, each once, in the order they were added. */
  query(rect: Rect): T[] {
    const stamp = ++this.queries;
    const found: number[] = [];
    this.candidates(rect, (index) => {
      if (this.seen[index] === stamp) return;
      if (this.covers(index, rect, meets)) {
        this.seen[index] = stamp;
        found.push(index);
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
   * none does. With `before`, only the items in slots before it count. It makes no list, so it can run
   * once for each of thousands of items.
   */
  highest(rect: Rect, score: (item: T) => number, before = Infinity): number {
    let best = -1;
    this.candidates(rect, (index) => {
      if (index >= before || !this.covers(index, rect, overlaps)) return;
      const value = score(this.items[index] as T);
      if (value > best) best = value;
    });
    return best;
  }

  /** Enters a slot in the cells its rectangles cover, or keeps it apart when they cover too many. */
  private place(slot: number, parts: readonly Rect[]): void {
    let cells = 0;
    for (const part of parts) cells += this.cellCount(part);
    // Written so that a rectangle whose coordinates are not finite numbers is kept apart too.
    if (!(cells <= MAX_CELLS)) {
      this.large.add(slot);
      return;
    }
    for (const part of parts) this.enter(slot, part);
  }

  /**
   * Visits the items that may meet `rect`, some more than once: those in the cells it covers and
   * those kept apart, or every item when it covers too many cells to visit them.
   */
  private candidates(rect: Rect, visit: (index: number) => void): void {
    if (!this.fewCells(rect)) {
      for (let index = 0; index < this.items.length; index++) visit(index);
      return;
    }
    this.eachCell(rect, (cell) => {
      for (const index of cell) visit(index);
    });
    for (const index of this.large) visit(index);
  }

  /** How many cells a rectangle covers; not a number when its coordinates are not. */
  private cellCount(rect: Rect): number {
    const size = this.cellSize;
    const columns = Math.floor((rect.x + rect.width) / size) - Math.floor(rect.x / size) + 1;
    const rows = Math.floor((rect.y + rect.height) / size) - Math.floor(rect.y / size) + 1;
    return columns * rows;
  }

  /** Whether a rectangle covers few enough cells to visit them; never when its coordinates are not numbers. */
  private fewCells(rect: Rect): boolean {
    return this.cellCount(rect) <= MAX_CELLS;
  }

  private add(item: T, rect: Rect, parts: readonly Rect[] | undefined): number {
    const index = this.items.length;
    this.items.push(item);
    this.bounds.push(rect);
    this.parts.push(parts);
    this.seen.push(0);
    this.live += 1;
    return index;
  }

  /** The list of a cell, copied first when it is shared with a copy of this index. */
  private writable(key: number): number[] | undefined {
    const cell = this.cells.get(key);
    if (!cell || this.owned === undefined || this.owned.has(key)) return cell;
    const copy = cell.slice();
    this.cells.set(key, copy);
    this.owned.add(key);
    return copy;
  }

  private enter(index: number, rect: Rect): void {
    this.eachCellKey(rect, (key) => {
      const cell = this.writable(key);
      // The parts of one item are entered one after another, so a repeat is always the last one.
      if (!cell) {
        this.cells.set(key, [index]);
        this.owned?.add(key);
      } else if (cell[cell.length - 1] !== index) cell.push(index);
    });
  }

  /** Takes a slot out of every cell it is in. */
  private leave(index: number): void {
    const parts = this.parts[index] ?? [this.bounds[index] as Rect];
    for (const part of parts) {
      this.eachCellKey(part, (key) => {
        if (!this.cells.get(key)?.includes(index)) return;
        const cell = this.writable(key) as number[];
        const at = cell.indexOf(index);
        if (at >= 0) cell.splice(at, 1);
      });
    }
  }

  private covers(index: number, rect: Rect, test: (a: Rect, b: Rect) => boolean): boolean {
    const bounds = this.bounds[index];
    if (bounds === undefined || !test(bounds, rect)) return false;
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
