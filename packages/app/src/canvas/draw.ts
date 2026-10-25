/**
 * The drawing step: turns parts of a scene into PixiJS graphics and text. It only draws; where
 * everything goes was decided by `buildScene`. Text is placed with anchors and given the room it may
 * take inside its shape, so that a label never leaves its shape; drawing does not depend on font
 * metrics beyond that. The canvas draws a scene in tiles with these building blocks.
 */
import { Container, Graphics, Text, type CanvasTextOptions, type TextStyleOptions } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
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
  TOGGLE_FACE,
  TOGGLE_SIGN,
  contrastRatio,
  readableTextColors,
} from './palette';
import { patternMatrix, patternTexture } from './patterns';
import { drawRowsShape, rowsBlocks, writeRowsText } from './rowsDraw';
import {
  ARROW_WIDTH,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
} from './scene';
import type { RoutePiece } from './tiles';

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
export type TextFactory = (
  options: CanvasTextOptions,
  kind: LabelKind,
  room?: number,
) => Container | undefined;

/** Labels as canvas text: sharp at any resolution, but slow to make by the thousand. */
export const canvasText: TextFactory = (options) => new Text(options);
const SHAPE_STROKE_WIDTH = 1.5;
/** How wide the outlines of plain blocks are, inside them, so that they show far out. */
const BLOCK_OUTLINE = SHAPE_STROKE_WIDTH * 4;
/** The contrast below which a block's fill needs an outline to stand out from the canvas, from WCAG 1.4.11. */
const BLOCK_CONTRAST = 3;
const TEXT_INSET = 12;
const NAME_SIZE = 14;
const DETAIL_SIZE = 11;

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

/** Whether a block of this fill needs an outline to be told apart from the canvas. */
function needsOutline(fill: Color): boolean {
  let outlined = outlinedFills.get(fill);
  if (outlined === undefined) {
    outlined = contrastRatio(fill, CANVAS_BACKGROUND) < BLOCK_CONTRAST;
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
 */
export function drawShapeBlocks(
  graphics: Graphics,
  shapes: readonly ElementShape[],
  inOrder = false,
): void {
  const outlines = new Map<Color, Rect[]>();
  const fills = new Map<Color, Rect[]>();
  for (const shape of shapes) {
    // A table is its body and its header, and its rows draw nothing (ADR 0023).
    const rows = rowsBlocks(shape, BLOCK_OUTLINE);
    if (rows) {
      if (rows.outline) {
        if (inOrder) fillRects(graphics, rows.outline.color, [rows.outline.rect]);
        else addRect(outlines, rows.outline.color, rows.outline.rect);
      }
      for (const { color, rect } of rows.fills) {
        if (inOrder) fillRects(graphics, color, [rect]);
        else addRect(fills, color, rect);
      }
      continue;
    }
    const outlined = isContainer(shape) || needsOutline(shape.fill);
    const inner = outlined ? grow(shape.rect, -BLOCK_OUTLINE) : shape.rect;
    const filled = inner.width > 0 && inner.height > 0;
    if (inOrder) {
      if (outlined) fillRects(graphics, shape.stroke, [shape.rect]);
      if (filled) fillRects(graphics, shape.fill, [inner]);
      continue;
    }
    if (outlined) addRect(outlines, shape.stroke, shape.rect);
    if (filled) addRect(fills, shape.fill, inner);
  }
  for (const [color, rects] of outlines) fillRects(graphics, color, rects);
  for (const [color, rects] of fills) fillRects(graphics, color, rects);
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
 * its kind, a collapsed container on a sheet that shows behind it, and on every container the toggle
 * that collapses or expands it.
 */
export function drawShapeOutlines(graphics: Graphics, shapes: readonly ElementShape[]): void {
  for (const shape of shapes) {
    if (drawRowsShape(graphics, shape)) {
      drawToggle(graphics, shape);
      continue;
    }
    if (shape.collapsed !== undefined) {
      const body = bodyOf(shape);
      if (body !== shape.rect) {
        drawBody(graphics, shape.kind, { ...body, x: body.x + SHEET, y: body.y + SHEET }, shape);
      }
      drawBody(graphics, shape.kind, body, shape);
    } else {
      drawBody(graphics, shape.kind, shape.rect, shape);
    }
    drawToggle(graphics, shape);
  }
}

/** Whether a shape is drawn as a container: one that holds shapes, or one the view collapses. */
function isContainer(shape: ElementShape): boolean {
  return shape.holdsContents || shape.collapsed !== undefined;
}

/**
 * Draws a container's toggle: a small square in its top right corner, with − on an expanded one
 * and + on a collapsed one, so that the sign says what pressing it does.
 */
function drawToggle(graphics: Graphics, shape: ElementShape): void {
  const toggle = toggleRect(shape);
  if (!toggle) return;
  const { x, y, width, height } = toggle;
  graphics
    .roundRect(x, y, width, height, 3)
    .fill(TOGGLE_FACE)
    .stroke({ color: shape.stroke, width: 1 });
  const middleX = x + width / 2;
  const middleY = y + height / 2;
  const arm = width * 0.28;
  graphics.moveTo(middleX - arm, middleY).lineTo(middleX + arm, middleY);
  if (shape.collapsed !== undefined) {
    graphics.moveTo(middleX, middleY - arm).lineTo(middleX, middleY + arm);
  }
  graphics.stroke({ color: TOGGLE_SIGN, width: 1.5 });
}

/**
 * Writes each shape's name and, with `details`, its component's name, each in the room its shape
 * gives it; a label the factory cannot fit is left out.
 */
export function writeShapeLabels(
  shapes: readonly ElementShape[],
  details: boolean,
  make: TextFactory = canvasText,
): Container[] {
  const texts: Container[] = [];
  for (const shape of shapes) {
    writeShapeText(shape, (options, detail, room) => {
      if (detail && !details) return;
      const text = make(options, detail ? 'detail' : 'name', room);
      if (text) texts.push(text);
    });
  }
  return texts;
}

/** Draws relations along their routes, with an arrowhead at the end of directed ones. */
export function drawRelationRoutes(graphics: Graphics, lines: readonly RelationLine[]): void {
  for (const line of lines) {
    strokeRoute(graphics, line.route, line.arrowhead, {
      color: line.stroke,
      width: line.width,
      dash: line.dash,
    });
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

/** Writes the names of the relations that have one, at the middle of their routes. */
export function writeRelationLabels(
  lines: readonly RelationLine[],
  make: TextFactory = canvasText,
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
            fill: RELATION_LABEL_TEXT,
            stroke: { color: RELATION_LABEL_HALO, width: 4, join: 'round' },
          },
        },
        'relation',
      );
    return text ? [text] : [];
  });
}

/** Draws notes and free arrows. */
export function drawFreeShapes(
  graphics: Graphics,
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
): void {
  for (const note of notes) {
    const { x, y, width, height } = note.rect;
    graphics.rect(x, y, width, height).fill(NOTE_FILL).stroke({ color: NOTE_STROKE, width: 1 });
  }
  for (const arrow of arrows) {
    strokeRoute(graphics, [arrow.from, arrow.to], arrow.arrowhead, {
      color: ARROW_STROKE,
      width: ARROW_WIDTH,
      dash: 'solid',
    });
    fillArrowhead(graphics, arrow.arrowhead, ARROW_STROKE);
  }
}

/** Writes the text of notes. */
export function writeNoteTexts(notes: readonly NoteShape[]): Text[] {
  return notes.map(
    (note) =>
      new Text({
        text: note.text,
        x: note.rect.x + TEXT_INSET,
        y: note.rect.y + 10,
        style: textStyle(13, NOTE_TEXT, Math.max(1, note.rect.width - 2 * TEXT_INSET), 'left'),
      }),
  );
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
  const inside = `${shape.collapsed.contents} inside`;
  return detail === '' ? inside : `${detail} · ${inside}`;
}

/**
 * Writes a shape's name and its detail: at the top of a container, collapsed or not, beside its
 * toggle, and centered otherwise. Each comes with its room, the height it may take inside the shape; a
 * label with no room is left out.
 */
function writeShapeText(
  shape: ElementShape,
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
): void {
  if (writeRowsText(shape, write)) return;
  const colors = readableTextColors(shape.fill);
  const rooms = labelRooms(shape);
  if (isContainer(shape)) {
    const { x, y, width } = bodyOf(shape);
    const toggle = toggleRect(shape);
    const beside = toggle ? toggle.width + 4 : 0;
    const wrap = Math.max(1, width - 2 * TEXT_INSET - beside);
    if (rooms.name > 0) {
      write(
        {
          text: shape.name,
          x: x + TEXT_INSET,
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
          x: x + TEXT_INSET,
          y: y + 8 + NAME_SIZE + 6,
          style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'left'),
        },
        true,
        rooms.detail,
      );
    }
    return;
  }
  const area = labelArea(shape);
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  const wrap = Math.max(1, area.width - TEXT_INSET);
  if (rooms.name > 0) {
    write(
      {
        text: shape.name,
        anchor: { x: 0.5, y: 1 },
        x: centerX,
        y: centerY + 2,
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
        y: centerY + 4,
        style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'center'),
      },
      true,
      rooms.detail,
    );
  }
}

/**
 * How tall a shape's name and its component's name may be, so that they stay inside it: in a
 * container, one line each in its header; elsewhere, the name above the middle of its label area and
 * the component's name below it.
 */
export function labelRooms(shape: ElementShape): { name: number; detail: number } {
  if (isContainer(shape)) {
    const { height } = bodyOf(shape);
    return { name: Math.min(20, height - 12), detail: Math.min(16, height - 32) };
  }
  const area = labelArea(shape);
  return { name: area.height / 2, detail: area.height / 2 - 6 };
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
    const from = bendAtStart ? reachedPast(points[1] as Point, first, width / 2) : first;
    graphics.moveTo(from.x, from.y);
    rest.forEach((point, at) => {
      const to =
        bendAtEnd && at === rest.length - 1
          ? reachedPast(points.at(-2) as Point, point, width / 2)
          : point;
      graphics.lineTo(to.x, to.y);
    });
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
