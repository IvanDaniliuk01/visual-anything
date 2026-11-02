/**
 * What each item of a scene is drawn in, in a theme (ADR-0033): built-in colors in that theme's
 * shade, every stored color as stored, or adapted on the dark canvas where the drawing defaults ask
 * for it (ADR 0087), and notes and free arrows without colors of their own in the theme's. The drawing step takes painted copies, which carry the colors to draw in their `fill` and
 * `stroke`, so that `draw.ts` draws a scene in any theme as it draws one in the light theme; in the
 * light theme an item in its own colors is its own copy.
 *
 * It also says what a theme switch or a recolor changes: which items follow the theme, and whether two
 * items differ only in their colors, which restyles their tiles in place rather than making them again.
 */
import { arrowColorOf, noteColorsOf, type ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import type { CanvasTheme } from '../../theme/themes';
import { readableTextColors } from '../colors';
import { rowsFollowTheme } from '../rowsDraw';
import type { ArrowShape, ElementShape, NoteShape, RelationLine } from '../scene';
import type { RoutePiece } from '../tiles';

/** The fill and stroke a shape is drawn in, in a theme. */
export function shapeColors(shape: ElementShape, theme: ThemeName): { fill: Color; stroke: Color } {
  return theme === 'dark' && shape.dark ? shape.dark : shape;
}

/** The stroke a relation's line is drawn in, in a theme. */
export function lineStroke(line: RelationLine, theme: ThemeName): Color {
  return theme === 'dark' ? (line.darkStroke ?? line.stroke) : line.stroke;
}

/** What a note is drawn in: its fill and stroke, and its text, which reads on its fill. */
export function noteColors(
  note: NoteShape,
  theme: CanvasTheme,
): { fill: Color; stroke: Color; text: Color } {
  const { fill, stroke } = noteColorsOf(note, theme, adaptedIn(note, theme));
  return {
    fill: fill.color,
    stroke: stroke.color,
    text: fill.origin.kind === 'theme' ? theme.noteText : readableTextColors(fill.color).name,
  };
}

/** The color a free arrow is drawn in. */
export function arrowStroke(arrow: ArrowShape, theme: CanvasTheme): Color {
  return arrowColorOf(arrow, theme, adaptedIn(arrow, theme)).color;
}

/** Whether a free shape's own colors are drawn adapted in this theme: on the dark canvas, if asked. */
function adaptedIn(shape: NoteShape | ArrowShape, theme: CanvasTheme): boolean {
  return theme.name === 'dark' && shape.adapted === true;
}

/**
 * Whether a shape is drawn in other colors in the dark theme than in the light one: in built-in
 * colors, or as a row or a shape that draws rows, whose body and separators are the theme's. A region
 * draws alike in both themes, its name tinted to each (ADR 0086).
 */
export function shapeFollowsTheme(shape: ElementShape): boolean {
  return (
    shape.dark !== undefined ||
    shape.style?.gradient?.darkTo !== undefined ||
    rowsFollowTheme(shape)
  );
}

export function lineFollowsTheme(line: RelationLine): boolean {
  return line.darkStroke !== undefined;
}

/**
 * Whether a note takes a color from the theme: its fill, its stroke, or, on the theme's fill, its
 * text; or draws its own adapted on the dark canvas (ADR 0087).
 */
export function noteFollowsTheme(note: NoteShape): boolean {
  return note.fill === undefined || note.stroke === undefined || note.adapted === true;
}

/** Whether a note's text is tinted otherwise in each theme: on the theme's fill, or an adapted one. */
export function noteTextFollowsTheme(note: NoteShape): boolean {
  return note.fill === undefined || note.adapted === true;
}

export function arrowFollowsTheme(arrow: ArrowShape): boolean {
  return arrow.stroke === undefined || arrow.adapted === true;
}

const darkShapes = new WeakMap<ElementShape, ElementShape>();
const darkLines = new WeakMap<RelationLine, RelationLine>();
const darkPieces = new WeakMap<RoutePiece, RoutePiece>();

/** A shape with the colors it is drawn in, in a theme: itself, when they are its `fill` and `stroke`. */
export function paintedShape(shape: ElementShape, theme: ThemeName): ElementShape {
  const { dark, style } = shape;
  const gradient = style?.gradient;
  if (theme !== 'dark' || (!dark && gradient?.darkTo === undefined)) return shape;
  let painted = darkShapes.get(shape);
  if (!painted) {
    painted = dark ? { ...shape, fill: dark.fill, stroke: dark.stroke } : { ...shape };
    // Its gradient runs to its color on the dark canvas, which the copy holds as drawn (ADR 0087).
    if (style && gradient?.darkTo !== undefined) {
      painted.style = {
        ...style,
        gradient: { to: gradient.darkTo, direction: gradient.direction },
      };
    }
    darkShapes.set(shape, painted);
  }
  return painted;
}

/** A relation's line with the stroke it is drawn in, in a theme. */
export function paintedLine(line: RelationLine, theme: ThemeName): RelationLine {
  const { darkStroke } = line;
  if (theme !== 'dark' || darkStroke === undefined) return line;
  let painted = darkLines.get(line);
  if (!painted) {
    painted = { ...line, stroke: darkStroke };
    darkLines.set(line, painted);
  }
  return painted;
}

/** A piece of a route, of a line with the stroke it is drawn in, in a theme. */
export function paintedPiece(piece: RoutePiece, theme: ThemeName): RoutePiece {
  const line = paintedLine(piece.line, theme);
  if (line === piece.line) return piece;
  let painted = darkPieces.get(piece);
  if (!painted) {
    painted = { ...piece, line };
    darkPieces.set(piece, painted);
  }
  return painted;
}

/** A note with the fill and stroke it is drawn in. */
export function paintedNote(note: NoteShape, theme: CanvasTheme): NoteShape {
  const { fill, stroke } = noteColors(note, theme);
  if (note.fill === fill && note.stroke === stroke) return note;
  // The copy holds the colors drawn, so it is not adapted again.
  const painted: NoteShape = { ...note, fill, stroke };
  delete painted.adapted;
  return painted;
}

/** An arrow with the color it is drawn in. */
export function paintedArrow(arrow: ArrowShape, theme: CanvasTheme): ArrowShape {
  const stroke = arrowStroke(arrow, theme);
  if (arrow.stroke === stroke) return arrow;
  const painted: ArrowShape = { ...arrow, stroke };
  delete painted.adapted;
  return painted;
}

/** The fields of each item that hold its colors; every other field says where and what it draws. */
export const SHAPE_PAINT: readonly string[] = ['fill', 'stroke', 'dark'];
export const LINE_PAINT: readonly string[] = ['stroke', 'darkStroke', 'typeStroke'];
export const NOTE_PAINT: readonly string[] = ['fill', 'stroke', 'adapted'];
export const ARROW_PAINT: readonly string[] = ['stroke', 'adapted'];

/**
 * Whether two items differ in nothing but the fields `paint` names, comparing every other field in
 * depth: a field added later, which this does not name, counts as one that changes the drawing.
 */
export function sameButPaint(a: object, b: object, paint: readonly string[]): boolean {
  if (a === b) return true;
  const first = a as Record<string, unknown>;
  const second = b as Record<string, unknown>;
  const keys = (item: Record<string, unknown>) =>
    Object.keys(item).filter((key) => !paint.includes(key) && item[key] !== undefined);
  const keysOfFirst = keys(first);
  const keysOfSecond = keys(second);
  return (
    keysOfFirst.length === keysOfSecond.length &&
    keysOfFirst.every((key) => Object.hasOwn(second, key) && sameValue(first[key], second[key]))
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, at) => sameValue(item, b[at]));
  }
  return sameButPaint(a, b, []);
}

/** Whether two lists hold, in the same order, items that differ only in their colors. */
export function sameListButPaint<T extends object>(
  a: readonly T[],
  b: readonly T[],
  paint: readonly string[],
): boolean {
  return a.length === b.length && a.every((item, at) => sameButPaint(item, b[at] as T, paint));
}
