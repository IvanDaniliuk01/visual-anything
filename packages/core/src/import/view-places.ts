/**
 * Where the shapes of an imported view sit (ADR-0042, ADR-0040), from boxes the file gives on its own
 * canvas. A position is stored relative to the shape of the element's container when the view shows
 * that container too, and on the canvas when the view shows none of its containers. A shape whose own
 * container is out of the view but some container further out shows sits in that one, where no
 * position can be stored for it (ADR-0019 keys positions by the container an element sits in); layout
 * places it.
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
  for (const key of showing) {
    const container = containerOf.get(key);
    if (container === undefined) {
      placedIn.set(key, null);
    } else if (showing.has(container)) {
      placedIn.set(key, container);
      const inside = contents.get(container);
      if (inside) inside.push(key);
      else contents.set(container, [key]);
    } else if (!anyShown(container, containerOf, showing)) {
      placedIn.set(key, null);
    }
  }

  const resolved = new Map<string, Box>();
  for (const key of deepestFirst(showing, placedIn)) {
    const inside = contents.get(key);
    const fitted = fit && inside !== undefined ? fittedAround(inside, resolved) : undefined;
    const box = fitted ?? boxes.get(key);
    if (box !== undefined) resolved.set(key, box);
  }

  const positions: PlannedPosition[] = [];
  for (const key of showing) {
    const container = placedIn.get(key);
    const box = resolved.get(key);
    if (container === undefined || box === undefined) continue;
    let { x, y } = box;
    if (container !== null) {
      const outer = resolved.get(container);
      if (outer === undefined) continue;
      x -= outer.x;
      y -= outer.y;
    }
    positions.push({
      element: key,
      ...(container === null ? {} : { container }),
      x: coordinate(x),
      y: coordinate(y),
      ...size('width', box.width),
      ...size('height', box.height),
    });
  }
  return positions;
}

/** Whether a container, or one it sits in further out, is shown. */
function anyShown(
  container: string,
  containerOf: ReadonlyMap<string, string>,
  showing: ReadonlySet<string>,
): boolean {
  const seen = new Set<string>();
  for (let at: string | undefined = container; at !== undefined; at = containerOf.get(at)) {
    if (showing.has(at)) return true;
    if (seen.has(at)) return false;
    seen.add(at);
  }
  return false;
}

/** The shown shapes, those deepest inside others in the view first. */
function deepestFirst(
  showing: ReadonlySet<string>,
  placedIn: ReadonlyMap<string, string | null>,
): string[] {
  const depth = new Map<string, number>();
  const depthOf = (start: string): number => {
    const chain: string[] = [];
    let at: string | null | undefined = start;
    let base = 0;
    while (at !== null && at !== undefined) {
      const known = depth.get(at);
      if (known !== undefined) {
        base = known;
        break;
      }
      chain.push(at);
      at = placedIn.get(at);
      // The containment a plan holds has no cycle, but a chain is never followed twice regardless.
      if (chain.length > showing.size) break;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      base += 1;
      depth.set(chain[i] as string, base);
    }
    return depth.get(start) as number;
  };
  return [...showing]
    .map((key) => [key, depthOf(key)] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

/** The box around shapes, with room for their container's name; undefined when none has a box. */
function fittedAround(
  keys: readonly string[],
  resolved: ReadonlyMap<string, Box>,
): Box | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const key of keys) {
    const box = resolved.get(key);
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

function size(
  name: 'width' | 'height',
  value: number | undefined,
): { width?: number; height?: number } {
  if (value === undefined || !Number.isFinite(value) || value < 1) return {};
  const kept = rounded(Math.min(MAX_COORDINATE, value));
  return name === 'width' ? { width: kept } : { height: kept };
}
