/**
 * The drawing step: turns parts of a scene into PixiJS graphics and text. It only draws; where
 * everything goes was decided by `buildScene`. Text is placed with anchors and given the room it may
 * take inside its shape, so that a label never leaves its shape; drawing does not depend on font
 * metrics beyond that. The canvas draws a scene in tiles with these building blocks.
 */
import { Container, Graphics, Text, type CanvasTextOptions, type TextStyleOptions } from 'pixi.js';
import {
  CANVAS_BACKGROUNDS,
  evenOddHolds,
  flattenOutline,
  simplifyOutline,
  type FlatContour,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { t } from '../i18n';
import type { Dash } from './geometry';
import {
  SHEET,
  bodyOf,
  cylinderCap,
  grow,
  directionOf,
  distance,
  personHead,
  toggleRect,
  untilArrowhead,
  type Arrowhead,
  type Point,
  type Rect,
  type ShapeKind,
} from './geometry';
import {
  ARROW_STROKE,
  CANVAS_BACKGROUND,
  NOTE_FILL,
  NOTE_STROKE,
  NOTE_TEXT,
  RELATION_LABEL_HALO,
  RELATION_LABEL_TEXT,
  contrastRatio,
  outlineColorOf,
  readableTextColors,
} from './colors';
import { COUNT_LINE_TOP, headerLines } from './collapse';
import { drawLeavingMark, writeLeavingMark } from './leavingMark';
import {
  TAG_DETAIL_LINE,
  TAG_PADDING,
  markLinesWithTag,
  nameTagOf,
  nameTagOn,
  outlinedDetailOf,
  placedTag,
  tagOfShape,
  tagRadius,
  type NameTag,
} from './nameTags';
import {
  LEAST_HEADER_WIDTH,
  LEAST_LABEL_HEIGHT,
  PART_NAME_LINE,
  PART_NAME_SIZE,
  headerStretch,
  labelAreaOn,
  markContours,
  nameLinesInside,
  partNameLines,
  placedPoints,
  showsContents,
  simplifiedLinesOf,
  writesNameBelow,
  type Outlined,
} from './outlined';
import { outlineAt, type PlacedOutline, type ShapeOutline } from './outlines';
import { drawDestinationMark } from './destinationMark';
import { patternMatrix, patternTexture } from './patterns';
import { drawnAsCurve, drawnCurve, strokeCurve } from './routing/curves';
import { LIGHT_ROWS, drawRowsShape, rowsBlocks, writeRowsText, type RowColors } from './rowsDraw';
import {
  ARROW_WIDTH,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
} from './scene';
import {
  bandRooms,
  besideImage,
  blockRectOf,
  bodyRectOf,
  headerShift,
  nameBandOf,
} from './shape-images';
import type { RoutePiece } from './tiles';
import type { EmphasisRun } from '@visual-anything/core';
import type { Measure } from '../text/layout';
import { BLOCK_INSET, DETAIL_SIZE, NAME_SIZE, placeTextBlock, type TextBlock } from './textBlock';

/** How big a note's text is written. */
const NOTE_SIZE = 13;

/** The fonts text is drawn in, first available first. */
export const FONT_FAMILY = [
  'system-ui',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'sans-serif',
];

/** What a label names: an element, its component, or a relation. */
export type LabelKind = 'name' | 'detail' | 'relation';

/**
 * Makes what a label is drawn with, from text laid out by this module. `room` is the height the label
 * may take inside its shape; a factory that cannot fit the text in it gives nothing.
 */
export interface TextFactory {
  /** `runs`, on a detail, are its text emphasis (ADR 0082), drawn in place of `options.text`. */
  (
    options: CanvasTextOptions,
    kind: LabelKind,
    room?: number,
    runs?: readonly EmphasisRun[],
  ): Container | undefined;
  /** How it measures a detail, so that a shape's text block is placed as it draws; Roboto's otherwise. */
  measure?: Measure;
  /** How it measures a name. */
  measureName?: (text: string) => number;
  /** How it draws a note's text, as canvas text otherwise. */
  note?: (note: NoteShape, color: Color) => Container;
}

/** How a label is written: where, in what room, and with what text emphasis. */
type Write = (
  options: CanvasTextOptions,
  detail: boolean,
  room: number,
  runs?: readonly EmphasisRun[],
) => Container | undefined;

/** Labels as canvas text: sharp at any resolution, but slow to make by the thousand. */
export const canvasText: TextFactory = (options) => new Text(options);
const SHAPE_STROKE_WIDTH = 1.5;
/** How wide the outlines of plain blocks are, inside them, so that they show far out. */
const BLOCK_OUTLINE = SHAPE_STROKE_WIDTH * 4;
/** The contrast below which a block's fill needs an outline to stand out from the canvas, from WCAG 1.4.11. */
const BLOCK_CONTRAST = 3;
const TEXT_INSET = 12;

/** A label that can be shortened: its text, and how tall it comes out. */
export interface FittingText {
  text: string;
  readonly height: number;
  destroy(): void;
}

/**
 * Fits a label in the room its shape gives it: a label too tall loses the end of its text, with "…"
 * in its place, once and, when that is not enough, once more; one that still does not fit is
 * destroyed, and nothing is shown.
 */
export function fitText<T extends FittingText>(label: T, room: number | undefined): T | undefined {
  if (room === undefined || label.height <= room) return label;
  const full = label.text;
  let keep = Math.floor((full.length * room) / label.height) - 1;
  for (let attempt = 0; attempt < 2 && keep > 0; attempt++) {
    label.text = `${full.slice(0, keep).trimEnd()}…`;
    if (label.height <= room) return label;
    keep = Math.floor(keep * 0.7);
  }
  label.destroy();
  return undefined;
}

const outlinedFills = new Map<Color, boolean>();

/**
 * Whether a block of this fill needs an outline to be told apart from the canvas: from either theme's,
 * so that a block in stored colors is drawn alike in both themes (ADR-0033).
 */
function needsOutline(fill: Color): boolean {
  let outlined = outlinedFills.get(fill);
  if (outlined === undefined) {
    outlined =
      contrastRatio(fill, CANVAS_BACKGROUNDS.light) < BLOCK_CONTRAST ||
      contrastRatio(fill, CANVAS_BACKGROUNDS.dark) < BLOCK_CONTRAST;
    outlinedFills.set(fill, outlined);
  }
  return outlined;
}

/**
 * Draws element shapes as plain blocks of their colour: what the eye can tell apart when a whole large
 * view is on screen, at a fraction of the cost of their outlines. Containers keep an outline, which
 * shows the structure, and so do blocks whose fill would not stand out from the canvas.
 *
 * An outline is a block of its colour under a smaller block of the fill, inside the shape: blocks
 * cost far less to draw than strokes, and all those of one colour are drawn together. The outlines
 * then come before every fill, so the shapes must not overlap; `inOrder` draws each one whole, in
 * order.
 *
 * A shape with its own outline (ADR 0066, ADR 0067) is its simplified outline, filled without its
 * holes, never its box, as its silhouette is too (ADR 0055's clarification): a polygon of its fill,
 * outlined inside by a stroke of its colour where a block would be. A shape's name tag is a block of
 * its fill under it, outlined as the shape is (ADR 0066's clarification of 2026-10-27).
 */
export function drawShapeBlocks(
  graphics: Graphics,
  shapes: readonly ElementShape[],
  inOrder = false,
  rowColors: RowColors = LIGHT_ROWS,
): void {
  const outlines = new Map<Color, Rect[]>();
  const fills = new Map<Color, Rect[]>();
  const silhouettes = new Silhouettes();
  // An outline of plain blocks is a few canvas units wide, far less than a pixel far out.
  const hairlines = new Hairlines();
  /** A block of `fill`, outlined inside in `stroke` when given; drawn at once when in order. */
  const block = (rect: Rect, fill: Color, stroke: Color | undefined) => {
    const inner = stroke === undefined ? rect : grow(rect, -BLOCK_OUTLINE);
    const filled = inner.width > 0 && inner.height > 0;
    if (stroke !== undefined) hairlines.add(stroke, 'block', rect);
    if (inOrder) {
      if (stroke !== undefined) fillRects(graphics, stroke, [rect]);
      if (filled) fillRects(graphics, fill, [inner]);
      return;
    }
    if (stroke !== undefined) addRect(outlines, stroke, rect);
    if (filled) addRect(fills, fill, inner);
  };
  for (const shape of shapes) {
    const tag = nameTagOn(shape);
    if (shape.outline) {
      const fill = fillOf(shape);
      const outlined = isContainer(shape) || needsOutline(fill);
      const rim = outlined ? outlineColorOf(shape) : undefined;
      silhouettes.add({ rect: shape.rect, outline: shape.outline }, fill, rim, hairlines);
      if (inOrder) silhouettes.draw(graphics);
      if (tag) block(tag, fill, rim);
      if (inOrder) hairlines.stroke(graphics);
      continue;
    }
    // A table is its body and its header, and its rows draw nothing (ADR 0023).
    const rows = rowsBlocks(shape, BLOCK_OUTLINE, rowColors);
    if (rows) {
      if (rows.outline) {
        if (inOrder) fillRects(graphics, rows.outline.color, [rows.outline.rect]);
        else addRect(outlines, rows.outline.color, rows.outline.rect);
        hairlines.add(rows.outline.color, 'block', rows.outline.rect);
      }
      for (const { color, rect } of rows.fills) {
        if (inOrder) fillRects(graphics, color, [rect]);
        else addRect(fills, color, rect);
      }
      if (inOrder) hairlines.stroke(graphics);
      continue;
    }
    // A shape drawn by its picture is a block of its plate.
    const outlined = isContainer(shape) || needsOutline(shape.fill);
    const rim = outlined ? outlineColorOf(shape) : undefined;
    block(blockRectOf(shape), shape.fill, rim);
    if (tag) block(tag, shape.fill, rim);
    if (inOrder) hairlines.stroke(graphics);
  }
  for (const [color, rects] of outlines) fillRects(graphics, color, rects);
  for (const [color, rects] of fills) fillRects(graphics, color, rects);
  silhouettes.draw(graphics);
  hairlines.stroke(graphics);
}

/**
 * What a shape with its own outline is filled in: its fill, or for a shape drawn as a named part, the
 * part's main color, which stands for its picture where the picture does not show (ADR 0067).
 */
export function fillOf(shape: { fill: Color; part?: { color: Color } }): Color {
  return shape.part ? shape.part.color : shape.fill;
}

/**
 * The simplified outlines of plain blocks, gathered by color: the polygons of each fill, then the
 * rims of those outlined, a stroke inside each polygon as wide as a block's outline, then the lines
 * a named part strokes. Polygons of one band never overlap, as their shapes' rectangles do not, so
 * the rims may come after every fill.
 */
class Silhouettes {
  private readonly fills = new Map<Color, number[][]>();
  private readonly rims = new Map<Color, number[][]>();
  private readonly lines: { color: Color; width: number; points: number[] }[] = [];

  add(shape: Outlined, fill: Color, rim: Color | undefined, hairlines: Hairlines): void {
    const { rect, outline } = shape;
    const dx = rect.x + outline.x;
    const dy = rect.y + outline.y;
    for (const polygon of simplifyOutline(outline.fitted)) {
      if (polygon.length < 6) continue;
      const points = placedPoints(polygon, dx, dy);
      append(this.fills, fill, points);
      if (rim !== undefined) {
        append(this.rims, rim, points);
        hairlines.addPolygon(rim, points, true);
      }
    }
    for (const line of simplifiedLinesOf(outline.fitted)) {
      const points = placedPoints(line.points, dx, dy);
      this.lines.push({ color: fill, width: line.width, points });
      hairlines.addPolygon(fill, points, false);
    }
  }

  draw(graphics: Graphics): void {
    for (const [color, polygons] of this.fills) {
      for (const points of polygons) graphics.poly(points, true);
      graphics.fill(color);
    }
    for (const [color, polygons] of this.rims) {
      for (const points of polygons) graphics.poly(points, true);
      graphics.stroke({ color, width: BLOCK_OUTLINE, alignment: 1 });
    }
    for (const { color, width, points } of this.lines) {
      graphics.poly(points, false).stroke({ color, width, cap: 'round', join: 'round' });
    }
    this.fills.clear();
    this.rims.clear();
    this.lines.length = 0;
  }
}

function append<V>(byColor: Map<Color, V[]>, color: Color, value: V): void {
  const list = byColor.get(color);
  if (list) list.push(value);
  else byColor.set(color, [value]);
}

function addRect(byColor: Map<Color, Rect[]>, color: Color, rect: Rect): void {
  const rects = byColor.get(color);
  if (rects) rects.push(rect);
  else byColor.set(color, [rect]);
}

function fillRects(graphics: Graphics, color: Color, rects: readonly Rect[]): void {
  for (const { x, y, width, height } of rects) graphics.rect(x, y, width, height);
  graphics.fill(color);
}

/** Draws relations as plain lines along their routes, without dashes or arrowheads. */
export function drawRelationLines(graphics: Graphics, lines: readonly RelationLine[]): void {
  for (const line of lines) {
    const [first, ...rest] = line.route;
    if (!first) continue;
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke({ color: line.stroke, width: line.width });
  }
}

/**
 * Draws element shapes in full, in order, so that containers come under their contents: each body by
 * its kind, or by its own outline with its holes cut (ADR 0066), a collapsed container on a sheet that
 * shows behind it, and on every container the toggle that collapses or expands it.
 */
export function drawShapeOutlines(
  graphics: Graphics,
  shapes: readonly ElementShape[],
  rowColors: RowColors = LIGHT_ROWS,
): void {
  const hairlines = new Hairlines();
  for (const shape of shapes) {
    if (drawRowsShape(graphics, shape, rowColors)) {
      drawToggle(graphics, shape);
      drawLeavingMark(graphics, shape);
      continue;
    }
    if (shape.outline) {
      drawOutlinedBody(graphics, shape, shape.outline, hairlines);
      drawNameTag(
        graphics,
        shape,
        { fill: fillOf(shape), stroke: outlineColorOf(shape) },
        hairlines,
      );
      drawToggle(graphics, shape);
      drawLeavingMark(graphics, shape);
      drawDestinationMark(graphics, shape);
      continue;
    }
    const colors = { fill: shape.fill, stroke: outlineColorOf(shape) };
    // Inside its plate for a shape drawn by its picture, which covers it once ready.
    const body = shape.collapsed === undefined ? bodyRectOf(shape) : bodyOf(shape);
    if (shape.collapsed !== undefined && body !== shape.rect) {
      // The sheet behind a collapsed container; the body covers most of its outline.
      drawBody(graphics, shape.kind, { ...body, x: body.x + SHEET, y: body.y + SHEET }, colors);
    }
    drawBody(graphics, shape.kind, body, colors);
    hairlines.add(colors.stroke, shape.kind, body);
    drawNameTag(graphics, shape, colors, hairlines);
    drawToggle(graphics, shape);
    drawLeavingMark(graphics, shape);
    drawDestinationMark(graphics, shape);
  }
  hairlines.stroke(graphics);
}

/**
 * Draws the body of a shape with its own outline: the outline filled in its fill, or its part's main
 * color, with its holes cut and every contour stroked, and outlined again a device pixel wide; on a
 * collapsed container, first the sheet behind it, its outline offset as a box's sheet is. An anchored
 * part draws no body: its drawing's picture shows it, and what changes how it looks is drawn over it.
 */
function drawOutlinedBody(
  graphics: Graphics,
  shape: ElementShape,
  outline: ShapeOutline,
  hairlines: Hairlines,
): void {
  if (shape.part?.inDrawing) return;
  const colors = { fill: fillOf(shape), stroke: outlineColorOf(shape) };
  const placed = outlineAt({ rect: shape.rect, outline }) as PlacedOutline;
  if (shape.collapsed !== undefined && bodyOf(shape) !== shape.rect) {
    drawOutline(graphics, { ...placed, x: placed.x + SHEET, y: placed.y + SHEET }, colors);
  }
  drawOutline(graphics, placed, colors);
  hairlines.addOutline(colors.stroke, placed);
}

/**
 * Draws a shape's name tag, when it writes its name in one (ADR 0066's clarification of 2026-10-27): a
 * rounded rectangle in the shape's colors, stroked as its body is, hung under its outline.
 */
function drawNameTag(
  graphics: Graphics,
  shape: ElementShape,
  colors: { fill: Color; stroke: Color },
  hairlines: Hairlines,
): void {
  const tag = nameTagOf(shape);
  if (!tag) return;
  const placed = placedTag(tag, shape.rect);
  graphics
    .roundRect(placed.x, placed.y, placed.width, placed.height, tagRadius(tag))
    .fill(colors.fill)
    .stroke({ color: colors.stroke, width: SHAPE_STROKE_WIDTH });
  hairlines.add(colors.stroke, 'rounded-rectangle', placed);
}

/** Whether a shape is drawn as a container: one that holds shapes, or one the view collapses. */
function isContainer(shape: ElementShape): boolean {
  return shape.holdsContents || shape.collapsed !== undefined;
}

/**
 * Draws a container's toggle: a small square in its top right corner, with − on an expanded one
 * and + on a collapsed one, so that the sign says what pressing it does. It is drawn in the
 * container's colors, its sign in the text that reads on them, so that it follows them in each theme.
 */
function drawToggle(graphics: Graphics, shape: ElementShape): void {
  const toggle = toggleRect(shape);
  if (!toggle) return;
  const { x, y, width, height } = toggle;
  graphics
    .roundRect(x, y, width, height, 3)
    .fill(shape.fill)
    .stroke({ color: shape.stroke, width: 1 });
  const middleX = x + width / 2;
  const middleY = y + height / 2;
  const arm = width * 0.28;
  graphics.moveTo(middleX - arm, middleY).lineTo(middleX + arm, middleY);
  if (shape.collapsed !== undefined) {
    graphics.moveTo(middleX, middleY - arm).lineTo(middleX, middleY + arm);
  }
  graphics.stroke({ color: readableTextColors(shape.fill).name, width: 1.5 });
}

/**
 * Writes each shape's name and, with `details`, its component's name, each in the room its shape
 * gives it; a label the factory cannot fit is left out. `backdrop` gives what a shape drawn by its
 * picture sits on, its container's fill or the canvas, which the name under the picture is written on.
 */
export function writeShapeLabels(
  shapes: readonly ElementShape[],
  details: boolean,
  make: TextFactory = canvasText,
  backdrop: (shape: ElementShape) => Color = () => CANVAS_BACKGROUND,
): Container[] {
  const texts: Container[] = [];
  for (const shape of shapes) {
    const write: Write = (options, detail, room, runs) => {
      if (detail && !details) return undefined;
      const text = make(options, detail ? 'detail' : 'name', room, runs);
      if (text) texts.push(text);
      return text;
    };
    writeShapeText(shape, write, backdrop, make);
    writeLeavingMark(shape, write);
  }
  return texts;
}

/** Draws relations along their routes, with an arrowhead at the end of directed ones. */
export function drawRelationRoutes(graphics: Graphics, lines: readonly RelationLine[]): void {
  for (const line of lines) {
    if (drawnAsCurve(line)) {
      strokeCurve(graphics, drawnCurve(line), { color: line.stroke, width: line.width });
    } else {
      strokeRoute(graphics, line.route, line.arrowhead, {
        color: line.stroke,
        width: line.width,
        dash: line.dash,
      });
    }
    if (line.arrowhead) fillArrowhead(graphics, line.arrowhead, line.stroke);
  }
}

/**
 * Draws the pieces of relations' routes that lie in one tile, dashed as their relation types say,
 * and the arrowheads of `ends`, whose tips lie there.
 */
export function drawRoutePieces(
  graphics: Graphics,
  pieces: readonly RoutePiece[],
  ends: readonly RelationLine[],
): void {
  for (const piece of pieces) {
    const { line } = piece;
    if (piece.curve && line.dash === 'solid') {
      strokeCurve(graphics, piece.curve, { color: line.stroke, width: line.width });
      continue;
    }
    strokeLine(
      graphics,
      piece.points,
      { color: line.stroke, width: line.width, dash: line.dash },
      piece,
    );
  }
  for (const line of ends) if (line.arrowhead) fillArrowhead(graphics, line.arrowhead, line.stroke);
}

/**
 * Draws pieces of relations' routes as plain lines, without dashes or arrowheads: a directed line's
 * last piece goes on to the tip, where no arrowhead covers it.
 */
export function drawPieceLines(graphics: Graphics, pieces: readonly RoutePiece[]): void {
  for (const piece of pieces) {
    const { line } = piece;
    const points = piece.last && line.arrowhead ? [...piece.points, line.to] : piece.points;
    strokeLine(graphics, points, { color: line.stroke, width: line.width, dash: 'solid' }, piece);
  }
}

/**
 * Draws the pieces of relations' routes as `drawPieceLines` does, all in one color, each `extra`
 * wider than its line: one path a width, since in one color the order they are drawn in shows not.
 */
export function drawPieceCasings(
  graphics: Graphics,
  pieces: readonly RoutePiece[],
  color: Color,
  extra: number,
): void {
  const byWidth = new Map<number, RoutePiece[]>();
  for (const piece of pieces) {
    const width = piece.line.width + extra;
    const same = byWidth.get(width);
    if (same) same.push(piece);
    else byWidth.set(width, [piece]);
  }
  for (const [width, same] of byWidth) {
    let traced = false;
    for (const piece of same) {
      const { line } = piece;
      const points = piece.last && line.arrowhead ? [...piece.points, line.to] : piece.points;
      traced = traceSolid(graphics, points, width, piece) || traced;
    }
    if (traced) graphics.stroke({ color, width, cap: 'butt', join: 'miter' });
  }
}

/**
 * Writes the names of the relations that have one, at the middle of their routes, in `colors`: the
 * text, and what is drawn behind it, which the light theme's by default.
 */
export function writeRelationLabels(
  lines: readonly RelationLine[],
  make: TextFactory = canvasText,
  colors: { text: Color; back: Color } = { text: RELATION_LABEL_TEXT, back: RELATION_LABEL_HALO },
): Container[] {
  return lines.flatMap((line) => {
    const text =
      line.label &&
      make(
        {
          text: line.label,
          anchor: 0.5,
          x: line.middle.x,
          y: line.middle.y,
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: 12,
            fill: colors.text,
            stroke: { color: colors.back, width: 4, join: 'round' },
          },
        },
        'relation',
      );
    return text ? [text] : [];
  });
}

/** Draws notes and free arrows, in their own colors or else the light theme's. */
export function drawFreeShapes(
  graphics: Graphics,
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
): void {
  for (const note of notes) {
    const { x, y, width, height } = note.rect;
    graphics
      .rect(x, y, width, height)
      .fill(note.fill ?? NOTE_FILL)
      .stroke({ color: note.stroke ?? NOTE_STROKE, width: 1 });
  }
  for (const arrow of arrows) {
    const color = arrow.stroke ?? ARROW_STROKE;
    strokeRoute(graphics, [arrow.from, arrow.to], arrow.arrowhead, {
      color,
      width: ARROW_WIDTH,
      dash: 'solid',
    });
    fillArrowhead(graphics, arrow.arrowhead, color);
  }
}

/**
 * Writes the text of notes: in white, tinted to the color that reads on the note's fill, so that a new
 * theme or a new fill only tints it again.
 */
export function writeNoteTexts(notes: readonly NoteShape[], make?: TextFactory): Container[] {
  return notes.map((note) => {
    const color = note.fill === undefined ? NOTE_TEXT : readableTextColors(note.fill).name;
    if (make?.note) return make.note(note, color);
    const text = new Text({
      text: note.text,
      x: note.rect.x + TEXT_INSET,
      y: note.rect.y + 10,
      style: textStyle(NOTE_SIZE, '#FFFFFF', Math.max(1, note.rect.width - 2 * TEXT_INSET), 'left'),
    });
    text.tint = color;
    return text;
  });
}

/** Where a note writes its text, and at what size: inside it, 12 units in at the sides. */
export function noteTextPlace(note: NoteShape): {
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
} {
  return {
    x: note.rect.x + TEXT_INSET,
    y: note.rect.y + 10,
    width: Math.max(1, note.rect.width - 2 * TEXT_INSET),
    height: Math.max(0, note.rect.height - 18),
    size: NOTE_SIZE,
  };
}

/**
 * Traces the outline of a shape's body in a rectangle, as `drawBody` strokes it, for a stroke of
 * its own: every part of it in the current path.
 */
function traceOutline(graphics: Graphics, kind: ShapeKind, rect: Rect): void {
  const { x, y, width, height } = rect;
  switch (kind) {
    case 'rectangle':
      graphics.rect(x, y, width, height);
      return;
    case 'rounded-rectangle':
      graphics.roundRect(x, y, width, height, Math.min(10, width / 4, height / 4));
      return;
    case 'ellipse':
      graphics.ellipse(x + width / 2, y + height / 2, width / 2, height / 2);
      return;
    case 'cylinder': {
      const cap = cylinderCap(rect);
      const centerX = x + width / 2;
      const radiusX = width / 2;
      graphics.poly([
        ...arcPoints(centerX, y + height - cap, radiusX, cap, Math.PI, 0),
        ...arcPoints(centerX, y + cap, radiusX, cap, 0, -Math.PI),
      ]);
      graphics.poly(arcPoints(centerX, y + cap, radiusX, cap, Math.PI, 0), false);
      return;
    }
    case 'person': {
      const head = personHead(rect);
      graphics.roundRect(x, y + head * 1.6, width, height - head * 1.6, Math.min(12, width / 4));
      graphics.circle(x + width / 2, y + head, head);
      return;
    }
  }
}

/**
 * Outlines one device pixel wide whatever the zoom, gathered by color: a stroke in canvas units
 * thinner than a pixel, which a canvas drawn without antialiasing leaves out but at its round
 * corners (ADR 0014), is drawn again as a pixel line, so that no shape's outline ever vanishes
 * (ADR 0033). They are stroked after the drawings they outline, all of one color in one path, so
 * that they cost one more batch, not one per shape.
 */
class Hairlines {
  private readonly byColor = new Map<
    Color,
    ({ kind: ShapeKind | 'block'; rect: Rect } | { points: number[]; closed: boolean })[]
  >();

  add(color: Color, kind: ShapeKind | 'block', rect: Rect): void {
    append(this.byColor, color, { kind, rect });
  }

  /** A polygon or a polyline, as points on the canvas. */
  addPolygon(color: Color, points: number[], closed: boolean): void {
    if (points.length >= 4) append(this.byColor, color, { points, closed });
  }

  /** Every contour of an outline placed on the canvas: its fills and holes closed, its lines open. */
  addOutline(color: Color, placed: PlacedOutline): void {
    for (const contour of flattenOutline(placed.fitted)) {
      this.addPolygon(
        color,
        placedPoints(contour.points, placed.x, placed.y),
        contour.role !== 'line',
      );
    }
  }

  stroke(graphics: Graphics): void {
    for (const [color, outlines] of this.byColor) {
      for (const outline of outlines) {
        if ('points' in outline) graphics.poly(outline.points, outline.closed);
        else if (outline.kind === 'block') {
          const { rect } = outline;
          graphics.rect(rect.x, rect.y, rect.width, rect.height);
        } else traceOutline(graphics, outline.kind, outline.rect);
      }
      graphics.stroke({ color, width: 1, pixelLine: true });
    }
    this.byColor.clear();
  }
}

/**
 * Draws an outline where it is placed (ADR 0066, ADR 0067): each fill filled with the holes that lie
 * in it cut out, every closed contour stroked, and each line stroked at its own width, with round
 * ends. A hole is cut from the smallest fill around it, so islands inside holes are filled again.
 */
export function drawOutline(
  graphics: Graphics,
  outline: PlacedOutline,
  colors: { fill: Color; stroke: Color },
): void {
  const flat = flattenOutline(outline.fitted);
  const { contours } = outline.fitted;
  const shifted = (contour: FlatContour) => placedPoints(contour.points, outline.x, outline.y);
  const fills = flat.filter((contour) => contour.role === 'fill');
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
  for (const fill of fills) {
    if (fill.points.length < 6) continue;
    graphics.poly(shifted(fill)).fill(colors.fill);
    for (const hole of holesIn.get(fill) ?? []) graphics.poly(shifted(hole)).cut();
  }
  const stroke = { color: colors.stroke, width: SHAPE_STROKE_WIDTH };
  flat.forEach((contour, at) => {
    if (contour.points.length < 4) return;
    if (contour.role !== 'line') {
      graphics.poly(shifted(contour), true).stroke(stroke);
      return;
    }
    const width = Math.max(SHAPE_STROKE_WIDTH, contours[at]?.width ?? 0);
    graphics
      .poly(shifted(contour), false)
      .stroke({ color: colors.stroke, width, cap: 'round', join: 'round' });
  });
}

/**
 * What a mark goes around: a rectangle, or a shape, by its plate, its own outline or its rectangle,
 * with its name tag. A shape given whole brings its own tag; `tag` gives one otherwise.
 */
export type MarkTarget = Rect | { rect: Rect; outline?: ShapeOutline; plate?: Rect; tag?: NameTag };

/**
 * Traces the mark around what is marked, `gap` outside it, into the current path for the caller to
 * stroke: a box around a rectangle or a plate, and along the outline of a shape with its own (ADR
 * 0066), each fill grown by the gap and each hole shrunk by it. A shape with a name tag is marked
 * around its outline, or its box, and its tag together, never across its name (ADR 0066's
 * clarification of 2026-10-27): that mark is lines, which only a stroke draws.
 */
export function traceMark(graphics: Graphics, target: MarkTarget, gap: number): void {
  if ('rect' in target) {
    const { outline, rect, plate } = target;
    const tag = target.tag ?? tagOfShape(target);
    if (tag && !plate) {
      const lines = markLinesWithTag(
        tag,
        () =>
          outline
            ? markContours(outline.fitted, gap).map((contour) =>
                Float64Array.from(placedPoints(contour, outline.x, outline.y)),
              )
            : [boxAround(rect, gap)],
        gap,
      );
      for (const line of lines) {
        graphics.poly(placedPoints(line.points, rect.x, rect.y), line.closed);
      }
      return;
    }
    if (outline && !plate) {
      const contours = markContours(outline.fitted, gap);
      if (contours.length > 0) {
        const dx = rect.x + outline.x;
        const dy = rect.y + outline.y;
        for (const contour of contours) graphics.poly(placedPoints(contour, dx, dy), true);
        return;
      }
    }
    traceBox(graphics, plate ?? rect, gap);
    return;
  }
  traceBox(graphics, target, gap);
}

function traceBox(graphics: Graphics, rect: Rect, gap: number): void {
  graphics.rect(rect.x - gap, rect.y - gap, rect.width + 2 * gap, rect.height + 2 * gap);
}

/** A box `gap` around a rectangle, as a polygon from the rectangle's top left. */
function boxAround(rect: Rect, gap: number): Float64Array {
  const right = rect.width + gap;
  const bottom = rect.height + gap;
  return Float64Array.from([-gap, -gap, right, -gap, right, bottom, -gap, bottom]);
}

/** Draws a shape's body in a rectangle, filled and stroked, approximating each kind of shape. */
function drawBody(
  graphics: Graphics,
  kind: ShapeKind,
  rect: Rect,
  colors: { fill: Color; stroke: Color },
): void {
  const { x, y, width, height } = rect;
  const shape = { ...colors, rect };
  const stroke = { color: shape.stroke, width: SHAPE_STROKE_WIDTH };
  switch (kind) {
    case 'rectangle':
      graphics.rect(x, y, width, height).fill(shape.fill).stroke(stroke);
      return;
    case 'rounded-rectangle':
      graphics
        .roundRect(x, y, width, height, Math.min(10, width / 4, height / 4))
        .fill(shape.fill)
        .stroke(stroke);
      return;
    case 'ellipse':
      graphics
        .ellipse(x + width / 2, y + height / 2, width / 2, height / 2)
        .fill(shape.fill)
        .stroke(stroke);
      return;
    case 'cylinder': {
      const cap = cylinderCap(shape.rect);
      const centerX = x + width / 2;
      const radiusX = width / 2;
      // The body, closed along the back of the top cap; then the front of the top cap.
      graphics
        .poly([
          ...arcPoints(centerX, y + height - cap, radiusX, cap, Math.PI, 0),
          ...arcPoints(centerX, y + cap, radiusX, cap, 0, -Math.PI),
        ])
        .fill(shape.fill)
        .stroke(stroke);
      graphics.poly(arcPoints(centerX, y + cap, radiusX, cap, Math.PI, 0), false).stroke(stroke);
      return;
    }
    case 'person': {
      const head = personHead(shape.rect);
      graphics
        .roundRect(x, y + head * 1.6, width, height - head * 1.6, Math.min(12, width / 4))
        .fill(shape.fill)
        .stroke(stroke);
      graphics
        .circle(x + width / 2, y + head, head)
        .fill(shape.fill)
        .stroke(stroke);
      return;
    }
  }
}

/**
 * What a shape writes under its name: its detail, or its component's name on a shape made without
 * one; and on a collapsed container, how many shapes it holds.
 */
export function detailOf(shape: ElementShape): string {
  const detail = shape.detail ?? shape.componentName;
  if (shape.collapsed === undefined) return detail;
  const inside = t('{count} inside', { count: shape.collapsed.contents });
  return detail === '' ? inside : `${detail} · ${inside}`;
}

/**
 * Writes a shape's name and its detail: at the top of a container, collapsed or not, beside its
 * toggle, and centered otherwise. Each comes with its room, the height it may take inside the shape; a
 * label with no room is left out.
 */
function writeShapeText(
  shape: ElementShape,
  write: Write,
  backdrop: (shape: ElementShape) => Color = () => CANVAS_BACKGROUND,
  make?: TextFactory,
): void {
  if (writeRowsText(shape, write)) return;
  if (writesNameBelow(shape)) {
    writeNameTag(shape, readableTextColors(fillOf(shape)), write);
    return;
  }
  if (shape.outline) {
    writeOutlinedText(shape, shape.outline, write);
    return;
  }
  const colors = readableTextColors(shape.fill);
  const rooms = labelRooms(shape);
  if (isContainer(shape)) {
    const { x, y, width, height } = bodyOf(shape);
    const toggle = toggleRect(shape);
    const beside = toggle ? toggle.width + 4 : 0;
    // Right of the icon its header may show.
    const shift = headerShift(shape);
    const wrap = Math.max(1, width - 2 * TEXT_INSET - beside - shift);
    if (rooms.name > 0) {
      write(
        {
          text: shape.name,
          x: x + TEXT_INSET + shift,
          y: y + 8,
          style: textStyle(NAME_SIZE, colors.name, wrap, 'left', '600'),
        },
        false,
        rooms.name,
      );
    }
    // A collapsed container's count, on a line of its own or first on the detail's.
    const { detail, count, countRoom } = headerLines(shape, height);
    if (rooms.detail > 0 && detail !== '') {
      write(
        {
          text: detail,
          x: x + TEXT_INSET + shift,
          y: y + 8 + NAME_SIZE + 6,
          style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'left'),
        },
        true,
        rooms.detail,
        // Its detail with text emphasis, unless a collapsed one's count came first on its line.
        detail === (shape.detail ?? shape.componentName) ? shape.detailRuns : undefined,
      );
    }
    if (count !== undefined && countRoom !== undefined) {
      write(
        {
          text: count,
          x: x + TEXT_INSET + shift,
          y: y + COUNT_LINE_TOP,
          style: textStyle(DETAIL_SIZE, colors.detail, Math.max(1, width - 2 * TEXT_INSET), 'left'),
        },
        true,
        countRoom,
      );
    }
    return;
  }
  const band = nameBandOf(shape);
  if (band) {
    writeBandText(shape, band, rooms, readableTextColors(backdrop(shape)), write);
    return;
  }
  // Right of the icon beside its name, when it shows one.
  const area = besideImage(shape, labelArea(shape));
  if (area.height <= 0) return;
  const centerX = area.x + area.width / 2;
  const wrap = Math.max(1, area.width - TEXT_INSET);
  const block = textBlockOf(shape, area, wrap, make);
  write(
    {
      text: shape.name,
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: block.nameTop,
      style: textStyle(NAME_SIZE, colors.name, wrap, 'center', '600'),
    },
    false,
    block.nameRoom,
  );
  if (block.detailLines === 0) return;
  write(
    {
      text: detailOf(shape),
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: block.detailTop,
      style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'center'),
    },
    true,
    block.detailRoom,
    shape.detailRuns,
  );
}

/**
 * A shape's name and detail as one block in its label area (`textBlock.ts`, ADR 0082), measured as
 * `make` draws them.
 */
export function textBlockOf(
  shape: ElementShape,
  area: Rect,
  wrap: number,
  make?: Pick<TextFactory, 'measure' | 'measureName'>,
): TextBlock {
  return placeTextBlock({
    area,
    wrap,
    name: shape.name,
    detail: detailOf(shape),
    ...(shape.detailRuns ? { detailRuns: shape.detailRuns } : {}),
    ...(shape.detailLines === undefined ? {} : { lines: shape.detailLines }),
    ...(shape.textPlacement === undefined ? {} : { placement: shape.textPlacement }),
    ...(make?.measure ? { measure: make.measure } : {}),
    ...(make?.measureName ? { measureName: make.measureName } : {}),
  });
}

/** The height a name takes on one line, which a shape with its own outline gives it at least. */
const NAME_LINE = 20;

/**
 * Writes the name and detail of a shape with its own outline (ADR 0066, ADR 0067), in colours that
 * read on its fill or its part's main color:
 *
 * - an expanded container in its header, as any container, along the stretch of the header line
 *   its outline holds, right of its icon there;
 * - any other shape centred in its label area, right of its icon there, its name whole, its words
 *   never cut (`nameLinesInside`), with its detail under it when the area has a line left for it. A
 *   collapsed container's detail starts with its count, so that cutting it never cuts the count.
 *
 * A name that does not fit there whole is written under the shape, whole, in its name tag
 * (`writesNameBelow`, ADR 0066's clarifications). A container whose header has no room writes
 * nothing, and the hover and selection marks write its name beside it.
 */
function writeOutlinedText(shape: ElementShape, outline: ShapeOutline, write: Write): void {
  const colors = readableTextColors(fillOf(shape));
  if (shape.part?.inDrawing === true) {
    writePartName(shape, outline, colors.name, write);
    return;
  }
  const rooms = outlinedRooms(shape, outline);
  if (showsContents(shape)) {
    const stretch = headerStretch({ ...shape, outline });
    if (!stretch) return;
    const { y } = shape.rect;
    const left = stretch.x + 2 + headerShift(shape);
    const wrap = Math.max(1, stretch.x + stretch.width - left);
    if (rooms.name > 0) {
      write(
        {
          text: shape.name,
          x: left,
          y: y + 8,
          style: textStyle(NAME_SIZE, colors.name, wrap, 'left', '600'),
        },
        false,
        rooms.name,
      );
    }
    const detail = detailOf(shape);
    if (rooms.detail > 0 && detail !== '') {
      write(
        {
          text: detail,
          x: left,
          y: y + 8 + NAME_SIZE + 6,
          style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'left'),
        },
        true,
        rooms.detail,
        detail === (shape.detail ?? shape.componentName) ? shape.detailRuns : undefined,
      );
    }
    return;
  }
  const lines = nameLinesInside({ ...shape, outline });
  if (!lines) return;
  const text = besideImage(shape, labelAreaOn({ rect: shape.rect, outline }));
  const centerX = text.x + text.width / 2;
  const wrap = Math.max(1, text.width);
  const detail = outlinedDetailOf(shape);
  const nameHeight = lines.length * PART_NAME_LINE;
  const withDetail = detail !== '' && text.height >= nameHeight + DETAIL_LINE;
  // The block in its label area as its text placement says (ADR 0082), centred unless it says not.
  const height = nameHeight + (withDetail ? DETAIL_LINE : 0);
  const inset = Math.max(0, Math.min(BLOCK_INSET, (text.height - height) / 2));
  const top =
    shape.textPlacement === 'top'
      ? text.y + inset
      : shape.textPlacement === 'bottom'
        ? text.y + text.height - inset - height
        : text.y + (text.height - height) / 2;
  write(
    {
      text: lines.join('\n'),
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: top,
      style: wholeLines(colors.name, wrap),
    },
    false,
    Math.max(text.height, nameHeight) + PART_NAME_LINE / 2,
  );
  if (withDetail) {
    write(
      {
        text: detail,
        anchor: { x: 0.5, y: 0 },
        x: centerX,
        y: top + nameHeight + 1,
        style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'center'),
      },
      true,
      DETAIL_LINE,
      detail === (shape.detail ?? shape.componentName) ? shape.detailRuns : undefined,
    );
  }
}

/** How tall the detail under a name written whole inside a shape with its own outline is. */
const DETAIL_LINE = 15;

/** The style of a name written on lines already broken, each whole: bold, at the name's size. */
function wholeLines(fill: Color, width: number): TextStyleOptions {
  return {
    ...textStyle(NAME_SIZE, fill, width, 'center', '600'),
    wordWrap: false,
    lineHeight: PART_NAME_LINE,
  };
}

/**
 * Writes the name of a shape that writes it in its name tag (`writesNameBelow`, ADR 0066's
 * clarification of 2026-10-27) whole, centred in the tag, in colours that read on the tag's fill,
 * which is the shape's, and its detail under the name, cut to the tag's width as the tag was made.
 */
function writeNameTag(
  shape: ElementShape,
  colors: { name: Color; detail: Color },
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
): void {
  const tag = nameTagOf(shape);
  if (!tag) return;
  const placed = placedTag(tag, shape.rect);
  const x = placed.x + placed.width / 2;
  const top = placed.y + TAG_PADDING;
  const height = tag.lines.length * PART_NAME_LINE;
  write(
    {
      text: tag.lines.join('\n'),
      anchor: { x: 0.5, y: 0 },
      x,
      y: top,
      style: wholeLines(colors.name, placed.width),
    },
    false,
    height + PART_NAME_LINE / 2,
  );
  if (tag.detail === '') return;
  write(
    {
      text: tag.detail,
      anchor: { x: 0.5, y: 0 },
      x,
      y: top + height + 1,
      style: textStyle(DETAIL_SIZE, colors.detail, placed.width, 'center'),
    },
    true,
    TAG_DETAIL_LINE,
  );
}

/**
 * Writes an anchored part's name, alone and whole, its words never cut, centred in its label area,
 * where it fits there (`partNameLines`); never its component's name or its detail. One that does not
 * fit is written beside the part by the hover and selection marks (namesBeside.ts, ADR 0067).
 */
function writePartName(
  shape: ElementShape,
  outline: ShapeOutline,
  color: Color,
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
): void {
  const text = partNameText(shape, outline, color);
  if (text) write(text.options, false, text.room);
}

/**
 * The text of an anchored part's name, alone and whole, centred in its label area, in `color`, and the
 * room it takes; none when it does not fit there whole (`partNameLines`). The tiles write it, and the
 * part layer writes it again over what hides it there (`writePartNames`).
 */
export function partNameText(
  shape: ElementShape,
  outline: ShapeOutline,
  color: Color,
): { options: CanvasTextOptions; room: number } | undefined {
  const area = labelAreaOn({ rect: shape.rect, outline });
  const lines = partNameLines(shape.name, area);
  if (!lines) return undefined;
  return {
    options: {
      text: lines.join('\n'),
      anchor: 0.5,
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
      style: {
        ...textStyle(PART_NAME_SIZE, color, area.width, 'center', '600'),
        wordWrap: false,
        lineHeight: PART_NAME_LINE,
      },
    },
    room: Math.max(area.height, NAME_LINE),
  };
}

/** How tall the name and detail of a shape with its own outline may be, as `writeOutlinedText` writes them. */
function outlinedRooms(
  shape: ElementShape,
  outline: ShapeOutline,
): { name: number; detail: number } {
  const none = { name: 0, detail: 0 };
  if (showsContents(shape)) {
    const stretch = headerStretch({ ...shape, outline });
    if (!stretch || stretch.width < LEAST_HEADER_WIDTH) return none;
    const { height } = shape.rect;
    return { name: Math.min(NAME_LINE, height - 12), detail: Math.min(16, height - 32) };
  }
  const { height } = labelAreaOn({ rect: shape.rect, outline });
  if (height < LEAST_LABEL_HEIGHT) return none;
  if (height >= 2 * NAME_LINE) return { name: height / 2, detail: height / 2 - 6 };
  return { name: Math.max(height, NAME_LINE), detail: 0 };
}

/**
 * Writes the name and detail of a shape drawn by its picture in the band under its plate, centred
 * across the shape, in colours that read on what it sits on: no text ever sits over a picture.
 */
function writeBandText(
  shape: ElementShape,
  band: Rect,
  rooms: { name: number; detail: number },
  colors: { name: Color; detail: Color },
  write: Write,
): void {
  const centerX = band.x + band.width / 2;
  const wrap = Math.max(1, band.width - TEXT_INSET);
  if (rooms.name > 0) {
    write(
      {
        text: shape.name,
        anchor: { x: 0.5, y: 0 },
        x: centerX,
        y: band.y + 1,
        style: textStyle(NAME_SIZE, colors.name, wrap, 'center', '600'),
      },
      false,
      rooms.name,
    );
  }
  const detail = detailOf(shape);
  if (rooms.detail > 0 && detail !== '') {
    write(
      {
        text: detail,
        anchor: { x: 0.5, y: 0 },
        x: centerX,
        y: band.y + 19,
        style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'center'),
      },
      true,
      rooms.detail,
      shape.detailRuns,
    );
  }
}

/**
 * How tall a shape's name and its component's name may be, so that they stay inside it: in a
 * container, one line each in its header; elsewhere, the lines its text block gives the name and then
 * the detail (`textBlock.ts`, ADR 0082), in Roboto's widths.
 */
export function labelRooms(shape: ElementShape): { name: number; detail: number } {
  if (shape.outline && shape.rowCount === undefined && shape.row === undefined) {
    return outlinedRooms(shape, shape.outline);
  }
  const band = nameBandOf(shape);
  if (band) return bandRooms(band);
  if (isContainer(shape)) {
    const { height } = bodyOf(shape);
    return { name: Math.min(20, height - 12), detail: Math.min(16, height - 32) };
  }
  const area = besideImage(shape, labelArea(shape));
  const block = textBlockOf(shape, area, Math.max(1, area.width - TEXT_INSET));
  return { name: block.nameRoom, detail: block.detailRoom };
}

/** The part of a shape its text is centered in: below a person's head, below a cylinder's top cap. */
function labelArea(shape: ElementShape): Rect {
  const { x, y, width, height } = shape.rect;
  if (shape.kind === 'person') {
    const top = personHead(shape.rect) * 1.6;
    return { x, y: y + top, width, height: height - top };
  }
  if (shape.kind === 'cylinder') {
    const cap = cylinderCap(shape.rect);
    return { x, y: y + 2 * cap, width, height: height - 3 * cap };
  }
  if (shape.kind === 'ellipse') {
    // The rectangle inscribed in the ellipse.
    return {
      x: x + width * 0.15,
      y: y + height * 0.15,
      width: width * 0.7,
      height: height * 0.7,
    };
  }
  return shape.rect;
}

function textStyle(
  fontSize: number,
  fill: Color,
  wordWrapWidth: number,
  align: 'left' | 'center',
  fontWeight: TextStyleOptions['fontWeight'] = 'normal',
): TextStyleOptions {
  return {
    fontFamily: FONT_FAMILY,
    fontSize,
    fontWeight,
    fill,
    align,
    wordWrap: true,
    wordWrapWidth,
    breakWords: true,
  };
}

/** Points along an elliptical arc from one angle to another, flattened for `poly`. */
function arcPoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  from: number,
  to: number,
  steps = 10,
): number[] {
  const points: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = from + ((to - from) * step) / steps;
    points.push(centerX + radiusX * Math.cos(angle), centerY + radiusY * Math.sin(angle));
  }
  return points;
}

/**
 * Strokes a route: in one line when solid, piece by piece with a repeating pattern otherwise. With an
 * arrowhead, the last piece stops at the arrowhead's base, so that the line does not show past its tip.
 */
function strokeRoute(
  graphics: Graphics,
  route: readonly Point[],
  arrowhead: Arrowhead | undefined,
  style: { color: Color; width: number; dash: Dash },
): void {
  strokeLine(graphics, untilArrowhead(route, arrowhead), style);
}

/**
 * Strokes points of a route. `travelled` is how far along the route they start, so that the dashes go
 * on where the points before left off; an end at a bend of the route reaches half a width past it,
 * as inner corners do, so that the outside of the bend is filled.
 */
function strokeLine(
  graphics: Graphics,
  points: readonly Point[],
  style: { color: Color; width: number; dash: Dash },
  { travelled: start = 0, bendAtStart = false, bendAtEnd = false } = {},
): void {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  const { color, width, dash } = style;
  if (dash === 'solid') {
    traceSolid(graphics, points, width, { bendAtStart, bendAtEnd });
    graphics.stroke({ color, width, cap: 'butt', join: 'miter' });
    return;
  }
  const texture = patternTexture(dash);
  let travelled = start;
  for (let each = 1; each < points.length; each++) {
    const from = points[each - 1] as Point;
    const to = points[each] as Point;
    const direction = directionOf(from, to);
    if (!direction) continue;
    const length = distance(from, to);
    // Inner ends reach half a width past the corner, so that the outside of the corner is filled.
    const before = each > 1 || bendAtStart ? width / 2 : 0;
    const after = each < points.length - 1 || bendAtEnd ? width / 2 : 0;
    graphics
      .moveTo(from.x - direction.x * before, from.y - direction.y * before)
      .lineTo(to.x + direction.x * after, to.y + direction.y * after)
      .stroke({
        color,
        width,
        cap: 'butt',
        texture,
        textureSpace: 'global',
        matrix: patternMatrix(dash, from, direction, travelled, width),
      });
    travelled += length;
  }
}

/**
 * Traces a solid line through `points`, ends at a bend reaching half a width past it, as inner
 * corners do, so that the outside of the bend is filled; says whether there was a line to trace.
 */
function traceSolid(
  graphics: Graphics,
  points: readonly Point[],
  width: number,
  { bendAtStart = false, bendAtEnd = false }: { bendAtStart?: boolean; bendAtEnd?: boolean },
): boolean {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return false;
  const from = bendAtStart ? reachedPast(points[1] as Point, first, width / 2) : first;
  graphics.moveTo(from.x, from.y);
  rest.forEach((point, at) => {
    const to =
      bendAtEnd && at === rest.length - 1
        ? reachedPast(points.at(-2) as Point, point, width / 2)
        : point;
    graphics.lineTo(to.x, to.y);
  });
  return true;
}

/** `to`, moved `by` further along the line from `from`. */
function reachedPast(from: Point, to: Point, by: number): Point {
  const direction = directionOf(from, to);
  return direction ? { x: to.x + direction.x * by, y: to.y + direction.y * by } : to;
}

function fillArrowhead(
  graphics: Graphics,
  arrowhead: { tip: Point; left: Point; right: Point },
  color: Color,
): void {
  const { tip, left, right } = arrowhead;
  graphics.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]).fill(color);
}
