/**
 * A shape's own outline in the scene (ADR 0066, ADR 0067): its free geometry fitted to the shape, or
 * a named part's outline fitted so that the part fills the shape, its proportions kept. Each is the
 * core's fitted outline with the place its top left sits from the top left of the shape's rectangle,
 * made once for each source and size, so that a shape that moves keeps the same object and the
 * incremental scene can tell by identity that it did not change. Hit testing, borders and drawing
 * read it here and through `draw.ts`.
 *
 * Pure, with no PixiJS, as the scene is.
 */
import {
  fitOutline,
  outlineExit,
  outlineHolds,
  readGeometry,
  type FittedOutline,
  type NamedPart,
  type Outline,
} from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import { borderPoint, holdsPoint, type Point, type Rect, type ShapeKind } from './geometry';
import { boxExit, nameTagOn, tagHolds, tagOfShape, type Tagged } from './nameTags';

/** What a shape's outline is made from, before it is fitted to the shape's size. */
export interface OutlineSource {
  readonly outline: Outline;
  /** The part of the outline's box that fills the shape, as a named part's bounds; absent: all of it. */
  readonly within?: Rect;
}

/** A fitted outline and where its top left sits: from a shape's rectangle, or on the canvas. */
export interface PlacedOutline {
  readonly fitted: FittedOutline;
  readonly x: number;
  readonly y: number;
}

/** An outline fitted to a shape, placed from the top left of the shape's rectangle. */
export interface ShapeOutline extends PlacedOutline {
  /** What it was fitted from, to fit it again to another size. */
  readonly source: OutlineSource;
}

const geometrySources = new WeakMap<Outline, OutlineSource>();
const partSources = new WeakMap<NamedPart, OutlineSource>();
const fittedBySource = new WeakMap<OutlineSource, Map<string, ShapeOutline>>();
/** The most sizes kept for one source; shapes come in few sizes. */
const SIZES_KEPT = 256;

/** The source of free geometry's outline, the same object for the same outline. */
export function geometrySource(outline: Outline): OutlineSource {
  let source = geometrySources.get(outline);
  if (!source) {
    source = { outline };
    geometrySources.set(outline, source);
  }
  return source;
}

/** The source of a named part's outline: its picture's, of which its bounds fill the shape. */
export function partSource(part: NamedPart): OutlineSource {
  let source = partSources.get(part);
  if (!source) {
    source = { outline: part.outline, within: part.bounds };
    partSources.set(part, source);
  }
  return source;
}

/**
 * An outline fitted to a rectangle of this size. Without `within`, the outline's whole box fills it,
 * as free geometry's does; with it, that part of the box fills it, its proportions kept and centred,
 * as a named part's bounds do within its picture's outline.
 */
export function outlineIn(source: OutlineSource, width: number, height: number): ShapeOutline {
  let sizes = fittedBySource.get(source);
  if (!sizes) {
    sizes = new Map();
    fittedBySource.set(source, sizes);
  }
  const key = `${width}x${height}`;
  let found = sizes.get(key);
  if (!found) {
    found = fitted(source, width, height);
    if (sizes.size >= SIZES_KEPT) sizes.delete(sizes.keys().next().value as string);
    sizes.set(key, found);
  }
  return found;
}

function fitted(source: OutlineSource, width: number, height: number): ShapeOutline {
  const { outline, within } = source;
  const scale = within ? Math.min(width / within.width, height / within.height) : NaN;
  if (!within || !(scale > 0) || !Number.isFinite(scale)) {
    return { source, fitted: fitOutline(outline, width, height), x: 0, y: 0 };
  }
  // Fitted to its own proportions, the outline's box is scaled by exactly `scale`, with no offset.
  return {
    source,
    fitted: fitOutline(outline, outline.width * scale, outline.height * scale),
    x: (width - within.width * scale) / 2 - within.x * scale,
    y: (height - within.height * scale) / 2 - within.y * scale,
  };
}

/**
 * The outline of free geometry, when the canvas draws it: none for geometry that is not geometry, or
 * that comes past what its file may hold (`drawnAsKind`, core's `geometryFindings`).
 */
export function geometryOutline(
  geometry: FreeGeometry | undefined,
  drawnAsKind: ReadonlySet<FreeGeometry>,
): Outline | undefined {
  if (geometry === undefined || drawnAsKind.has(geometry)) return undefined;
  const read = readGeometry(geometry);
  return read.ok ? read.outline : undefined;
}

/**
 * Whether two shapes' outlines are the same: the same object, or fitted to the same size and place
 * from outlines equal in every number, as when a command stores a geometry again.
 */
export function sameOutline(a: ShapeOutline | undefined, b: ShapeOutline | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.x !== b.x || a.y !== b.y) return false;
  if (a.fitted.width !== b.fitted.width || a.fitted.height !== b.fitted.height) return false;
  const [x, y] = [a.source, b.source];
  if (x.outline === y.outline) return sameBox(x.within, y.within);
  return sameBox(x.within, y.within) && JSON.stringify(x.outline) === JSON.stringify(y.outline);
}

function sameBox(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) return true;
  return (
    a !== undefined &&
    b !== undefined &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** A shape's outline placed on the canvas, as drawing it takes it; none for a shape without one. */
export function outlineAt(shape: {
  rect: Rect;
  outline?: ShapeOutline;
}): PlacedOutline | undefined {
  const { outline, rect } = shape;
  return outline && { fitted: outline.fitted, x: rect.x + outline.x, y: rect.y + outline.y };
}

/** What a shape is pointed at and attached to by: its kind and rectangle, or its own outline. */
export interface DrawnShape {
  kind: ShapeKind;
  rect: Rect;
  /** Its own outline, placed from the top left of `rect` (ADR 0066, ADR 0067). */
  outline?: ShapeOutline;
  /** A shape drawn by its picture is held by the picture's plate and its name band. */
  image?: { placement: string; box: Rect; band?: Rect };
  /** A solid shown in place of an image takes its place (ADR 0075). */
  solid?: { placement: string; box: Rect; band?: Rect };
}

/**
 * Whether a shape holds a point as it is drawn: by its own outline, to within `margin` of it, when it
 * has one, so that a point in a hole or beside the outline inside its box is not held; a drawing by
 * its plate and its name band; any other shape by its kind's outline. A shape that writes its name in
 * a name tag holds what its tag holds too (ADR 0066's clarification of 2026-10-27).
 */
export function shapeHolds(shape: DrawnShape, point: Point, margin = 0): boolean {
  const { outline, rect } = shape;
  if (tagOfShape(shape) && tagHolds(shape as unknown as Tagged, point, margin)) return true;
  if (outline) {
    const local = { x: point.x - rect.x - outline.x, y: point.y - rect.y - outline.y };
    return outlineHolds(outline.fitted, local, margin);
  }
  const image = shape.image ?? shape.solid;
  if (image?.placement === 'drawing') {
    return (
      holdsPoint('rectangle', image.box, point) ||
      (image.band !== undefined && holdsPoint('rectangle', image.band, point))
    );
  }
  return holdsPoint(shape.kind, rect, point);
}

/**
 * Where a line from `inside`, a point within a shape, toward `toward` last leaves the shape: its own
 * outline when it has one (ADR 0066), or else, as `borderPoint` finds it, its kind's; and where it
 * last leaves the shape and its name tag together, for a shape that writes its name in one, so that
 * the line never crosses the name (ADR 0066's clarification of 2026-10-27).
 */
export function shapeBorderPoint(shape: DrawnShape, inside: Point, toward: Point): Point {
  const body = bodyBorderPoint(shape, inside, toward);
  const tag = tagOfShape(shape) && nameTagOn(shape as unknown as Tagged);
  const leaves = tag && boxExit(tag, inside, toward);
  if (!leaves) return body;
  const along = (point: Point) =>
    (point.x - inside.x) * (toward.x - inside.x) + (point.y - inside.y) * (toward.y - inside.y);
  return along(leaves) > along(body) ? leaves : body;
}

function bodyBorderPoint(shape: DrawnShape, inside: Point, toward: Point): Point {
  const { outline, rect } = shape;
  if (outline) {
    const x = rect.x + outline.x;
    const y = rect.y + outline.y;
    const exit = outlineExit(
      outline.fitted,
      { x: inside.x - x, y: inside.y - y },
      { x: toward.x - x, y: toward.y - y },
    );
    if (exit) return { x: exit.x + x, y: exit.y + y };
  }
  return borderPoint(shape.kind, rect, inside, toward);
}
