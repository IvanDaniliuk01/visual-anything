/**
 * The drawing step: turns a scene into PixiJS graphics and text. It only draws; where everything goes
 * was decided by `buildScene`. Text is placed with anchors and never measured here, so drawing does
 * not depend on font metrics.
 */
import { Container, Graphics, Text, type CanvasTextOptions, type TextStyleOptions } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
import type { Dash } from './geometry';
import { dashSegments, distance, middle, type Point, type Rect } from './geometry';
import {
  ARROW_STROKE,
  NOTE_FILL,
  NOTE_STROKE,
  NOTE_TEXT,
  RELATION_LABEL_HALO,
  RELATION_LABEL_TEXT,
  readableTextColors,
} from './palette';
import { ARROW_WIDTH, type ElementShape, type Scene } from './scene';

/** What the drawing step made from a scene. */
export interface DrawnScene {
  /** Everything drawn, in the scene's coordinates. */
  content: Container;
  /** Every text drawn, so that its resolution can follow the scale the scene is shown at. */
  texts: Text[];
}

const FONT_FAMILY = ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'];
const SHAPE_STROKE_WIDTH = 1.5;
const TEXT_INSET = 12;
const NAME_SIZE = 14;
const DETAIL_SIZE = 11;

/** Draws a scene, in drawing order: element shapes, their text, relations, labels, notes and arrows. */
export function drawScene(scene: Scene): DrawnScene {
  const content = new Container();
  const texts: Text[] = [];
  const write = (options: CanvasTextOptions): void => {
    const text = new Text(options);
    texts.push(text);
    content.addChild(text);
  };

  const shapes = new Graphics();
  for (const shape of scene.shapes) outline(shapes, shape);
  content.addChild(shapes);
  for (const shape of scene.shapes) writeShapeText(shape, write);

  const relations = new Graphics();
  for (const line of scene.relations) {
    strokeLine(relations, line.from, shaftEnd(line.from, line.to, line.arrowhead), {
      color: line.stroke,
      width: line.width,
      dash: line.dash,
    });
    if (line.arrowhead) fillArrowhead(relations, line.arrowhead, line.stroke);
  }
  content.addChild(relations);
  for (const line of scene.relations) {
    if (!line.label) continue;
    write({
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
    });
  }

  const notes = new Graphics();
  for (const note of scene.notes) {
    const { x, y, width, height } = note.rect;
    notes.rect(x, y, width, height).fill(NOTE_FILL).stroke({ color: NOTE_STROKE, width: 1 });
  }
  content.addChild(notes);
  for (const note of scene.notes) {
    write({
      text: note.text,
      x: note.rect.x + TEXT_INSET,
      y: note.rect.y + 10,
      style: textStyle(13, NOTE_TEXT, note.rect.width - 2 * TEXT_INSET, 'left'),
    });
  }

  const arrows = new Graphics();
  for (const arrow of scene.arrows) {
    strokeLine(arrows, arrow.from, shaftEnd(arrow.from, arrow.to, arrow.arrowhead), {
      color: ARROW_STROKE,
      width: ARROW_WIDTH,
      dash: 'solid',
    });
    fillArrowhead(arrows, arrow.arrowhead, ARROW_STROKE);
  }
  content.addChild(arrows);

  return { content, texts };
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

/** Writes a shape's name and its component's name: at the top of a container, centered otherwise. */
function writeShapeText(shape: ElementShape, write: (options: CanvasTextOptions) => void): void {
  const colors = readableTextColors(shape.fill);
  if (shape.holdsContents) {
    const { x, y, width } = shape.rect;
    const wrap = Math.max(1, width - 2 * TEXT_INSET);
    write({
      text: shape.name,
      x: x + TEXT_INSET,
      y: y + 8,
      style: textStyle(NAME_SIZE, colors.name, wrap, 'left', '600'),
    });
    write({
      text: shape.componentName,
      x: x + TEXT_INSET,
      y: y + 8 + NAME_SIZE + 6,
      style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'left'),
    });
    return;
  }
  const area = labelArea(shape);
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  const wrap = Math.max(1, area.width - TEXT_INSET);
  write({
    text: shape.name,
    anchor: { x: 0.5, y: 1 },
    x: centerX,
    y: centerY + 2,
    style: textStyle(NAME_SIZE, colors.name, wrap, 'center', '600'),
  });
  write({
    text: shape.componentName,
    anchor: { x: 0.5, y: 0 },
    x: centerX,
    y: centerY + 4,
    style: textStyle(DETAIL_SIZE, colors.detail, wrap, 'center'),
  });
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
  steps = 16,
): number[] {
  const points: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = from + ((to - from) * step) / steps;
    points.push(centerX + radiusX * Math.cos(angle), centerY + radiusY * Math.sin(angle));
  }
  return points;
}

/**
 * Where the stroked part of a line ends: at the base of its arrowhead, so that the line does not show
 * past the arrowhead's tip. Undefined when the line is no longer than its arrowhead.
 */
function shaftEnd(
  from: Point,
  to: Point,
  arrowhead: { left: Point; right: Point } | undefined,
): Point | undefined {
  if (!arrowhead) return to;
  const base = middle(arrowhead.left, arrowhead.right);
  return distance(from, to) > distance(base, to) ? base : undefined;
}

function strokeLine(
  graphics: Graphics,
  from: Point,
  to: Point | undefined,
  style: { color: Color; width: number; dash: Dash },
): void {
  if (!to) return;
  const { color, width, dash } = style;
  if (dash === 'solid') {
    graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
  } else {
    const [length, gap] = dash === 'dashed' ? [width * 4, width * 3] : [width, width * 2];
    for (const [start, end] of dashSegments(from, to, length, gap)) {
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y);
    }
  }
  graphics.stroke({ color, width, cap: dash === 'dotted' ? 'round' : 'butt' });
}

function fillArrowhead(
  graphics: Graphics,
  arrowhead: { tip: Point; left: Point; right: Point },
  color: Color,
): void {
  const { tip, left, right } = arrowhead;
  graphics.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]).fill(color);
}
