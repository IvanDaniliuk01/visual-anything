/**
 * Where the shapes of an imported view sit (ADR-0042, ADR-0040), from boxes the file gives on its own
 * canvas. A position is stored relative to the shape of the element's container when the view shows
 * that container too, and on the canvas when the view shows none of its containers. A shape whose own
 * container is out of the view but some container further out shows sits in that one, where no
 * position can be stored for it (ADR-0019 keys positions by the container an element sits in); layout
 * places it. Everything here takes time in proportion to the shapes shown and the containers above
 * them, once each.
 */
import { MAX_COORDINATE } from '../commands/draft';
import type { PlannedPosition } from './plan';
import { rounded } from './reading';

/** A box on the file's own canvas, in canvas units. */
export interface Box {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** Room left around the contents of a fitted container, as the canvas leaves (scene.ts). */
const PADDING = 24;
/** Room above them, for the container's name. */
const HEADER = 48;
/** The size a shape the file gives no size is taken to have, Essence's. */
const DEFAULT_SIZE = { width: 160, height: 72 };

/**
 * The positions of the shapes a view shows, in the order shown. With `fit`, a container that holds
 * shapes the view shows is given the box around them, with room for its name, whatever box the file
 * gives it, as Structurizr draws boundaries; without, each keeps the box the file gives.
 */
export function placesInView(
  shown: readonly string[],
  containerOf: ReadonlyMap<string, string>,
  boxes: ReadonlyMap<string, Box>,
  fit: boolean,
): PlannedPosition[] {
  const showing = new Set(shown);
  /** The container each shown shape sits in, or `null` for the canvas; absent when none can be stored. */
  const placedIn = new Map<string, string | null>();
  const contents = new Map<string, string[]>();
  const known = new Map<string, boolean>();
  for (const key of showing) {
    const container = containerOf.get(key);
    if (container === undefined) {
      placedIn.set(key, null);
    } else if (showing.has(container)) {
      placedIn.set(key, container);
      const inside = contents.get(container);
      if (inside) inside.push(key);
      else contents.set(container, [key]);
    } else if (!anyShown(container, containerOf, showing, known)) {
      placedIn.set(key, null);
    }
  }

  // Only containers that hold shown shapes are fitted, those deepest inside others first.
  const fitted = new Map<string, Box>();
  const boxOf = (key: string) => fitted.get(key) ?? boxes.get(key);
  if (fit) {
    for (const key of deepestFirst([...contents.keys()], placedIn)) {
      const around = fittedAround(contents.get(key) as string[], boxOf);
      if (around !== undefined) fitted.set(key, around);
    }
  }

  const positions: PlannedPosition[] = [];
  for (const key of showing) {
    const container = placedIn.get(key);
    const box = boxOf(key);
    if (container === undefined || box === undefined) continue;
    let { x, y } = box;
    if (container !== null) {
      const outer = boxOf(container);
      if (outer === undefined) continue;
      x -= outer.x;
      y -= outer.y;
    }
    const position: PlannedPosition =
      container === null
        ? { element: key, x: coordinate(x), y: coordinate(y) }
        : { element: key, container, x: coordinate(x), y: coordinate(y) };
    const width = size(box.width);
    if (width !== undefined) position.width = width;
    const height = size(box.height);
    if (height !== undefined) position.height = height;
    positions.push(position);
  }
  return positions;
}

/** Whether a container, or one it sits in further out, is shown; each container's answer is kept. */
function anyShown(
  container: string,
  containerOf: ReadonlyMap<string, string>,
  showing: ReadonlySet<string>,
  known: Map<string, boolean>,
): boolean {
  const chain: string[] = [];
  const seen = new Set<string>();
  let found = false;
  for (let at: string | undefined = container; at !== undefined; at = containerOf.get(at)) {
    const answer = known.get(at);
    if (answer !== undefined) {
      found = answer;
      break;
    }
    if (showing.has(at)) {
      found = true;
      break;
    }
    if (seen.has(at)) break;
    seen.add(at);
    chain.push(at);
  }
  for (const each of chain) known.set(each, found);
  return found;
}

/** Containers in an order in which each comes after the shown containers it holds. */
function deepestFirst(
  containers: readonly string[],
  placedIn: ReadonlyMap<string, string | null>,
): string[] {
  // How many containers deep each is, counted from the canvas, memoized along each chain.
  const depth = new Map<string, number>();
  for (const start of containers) {
    const chain: string[] = [];
    let base = 0;
    for (let at: string | null | undefined = start; at !== null && at !== undefined;) {
      const known = depth.get(at);
      if (known !== undefined) {
        base = known;
        break;
      }
      chain.push(at);
      // A plan's containment has no cycle, but a chain is never followed past every container.
      if (chain.length > containers.length + 1) break;
      at = placedIn.get(at);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      base += 1;
      depth.set(chain[i] as string, base);
    }
  }
  return [...containers].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
}

/** The box around shapes, with room for their container's name; undefined when none has a box. */
function fittedAround(
  keys: readonly string[],
  boxOf: (key: string) => Box | undefined,
): Box | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const key of keys) {
    const box = boxOf(key);
    if (box === undefined) continue;
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + (box.width ?? DEFAULT_SIZE.width));
    bottom = Math.max(bottom, box.y + (box.height ?? DEFAULT_SIZE.height));
  }
  if (left === Infinity) return undefined;
  return {
    x: left - PADDING,
    y: top - HEADER,
    width: right - left + 2 * PADDING,
    height: bottom - top + HEADER + PADDING,
  };
}

/** A coordinate within the canvas the file format allows, rounded to hundredths. */
export function coordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return rounded(Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, value)));
}

/** A size within the canvas the file format allows; none when the file gives none that is positive. */
function size(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 1) return undefined;
  return rounded(Math.min(MAX_COORDINATE, value));
}
