/**
 * A uniform grid over the canvas that finds what lies at a point or across a rectangle by looking only
 * at the cells involved, so that pointing at one shape among 10,000 stays cheap.
 */
import type { Point, Rect } from './geometry';

export class SpatialIndex<T> {
  private readonly items: { item: T; rect: Rect }[] = [];
  private readonly cells = new Map<string, number[]>();

  constructor(private readonly cellSize = 256) {}

  /** Adds an item that covers `rect`. */
  insert(item: T, rect: Rect): void {
    const index = this.items.length;
    this.items.push({ item, rect });
    for (const key of this.keysOf(rect)) {
      const cell = this.cells.get(key);
      if (cell) cell.push(index);
      else this.cells.set(key, [index]);
    }
  }

  /** The items whose rectangle meets `rect`, each once, in the order they were added. */
  query(rect: Rect): T[] {
    const found = new Set<number>();
    for (const key of this.keysOf(rect)) {
      for (const index of this.cells.get(key) ?? []) {
        if (!found.has(index) && meets((this.items[index] as { rect: Rect }).rect, rect)) {
          found.add(index);
        }
      }
    }
    return [...found].sort((a, b) => a - b).map((index) => (this.items[index] as { item: T }).item);
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

  private *keysOf(rect: Rect): Generator<string> {
    const size = this.cellSize;
    const left = Math.floor(rect.x / size);
    const right = Math.floor((rect.x + rect.width) / size);
    const top = Math.floor(rect.y / size);
    const bottom = Math.floor((rect.y + rect.height) / size);
    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) yield `${column},${row}`;
    }
  }
}

/** Whether two rectangles share at least a point. */
export function meets(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
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
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
