/**
 * Painting free geometry for the Shape section's preview exactly as the canvas draws it: through the
 * canvas's own `drawOutline`, into a 2D context in place of PixiJS's graphics, at a shape's size
 * scaled to fit the preview (ADR 0066).
 */
import type { Outline } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import type { Graphics } from 'pixi.js';
import { drawOutline } from '../../canvas/draw';
import { geometrySource, outlineIn, type PlacedOutline } from '../../canvas/outlines';

/** What of a 2D context the preview paints with. */
export type PreviewContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'strokeRect'
  | 'setLineDash'
  | 'clearRect'
  | 'setTransform'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
>;

interface Polygon {
  points: readonly number[];
  close: boolean;
}

/**
 * The part of PixiJS's `Graphics` that `drawOutline` draws with, painting into a 2D context instead:
 * a polygon, then a fill, the holes cut from it, or a stroke. A fill and its holes are painted
 * together by the even-odd rule, which cuts each hole from the fill it lies in, as the canvas does.
 */
class OutlinePainter {
  private polygon: Polygon | undefined;
  private filling: { polygons: Polygon[]; color: string } | undefined;

  constructor(private readonly context: PreviewContext) {}

  poly(points: readonly number[], close?: boolean): this {
    this.polygon = { points, close: close === true };
    return this;
  }

  fill(color: string): this {
    this.finish();
    if (this.polygon) this.filling = { polygons: [this.polygon], color };
    return this;
  }

  cut(): this {
    if (this.filling && this.polygon) this.filling.polygons.push(this.polygon);
    return this;
  }

  stroke(style: {
    color: string;
    width: number;
    cap?: CanvasLineCap;
    join?: CanvasLineJoin;
  }): this {
    this.finish();
    if (!this.polygon) return this;
    const { context } = this;
    context.beginPath();
    this.trace(this.polygon);
    context.strokeStyle = style.color;
    context.lineWidth = style.width;
    context.lineCap = style.cap ?? 'butt';
    context.lineJoin = style.join ?? 'miter';
    context.stroke();
    return this;
  }

  /** Paints the fill begun last, with the holes cut from it. */
  finish(): void {
    const filling = this.filling;
    if (!filling) return;
    this.filling = undefined;
    const { context } = this;
    context.beginPath();
    for (const polygon of filling.polygons) this.trace({ ...polygon, close: true });
    context.fillStyle = filling.color;
    context.fill('evenodd');
  }

  private trace({ points, close }: Polygon): void {
    const { context } = this;
    for (let at = 0; at + 1 < points.length; at += 2) {
      const x = points[at] as number;
      const y = points[at + 1] as number;
      if (at === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (close) context.closePath();
  }
}

/**
 * Paints an outline where it is placed exactly as the canvas draws it, through the canvas's own
 * `drawOutline`, into a 2D context.
 */
export function paintOutline(
  context: PreviewContext,
  placed: PlacedOutline,
  colors: { fill: Color; stroke: Color },
): void {
  const painter = new OutlinePainter(context);
  // `drawOutline` only calls `poly`, `fill`, `cut` and `stroke`, which the painter has.
  drawOutline(painter as unknown as Graphics, placed, colors);
  painter.finish();
}

/** The preview's size on screen, in pixels. */
export const PREVIEW = { width: 168, height: 112 } as const;
/** Room kept around the shape, in pixels. */
const MARGIN = 6;

/**
 * Where the preview places a shape of a size: scaled to fit it, centred, with its outline fitted as
 * the scene fits it.
 */
export function previewPlacement(
  outline: Outline,
  width: number,
  height: number,
): { scale: number; x: number; y: number; placed: PlacedOutline } {
  const scale = Math.min(
    (PREVIEW.width - 2 * MARGIN) / width,
    (PREVIEW.height - 2 * MARGIN) / height,
  );
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const x = (PREVIEW.width - drawnWidth) / 2;
  const y = (PREVIEW.height - drawnHeight) / 2;
  const fitted = outlineIn(geometrySource(outline), drawnWidth, drawnHeight);
  return { scale, x, y, placed: { fitted: fitted.fitted, x: x + fitted.x, y: y + fitted.y } };
}
