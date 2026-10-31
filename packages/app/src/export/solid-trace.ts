/**
 * Tracing a solid's part buffer (ADR 0075): the pixels a part covers in its picture, outlined as SVG
 * path data, so that the SVG of a drawing with parts can write each anchored part as a transparent
 * path over the picture, carrying its ids, for a reader of the file to point at.
 *
 * A part covers the pixels its own geometry is drawn on and those of every part it holds, as pointing
 * finds the nearest anchored part holding what is under the pointer. Its outline is made of the edges
 * between the pixels it covers and those it does not, joined into closed contours, each corner kept
 * only where the edge turns, in pixels of the picture from its top left. Filled by the even-odd rule,
 * the contours cover exactly its pixels, holes and all.
 */
import type { SolidPart } from '@visual-anything/schema';
import type { SolidPartBuffer } from '../solids/views';

/** A part's place in a part buffer: the range of values it covers, and the box of their pixels. */
export interface TracedPart {
  /** The first and one past the last value of the buffer the part covers: its index plus one, on. */
  from: number;
  to: number;
  /** The box of the pixels it covers, in pixels; none when its picture shows none of it. */
  box?: { x: number; y: number; width: number; height: number };
}

/**
 * The values of a part buffer a part covers: its own, its index plus one, and those of every part it
 * holds, which follow it in depth-first order.
 */
export function partValues(
  parts: readonly SolidPart[],
  index: number,
): { from: number; to: number } {
  const inside = new Set([index]);
  let end = index + 1;
  for (; end < parts.length; end++) {
    const parent = parts[end]?.parent;
    if (parent === undefined || !inside.has(parent)) break;
    inside.add(end);
  }
  return { from: index + 1, to: end + 1 };
}

/** The boxes of the pixels of each value a buffer holds, by value, in one pass. */
export function valueBoxes(
  buffer: SolidPartBuffer,
): Map<number, { x1: number; y1: number; x2: number; y2: number }> {
  const boxes = new Map<number, { x1: number; y1: number; x2: number; y2: number }>();
  const { width, height, data } = buffer;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = data[y * width + x] as number;
      if (value === 0) continue;
      const box = boxes.get(value);
      if (!box) boxes.set(value, { x1: x, y1: y, x2: x + 1, y2: y + 1 });
      else {
        if (x < box.x1) box.x1 = x;
        if (x + 1 > box.x2) box.x2 = x + 1;
        if (y + 1 > box.y2) box.y2 = y + 1;
      }
    }
  }
  return boxes;
}

/**
 * The path data of the pixels whose values lie in `[from, to)`, within `box`, in pixels of the
 * picture: one closed contour of horizontal and vertical edges for each boundary, to be filled by the
 * even-odd rule. Empty when no pixel there holds such a value.
 */
export function tracedPathData(
  buffer: SolidPartBuffer,
  from: number,
  to: number,
  box: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: buffer.width,
    height: buffer.height,
  },
): string {
  const { data, width } = buffer;
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const w = Math.min(buffer.width, box.x + box.width) - x0;
  const h = Math.min(buffer.height, box.y + box.height) - y0;
  if (w <= 0 || h <= 0) return '';
  const covers = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const value = data[(y0 + y) * width + x0 + x] as number;
    return value >= from && value < to;
  };
  // Each corner of the box's pixels is a vertex; each edge leaves one, with what it covers on its
  // right, so that at most two edges leave a vertex, where two covered pixels meet at a corner only.
  const across = w + 1;
  const first = new Int32Array(across * (h + 1)).fill(-1);
  const second = new Int32Array(across * (h + 1)).fill(-1);
  const add = (start: number, end: number) => {
    if (first[start] === -1) first[start] = end;
    else second[start] = end;
  };
  const vertex = (x: number, y: number) => y * across + x;
  let edges = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!covers(x, y)) continue;
      if (!covers(x, y - 1)) {
        add(vertex(x, y), vertex(x + 1, y));
        edges += 1;
      }
      if (!covers(x + 1, y)) {
        add(vertex(x + 1, y), vertex(x + 1, y + 1));
        edges += 1;
      }
      if (!covers(x, y + 1)) {
        add(vertex(x + 1, y + 1), vertex(x, y + 1));
        edges += 1;
      }
      if (!covers(x - 1, y)) {
        add(vertex(x, y + 1), vertex(x, y));
        edges += 1;
      }
    }
  }
  if (edges === 0) return '';
  const take = (start: number): number => {
    const end = first[start] as number;
    if (end !== -1) {
      first[start] = second[start] as number;
      second[start] = -1;
    }
    return end;
  };
  let path = '';
  for (let start = 0; start < first.length; start++) {
    while (first[start] !== -1) {
      // One contour, from this vertex round to it again, its corners where it turns.
      const corners: number[] = [start];
      let at = start;
      let next = take(at);
      while (next !== -1) {
        corners.push(next);
        at = next;
        if (at === start) break;
        next = take(at);
      }
      path += contourData(corners, across, x0, y0);
    }
  }
  return path;
}

/** A contour's vertices as path data: a move, then an `H` or a `V` at each turn, closed. */
function contourData(vertices: readonly number[], across: number, x0: number, y0: number): string {
  const xOf = (vertex: number) => (vertex % across) + x0;
  const yOf = (vertex: number) => Math.floor(vertex / across) + y0;
  const start = vertices[0] as number;
  let data = `M${xOf(start)} ${yOf(start)}`;
  // The last vertex is the first again.
  const count = vertices.length - 1;
  for (let at = 1; at < count; at++) {
    const here = vertices[at] as number;
    const before = vertices[at - 1] as number;
    const after = vertices[at + 1] as number;
    const horizontal = yOf(before) === yOf(here);
    const turns = horizontal ? yOf(after) !== yOf(here) : xOf(after) !== xOf(here);
    if (!turns) continue;
    data += horizontal ? `H${xOf(here)}` : `V${yOf(here)}`;
  }
  return `${data}Z`;
}
