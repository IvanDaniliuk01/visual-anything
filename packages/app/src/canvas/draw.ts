/**
 * The drawing step: turns parts of a scene into PixiJS graphics and text. It only draws; where
 * everything goes was decided by `buildScene`. Text is placed with anchors and never measured here, so
 * drawing does not depend on font metrics. The canvas draws a scene in tiles with these building
 * blocks.
 */
import { Container, Graphics, Text, type CanvasTextOptions, type TextStyleOptions } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
import type { Dash } from './geometry';
import { directionOf, distance, middle, type Point, type Rect } from './geometry';
import {
  ARROW_STROKE,
  NOTE_FILL,
  NOTE_STROKE,
  NOTE_TEXT,
  RELATION_LABEL_HALO,
  RELATION_LABEL_TEXT,
  readableTextColors,
} from './palette';
import { patternMatrix, patternTexture } from './patterns';
import {
  ARROW_WIDTH,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
} from './scene';

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

/** Makes the object a label is drawn with, from text laid out by this module. */
export type TextFactory = (options: CanvasTextOptions, kind: LabelKind) => Container;

/** Labels as canvas text: sharp at any resolution, but slow to make by the thousand. */
export const canvasText: TextFactory = (options) => new Text(options);
const SHAPE_STROKE_WIDTH = 1.5;
const TEXT_INSET = 12;
const NAME_SIZE = 14;
const DETAIL_SIZE = 11;

/**
 * Draws element shapes as plain blocks of their colour: what the eye can tell apart when a whole large
 * view is on screen, at a fraction of the cost of their outlines.
 */
export function drawShapeBlocks(graphics: Graphics, shapes: readonly ElementShape[]): void {
  for (const shape of shapes) {
    const { x, y, width, height } = shape.rect;
    graphics.rect(x, y, width, height).fill(shape.fill);
    // Only containers keep an outline, which shows the structure; the others' would be too thin to see.
    if (shape.holdsContents)
      graphics.stroke({ color: shape.stroke, width: SHAPE_STROKE_WIDTH * 4 });
  }
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

/** Draws the outlines of element shapes in order, so that containers come under their contents. */
export function drawShapeOutlines(graphics: Graphics, shapes: readonly ElementShape[]): void {
  for (const shape of shapes) outline(graphics, shape);
}

/** Writes each shape's name and, with `details`, its component's name. */
export function writeShapeLabels(
  shapes: readonly ElementShape[],
  details: boolean,
  make: TextFactory = canvasText,
): Container[] {
  const texts: Container[] = [];
  for (const shape of shapes) {
    writeShapeText(shape, (options, detail) => {
      if (!detail || details) texts.push(make(options, detail ? 'detail' : 'name'));
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

/** Writes the names of the relations that have one, at the middle of their routes. */
export function writeRelationLabels(
  lines: readonly RelationLine[],
  make: TextFactory = canvasText,
): Container[] {
  return lines.flatMap((line) =>
    line.label
      ? [
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
          ),
        ]
      : [],
  );
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

/** Draws an element shape's outline, filled and stroked, approximating each kind of shape. */
function outline(graphics: Graphics, shape: ElementShape): void {
  const { x, y, width, height } = shape.rect;
  const stroke = { color: shape.stroke, width: SHAPE_STROKE_WIDTH };
  switch (shape.kind) {
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
      const cap = capHeight(shape.rect);
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
      const head = headRadius(shape.rect);
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
 * Writes a shape's name and its component's name, which is a detail: at the top of a container,
 * centered otherwise.
 */
function writeShapeText(
  shape: ElementShape,
  write: (options: CanvasTextOptions, detail: boolean) => void,
): void {
  const colors = readableTextColors(shape.fill);
  if (shape.holdsContents) {
    const { x, y, width } = shape.rect;
    const wrap = Math.max(1, width - 2 * TEXT_INSET);
    write(
      {
        text: shape.name,
        x: x + TEXT_INSET,
        y: y + 8,
        style: textStyle(NAME_SIZE, colors.name, wrap, 'left', '600'),
      },
      false,
    );
    write(
      {
        text: shape.componentName,
        x: x + TEXT_INSET,
        y: y + 8 + NAME_SIZE + 6,
        style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'left'),
      },
      true,
    );
    return;
  }
  const area = labelArea(shape);
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  const wrap = Math.max(1, area.width - TEXT_INSET);
  write(
    {
      text: shape.name,
      anchor: { x: 0.5, y: 1 },
      x: centerX,
      y: centerY + 2,
      style: textStyle(NAME_SIZE, colors.name, wrap, 'center', '600'),
    },
    false,
  );
  write(
    {
      text: shape.componentName,
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: centerY + 4,
      style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'center'),
    },
    true,
  );
}

/** The part of a shape its text is centered in: below a person's head, below a cylinder's top cap. */
function labelArea(shape: ElementShape): Rect {
  const { x, y, width, height } = shape.rect;
  if (shape.kind === 'person') {
    const top = headRadius(shape.rect) * 1.6;
    return { x, y: y + top, width, height: height - top };
  }
  if (shape.kind === 'cylinder') {
    const cap = capHeight(shape.rect);
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

function capHeight(rect: Rect): number {
  return Math.min(12, rect.height * 0.15);
}

function headRadius(rect: Rect): number {
  return Math.min(rect.height * 0.22, rect.width * 0.2);
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
  arrowhead: { left: Point; right: Point } | undefined,
  style: { color: Color; width: number; dash: Dash },
): void {
  const points = [...route];
  if (arrowhead && points.length >= 2) {
    const tip = points.at(-1) as Point;
    const before = points.at(-2) as Point;
    const base = middle(arrowhead.left, arrowhead.right);
    if (distance(before, tip) > distance(base, tip)) points[points.length - 1] = base;
    else points.pop();
  }
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  const { color, width, dash } = style;
  if (dash === 'solid') {
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke({ color, width, cap: 'butt', join: 'miter' });
    return;
  }
  const texture = patternTexture(dash);
  let travelled = 0;
  for (let each = 1; each < points.length; each++) {
    const from = points[each - 1] as Point;
    const to = points[each] as Point;
    const direction = directionOf(from, to);
    if (!direction) continue;
    const length = distance(from, to);
    // Inner ends reach half a width past the corner, so that the outside of the corner is filled.
    const before = each > 1 ? width / 2 : 0;
    const after = each < points.length - 1 ? width / 2 : 0;
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

function fillArrowhead(
  graphics: Graphics,
  arrowhead: { tip: Point; left: Point; right: Point },
  color: Color,
): void {
  const { tip, left, right } = arrowhead;
  graphics.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]).fill(color);
}
