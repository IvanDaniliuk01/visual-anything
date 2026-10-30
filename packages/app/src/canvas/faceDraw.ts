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
import { faceBoxPieces, facePaints, faceRect, shapeFaceDrawing, type FaceShow } from './faces';
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
    // The pieces the exports write too (`faceBoxPieces`): backgrounds, rings, sides and dashes.
    for (const piece of faceBoxPieces(box, at)) {
      const { x, y, width, height } = piece.rect;
      if (piece.radius > 0) graphics.roundRect(x, y, width, height, piece.radius);
      else graphics.rect(x, y, width, height);
      if (piece.kind === 'fill') graphics.fill(color(piece.color));
      else graphics.stroke({ color: color(piece.color), width: piece.width });
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
  if (!drawing || !facePaints(drawing)) return undefined;
  const rect = faceRect(shape);
  const label = new FaceLabel(drawing, { x: rect.x, y: rect.y });
  label.paint(theme, fill, shape.stroke);
  return label;
}
