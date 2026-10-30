/**
 * The Face section's preview (ADR 0083): a face drawing painted on a 2D canvas as the canvas draws
 * it, with no DOM in between. The core laid it out, so every box, band and run is where the canvas
 * puts it; this paints them in their tokens' colors on the shape's fill, in Roboto by its weight and
 * style (the canvas's own families, `robotoFonts.ts`), with the regions of rows and contents marked.
 */
import { resolveFaceColor, type FaceDrawing, type FacePalette } from '@visual-anything/core';
import type { RobotoVariant } from '@visual-anything/core';
import { ROBOTO, ROBOTO_MONO } from '../../canvas/robotoFonts';

/** What the painter uses of a 2D context. */
export interface FacePreviewContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  roundRect?(x: number, y: number, width: number, height: number, radius: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

/** The CSS font a run of a variant and size is painted in. */
export function fontOf(variant: RobotoVariant, size: number): string {
  if (variant === 'mono') return `400 ${size}px "${ROBOTO_MONO}", monospace`;
  const italic = variant === 'italic' || variant === 'boldItalic' ? 'italic ' : '';
  const weight = variant === 'bold' || variant === 'boldItalic' ? 700 : 400;
  return `${italic}${weight} ${size}px "${ROBOTO}", sans-serif`;
}

/** A rectangle, rounded when it has a radius and the context rounds. */
function path(
  context: FacePreviewContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  if (radius > 0 && context.roundRect) context.roundRect(x, y, width, height, radius);
  else context.rect(x, y, width, height);
}

/**
 * Paints a face drawing at `x`, `y`: its boxes with their backgrounds and borders, its bands, then
 * its runs, as `canvas/faceDraw.ts` draws them on the canvas.
 */
export function paintFaceDrawing(
  context: FacePreviewContext,
  drawing: FaceDrawing,
  x: number,
  y: number,
  palette: FacePalette,
): void {
  const color = (each: string) => resolveFaceColor(each, palette);
  for (const box of drawing.boxes) {
    const left = x + box.x;
    const top = y + box.y;
    const radius = Math.min(box.radius, box.width / 2, box.height / 2);
    if (box.background !== undefined && box.width > 0 && box.height > 0) {
      path(context, left, top, box.width, box.height, radius);
      context.fillStyle = color(box.background);
      context.fill();
    }
    const sides = box.borders ?? {};
    const { top: over, right, bottom, left: before } = sides;
    const same =
      over !== undefined &&
      [right, bottom, before].every(
        (side) => side?.width === over.width && side.color === over.color,
      );
    if (same && radius > 0) {
      const inset = over.width / 2;
      path(
        context,
        left + inset,
        top + inset,
        box.width - over.width,
        box.height - over.width,
        Math.max(0, radius - inset),
      );
      context.strokeStyle = color(over.color);
      context.lineWidth = over.width;
      context.stroke();
      continue;
    }
    const side = (border: typeof over, sx: number, sy: number, sw: number, sh: number) => {
      if (border === undefined) return;
      context.fillStyle = color(border.color);
      context.fillRect(sx, sy, sw, sh);
    };
    side(over, left, top, box.width, over?.width ?? 0);
    side(bottom, left, top + box.height - (bottom?.width ?? 0), box.width, bottom?.width ?? 0);
    side(before, left, top, before?.width ?? 0, box.height);
    side(right, left + box.width - (right?.width ?? 0), top, right?.width ?? 0, box.height);
  }
  for (const band of drawing.bands) {
    if (band.width <= 0 || band.height <= 0) continue;
    context.fillStyle = color(band.color);
    context.fillRect(x + band.x, y + band.y, band.width, band.height);
  }
  context.textBaseline = 'alphabetic';
  for (const run of drawing.runs) {
    context.font = fontOf(run.variant, run.size);
    context.fillStyle = color(run.color);
    context.fillText(run.text, x + run.x, y + run.y);
  }
}

/** The room around the shape in the preview, in canvas pixels. */
export const PREVIEW_MARGIN = 8;
/** The widest the preview is, in CSS pixels. */
export const PREVIEW_WIDTH = 280;
/** The tallest the preview is, in CSS pixels. */
export const PREVIEW_HEIGHT = 360;

export interface FacePreviewPlacement {
  /** How the face's units map to the preview's pixels. */
  scale: number;
  /** The preview's size, in CSS pixels. */
  width: number;
  height: number;
}

/** How a shape of this size fits the preview: never enlarged, shrunk to fit its width and height. */
export function previewPlacementOf(width: number, height: number): FacePreviewPlacement {
  const scale = Math.min(
    1,
    (PREVIEW_WIDTH - 2 * PREVIEW_MARGIN) / Math.max(1, width),
    (PREVIEW_HEIGHT - 2 * PREVIEW_MARGIN) / Math.max(1, height),
  );
  return {
    scale,
    width: Math.ceil(width * scale + 2 * PREVIEW_MARGIN),
    height: Math.ceil(height * scale + 2 * PREVIEW_MARGIN),
  };
}

/**
 * Paints a whole preview: the shape's body in its fill and stroke, as tall as the face, or the
 * height it is drawn at; the face on it; and the regions of its rows and contents dashed.
 */
export function paintFacePreview(
  context: FacePreviewContext,
  drawing: FaceDrawing,
  shape: { width: number; height: number },
  palette: FacePalette,
  density = 1,
): FacePreviewPlacement {
  const placement = previewPlacementOf(shape.width, shape.height);
  const { scale } = placement;
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, placement.width, placement.height);
  context.setTransform(
    density * scale,
    0,
    0,
    density * scale,
    density * PREVIEW_MARGIN,
    density * PREVIEW_MARGIN,
  );
  context.beginPath();
  context.rect(0, 0, shape.width, shape.height);
  context.fillStyle = palette.fill;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = palette.stroke;
  context.stroke();
  paintFaceDrawing(context, drawing, 0, 0, palette);
  context.setLineDash([4, 3]);
  context.strokeStyle = palette['text-muted'];
  for (const region of drawing.regions) {
    if (region.width <= 0 || region.height <= 0) continue;
    context.strokeRect(region.x + 2, region.y + 2, region.width - 4, region.height - 4);
  }
  context.setLineDash([]);
  return placement;
}
