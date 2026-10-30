/**
 * Faces on the canvas (ADR 0083, F2): a shape whose appearance has a face draws its body as always,
 * and inside it the face drawing the core lays out (`layOutFace`): its boxes, its bands and its runs
 * as glyph quads, in one drawing per shape among its tile's labels, in the colors its tokens take on
 * the shape's fill in the theme shown.
 *
 * - **Laid out once.** A face drawing is kept for each face and what fills it (`ShapeFace`, which
 *   the scene keeps per element), and for each size, variant and collapsed state, so that panning
 *   and zooming never lay anything out; a tile lays out only the faces it writes.
 * - **Sizes before layout.** A face of size `content` gives its shape its height, and a face over
 *   rows or contents gives its shape a header as tall as what comes before `<rows/>` or
 *   `<contents/>`; the scene works both out before layout, which reads them like any size.
 * - **Where it is drawn:** in the shape's label area, in its free geometry's `label` rectangle, over a
 *   row's band, or in the header of a shape that draws rows or holds contents.
 *
 * This module is pure, for the scene; `faceDraw.ts` draws.
 */
import {
  compileFace,
  faceDrawingText,
  layOutFace,
  type CompiledFace,
  type FaceDrawing,
  type FaceInput,
  type FaceLayoutOptions,
  type ResolvedFace,
} from '@visual-anything/core';
import { bodyOf, cylinderCap, personHead, type Rect, type ShapeKind } from './geometry';
import { labelAreaOn } from './outlined';
import type { ElementShape } from './scene';

/** A shape's face: compiled, with what fills it from the shape's element. */
export interface ShapeFace {
  compiled: CompiledFace;
  input: FaceInput;
}

/** What a tile writes of its shapes' faces: the variant its level names, if any (ADR 0055). */
export interface FaceShow {
  variant?: string;
}

const compiledFaces = new WeakMap<ResolvedFace, CompiledFace>();

/** A resolved face compiled, once for each resolved face: the looks the scene keeps hold it. */
export function compiledFaceOf(face: ResolvedFace): CompiledFace {
  let compiled = compiledFaces.get(face);
  if (!compiled) {
    compiled = compileFace(face);
    compiledFaces.set(face, compiled);
  }
  return compiled;
}

/** The face drawings kept for each face, by size, variant and collapsed state. */
const drawings = new WeakMap<ShapeFace, Map<string, FaceDrawing>>();
/** The most drawings kept for one face, which a shape resized by hand runs through. */
const KEPT_PER_FACE = 8;

/** A face laid out with these options, kept: laid out again only for another size or variant. */
export function faceDrawingOf(face: ShapeFace, options: FaceLayoutOptions): FaceDrawing {
  let kept = drawings.get(face);
  if (!kept) {
    kept = new Map();
    drawings.set(face, kept);
  }
  const key = `${options.width} ${options.height ?? ''} ${options.variant ?? ''} ${
    options.collapsed ? 1 : 0
  }`;
  let drawing = kept.get(key);
  if (!drawing) {
    drawing = layOutFace(face.compiled, face.input, options);
    if (kept.size >= KEPT_PER_FACE) kept.delete(kept.keys().next().value as string);
    kept.set(key, drawing);
  }
  return drawing;
}

/**
 * How tall a face of size `content` is at a width: what the shape's height becomes. A face that
 * could not be drawn, drawn as the shape's name, is as tall as that.
 */
export function faceContentHeight(face: ShapeFace, width: number, collapsed = false): number {
  return Math.ceil(faceDrawingOf(face, { width, ...(collapsed ? { collapsed } : {}) }).height);
}

/**
 * How tall the header a face gives a shape that draws rows or holds contents is at a width: what
 * comes before its `<rows/>` or `<contents/>`, or the whole face without either, never lower than
 * `least`, the canvas's own header, so that its toggle, its name and its relations keep their room.
 */
export function faceHeader(face: ShapeFace, width: number, least: number): number {
  const drawing = faceDrawingOf(face, { width });
  const region = drawing.regions.find((each) => each.kind === 'rows' || each.kind === 'contents');
  return Math.max(least, Math.ceil(region === undefined ? drawing.height : region.y));
}

/**
 * The share of a shape's height its label area takes, for a kind: a face of size `content` makes
 * the shape tall enough for its area to hold it.
 */
export function heightForFace(kind: ShapeKind, width: number, faceHeight: number): number {
  if (kind === 'rectangle' || kind === 'rounded-rectangle') return faceHeight;
  if (kind === 'ellipse') return Math.ceil(faceHeight / 0.7);
  // A person's head and a cylinder's caps take room by the shape's size: found in a few steps.
  let height = faceHeight;
  for (let step = 0; step < 4; step++) {
    const area = areaOfKind(kind, { x: 0, y: 0, width, height });
    height += faceHeight - area.height;
  }
  return Math.ceil(height);
}

/** The width a face is laid out at in a shape of this kind and width, in its label area. */
export function faceWidthIn(kind: ShapeKind, width: number): number {
  return kind === 'ellipse' ? width * 0.7 : width;
}

function areaOfKind(kind: ShapeKind, rect: Rect): Rect {
  const { x, y, width, height } = rect;
  if (kind === 'person') {
    const top = personHead(rect) * 1.6;
    return { x, y: y + top, width, height: height - top };
  }
  if (kind === 'cylinder') {
    const cap = cylinderCap(rect);
    return { x, y: y + 2 * cap, width, height: height - 3 * cap };
  }
  if (kind === 'ellipse') {
    return { x: x + width * 0.15, y: y + height * 0.15, width: width * 0.7, height: height * 0.7 };
  }
  return rect;
}

/**
 * Where a shape's face is drawn: over a row's band; in the header of a shape that draws rows or
 * holds contents; on a collapsed container's sheet; in its free geometry's `label` rectangle; in
 * its kind's label area otherwise.
 */
export function faceRect(shape: ElementShape): Rect {
  if (shape.row !== undefined) return shape.rect;
  const body = bodyOf(shape);
  if (shape.collapsed !== undefined) return body;
  if (shape.rowCount !== undefined || shape.holdsContents) {
    return { ...body, height: Math.min(body.height, shape.header ?? body.height) };
  }
  if (shape.outline) return labelAreaOn({ ...shape, outline: shape.outline });
  return areaOfKind(shape.kind, shape.rect);
}

/** How a shape's face is laid out where the canvas draws it, with a level's variant. */
export function faceOptionsOf(shape: ElementShape, show: FaceShow = {}): FaceLayoutOptions {
  const rect = faceRect(shape);
  return {
    width: rect.width,
    height: rect.height,
    ...(show.variant === undefined ? {} : { variant: show.variant }),
    ...(shape.collapsed === undefined ? {} : { collapsed: true }),
  };
}

/** The face drawing a shape shows, laid out where the canvas draws it; none without a face. */
export function shapeFaceDrawing(
  shape: ElementShape,
  show: FaceShow = {},
): FaceDrawing | undefined {
  return shape.face && faceDrawingOf(shape.face, faceOptionsOf(shape, show));
}

/**
 * What a shape's face says, in reading order, a paragraph a line (ADR 0083): the whole face, laid out
 * at the width the canvas draws it at with no height to cut it, for its announcement and its hover
 * card. None without a face.
 */
export function faceText(shape: ElementShape): string | undefined {
  if (!shape.face) return undefined;
  const drawing = faceDrawingOf(shape.face, {
    width: faceRect(shape).width,
    ...(shape.collapsed === undefined ? {} : { collapsed: true }),
  });
  return faceDrawingText(drawing);
}

/**
 * What a shape's face says beyond its name and its component's name, which an announcement says
 * already: its paragraphs joined by commas. None without a face.
 */
export function faceDetail(shape: ElementShape, componentName: string): string | undefined {
  const text = faceText(shape);
  if (text === undefined) return undefined;
  return text
    .split('\n')
    .filter((line) => line !== shape.name && line !== componentName)
    .join(', ');
}

/** Whether the canvas cut a shape's face, which its hover card then gives back whole. */
export function faceCut(shape: ElementShape): boolean {
  return shapeFaceDrawing(shape)?.cut === true;
}
