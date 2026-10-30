/**
 * Faces in SVG and PDF (ADR 0083, F3): the face drawing the canvas draws in a shape (`faces.ts`,
 * `faceDraw.ts`), written as the canvas draws it, so that the SVG, the PDF made from it and the canvas
 * never draw a face differently. Nothing re-flows: the core laid the face out in Roboto's widths, and
 * each run is placed by its own `x`.
 *
 * - its boxes, as the pieces the canvas paints them with (`faceBoxPieces`): backgrounds with their
 *   radius, a ring for a rounded box's alike sides, and bands and dashes for the others;
 * - its bands, behind, under and through runs;
 * - its pictures, `<icon/>` as the shape's own image and `<image ref="…"/>` as an image of its
 *   component's package, each fitted in its box with its proportions kept, as symbols;
 * - its runs, each line a `<text>` with a `<tspan>` per run at its own `x` and baseline, in its
 *   weight, style and family: Roboto, Roboto Mono for `mono`, which the PDF embeds.
 *
 * Its colors are its tokens' on the shape's fill in the theme drawn (`facePalette`), as on the canvas.
 */
import {
  resolveFaceColor,
  robotoWidth,
  type FaceDrawing,
  type FaceImage,
  type FacePalette,
  type FaceRun,
} from '@visual-anything/core';
import type { Point, Rect } from '../canvas/geometry';
import { deepestFaceShow, faceBoxPieces } from '../canvas/faces';
import { MONO_FAMILY } from './emphasis-svg';
import { element, empty, textElement, type AttributeValue } from './markup';

/**
 * The family a face's text is written in: Roboto, which it was laid out in, then the drawing's own
 * (`SVG_FONT_FAMILY`) for a reader that lacks it.
 */
export const FACE_FONT_FAMILY =
  "Roboto, system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** What a face's pictures are drawn with: a picture written at a place, or nothing. */
export type FacePicture = (image: FaceImage, rect: Rect) => string;

/**
 * What faces an export draws of a shape: what the canvas draws at the most detailed level the shape
 * declares, as an export draws every detail (`deepestFaceShow`).
 */
export const exportedFaceShow = deepestFaceShow;

/** What a run is written with, beyond its text and place. */
function runValues(run: FaceRun): Record<string, AttributeValue> {
  const { variant } = run;
  return {
    'font-size': run.size,
    'font-weight': variant === 'bold' || variant === 'boldItalic' ? 700 : undefined,
    'font-style': variant === 'italic' || variant === 'boldItalic' ? 'italic' : undefined,
    'font-family': variant === 'mono' ? MONO_FAMILY : undefined,
  };
}

/**
 * A face drawing written at `at`, its top left, in this palette's colors, in a group of its own
 * (`data-part="face"`). `texts` gets each line's text, for the PDF's check of the glyphs its fonts
 * lack; `picture` draws its pictures, which are left out without it.
 */
export function faceSvg(
  drawing: FaceDrawing,
  at: Point,
  palette: FacePalette,
  texts?: string[],
  picture?: FacePicture,
): string {
  const color = (each: string) => resolveFaceColor(each, palette);
  let written = '';
  for (const box of drawing.boxes) {
    for (const piece of faceBoxPieces(box, at)) {
      const rx = piece.radius > 0 ? piece.radius : undefined;
      written +=
        piece.kind === 'fill'
          ? empty('rect', { ...piece.rect, rx, fill: color(piece.color) })
          : empty('rect', {
              ...piece.rect,
              rx,
              fill: 'none',
              stroke: color(piece.color),
              'stroke-width': piece.width,
            });
    }
  }
  for (const band of drawing.bands) {
    if (!(band.width > 0) || !(band.height > 0)) continue;
    written += empty('rect', {
      x: at.x + band.x,
      y: at.y + band.y,
      width: band.width,
      height: band.height,
      fill: color(band.color),
    });
  }
  if (picture) {
    for (const image of drawing.images) {
      if (!(image.width > 0) || !(image.height > 0)) continue;
      written += picture(image, {
        x: at.x + image.x,
        y: at.y + image.y,
        width: image.width,
        height: image.height,
      });
    }
  }
  written += runsSvg(drawing.runs, at, color, texts);
  return written === ''
    ? ''
    : element('g', { 'data-part': 'face', 'font-family': FACE_FONT_FAMILY }, written);
}

/** A face's runs, each of its lines a `<text>` with a `<tspan>` for each run. */
function runsSvg(
  runs: readonly FaceRun[],
  at: Point,
  color: (each: string) => string,
  texts: string[] | undefined,
): string {
  let written = '';
  let line: FaceRun[] = [];
  const flush = () => {
    if (line.length === 0) return;
    const fill = color((line[0] as FaceRun).color);
    const spans: string[] = [];
    for (const run of line) {
      // Spaces at a run's start are moved past, since readers of SVG fold them away.
      const text = run.text.trimStart();
      if (text.trim() === '') continue;
      const lead = run.text.slice(0, run.text.length - text.length);
      const x = at.x + run.x + (lead === '' ? 0 : robotoWidth(lead, run.variant, run.size));
      const own = color(run.color);
      spans.push(
        textElement(
          'tspan',
          { x, y: at.y + run.y, ...runValues(run), fill: own === fill ? undefined : own },
          text.trimEnd(),
        ),
      );
    }
    if (spans.length > 0) {
      texts?.push(line.map((run) => run.text).join(''));
      written += element('text', { fill }, spans.join(''));
    }
    line = [];
  };
  for (const run of runs) {
    const last = line.at(-1);
    if (last && (last.line !== run.line || last.paragraph !== run.paragraph)) flush();
    line.push(run);
  }
  flush();
  return written;
}
