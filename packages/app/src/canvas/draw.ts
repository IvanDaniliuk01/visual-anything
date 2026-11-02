/**
 * The drawing step: turns parts of a scene into PixiJS graphics and text. It only draws; where
 * everything goes was decided by `buildScene`. Text is placed with anchors and given the room it may
 * take inside its shape, so that a label never leaves its shape; drawing does not depend on font
 * metrics beyond that. The canvas draws a scene in tiles with these building blocks.
 */
import {
  Container,
  FillGradient,
  Graphics,
  Text,
  type CanvasTextOptions,
  type FillInput,
  type StrokeInput,
  type TextStyleOptions,
} from 'pixi.js';
import {
  CANVAS_BACKGROUNDS,
  evenOddHolds,
  flattenOutline,
  simplifyOutline,
  type FlatContour,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import type { Dash } from './geometry';
import {
  INNER_BORDER,
  SHEET,
  bodyOf,
  cylinderCap,
  grow,
  directionOf,
  distance,
  personBodyPoints,
  personFigure,
  personLabelTop,
  showsInnerBorder,
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
import { countLineTopOf, countText, headerLines, headerWrapOf } from './collapse';
import { drawLeavingMark, writeLeavingMark } from './leavingMark';
import {
  TAG_DETAIL_LINE,
  TAG_PADDING,
  markLinesWithTag,
  nameTagOf,
  nameTagOn,
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
  partNameLines,
  placedPoints,
  showsContents,
  simplifiedLinesOf,
  type Outlined,
} from './outlined';
import { outlineAt, type PlacedOutline, type ShapeOutline } from './outlines';
import { drawDestinationMark } from './destinationMark';
import { drawSolidMark, isAnchoredSolidPart } from './solidMark';
import { patternMatrix, patternTexture } from './patterns';
import { drawnAsCurve, drawnCurve, strokeCurve } from './routing/curves';
import { LIGHT_ROWS, drawRowsShape, rowsBlocks, writeRowsText, type RowColors } from './rowsDraw';
import { LIGHT_REGION, drawRegion, regionTabOf, type RegionColors } from './regionDraw';
import {
  arrowWidthOf,
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
import {
  borderWidthOf,
  castsShadow,
  cornerRadiusOf,
  drawnKindOf,
  opacityOf,
  type ShapeGradient,
  type Styled,
} from './shapeStyle';
import type { EmphasisRun, ResolvedDrawing } from '@visual-anything/core';
import {
  BASE_DRAWING,
  NAME_LINE,
  SOFT_SHADOW,
  TOGGLE_LOOK,
  fontFamilyOf,
  headerPlacesOf,
  headerRoomsOf,
  lineOf,
  nameWeightOf,
  noteTextPlaceIn,
  personCornerRadius,
  textSideInset,
} from './drawing';
import type { Measure } from '../text/layout';
import { outlinedTextBlock } from './outlinedText';
import { canvasMeasure, placeTextBlock, type TextBlock, type TextBlockInput } from './textBlock';
import { labelColorsOf, writesStyledInside } from './labelColors';
import {
  LABEL_BACK,
  nameColorsOf,
  nameLookOf,
  styledTextBlock,
  type NameLook,
  type StyledBlock,
} from './shapeText';
import { SANS_FAMILY } from './robotoFonts';

/**
 * The fonts text is drawn in, first available first: Roboto, loaded from the app's own bytes
 * (`robotoFonts.ts`, ADR 0083), then the system's until it is.
 */
export const FONT_FAMILY = [...SANS_FAMILY];

/** What a label names: an element, its component, a relation, or how many an aggregated one stands for. */
export type LabelKind = 'name' | 'detail' | 'relation' | 'count-badge';

/**
 * What a name draws beyond its text (ADR 0088): a line under each of its lines, which are written as
 * given, each as wide as `widths` says, `lineHeight` apart, at `size`.
 */
export interface LabelDecor {
  underline?: { widths: readonly number[]; lineHeight: number; size: number };
}

/**
 * Makes what a label is drawn with, from text laid out by this module. `room` is the height the label
 * may take inside its shape; a factory that cannot fit the text in it gives nothing.
 */
export interface TextFactory {
  /**
   * `runs`, on a detail, are its text emphasis (ADR 0082), drawn in place of `options.text`; `decor`,
   * on a name, what it draws beyond its text (ADR 0088), which a factory may leave out.
   */
  (
    options: CanvasTextOptions,
    kind: LabelKind,
    room?: number,
    runs?: readonly EmphasisRun[],
    decor?: LabelDecor,
  ): Container | undefined;
  /** How it measures a detail, so that a shape's text block is placed as it draws; Roboto's otherwise. */
  measure?: Measure;
  /** How it measures a name. */
  measureName?: (text: string) => number;
  /** How it draws a note's text, as canvas text otherwise. */
  note?: (note: NoteShape, color: Color, drawing?: ResolvedDrawing) => Container;
}

/** How a label is written: where, in what room, with what text emphasis and what it draws beyond. */
type Write = (
  options: CanvasTextOptions,
  detail: boolean,
  room: number,
  runs?: readonly EmphasisRun[],
  decor?: LabelDecor,
) => Container | undefined;

/** Labels as canvas text: sharp at any resolution, but slow to make by the thousand. */
export const canvasText: TextFactory = (options) => new Text(options);
/**
 * How wide the outlines of plain blocks are, inside them, so that they show far out: four of the
 * drawing's borders.
 */
function blockOutlineOf(drawing: ResolvedDrawing): number {
  return drawing.shapes.borderWidth * 4;
}
/** The contrast below which a block's fill needs an outline to stand out from the canvas, from WCAG 1.4.11. */
const BLOCK_CONTRAST = 3;

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
  drawing: ResolvedDrawing = BASE_DRAWING,
  region: RegionColors = LIGHT_REGION,
): void {
  const outlines = new Map<Color, Rect[]>();
  const fills = new Map<Color, Rect[]>();
  const blockOutline = blockOutlineOf(drawing);
  const silhouettes = new Silhouettes(blockOutline);
  // An outline of plain blocks is a few canvas units wide, far less than a pixel far out.
  const hairlines = new Hairlines(drawing);
  /** A block of `fill`, outlined inside in `stroke` when given; drawn at once when in order. */
  const block = (rect: Rect, fill: Color, stroke: Color | undefined) => {
    const inner = stroke === undefined ? rect : grow(rect, -blockOutline);
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
    // An anchored part of a solid is drawn by its drawing's picture (ADR 0075).
    if (isAnchoredSolidPart(shape)) continue;
    const tag = nameTagOn(shape);
    if (shape.outline) {
      const fill = fillOf(shape);
      const outlined = isContainer(shape) || needsOutline(fill);
      const rim = outlined ? outlineColorOf(shape) : undefined;
      silhouettes.add({ rect: shape.rect, outline: shape.outline }, fill, rim, hairlines);
      if (inOrder) silhouettes.draw(graphics);
      if (tag) block(tag, shape.text?.background ?? fill, shape.text?.border ?? rim);
      if (inOrder) hairlines.stroke(graphics);
      continue;
    }
    // A table is its body and its header, and its rows draw nothing (ADR 0023).
    const rows = rowsBlocks(shape, blockOutline, rowColors);
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
    // A region is its faint fill and its border, drawn at once under what the loop draws after it,
    // as a container lies under its contents, alike in both themes.
    if (shape.region) {
      const { x, y, width, height } = shape.rect;
      graphics
        .rect(x, y, width, height)
        .fill({ color: shape.stroke, alpha: region.fillAlpha })
        .stroke({
          color: shape.stroke,
          alpha: region.borderAlpha,
          width: Math.min(blockOutline, width / 2, height / 2),
          alignment: 1,
        });
      continue;
    }
    // A shape drawn by its picture is a block of its plate.
    const outlined = isContainer(shape) || needsOutline(shape.fill);
    const rim = outlined ? outlineColorOf(shape) : undefined;
    if (fadedOrRunning(shape)) {
      // Its opacity and gradient show far out too (ADR 0088), drawn at once: blocks out of order
      // never overlap, so where it is drawn among them shows not.
      styledBlock(graphics, blockRectOf(shape), shape, rim, blockOutline);
      if (tag) block(tag, shape.text?.background ?? shape.fill, shape.text?.border ?? rim);
      if (inOrder) hairlines.stroke(graphics);
      continue;
    }
    block(blockRectOf(shape), shape.fill, rim);
    if (tag) block(tag, shape.text?.background ?? shape.fill, shape.text?.border ?? rim);
    if (inOrder) hairlines.stroke(graphics);
  }
  for (const [color, rects] of outlines) fillRects(graphics, color, rects);
  for (const [color, rects] of fills) fillRects(graphics, color, rects);
  silhouettes.draw(graphics);
  hairlines.stroke(graphics);
}

/** Whether a shape's own style shows far out: an opacity below 1 or a gradient (ADR 0088). */
function fadedOrRunning(shape: ElementShape): boolean {
  return shape.style?.opacity !== undefined || shape.style?.gradient !== undefined;
}

/**
 * A plain block of a shape whose opacity or gradient shows far out: outlined inside in `rim` when
 * given, as other blocks are, both as opaque as the shape, its fill running to its gradient's color.
 */
function styledBlock(
  graphics: Graphics,
  rect: Rect,
  shape: ElementShape,
  rim: Color | undefined,
  outline: number,
): void {
  const alpha = opacityOf(shape);
  const inner = rim === undefined ? rect : grow(rect, -outline);
  if (rim !== undefined) {
    // A frame inside it, which the fill does not cover, so that neither shows through the other.
    graphics.rect(rect.x, rect.y, rect.width, rect.height).stroke({
      color: rim,
      alpha,
      width: Math.min(outline, rect.width / 2, rect.height / 2),
      alignment: 1,
    });
  }
  if (inner.width <= 0 || inner.height <= 0) return;
  const running = shape.style?.gradient && gradientFill(shape.fill, shape.style.gradient);
  graphics
    .rect(inner.x, inner.y, inner.width, inner.height)
    .fill(running ? { fill: running, alpha } : { color: shape.fill, alpha });
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
  constructor(private readonly outline: number) {}

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
      graphics.stroke({ color, width: this.outline, alignment: 1 });
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
    graphics.stroke(
      line.opacity === undefined
        ? { color: line.stroke, width: line.width }
        : { color: line.stroke, alpha: line.opacity, width: line.width },
    );
  }
}

/**
 * Draws element shapes in full, in order, so that containers come under their contents: each body by
 * its kind, or by its own outline with its holes cut (ADR 0066), a collapsed container on a sheet that
 * shows behind it or with a second border inside it, and on every container the toggle that collapses
 * or expands it. A container the drawing defaults draw as a region is drawn as one (ADR 0086), and
 * with soft shadows each shape that holds nothing first lays its shadow.
 */
export function drawShapeOutlines(
  graphics: Graphics,
  shapes: readonly ElementShape[],
  rowColors: RowColors = LIGHT_ROWS,
  drawing: ResolvedDrawing = BASE_DRAWING,
  region: RegionColors = LIGHT_REGION,
): void {
  const hairlines = new Hairlines(drawing);
  for (const shape of shapes) {
    // An anchored part of a solid is drawn by its drawing's picture (ADR 0075).
    if (isAnchoredSolidPart(shape)) continue;
    if (shape.region) {
      drawRegion(graphics, shape, region, drawing);
      drawLeavingMark(graphics, shape);
      drawDestinationMark(graphics, shape);
      continue;
    }
    // A soft shadow, the drawing defaults' under a shape that holds nothing, or its own (ADR 0088).
    if (shape.row === undefined && castsShadow(shape, drawing, isContainer(shape))) {
      drawShadow(graphics, shape, bodyRectOf(shape), drawing);
    }
    if (drawRowsShape(graphics, shape, rowColors, drawing)) {
      drawToggle(graphics, shape);
      drawLeavingMark(graphics, shape);
      continue;
    }
    if (shape.outline) {
      drawOutlinedBody(graphics, shape, shape.outline, hairlines, drawing);
      // A solid's placeholder until its picture covers it (ADR 0075).
      drawSolidMark(graphics, shape, outlineColorOf(shape));
      drawNameTag(
        graphics,
        shape,
        { fill: fillOf(shape), stroke: outlineColorOf(shape) },
        hairlines,
        drawing,
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
      drawBody(graphics, shape, { ...body, x: body.x + SHEET, y: body.y + SHEET }, colors, drawing);
    }
    drawBody(graphics, shape, body, colors, drawing);
    hairlines.addBody(colors.stroke, shape, body);
    // A collapsed container whose drawing defaults count what it holds shows a second border.
    if (showsInnerBorder(shape.collapsed))
      drawInnerBorder(graphics, shape.kind, body, colors, drawing);
    // A solid's placeholder until its picture covers it (ADR 0075).
    drawSolidMark(graphics, shape, colors.stroke);
    drawLabelBack(graphics, shape, drawing);
    drawNameTag(graphics, shape, colors, hairlines, drawing);
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
  drawing: ResolvedDrawing,
): void {
  if (shape.part?.inDrawing) return;
  const colors = { fill: fillOf(shape), stroke: outlineColorOf(shape) };
  const placed = outlineAt({ rect: shape.rect, outline }) as PlacedOutline;
  if (shape.collapsed !== undefined && bodyOf(shape) !== shape.rect) {
    drawOutline(
      graphics,
      { ...placed, x: placed.x + SHEET, y: placed.y + SHEET },
      colors,
      drawing,
      shape,
    );
  }
  drawOutline(graphics, placed, colors, drawing, shape);
  // A border of its own that is dashed, dotted or none draws no line a pixel wide over it.
  if (bodyLook(shape, colors, drawing).pixelLine) {
    hairlines.addOutline(colors.stroke, placed, opacityOf(shape));
  }
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
  drawing: ResolvedDrawing,
): void {
  const tag = nameTagOf(shape);
  if (!tag) return;
  const placed = placedTag(tag, shape.rect);
  // In its text's back and line, where its text sets them (ADR 0088).
  const fill = shape.text?.background ?? colors.fill;
  const stroke = shape.text?.border ?? colors.stroke;
  graphics
    .roundRect(placed.x, placed.y, placed.width, placed.height, tagRadius(tag, drawing))
    .fill(fill)
    .stroke({ color: stroke, width: drawing.shapes.borderWidth });
  hairlines.add(stroke, 'rounded-rectangle', placed);
}

/**
 * Draws the back of a shape's name and detail written inside it, when its text sets a background or
 * a border (ADR 0088): a rectangle with slightly rounded corners around them, filled in the
 * background and lined in the border.
 */
function drawLabelBack(graphics: Graphics, shape: ElementShape, drawing: ResolvedDrawing): void {
  const text = shape.text;
  if (text?.background === undefined && text?.border === undefined) return;
  // Measured as the canvas writes its text, in Roboto's own widths.
  const back = styledBlockInside(shape, { measure: canvasMeasure }, drawing)?.back;
  if (!back) return;
  graphics.roundRect(back.x, back.y, back.width, back.height, LABEL_BACK.radius);
  if (text.background !== undefined) graphics.fill(text.background);
  if (text.border !== undefined) graphics.stroke({ color: text.border, width: 1 });
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
    .roundRect(x, y, width, height, TOGGLE_LOOK.radius)
    .fill(shape.fill)
    .stroke({ color: shape.stroke, width: TOGGLE_LOOK.border });
  const middleX = x + width / 2;
  const middleY = y + height / 2;
  const arm = width * TOGGLE_LOOK.arm;
  graphics.moveTo(middleX - arm, middleY).lineTo(middleX + arm, middleY);
  if (shape.collapsed !== undefined) {
    graphics.moveTo(middleX, middleY - arm).lineTo(middleX, middleY + arm);
  }
  graphics.stroke({ color: readableTextColors(shape.fill).name, width: TOGGLE_LOOK.sign });
}

/**
 * Writes each shape's name and, with `details`, its component's name, each in the room its shape
 * gives it; a label the factory cannot fit is left out. `backdrop` gives what a shape drawn by its
 * picture sits on, its container's fill or the canvas, which the name under the picture is written on.
 * `faceOf` draws a shape's face (ADR 0083), which it writes in place of its name and detail.
 */
export function writeShapeLabels(
  shapes: readonly ElementShape[],
  details: boolean,
  make: TextFactory = canvasText,
  backdrop: (shape: ElementShape) => Color = () => CANVAS_BACKGROUND,
  faceOf?: (shape: ElementShape) => Container | undefined,
  drawing: ResolvedDrawing = BASE_DRAWING,
  region: RegionColors = LIGHT_REGION,
): Container[] {
  const texts: Container[] = [];
  for (const shape of shapes) {
    // An anchored part of a solid writes its name only in the hover and selection marks (ADR 0075).
    if (isAnchoredSolidPart(shape)) continue;
    const write: Write = (options, detail, room, runs, decor) => {
      if (detail && !details) return undefined;
      const text = make(options, detail ? 'detail' : 'name', room, runs, decor);
      if (text) texts.push(text);
      return text;
    };
    // A region writes its name alone in its tab, in the theme's muted text (ADR 0086).
    if (shape.region) {
      writeRegionName(shape, write, region, drawing);
      writeLeavingMark(shape, write);
      continue;
    }
    const face = faceOf?.(shape);
    if (face) {
      texts.push(face);
      // A face that does not write the name leaves it to the shape's name tag (ADR 0083).
      if (nameTagOf(shape)) {
        writeNameTag(shape, nameColorsOf(shape, fillOf(shape)), write, drawing);
      }
    } else writeShapeText(shape, write, backdrop, make, drawing);
    writeLeavingMark(shape, write);
  }
  return texts;
}

/** Writes a region's name in its tab, after its icon, on one line, at 500 in the muted text. */
function writeRegionName(
  shape: ElementShape,
  write: Write,
  region: RegionColors,
  drawing: ResolvedDrawing,
): void {
  const { name, detail } = regionTabOf(shape, drawing);
  if (name.y + name.height > shape.rect.y + shape.rect.height) return;
  // Its detail, where it says more than its component's name, on the line under it.
  if (detail) {
    write(
      {
        text: detail.text,
        x: detail.rect.x,
        y: detail.rect.y,
        style: textStyle(
          drawing.text.detailSize,
          region.text,
          detail.rect.width,
          'left',
          'normal',
          drawing,
        ),
      },
      true,
      // Never shorter than a label of one line is drawn, whatever the drawing's line height.
      Math.max(detail.rect.height + 1, lineOf(drawing, drawing.text.detailSize)),
      shape.detailRuns,
    );
  }
  write(
    {
      text: shape.name,
      x: name.x,
      y: name.y,
      // Wrapped to its width, and cut to its one line with "…" when it runs longer.
      style: textStyle(
        drawing.text.containerNameSize,
        region.text,
        name.width,
        'left',
        '500',
        drawing,
      ),
    },
    false,
    Math.max(name.height + 1, lineOf(drawing, drawing.text.containerNameSize)),
  );
}

/** Draws relations along their routes, with an arrowhead at the end of directed ones. */
export function drawRelationRoutes(graphics: Graphics, lines: readonly RelationLine[]): void {
  // An open arrowhead is stroked at its line's width, a filled one filled.
  for (const line of lines) {
    const alpha = line.opacity ?? 1;
    if (drawnAsCurve(line)) {
      strokeCurve(graphics, drawnCurve(line), { color: line.stroke, width: line.width, alpha });
    } else {
      strokeRoute(graphics, line.route, line.arrowhead, {
        color: line.stroke,
        width: line.width,
        dash: line.dash,
        alpha,
      });
    }
    if (line.arrowhead) fillArrowhead(graphics, line.arrowhead, line.stroke, line.width, alpha);
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
    // A relation's opacity fades its line and arrowhead, never its label (ADR 0088).
    const alpha = line.opacity ?? 1;
    if (piece.curve && line.dash === 'solid') {
      strokeCurve(graphics, piece.curve, { color: line.stroke, width: line.width, alpha });
      continue;
    }
    strokeLine(
      graphics,
      piece.points,
      { color: line.stroke, width: line.width, dash: line.dash, alpha },
      piece,
    );
  }
  for (const line of ends) {
    if (line.arrowhead) {
      fillArrowhead(graphics, line.arrowhead, line.stroke, line.width, line.opacity ?? 1);
    }
  }
}

/**
 * Draws pieces of relations' routes as plain lines, without dashes or arrowheads: a directed line's
 * last piece goes on to the tip, where no arrowhead covers it.
 */
export function drawPieceLines(graphics: Graphics, pieces: readonly RoutePiece[]): void {
  for (const piece of pieces) {
    const { line } = piece;
    const points = piece.last && line.arrowhead ? [...piece.points, line.to] : piece.points;
    strokeLine(
      graphics,
      points,
      { color: line.stroke, width: line.width, dash: 'solid', alpha: line.opacity ?? 1 },
      piece,
    );
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
  drawing: ResolvedDrawing = BASE_DRAWING,
  written?: (label: Container, line: RelationLine) => void,
): Container[] {
  return lines.flatMap((line) => {
    // An aggregated relation's count badge (ADR 0086): a pill bordered in its line's color.
    const countBadge = line.countBadge === true;
    const text =
      line.label &&
      make(
        {
          text: line.label,
          anchor: 0.5,
          x: line.middle.x,
          y: line.middle.y,
          style: {
            fontFamily: fontFamilyOf(drawing),
            fontSize: drawing.text.labelSize,
            fill: colors.text,
            stroke: { color: colors.back, width: 4, join: 'round' },
          },
        },
        countBadge ? 'count-badge' : 'relation',
      );
    if (!text) return [];
    if (countBadge) paintCountBadgeBorder(text, line.stroke);
    written?.(text, line);
    return [text];
  });
}

/** A label that draws a border of its own, as a count badge does, and the color it draws it in. */
interface Bordered {
  paintBorder(color: Color): void;
}

/** Draws a count badge's border in a color: its line's, in the theme the label is drawn in. */
export function paintCountBadgeBorder(label: Container, color: Color): void {
  if ('paintBorder' in label) (label as Container & Bordered).paintBorder(color);
}

/** Draws notes and free arrows, in their own colors or else the light theme's. */
export function drawFreeShapes(
  graphics: Graphics,
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
  drawing: ResolvedDrawing = BASE_DRAWING,
): void {
  const width = arrowWidthOf(drawing);
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
      width,
      dash: 'solid',
    });
    fillArrowhead(graphics, arrow.arrowhead, color, width);
  }
}

/**
 * Writes the text of notes: in white, tinted to the color that reads on the note's fill, so that a new
 * theme or a new fill only tints it again.
 */
export function writeNoteTexts(
  notes: readonly NoteShape[],
  make?: TextFactory,
  drawing: ResolvedDrawing = BASE_DRAWING,
): Container[] {
  return notes.map((note) => {
    const color = note.fill === undefined ? NOTE_TEXT : readableTextColors(note.fill).name;
    if (make?.note) return make.note(note, color, drawing);
    const place = noteTextPlace(note, drawing);
    const text = new Text({
      text: note.text,
      x: place.x,
      y: place.y,
      style: textStyle(place.size, '#FFFFFF', place.width, 'left', 'normal', drawing),
    });
    text.tint = color;
    return text;
  });
}

/**
 * Where a note writes its text, and at what size: inside it, the drawing's side inset in at the sides
 * (12 units unless it says otherwise), at its `text.noteSize` (`noteTextPlaceIn`, which the SVG
 * reads too).
 */
export function noteTextPlace(
  note: NoteShape,
  drawing: ResolvedDrawing = BASE_DRAWING,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
} {
  return noteTextPlaceIn(note.rect, drawing);
}

/**
 * Traces the outline of a shape's body in a rectangle, as `drawBody` strokes it, for a stroke of
 * its own: every part of it in the current path.
 */
function traceOutline(
  graphics: Graphics,
  styled: Styled,
  rect: Rect,
  drawing: ResolvedDrawing,
): void {
  const { x, y, width, height } = rect;
  switch (drawnKindOf(styled)) {
    case 'rectangle':
      graphics.rect(x, y, width, height);
      return;
    case 'rounded-rectangle':
      graphics.roundRect(x, y, width, height, cornerRadiusOf(styled, drawing, width, height));
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
      const figure = personFigure(rect);
      graphics.poly(personBodyPoints(figure, personCornerRadius(drawing, width)), true);
      graphics.circle(figure.head.x, figure.head.y, figure.head.radius);
      return;
    }
  }
}

/**
 * Lays a shape's soft shadow, under where its body is then drawn: as faint as the shape is opaque
 * (ADR 0088).
 */
function drawShadow(
  graphics: Graphics,
  styled: Styled,
  rect: Rect,
  drawing: ResolvedDrawing,
): void {
  const { offset, alpha, layers } = SOFT_SHADOW;
  const opacity = opacityOf(styled);
  for (let layer = layers - 1; layer >= 0; layer--) {
    const at = grow({ ...rect, y: rect.y + offset }, layer);
    traceSilhouette(graphics, styled, at, drawing);
    graphics.fill({ color: 0x000000, alpha: (alpha / layers) * opacity });
  }
}

/** Traces the closed outline a shape's shadow fills: its body, without a cylinder's front cap. */
function traceSilhouette(
  graphics: Graphics,
  styled: Styled,
  rect: Rect,
  drawing: ResolvedDrawing,
): void {
  const { x, y, width, height } = rect;
  switch (drawnKindOf(styled)) {
    case 'rectangle':
      graphics.rect(x, y, width, height);
      return;
    case 'ellipse':
      graphics.ellipse(x + width / 2, y + height / 2, width / 2, height / 2);
      return;
    case 'cylinder':
      graphics.roundRect(x, y, width, height, Math.min(width / 2, cylinderCap(rect) * 2));
      return;
    case 'person': {
      const figure = personFigure(rect);
      graphics.poly(personBodyPoints(figure, personCornerRadius(drawing, width)), true);
      return;
    }
    default:
      graphics.roundRect(x, y, width, height, cornerRadiusOf(styled, drawing, width, height));
  }
}

/** A collapsed container's second border, `INNER_BORDER` inside its body, 1 wide (ADR 0086). */
function drawInnerBorder(
  graphics: Graphics,
  kind: ShapeKind,
  body: Rect,
  colors: { stroke: Color },
  drawing: ResolvedDrawing,
): void {
  const inner = grow(body, -INNER_BORDER);
  if (inner.width <= 0 || inner.height <= 0) return;
  traceOutline(graphics, { kind }, inner, drawing);
  graphics.stroke({ color: colors.stroke, width: 1 });
}

/**
 * Outlines one device pixel wide whatever the zoom, gathered by color: a stroke in canvas units
 * thinner than a pixel, which a canvas drawn without antialiasing leaves out but at its round
 * corners (ADR 0014), is drawn again as a pixel line, so that no shape's outline ever vanishes
 * (ADR 0033). They are stroked after the drawings they outline, all of one color in one path, so
 * that they cost one more batch, not one per shape.
 */
class Hairlines {
  constructor(private readonly drawing: ResolvedDrawing) {}

  /** By color, and for those of shapes less than opaque, by color and opacity (ADR 0088). */
  private readonly byColor = new Map<
    string,
    (
      | { kind: ShapeKind | 'block'; rect: Rect }
      | { styled: Styled; rect: Rect }
      | { points: number[]; closed: boolean }
    )[]
  >();

  add(color: Color, kind: ShapeKind | 'block', rect: Rect): void {
    append(this.byColor, color, { kind, rect });
  }

  /**
   * A shape's body, traced as it is drawn, when its border is a solid line: a dashed, dotted or
   * missing border of its own draws no line a pixel wide over it (ADR 0088).
   */
  addBody(color: Color, styled: Styled, rect: Rect): void {
    if (!bodyLook(styled, { fill: color, stroke: color }, this.drawing).pixelLine) return;
    if (styled.style === undefined) append(this.byColor, color, { kind: styled.kind, rect });
    else append(this.byColor, hairlineKey(color, opacityOf(styled)), { styled, rect });
  }

  /** A polygon or a polyline, as points on the canvas. */
  addPolygon(color: Color, points: number[], closed: boolean, alpha = 1): void {
    if (points.length >= 4) append(this.byColor, hairlineKey(color, alpha), { points, closed });
  }

  /** Every contour of an outline placed on the canvas: its fills and holes closed, its lines open. */
  addOutline(color: Color, placed: PlacedOutline, alpha = 1): void {
    for (const contour of flattenOutline(placed.fitted)) {
      this.addPolygon(
        color,
        placedPoints(contour.points, placed.x, placed.y),
        contour.role !== 'line',
        alpha,
      );
    }
  }

  stroke(graphics: Graphics): void {
    for (const [key, outlines] of this.byColor) {
      for (const outline of outlines) {
        if ('points' in outline) graphics.poly(outline.points, outline.closed);
        else if ('styled' in outline) {
          traceOutline(graphics, outline.styled, outline.rect, this.drawing);
        } else if (outline.kind === 'block') {
          const { rect } = outline;
          graphics.rect(rect.x, rect.y, rect.width, rect.height);
        } else traceOutline(graphics, { kind: outline.kind }, outline.rect, this.drawing);
      }
      const [color, alpha] = hairlineColorOf(key);
      graphics.stroke(
        alpha === 1
          ? { color, width: 1, pixelLine: true }
          : { color, alpha, width: 1, pixelLine: true },
      );
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
  drawing: ResolvedDrawing = BASE_DRAWING,
  styled?: Styled,
): void {
  // Its own border, opacity and gradient (ADR 0088); a corner radius does not apply to it.
  const look = styled?.style ? bodyLook(styled, colors, drawing) : undefined;
  const border = styled ? borderWidthOf(styled, drawing) : drawing.shapes.borderWidth;
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
    graphics.poly(shifted(fill)).fill(look ? look.fill : colors.fill);
    for (const hole of holesIn.get(fill) ?? []) graphics.poly(shifted(hole)).cut();
  }
  const alpha = styled ? opacityOf(styled) : 1;
  const stroke = look ? look.stroke : { color: colors.stroke, width: border };
  flat.forEach((contour, at) => {
    if (contour.points.length < 4) return;
    if (contour.role !== 'line') {
      if (stroke) graphics.poly(shifted(contour), true).stroke(stroke);
      else if (look?.dashed) {
        strokeDashedPolyline(graphics, pointsOf(shifted(contour)), true, look.dashed);
      }
      return;
    }
    // Its lines are what the outline draws, at their own width, whatever its border.
    const width = Math.max(border, contours[at]?.width ?? 0);
    graphics
      .poly(shifted(contour), false)
      .stroke(
        alpha === 1
          ? { color: colors.stroke, width, cap: 'round', join: 'round' }
          : { color: colors.stroke, alpha, width, cap: 'round', join: 'round' },
      );
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

/**
 * Draws a shape's body in a rectangle, filled and stroked, approximating each kind of shape, with its
 * own style where it has one (ADR 0088): a rectangle of either kind at its own corner radius, its
 * border at its own width, dashed or dotted, or none at 0, its fill running to a gradient's color, and
 * all of it as opaque as it is.
 */
function drawBody(
  graphics: Graphics,
  styled: Styled,
  rect: Rect,
  colors: { fill: Color; stroke: Color },
  drawing: ResolvedDrawing,
): void {
  const { x, y, width, height } = rect;
  const look = bodyLook(styled, colors, drawing);
  const paint = () => {
    graphics.fill(look.fill);
    if (look.stroke) graphics.stroke(look.stroke);
  };
  switch (drawnKindOf(styled)) {
    case 'rectangle':
      graphics.rect(x, y, width, height);
      paint();
      break;
    case 'rounded-rectangle':
      graphics.roundRect(x, y, width, height, cornerRadiusOf(styled, drawing, width, height));
      paint();
      break;
    case 'ellipse':
      graphics.ellipse(x + width / 2, y + height / 2, width / 2, height / 2);
      paint();
      break;
    case 'cylinder': {
      const cap = cylinderCap(rect);
      const centerX = x + width / 2;
      const radiusX = width / 2;
      // The body, closed along the back of the top cap; then the front of the top cap.
      graphics.poly([
        ...arcPoints(centerX, y + height - cap, radiusX, cap, Math.PI, 0),
        ...arcPoints(centerX, y + cap, radiusX, cap, 0, -Math.PI),
      ]);
      paint();
      if (look.stroke) {
        graphics.poly(arcPoints(centerX, y + cap, radiusX, cap, Math.PI, 0), false);
        graphics.stroke(look.stroke);
      }
      break;
    }
    case 'person': {
      // A head over shoulders drawn as one rounded arc (ADR 0086).
      const figure = personFigure(rect);
      graphics.poly(personBodyPoints(figure, personCornerRadius(drawing, width)), true);
      paint();
      graphics.circle(figure.head.x, figure.head.y, figure.head.radius);
      paint();
      break;
    }
  }
  if (look.dashed) {
    for (const { points, closed } of outlinePolylines(styled, rect, drawing)) {
      strokeDashedPolyline(graphics, points, closed, look.dashed);
    }
  }
}

/** How a shape's body is painted: its fill, and its border, solid, dashed or none. */
interface BodyLook {
  fill: FillInput;
  /** Its border, when solid and wider than 0. */
  stroke?: StrokeInput;
  /** Its border, when dashed or dotted and wider than 0. */
  dashed?: DashedStroke;
  /** Whether a line a pixel wide outlines it too, as every solid border is (`Hairlines`). */
  pixelLine: boolean;
}

interface DashedStroke {
  color: Color;
  width: number;
  dash: Exclude<Dash, 'solid'>;
  alpha: number;
}

/**
 * How a shape's body is painted: in exactly the styles drawn before ADR 0088 when it has no style of
 * its own.
 */
function bodyLook(
  styled: Pick<Styled, 'style'>,
  colors: { fill: Color; stroke: Color },
  drawing: ResolvedDrawing,
): BodyLook {
  const width = borderWidthOf(styled, drawing);
  const alpha = opacityOf(styled);
  const gradient = styled.style?.gradient;
  const dash = styled.style?.dash;
  const running = gradient ? gradientFill(colors.fill, gradient) : undefined;
  let fill: FillInput;
  if (running) fill = alpha === 1 ? running : { fill: running, alpha };
  else fill = alpha === 1 ? colors.fill : { color: colors.fill, alpha };
  if (width <= 0) return { fill, pixelLine: false };
  if (dash !== undefined) {
    return { fill, dashed: { color: colors.stroke, width, dash, alpha }, pixelLine: false };
  }
  const stroke =
    alpha === 1 ? { color: colors.stroke, width } : { color: colors.stroke, width, alpha };
  return { fill, stroke, pixelLine: true };
}

/** The gradients made so far, by their colors and direction; null where none can be made. */
const gradients = new Map<string, FillGradient | null>();

/**
 * The fill of a gradient from a shape's fill to its second color, made once for each pair and
 * direction and laid over the bounds of what it fills; none where the page cannot draw one, such as a
 * page without a 2D canvas, which then fills in the shape's fill.
 */
export function gradientFill(from: Color, gradient: ShapeGradient): FillGradient | undefined {
  const key = `${from} ${gradient.to} ${gradient.direction}`;
  let made = gradients.get(key);
  if (made === undefined) {
    try {
      made = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: gradient.direction === 'down' ? { x: 0, y: 1 } : { x: 1, y: 0 },
        colorStops: [
          { offset: 0, color: from },
          { offset: 1, color: gradient.to },
        ],
        textureSpace: 'local',
      });
      made.buildGradient();
    } catch {
      made = null;
    }
    gradients.set(key, made);
  }
  return made ?? undefined;
}

/**
 * The lines a shape's body is outlined with, as points on the canvas, for a dashed or dotted border:
 * its kind's outline, closed, and a cylinder's front cap and a person's head as lines of their own.
 */
function outlinePolylines(
  styled: Styled,
  rect: Rect,
  drawing: ResolvedDrawing,
): { points: Point[]; closed: boolean }[] {
  const { x, y, width, height } = rect;
  switch (drawnKindOf(styled)) {
    case 'rectangle':
      return [
        {
          points: [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
          ],
          closed: true,
        },
      ];
    case 'rounded-rectangle': {
      const r = cornerRadiusOf(styled, drawing, width, height);
      const corner = (cx: number, cy: number, from: number) =>
        arcPoints(cx, cy, r, r, from, from + Math.PI / 2, 6);
      return [
        {
          points: pointsOf([
            ...corner(x + width - r, y + r, -Math.PI / 2),
            ...corner(x + width - r, y + height - r, 0),
            ...corner(x + r, y + height - r, Math.PI / 2),
            ...corner(x + r, y + r, Math.PI),
          ]),
          closed: true,
        },
      ];
    }
    case 'ellipse': {
      const around = arcPoints(x + width / 2, y + height / 2, width / 2, height / 2, 0, TURN, 48);
      return [{ points: pointsOf(around).slice(0, -1), closed: true }];
    }
    case 'cylinder': {
      const cap = cylinderCap(rect);
      const centerX = x + width / 2;
      const radiusX = width / 2;
      return [
        {
          points: pointsOf([
            ...arcPoints(centerX, y + height - cap, radiusX, cap, Math.PI, 0, 16),
            ...arcPoints(centerX, y + cap, radiusX, cap, 0, -Math.PI, 16),
          ]),
          closed: true,
        },
        {
          points: pointsOf(arcPoints(centerX, y + cap, radiusX, cap, Math.PI, 0, 16)),
          closed: false,
        },
      ];
    }
    case 'person': {
      const figure = personFigure(rect);
      const { head } = figure;
      const around = arcPoints(head.x, head.y, head.radius, head.radius, 0, TURN, 24);
      return [
        {
          points: pointsOf(personBodyPoints(figure, personCornerRadius(drawing, width))),
          closed: true,
        },
        { points: pointsOf(around).slice(0, -1), closed: true },
      ];
    }
  }
}

const TURN = Math.PI * 2;

/** Strokes a polyline dashed or dotted, as a line of that pattern is; closed back to its first point. */
function strokeDashedPolyline(
  graphics: Graphics,
  points: readonly Point[],
  closed: boolean,
  style: DashedStroke,
): void {
  const first = points[0];
  if (first === undefined || points.length < 2) return;
  strokeLine(graphics, closed ? [...points, first] : points, style, {
    bendAtStart: closed,
    bendAtEnd: closed,
  });
}

/** Flat points, as `poly` takes them, as points. */
function pointsOf(flat: readonly number[]): Point[] {
  const points: Point[] = [];
  for (let at = 0; at + 1 < flat.length; at += 2) {
    points.push({ x: flat[at] as number, y: flat[at + 1] as number });
  }
  return points;
}

/** The key hairlines are gathered by: their color, and their opacity below 1. */
function hairlineKey(color: Color, alpha: number): string {
  return alpha === 1 ? color : `${color} ${alpha}`;
}

function hairlineColorOf(key: string): [Color, number] {
  const [color, alpha] = key.split(' ');
  return [color as Color, alpha === undefined ? 1 : Number(alpha)];
}

/**
 * What a shape writes under its name: its detail, or its component's name on a shape made without
 * one; and on a collapsed container, how many shapes it holds.
 */
export function detailOf(shape: ElementShape): string {
  const detail = shape.detail ?? shape.componentName;
  if (shape.collapsed === undefined) return detail;
  const inside = countText(shape.collapsed);
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
  make: TextFactory | undefined,
  drawing: ResolvedDrawing,
): void {
  if (writeRowsText(shape, write, drawing)) return;
  // In its name tag, under its own outline when its name does not fit inside it, or at the side its
  // text names (ADR 0066's clarifications, ADR 0088).
  if (nameTagOf(shape)) {
    writeNameTag(shape, nameColorsOf(shape, fillOf(shape)), write, drawing);
    return;
  }
  if (shape.outline) {
    writeOutlinedText(shape, shape.outline, write, make, drawing);
    return;
  }
  const colors = labelColorsOf(shape, shape.fill);
  const rooms = labelRooms(shape, drawing);
  const inset = textSideInset(drawing);
  const { nameSize, detailSize, containerNameSize } = drawing.text;
  const weight = nameWeightOf(drawing);
  if (isContainer(shape)) {
    const { x, y, width, height } = bodyOf(shape);
    // Right of the icon its header may show.
    const shift = headerShift(shape);
    const wrap = headerWrapOf(shape, drawing);
    const { nameTop, detailTop } = headerPlacesOf(drawing);
    if (rooms.name > 0) {
      write(
        {
          text: shape.name,
          x: x + inset + shift,
          y: y + nameTop,
          style: textStyle(containerNameSize, colors.name, wrap, 'left', weight, drawing),
        },
        false,
        rooms.name,
      );
    }
    // A collapsed container's count, on a line of its own or first on the detail's, under its detail
    // wrapped to its lines (ADR 0082).
    const { detail, detailRoom, count, countTop, countRoom } = headerLines(
      shape,
      height,
      wrap,
      make?.measure,
      drawing,
    );
    if (rooms.detail > 0 && detail !== '') {
      write(
        {
          text: detail,
          x: x + inset + shift,
          y: y + detailTop,
          style: textStyle(detailSize, colors.detail, wrap, 'left', 'normal', drawing),
        },
        true,
        shape.collapsed === undefined ? rooms.detail : detailRoom,
        // Its detail with text emphasis, unless a collapsed one's count came first on its line.
        detail === (shape.detail ?? shape.componentName) ? shape.detailRuns : undefined,
      );
    }
    if (count !== undefined && countRoom !== undefined) {
      write(
        {
          text: count,
          x: x + inset + shift,
          y: y + (countTop ?? countLineTopOf(drawing)),
          style: textStyle(
            detailSize,
            colors.detail,
            Math.max(1, width - 2 * inset),
            'left',
            'normal',
            drawing,
          ),
        },
        true,
        countRoom,
      );
    }
    return;
  }
  const band = nameBandOf(shape);
  if (band) {
    writeBandText(shape, band, rooms, readableTextColors(backdrop(shape)), write, drawing);
    return;
  }
  // Right of the icon beside its name, when it shows one.
  const area = besideImage(shape, labelArea(shape));
  if (area.height <= 0) return;
  // As its text says, when it says anything (ADR 0088).
  if (shape.text) {
    const styled = styledBlockInside(shape, make, drawing);
    if (styled) writeStyledText(shape, styled, write, drawing);
    return;
  }
  const centerX = area.x + area.width / 2;
  const wrap = Math.max(1, area.width - inset);
  const block = textBlockOf(shape, area, wrap, make, drawing);
  write(
    {
      text: shape.name,
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: block.nameTop,
      style: textStyle(nameSize, colors.name, wrap, 'center', weight, drawing),
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
      style: textStyle(detailSize, colors.detail, wrap, 'center', 'normal', drawing),
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
  drawing: ResolvedDrawing = BASE_DRAWING,
): TextBlock {
  const input = textBlockInput(shape, area, wrap, make, drawing);
  // A shape whose text says how it writes its name places it so (ADR 0088).
  return shape.text ? styledTextBlock(input, shape.text).block : placeTextBlock(input);
}

/** What a shape's text block is placed from. */
function textBlockInput(
  shape: ElementShape,
  area: Rect,
  wrap: number,
  make: Pick<TextFactory, 'measure' | 'measureName'> | undefined,
  drawing: ResolvedDrawing,
): TextBlockInput {
  return {
    drawing,
    area,
    wrap,
    name: shape.name,
    detail: detailOf(shape),
    ...(shape.detailRuns ? { detailRuns: shape.detailRuns } : {}),
    ...(shape.detailLines === undefined ? {} : { lines: shape.detailLines }),
    ...(shape.textPlacement === undefined ? {} : { placement: shape.textPlacement }),
    ...(make?.measure ? { measure: make.measure } : {}),
    // A styled name is measured in its own widths.
    ...(make?.measureName && !shape.text ? { measureName: make.measureName } : {}),
  };
}

/**
 * The text block of a shape that writes its name and detail inside itself as its text says (ADR
 * 0088): a shape with its kind's outline, no rows, no picture band and no tag, that holds nothing;
 * none for any other, which writes as always, and for one whose text says nothing.
 */
export function styledBlockInside(
  shape: ElementShape,
  make: Pick<TextFactory, 'measure' | 'measureName'> | undefined,
  drawing: ResolvedDrawing,
): StyledBlock | undefined {
  const text = shape.text;
  if (!text || !writesStyledInside(shape)) return undefined;
  const area = besideImage(shape, labelArea(shape));
  if (area.height <= 0) return undefined;
  const wrap = Math.max(1, area.width - textSideInset(drawing));
  return styledTextBlock(textBlockInput(shape, area, wrap, make, drawing), text);
}

/** The style a name is written in, as its look says, in `fill`, aligned as given. */
function nameStyle(
  look: NameLook,
  fill: Color,
  align: 'left' | 'center' | 'right',
): TextStyleOptions {
  return {
    fontFamily: [...look.family],
    fontSize: look.size,
    fontWeight: look.weight,
    fontStyle: look.italic ? 'italic' : 'normal',
    fill,
    align,
    wordWrap: false,
  };
}

/** Where a label aligned so starts across, and its anchor. */
function alignedAt(
  align: 'left' | 'center' | 'right',
  left: number,
  right: number,
): { x: number; anchor: number } {
  return align === 'left'
    ? { x: left, anchor: 0 }
    : align === 'right'
      ? { x: right, anchor: 1 }
      : { x: (left + right) / 2, anchor: 0.5 };
}

/**
 * Writes a shape's name and detail as its text says (ADR 0088): the name on the lines its block broke
 * it into, in its font, size, weight and style, aligned in its column and underlined when asked, in
 * its own color or the one that reads on its back or its fill; the detail under it, aligned alike.
 */
function writeStyledText(
  shape: ElementShape,
  styled: StyledBlock,
  write: Write,
  drawing: ResolvedDrawing,
): void {
  const { block, look, lines, widths, align, left, right, wrap } = styled;
  const colors = nameColorsOf(shape, shape.fill);
  const at = alignedAt(align, left, right);
  if (lines.length > 0) {
    const lineHeight = look.size * drawing.text.lineHeight;
    write(
      {
        text: lines.join('\n'),
        anchor: { x: at.anchor, y: 0 },
        x: at.x,
        y: block.nameTop,
        style: nameStyle(look, colors.name, align),
      },
      false,
      // Its lines were cut to the block already: what it draws is what it holds.
      block.nameHeight + lineHeight,
      undefined,
      look.underline ? { underline: { widths, lineHeight, size: look.size } } : undefined,
    );
  }
  if (block.detailLines === 0) return;
  write(
    {
      text: detailOf(shape),
      anchor: { x: at.anchor, y: 0 },
      x: at.x,
      y: block.detailTop,
      style: textStyle(drawing.text.detailSize, colors.detail, wrap, align, 'normal', drawing),
    },
    true,
    block.detailRoom,
    shape.detailRuns,
  );
}

/**
 * Writes the name and detail of a shape with its own outline (ADR 0066, ADR 0067), in colours that
 * read on its fill or its part's main color:
 *
 * - an expanded container in its header, as any container, along the stretch of the header line
 *   its outline holds, right of its icon there;
 * - any other shape in its label area, right of its icon there, placed by its text placement, its
 *   name whole, its words never cut (`nameLinesInside`), with its detail wrapped under it to its
 *   `lines` and to what the area holds (`outlinedTextBlock`, ADR 0082). A collapsed container's
 *   detail starts with its count, so that cutting it never cuts the count.
 *
 * A name that does not fit there whole is written under the shape, whole, in its name tag
 * (`writesNameBelow`, ADR 0066's clarifications). A container whose header has no room writes
 * nothing, and the hover and selection marks write its name beside it.
 */
function writeOutlinedText(
  shape: ElementShape,
  outline: ShapeOutline,
  write: Write,
  make: TextFactory | undefined,
  drawing: ResolvedDrawing,
): void {
  const colors = labelColorsOf(shape, fillOf(shape));
  const { containerNameSize, detailSize } = drawing.text;
  if (shape.part?.inDrawing === true) {
    writePartName(shape, outline, colors.name, write);
    return;
  }
  const rooms = outlinedRooms(shape, outline, drawing);
  if (showsContents(shape)) {
    const stretch = headerStretch({ ...shape, outline });
    if (!stretch) return;
    const { y } = shape.rect;
    const left = stretch.x + 2 + headerShift(shape);
    const wrap = Math.max(1, stretch.x + stretch.width - left);
    const { nameTop, detailTop } = headerPlacesOf(drawing);
    if (rooms.name > 0) {
      write(
        {
          text: shape.name,
          x: left,
          y: y + nameTop,
          style: textStyle(
            containerNameSize,
            colors.name,
            wrap,
            'left',
            nameWeightOf(drawing),
            drawing,
          ),
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
          y: y + detailTop,
          style: textStyle(detailSize, colors.detail, wrap, 'left', 'normal', drawing),
        },
        true,
        rooms.detail,
        detail === (shape.detail ?? shape.componentName) ? shape.detailRuns : undefined,
      );
    }
    return;
  }
  const placed = outlinedTextBlock(shape, outline, make?.measure);
  if (!placed) return;
  const { lines, area, wrap, detail, runs, block } = placed;
  const centerX = area.x + area.width / 2;
  write(
    {
      text: lines.join('\n'),
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: block.nameTop,
      style: wholeLines(colors.name, wrap, drawing),
    },
    false,
    Math.max(area.height, block.nameHeight) + PART_NAME_LINE / 2,
  );
  if (block.detailLines === 0) return;
  write(
    {
      text: detail,
      anchor: { x: 0.5, y: 0 },
      x: centerX,
      y: block.detailTop,
      style: textStyle(detailSize, colors.detail, wrap, 'center', 'normal', drawing),
    },
    true,
    block.detailRoom,
    runs,
  );
}

/** The style of a name written on lines already broken, each whole: in its weight, at its size. */
function wholeLines(fill: Color, width: number, drawing: ResolvedDrawing): TextStyleOptions {
  return {
    ...textStyle(drawing.text.nameSize, fill, width, 'center', nameWeightOf(drawing), drawing),
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
  write: Write,
  drawing: ResolvedDrawing,
): void {
  const tag = nameTagOf(shape);
  if (!tag) return;
  const placed = placedTag(tag, shape.rect);
  if (tag.styled) {
    writeStyledTag(shape, tag, placed, colors, write, drawing);
    return;
  }
  const x = placed.x + placed.width / 2;
  const top = placed.y + TAG_PADDING;
  const height = tag.lines.length * PART_NAME_LINE;
  write(
    {
      text: tag.lines.join('\n'),
      anchor: { x: 0.5, y: 0 },
      x,
      y: top,
      style: wholeLines(colors.name, placed.width, drawing),
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
      style: textStyle(
        drawing.text.detailSize,
        colors.detail,
        placed.width,
        'center',
        'normal',
        drawing,
      ),
    },
    true,
    TAG_DETAIL_LINE,
  );
}

/**
 * Writes the name and detail of a tag made as its shape's text says (ADR 0088): its name on its
 * lines, in the text's font, size, weight and style, aligned between its insets, underlined when
 * asked, and its detail under it.
 */
function writeStyledTag(
  shape: ElementShape,
  tag: NameTag,
  placed: Rect,
  colors: { name: Color; detail: Color },
  write: Write,
  drawing: ResolvedDrawing,
): void {
  const styled = tag.styled;
  if (!styled) return;
  const look = nameLookOf(shape.text, BASE_DRAWING, PART_NAME_SIZE, '700');
  const align = shape.text?.align ?? 'center';
  const left = placed.x + styled.inset;
  const right = placed.x + placed.width - styled.inset;
  const at = alignedAt(align, left, right);
  const top = placed.y + styled.padding;
  const height = tag.lines.length * styled.lineHeight;
  write(
    {
      text: tag.lines.join('\n'),
      anchor: { x: at.anchor, y: 0 },
      x: at.x,
      y: top,
      style: nameStyle(look, colors.name, align),
    },
    false,
    height + styled.lineHeight / 2,
    undefined,
    look.underline
      ? { underline: { widths: styled.widths, lineHeight: styled.lineHeight, size: look.size } }
      : undefined,
  );
  if (tag.detail === '') return;
  write(
    {
      text: tag.detail,
      anchor: { x: at.anchor, y: 0 },
      x: at.x,
      y: top + height + 1,
      style: textStyle(
        drawing.text.detailSize,
        colors.detail,
        Math.max(1, right - left),
        align,
        'normal',
        drawing,
      ),
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
        ...textStyle(PART_NAME_SIZE, color, area.width, 'center', '700'),
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
  drawing: ResolvedDrawing,
): { name: number; detail: number } {
  const none = { name: 0, detail: 0 };
  if (showsContents(shape)) {
    const stretch = headerStretch({ ...shape, outline });
    if (!stretch || stretch.width < LEAST_HEADER_WIDTH) return none;
    return headerRoomsOf(drawing, shape.rect.height);
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
  drawing: ResolvedDrawing,
): void {
  const centerX = band.x + band.width / 2;
  const wrap = Math.max(1, band.width - textSideInset(drawing));
  const { nameSize, detailSize } = drawing.text;
  if (rooms.name > 0) {
    write(
      {
        text: shape.name,
        anchor: { x: 0.5, y: 0 },
        x: centerX,
        y: band.y + 1,
        style: textStyle(nameSize, colors.name, wrap, 'center', nameWeightOf(drawing), drawing),
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
        style: textStyle(detailSize, colors.detail, wrap, 'center', 'normal', drawing),
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
export function labelRooms(
  shape: ElementShape,
  drawing: ResolvedDrawing = BASE_DRAWING,
): { name: number; detail: number } {
  if (shape.outline && shape.rowCount === undefined && shape.row === undefined) {
    return outlinedRooms(shape, shape.outline, drawing);
  }
  const band = nameBandOf(shape);
  if (band) return bandRooms(band);
  if (isContainer(shape)) return headerRoomsOf(drawing, bodyOf(shape).height);
  const area = besideImage(shape, labelArea(shape));
  const block = textBlockOf(
    shape,
    area,
    Math.max(1, area.width - textSideInset(drawing)),
    undefined,
    drawing,
  );
  return { name: block.nameRoom, detail: block.detailRoom };
}

/** The part of a shape its text is centered in: below a person's head, below a cylinder's top cap. */
export function labelArea(shape: ElementShape): Rect {
  const { x, y, width, height } = shape.rect;
  if (shape.kind === 'person') {
    const top = personLabelTop(shape.rect);
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
  align: 'left' | 'center' | 'right',
  fontWeight: TextStyleOptions['fontWeight'] = 'normal',
  drawing: ResolvedDrawing = BASE_DRAWING,
): TextStyleOptions {
  return {
    fontFamily: fontFamilyOf(drawing),
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
  style: { color: Color; width: number; dash: Dash; alpha?: number },
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
  style: { color: Color; width: number; dash: Dash; alpha?: number },
  { travelled: start = 0, bendAtStart = false, bendAtEnd = false } = {},
): void {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  const { color, width, dash } = style;
  // Faded only where an opacity says so (ADR 0088), so that every other line strokes as before.
  const faded = style.alpha === undefined || style.alpha === 1 ? {} : { alpha: style.alpha };
  if (dash === 'solid') {
    traceSolid(graphics, points, width, { bendAtStart, bendAtEnd });
    graphics.stroke({ color, ...faded, width, cap: 'butt', join: 'miter' });
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
        ...faded,
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

/** Draws an arrowhead: filled, or for an open one, its two sides stroked at the line's width. */
function fillArrowhead(
  graphics: Graphics,
  arrowhead: Arrowhead,
  color: Color,
  width: number,
  alpha = 1,
): void {
  const { tip, left, right } = arrowhead;
  const faded = alpha === 1 ? {} : { alpha };
  if (arrowhead.open) {
    graphics
      .poly([left.x, left.y, tip.x, tip.y, right.x, right.y], false)
      .stroke({ color, ...faded, width, cap: 'round', join: 'round' });
    return;
  }
  graphics
    .poly([tip.x, tip.y, left.x, left.y, right.x, right.y])
    .fill(alpha === 1 ? color : { color, alpha });
}
