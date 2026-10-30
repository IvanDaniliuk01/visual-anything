/**
 * Drawing faces on the canvas (ADR 0083, F2): a face drawing's boxes, bands and runs, as glyph quads,
 * in one drawing per shape among its tile's labels, in the colors its tokens take on the shape's fill
 * in the theme shown (`faces.ts` lays them out and keeps them).
 */
import {
  facePalette,
  resolveFaceColor,
  type FaceDrawing,
  type FacePalette,
  type ThemeName,
} from '@visual-anything/core';
import { Container, Graphics } from 'pixi.js';
import { drawGlyphs } from './emphasisLabels';
import { faceRect, shapeFaceDrawing, type FaceShow } from './faces';
import type { Point } from './geometry';
import type { ElementShape } from './scene';

/** Draws a face drawing at `at`: its boxes, its bands, then its runs, in this palette's colors. */
export function drawFaceDrawing(
  graphics: Graphics,
  drawing: FaceDrawing,
  at: Point,
  palette: FacePalette,
): void {
  const color = (each: string) => resolveFaceColor(each, palette);
  for (const box of drawing.boxes) {
    const x = at.x + box.x;
    const y = at.y + box.y;
    const radius = Math.min(box.radius, box.width / 2, box.height / 2);
    if (box.background !== undefined && box.width > 0 && box.height > 0) {
      if (radius > 0) graphics.roundRect(x, y, box.width, box.height, radius);
      else graphics.rect(x, y, box.width, box.height);
      graphics.fill(color(box.background));
    }
    const { top, right, bottom, left } = box.borders ?? {};
    const same =
      top !== undefined &&
      [right, bottom, left].every((side) => side?.width === top.width && side.color === top.color);
    if (same && radius > 0) {
      // Stroked inside the box, as a border-box draws it.
      const inset = top.width / 2;
      graphics
        .roundRect(
          x + inset,
          y + inset,
          box.width - top.width,
          box.height - top.width,
          Math.max(0, radius - inset),
        )
        .stroke({ color: color(top.color), width: top.width });
      continue;
    }
    if (top) graphics.rect(x, y, box.width, top.width).fill(color(top.color));
    if (bottom) {
      graphics.rect(x, y + box.height - bottom.width, box.width, bottom.width);
      graphics.fill(color(bottom.color));
    }
    if (left) graphics.rect(x, y, left.width, box.height).fill(color(left.color));
    if (right) {
      graphics.rect(x + box.width - right.width, y, right.width, box.height);
      graphics.fill(color(right.color));
    }
  }
  for (const band of drawing.bands) {
    if (band.width <= 0 || band.height <= 0) continue;
    graphics.rect(at.x + band.x, at.y + band.y, band.width, band.height).fill(color(band.color));
  }
  for (const run of drawing.runs) {
    drawGlyphs(
      graphics,
      run.text,
      run.variant,
      run.size,
      at.x + run.x,
      at.y + run.y,
      color(run.color),
    );
  }
}

/**
 * A shape's face, drawn among its tile's labels: drawn again in place for another theme or fill
 * (`paint`), since its colors are its tokens' on the shape's fill.
 */
export class FaceLabel extends Container {
  readonly graphics = new Graphics();

  constructor(
    readonly drawing: FaceDrawing,
    readonly at: Point,
  ) {
    super();
    this.addChild(this.graphics);
  }

  /** Draws it in the colors of a shape of this fill and stroke, in a theme. */
  paint(theme: ThemeName, fill: string, stroke: string): void {
    this.graphics.clear();
    drawFaceDrawing(this.graphics, this.drawing, this.at, facePalette(theme, fill, stroke));
  }
}

/**
 * A shape's face as a label, in a theme, for a shape already painted in it (`paintedShape`); none
 * when it has no face or its face draws nothing.
 */
export function faceLabel(
  shape: ElementShape,
  theme: ThemeName,
  show: FaceShow = {},
  fill: string = shape.fill,
): FaceLabel | undefined {
  const drawing = shapeFaceDrawing(shape, show);
  if (!drawing || (drawing.runs.length === 0 && drawing.boxes.length === 0)) return undefined;
  const rect = faceRect(shape);
  const label = new FaceLabel(drawing, { x: rect.x, y: rect.y });
  label.paint(theme, fill, shape.stroke);
  return label;
}
