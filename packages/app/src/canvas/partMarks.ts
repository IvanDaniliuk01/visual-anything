/**
 * What is drawn over anchored parts (ADR 0067), worked out apart from drawing it, so that the
 * canvas's part layer (`partsDraw.ts`) and the exports (`export/svg.ts`) draw the same marks: which
 * parts of which drawing get a cover, a veil, their own picture, an overlay's fill, stroke, opacity
 * and badge, and how an outline's holes are cut from its fills. Pure, with no PixiJS, as the scene is,
 * so that the exports run where there is no canvas.
 */
import { evenOddHolds, type FlatContour, type OverlayLook } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { outlineAt, type PlacedOutline } from './outlines';
import { overlayLookOfPart } from './overlays/decorate';
import type { ElementShape, Scene } from './scene';

/** How wide an overlay's stroke is drawn along a part's outline, in canvas units. */
export const OVERLAY_STROKE = 2;
/** The size a badge is written at, as a shape's detail is. */
export const BADGE_SIZE = 11;
/** How wide the halo of the part's main color around a badge is. */
export const BADGE_HALO = 3;

/** What is drawn over one anchored part. */
export interface PartMark {
  shape: ElementShape;
  outline: PlacedOutline;
  /** Its main color, which it is filled in far out and while its own picture is not ready. */
  color: Color;
  /** Whether the emphasis draws it faintly. */
  faint: boolean;
  /** Whether a filter hides it: it is covered with its drawing's fill. */
  covered: boolean;
  /** Whether it is faint in a drawing at full strength, which lays a veil of the drawing's fill. */
  veiled: boolean;
  /** Whether it is at full strength in a faint drawing, which draws it with its own picture. */
  ownPicture: boolean;
  /** What an overlay gives it. */
  fill?: Color;
  stroke?: Color;
  /** How opaque an overlay leaves it, below 1; the rest is a veil of the drawing's fill. */
  opacity?: number;
  /** The badge an overlay writes at its label point. */
  badge?: string;
}

/** A drawing with parts and what is drawn over its parts, in its picture's order. */
export interface DrawingMarks {
  drawing: ElementShape;
  /** The shape it sits in, whose fill is behind it; none in World, where the canvas is. */
  holder?: ElementShape;
  /** Whether the emphasis draws the drawing faintly. */
  faint: boolean;
  parts: PartMark[];
}

/**
 * What is drawn over the anchored parts of a scene, drawing by drawing in drawing order, and each
 * drawing's parts in its picture's order; `hidden` and `dimmed` are what the emphasis and a drag leave
 * out and draw faintly. A drawing left out leaves out its parts.
 */
export function partMarksOf(
  scene: Scene,
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string>,
  lookOf: (shape: ElementShape) => OverlayLook | undefined = overlayLookOfPart,
): DrawingMarks[] {
  const { shapes } = scene;
  if (!shapes.some((shape) => shape.picture !== undefined)) return [];
  const byKey = new Map<string, ElementShape>();
  for (const shape of shapes) byKey.set(shape.key, shape);
  const drawings = new Map<string, DrawingMarks>();
  const order = scene.drawing ?? shapes.map((_, at) => at);
  for (const at of order) {
    const shape = shapes[at] as ElementShape;
    if (shape.picture !== undefined) {
      if (hidden.has(shape.key)) continue;
      const holder =
        shape.containerShape === undefined ? undefined : byKey.get(shape.containerShape);
      drawings.set(shape.key, {
        drawing: shape,
        ...(holder ? { holder } : {}),
        faint: dimmed.has(shape.key),
        parts: [],
      });
      continue;
    }
    if (shape.part?.inDrawing !== true || shape.containerShape === undefined) continue;
    const marks = drawings.get(shape.containerShape);
    const outline = outlineAt(shape);
    if (!marks || !outline) continue;
    const look = lookOf(shape);
    const faint = dimmed.has(shape.key);
    const covered = hidden.has(shape.key);
    marks.parts.push({
      shape,
      outline,
      color: shape.part.color,
      faint,
      covered,
      veiled: !covered && faint && !marks.faint,
      ownPicture: !covered && !faint && marks.faint,
      ...(look?.fill === undefined ? {} : { fill: look.fill }),
      ...(look?.stroke === undefined ? {} : { stroke: look.stroke }),
      ...(look?.opacity !== undefined && look.opacity < 1 ? { opacity: look.opacity } : {}),
      ...(look?.badge === undefined || look.badge === '' ? {} : { badge: look.badge }),
    });
  }
  return [...drawings.values()].filter((each) => each.parts.length > 0);
}

/**
 * The holes cut from each fill of a flattened outline: each hole from the smallest fill around its
 * first point, so that an island inside a hole is filled again. A hole no fill holds is cut from none.
 */
export function holesByFill(
  flat: readonly FlatContour[],
  fills: readonly FlatContour[],
): Map<FlatContour, FlatContour[]> {
  const holesIn = new Map<FlatContour, FlatContour[]>();
  for (const hole of flat) {
    if (hole.role !== 'hole' || hole.points.length < 6) continue;
    const x = hole.points[0] as number;
    const y = hole.points[1] as number;
    let around: FlatContour | undefined;
    let area = Infinity;
    for (const fill of fills) {
      if (x < fill.minX || x > fill.maxX || y < fill.minY || y > fill.maxY) continue;
      const size = (fill.maxX - fill.minX) * (fill.maxY - fill.minY);
      if (size < area && evenOddHolds(fill.points, x, y)) {
        around = fill;
        area = size;
      }
    }
    if (around) holesIn.set(around, [...(holesIn.get(around) ?? []), hole]);
  }
  return holesIn;
}
