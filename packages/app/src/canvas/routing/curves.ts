/**
 * Curved lines on the canvas: the spans a curved line is drawn with, up to the base of its
 * arrowhead, cut into the pieces its tiles draw, and stroked as Bézier curves, so that a curve stays
 * smooth at any zoom. A dashed or dotted curve is drawn along its flattened route instead, with the
 * dash pattern of every other line.
 */
import type { Graphics } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
import { distance, middle, type Point } from '../geometry';
import type { RelationLine } from '../scene';
import type { RoutePiece } from '../tiles';
import { flattenedSegments, pointOnSpan, splitSpan, type CurveSpan } from './hand';

/** About how long a piece of a curve is at most, so that a tile spans about its cell. */
const PIECE_LENGTH = 512;
/** The most pieces a curve is cut into; beyond, it is drawn whole, in one tile. */
const MOST_PIECES = 1024;
/** How closely PixiJS follows a Bézier curve when it draws it: within 0.1 units. */
const SMOOTHNESS = 0.9;

const trimmed = new WeakMap<RelationLine, CurveSpan[]>();

/**
 * A curved line's spans up to the base of its arrowhead, which covers the rest, so that the line never
 * shows past its tip; all of them on a line without one.
 */
export function drawnCurve(line: RelationLine): CurveSpan[] {
  const spans = line.curve ?? [];
  if (!line.arrowhead || spans.length === 0) return spans;
  const known = trimmed.get(line);
  if (known) return known;
  const { tip } = line.arrowhead;
  const length = distance(middle(line.arrowhead.left, line.arrowhead.right), tip);
  const kept = [...spans];
  let last = kept.pop() as CurveSpan;
  // A last span shorter than the arrowhead is covered by it.
  while (distance(last.from, tip) <= length && kept.length > 0) last = kept.pop() as CurveSpan;
  if (distance(last.from, tip) > length) {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step++) {
      const t = (low + high) / 2;
      if (distance(pointOnSpan(last, t), tip) > length) low = t;
      else high = t;
    }
    kept.push(splitSpan(last, low)[0]);
  }
  trimmed.set(line, kept);
  return kept;
}

/**
 * The pieces of a curved line's drawing, each about `PIECE_LENGTH` long at most and in the cell of
 * its middle, with its spans for the full drawing and its flattened points for the plain one, its
 * bounds and its dashes. Undefined when the line is not curved, or would be cut into too many pieces.
 */
export function curvePieces(
  line: RelationLine,
  cellOf: (point: Point) => string,
): RoutePiece[] | undefined {
  if (!line.curve) return undefined;
  const spans = drawnCurve(line);
  const parts: CurveSpan[] = [];
  for (const span of spans) {
    const reach = outlineLength(span);
    if (!Number.isFinite(reach)) return undefined;
    const count = Math.max(1, Math.ceil(reach / PIECE_LENGTH));
    if (parts.length + count > MOST_PIECES) return undefined;
    let rest = span;
    for (let at = count; at > 1; at--) {
      const [head, tail] = splitSpan(rest, 1 / at);
      parts.push(head);
      rest = tail;
    }
    parts.push(rest);
  }
  const pieces: RoutePiece[] = [];
  let travelled = 0;
  for (const part of parts) {
    const cell = cellOf(pointOnSpan(part, 0.5));
    const segments = flattenedSegments(distance(part.from, part.to));
    const points: Point[] = [];
    for (let step = 1; step <= segments; step++) points.push(pointOnSpan(part, step / segments));
    const previous = pieces.at(-1);
    if (previous && previous.cell === cell) {
      previous.curve?.push(part);
      previous.points.push(...points);
    } else {
      pieces.push({
        line,
        cell,
        points: [part.from, ...points],
        travelled,
        bendAtStart: false,
        bendAtEnd: false,
        last: false,
        curve: [part],
      });
    }
    let length = 0;
    let from = part.from;
    for (const point of points) {
      length += distance(from, point);
      from = point;
    }
    travelled += length;
  }
  const last = pieces.at(-1);
  if (last) last.last = true;
  return pieces;
}

/** How long a span's control polygon is: never shorter than the span itself. */
function outlineLength(span: CurveSpan): number {
  return distance(span.from, span.c1) + distance(span.c1, span.c2) + distance(span.c2, span.to);
}

/** Traces spans that follow one another as one path, from the first one's start. */
export function traceCurve(graphics: Graphics, spans: readonly CurveSpan[]): void {
  const [first] = spans;
  if (!first) return;
  graphics.moveTo(first.from.x, first.from.y);
  for (const span of spans) {
    graphics.bezierCurveTo(
      span.c1.x,
      span.c1.y,
      span.c2.x,
      span.c2.y,
      span.to.x,
      span.to.y,
      SMOOTHNESS,
    );
  }
}

/** Strokes spans as one solid curve. */
export function strokeCurve(
  graphics: Graphics,
  spans: readonly CurveSpan[],
  style: { color: Color; width: number },
): void {
  if (spans.length === 0) return;
  traceCurve(graphics, spans);
  graphics.stroke({ color: style.color, width: style.width, cap: 'butt', join: 'round' });
}

/** Whether a line is drawn as a smooth curve: curved and solid; a dashed curve is drawn flattened. */
export function drawnAsCurve(line: RelationLine): boolean {
  return line.curve !== undefined && line.dash === 'solid';
}
