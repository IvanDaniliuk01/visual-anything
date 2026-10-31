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
 * - **What it takes the place of** (ADR 0083's clarification of F5): a shape whose face writes its name
 *   hangs no name tag under itself (`faceWritesName`), and one whose face draws `<icon/>` draws its icon
 *   nowhere else (`faceDrawsIcon`), as the face the exports draw decides, so that its bounds never
 *   change with the zoom.
 *
 * This module is pure, for the scene; `faceDraw.ts` draws.
 */
import {
  compileFace,
  faceDrawingText,
  layOutFace,
  type CleanedImage,
  type CompiledFace,
  type CompiledMarkup,
  type FaceBox,
  type FaceColor,
  type FaceDrawing,
  type FaceInput,
  type FaceLayoutOptions,
  type ResolvedFace,
} from '@visual-anything/core';
import type { LevelOfDetail } from '@visual-anything/schema';
import { bodyOf, cylinderCap, personHead, type Rect, type ShapeKind } from './geometry';
import { levelDetail } from './levels';
import { labelAreaOn } from './outlined';
import type { ElementShape } from './scene';

/** A picture a face draws by `<image ref="…"/>`: an image of its component's package. */
export interface FacePicture {
  image: CleanedImage;
  serial: number;
}

/** A shape's face: compiled, with what fills it from the shape's element. */
export interface ShapeFace {
  compiled: CompiledFace;
  input: FaceInput;
  /**
   * The images its `<image ref="…"/>` name, by their `ref`, as its component's package holds them;
   * absent when it names none, and a `ref` the package does not hold is left out.
   */
  pictures?: Readonly<Record<string, FacePicture>>;
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

/** How many face drawings were asked for, and how many of them had to be laid out, for the benchmark. */
const counts = { asked: 0, laidOut: 0 };

/**
 * How many face drawings were asked for since `resetFaceCounts`, and how many of them were laid out
 * rather than found kept: the benchmark's hit rate of the face layout cache (ADR 0083, F5).
 */
export function faceCounts(): { asked: number; laidOut: number } {
  return { ...counts };
}

export function resetFaceCounts(): void {
  counts.asked = 0;
  counts.laidOut = 0;
}

/** A face laid out with these options, kept: laid out again only for another size or variant. */
export function faceDrawingOf(face: ShapeFace, options: FaceLayoutOptions): FaceDrawing {
  counts.asked += 1;
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
    counts.laidOut += 1;
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

/**
 * Whether a face drawing draws anything: runs or boxes. One that draws neither is not drawn, and the
 * shape writes its name and detail instead, on the canvas and in the exports alike.
 */
export function facePaints(drawing: FaceDrawing): boolean {
  return drawing.runs.length > 0 || drawing.boxes.length > 0;
}

/** Whether the canvas cut a shape's face, which its hover card then gives back whole. */
export function faceCut(shape: ElementShape): boolean {
  return shapeFaceDrawing(shape)?.cut === true;
}

// ——— What a face takes the place of ——————————————————————————————————————————————————————————————

/**
 * What face a shape shows at the most detailed level it declares, as an export draws every detail:
 * the face, in the variant that level names; none when that level shows no face. Without levels, its
 * face as the canvas draws it wherever names are written; a row its own face, whatever variant its
 * container's level names. What the exports draw, and what decides the name tag and the icon a face
 * takes the place of, whatever the zoom (ADR 0083's clarifications of F3 and F5).
 */
export function deepestFaceShow(shape: {
  levels?: readonly LevelOfDetail[];
  row?: number;
}): FaceShow | undefined {
  if (shape.levels === undefined || shape.levels.length === 0) return {};
  return levelDetail(shape.levels, Number.POSITIVE_INFINITY, undefined, shape.row !== undefined)
    .detail.face;
}

/** A shape as what its face takes the place of reads it. */
interface Faced {
  face?: ShapeFace;
  levels?: readonly LevelOfDetail[];
  row?: number;
  collapsed?: unknown;
}

/** The markup a face is laid out from with a variant, or collapsed, as `layOutFace` picks it. */
function markupShown(
  compiled: CompiledFace,
  variant: string | undefined,
  collapsed: boolean,
): CompiledMarkup | undefined {
  if (variant !== undefined) return compiled.variants.get(variant) ?? compiled.markup;
  if (collapsed && compiled.collapsed !== undefined) {
    return compiled.variants.get(compiled.collapsed) ?? compiled.markup;
  }
  return compiled.markup;
}

type FaceNode = CompiledMarkup['nodes'][number];

const namesWritten = new WeakMap<CompiledMarkup, boolean>();

/** Whether a markup writes `{{name}}` in its text anywhere, under a condition or not. */
function markupWritesName(markup: CompiledMarkup): boolean {
  let known = namesWritten.get(markup);
  if (known === undefined) {
    known = markup.nodes.some(writesName);
    namesWritten.set(markup, known);
  }
  return known;
}

function writesName(node: FaceNode): boolean {
  switch (node.kind) {
    case 'text':
      return node.text.some((part) => typeof part !== 'string' && part.ref.kind === 'name');
    case 'element':
    case 'each':
      return node.children.some(writesName);
    case 'choice':
      return node.branches.some((branch) => writesName(branch.node));
  }
}

/**
 * Whether a shape's face writes its name (ADR 0083: "the name tag is not used while a face writes
 * `{{name}}`"): the markup it shows at its most detailed level (`deepestFaceShow`) holds a `{{name}}`
 * slot in its text, under a condition or not, or the face cannot be laid out and is drawn as the
 * shape's name. Such a shape hangs no name tag, so that its bounds, its hits, where its relations
 * attach and its layout never count an empty one. Read from the face alone, never from its layout.
 */
export function faceWritesName(shape: Faced): boolean {
  if (!shape.face) return false;
  const show = deepestFaceShow(shape);
  if (show === undefined) return false;
  const { compiled } = shape.face;
  if (!compiled.ok) return true;
  const markup = markupShown(compiled, show.variant, shape.collapsed !== undefined);
  return markup === undefined || markupWritesName(markup);
}

const drawsIcon = new WeakMap<ElementShape, boolean>();

/**
 * Whether a shape's face draws its own image by `<icon/>`, as the exports draw it: the face it shows
 * at its most detailed level, where the canvas lays it out, draws one. Its icon, or its header's
 * icon, is then drawn nowhere else; a drawing's picture stays.
 */
export function faceDrawsIcon(shape: ElementShape): boolean {
  // A solid's icon is drawn by `<icon/>` as an image's is (ADR 0075).
  if (!shape.face || (!shape.image && !shape.solid)) return false;
  let known = drawsIcon.get(shape);
  if (known === undefined) {
    const show = deepestFaceShow(shape);
    const drawing = show && shapeFaceDrawing(shape, show);
    known =
      drawing !== undefined &&
      facePaints(drawing) &&
      drawing.images.some((each) => each.kind === 'icon');
    drawsIcon.set(shape, known);
  }
  return known;
}

/** Whether a shape's own image, placed as it is, is drawn by its face rather than on its own. */
export function iconInFace(shape: ElementShape): boolean {
  const placement = shape.image?.placement ?? shape.solid?.placement;
  return (placement === 'icon' || placement === 'header') && faceDrawsIcon(shape);
}

const imageRefs = new WeakMap<CompiledFace, readonly string[]>();

/** The ids a face's `<image ref="…"/>` name, in its markup and its variants, each once. */
export function faceImageRefs(compiled: CompiledFace): readonly string[] {
  let refs = imageRefs.get(compiled);
  if (!refs) {
    const found = new Set<string>();
    const visit = (node: FaceNode): void => {
      if (node.kind === 'text') return;
      if (node.kind === 'choice') {
        for (const branch of node.branches) visit(branch.node);
        return;
      }
      if (node.kind === 'element' && node.tag === 'image' && node.ref !== undefined) {
        found.add(node.ref);
      }
      for (const child of node.children) visit(child);
    };
    for (const markup of [compiled.markup, ...compiled.variants.values()]) {
      for (const node of markup?.nodes ?? []) visit(node);
    }
    refs = [...found];
    imageRefs.set(compiled, refs);
  }
  return refs;
}

/**
 * Where a face draws a picture of this size in its box: fitted, its proportions kept, centred; none
 * for a picture or a box of no size. The canvas and the exports place it so.
 */
export function facePictureRect(box: Rect, width: number, height: number): Rect | undefined {
  const scale = Math.min(box.width / width, box.height / height);
  if (!(scale > 0) || !Number.isFinite(scale)) return undefined;
  return {
    x: box.x + (box.width - width * scale) / 2,
    y: box.y + (box.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}

// ——— How a face's boxes are painted ———————————————————————————————————————————————————————————————

/**
 * A piece a face's box is painted with (ADR 0083, F3), placed: a rectangle filled, with a radius for
 * a background, or a ring stroked, for a rounded box whose sides are alike. The canvas and the exports
 * paint the same pieces, so that they never draw a box differently.
 */
export type FacePiece =
  | { kind: 'fill'; rect: Rect; radius: number; color: FaceColor }
  | { kind: 'ring'; rect: Rect; radius: number; width: number; color: FaceColor };

/** A border's side, as a face drawing holds it. */
type FaceSide = NonNullable<NonNullable<FaceBox['borders']>['top']>;

/** The most dashes a dashed side draws, however long it is. */
const MOST_DASHES = 64;

/**
 * The pieces a face's box is painted with, placed at `at`, in order: its background; then its borders,
 * inside the box as a border-box draws them:
 *
 * - a rounded box whose four sides are alike and solid strokes one ring, half its width inside;
 * - a solid side is a band along the whole side;
 * - a dashed side is dashes three times its width long, two apart or more, the first and the last at
 *   its ends, at most 64; along a rounded box's straight stretch only, its corners left open.
 */
export function faceBoxPieces(box: FaceBox, at: { x: number; y: number }): FacePiece[] {
  const { width, height } = box;
  if (!(width > 0) || !(height > 0)) return [];
  const x = at.x + box.x;
  const y = at.y + box.y;
  const radius = Math.max(0, Math.min(box.radius, width / 2, height / 2));
  const pieces: FacePiece[] = [];
  if (box.background !== undefined) {
    pieces.push({ kind: 'fill', rect: { x, y, width, height }, radius, color: box.background });
  }
  const { top, right, bottom, left } = box.borders ?? {};
  const alike =
    top !== undefined &&
    top.style === 'solid' &&
    [right, bottom, left].every(
      (side) => side?.width === top.width && side.color === top.color && side.style === top.style,
    );
  if (alike && radius > 0) {
    const inset = top.width / 2;
    pieces.push({
      kind: 'ring',
      rect: { x: x + inset, y: y + inset, width: width - top.width, height: height - top.width },
      radius: Math.max(0, radius - inset),
      width: top.width,
      color: top.color,
    });
    return pieces;
  }
  const along = (side: FaceSide | undefined, horizontal: boolean, far: boolean) => {
    if (side === undefined || !(side.width > 0)) return;
    const thick = Math.min(side.width, horizontal ? height : width);
    const across = horizontal ? (far ? y + height - thick : y) : far ? x + width - thick : x;
    const start = horizontal ? x : y;
    const length = horizontal ? width : height;
    const piece = (from: number, long: number): FacePiece => ({
      kind: 'fill',
      rect: horizontal
        ? { x: from, y: across, width: long, height: thick }
        : { x: across, y: from, width: thick, height: long },
      radius: 0,
      color: side.color,
    });
    if (side.style === 'solid') {
      pieces.push(piece(start, length));
      return;
    }
    const corner = Math.min(radius, length / 2);
    for (const [from, long] of dashes(start + corner, length - 2 * corner, side.width)) {
      pieces.push(piece(from, long));
    }
  };
  along(top, true, false);
  along(bottom, true, true);
  along(left, false, false);
  along(right, false, true);
  return pieces;
}

/**
 * Where the dashes of a dashed side of this width go along a stretch: each three times the width long
 * and two widths apart or more, the gaps spread so that the first and the last meet its ends; one in
 * its middle when only one fits, and at most `MOST_DASHES`, longer then.
 */
function dashes(from: number, length: number, width: number): [number, number][] {
  if (!(length > 0)) return [];
  const dash = 3 * width;
  const gap = 2 * width;
  if (length <= dash + gap)
    return [[from + Math.max(0, (length - dash) / 2), Math.min(dash, length)]];
  const fits = Math.floor((length + gap) / (dash + gap));
  const count = Math.min(MOST_DASHES, fits);
  const long = fits > MOST_DASHES ? (length - (count - 1) * gap) / count : dash;
  const spread = (length - count * long) / (count - 1);
  const placed: [number, number][] = [];
  for (let at = 0; at < count; at++) placed.push([from + at * (long + spread), long]);
  return placed;
}
