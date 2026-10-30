/**
 * Where a shape with its own outline that writes its name inside itself places its text (ADR 0066,
 * ADR 0082): its name whole on the lines `nameLinesInside` gives, then its detail wrapped under it to
 * its `lines` and to what its label area holds, the block placed by its text placement. The canvas,
 * the hover card and the SVG export all place it here. Pure, with no PixiJS.
 */
import type { EmphasisRun } from '@visual-anything/core';
import type { Measure } from '../text/layout';
import type { Rect } from './geometry';
import { outlinedDetailOf } from './nameTags';
import { PART_NAME_LINE, labelAreaOn, nameLinesInside } from './outlined';
import type { ShapeOutline } from './outlines';
import type { ElementShape } from './scene';
import { besideImage } from './shape-images';
import { placeTextBlock, type TextBlock } from './textBlock';

/** A shape's text placed inside its own outline. */
export interface OutlinedText {
  /** Its name's lines, each whole. */
  lines: string[];
  /** Its label area, right of its icon there. */
  area: Rect;
  wrap: number;
  /** Its detail as written: a collapsed container's starts with its count. */
  detail: string;
  /** The runs its detail takes text emphasis with, unless a collapsed one's count came first. */
  runs: readonly EmphasisRun[] | undefined;
  block: TextBlock;
}

/** Where a shape with its own outline writes its text; undefined when its name does not fit whole. */
export function outlinedTextBlock(
  shape: ElementShape,
  outline: ShapeOutline,
  measure?: Measure,
): OutlinedText | undefined {
  const lines = nameLinesInside({ ...shape, outline });
  if (!lines) return undefined;
  const area = besideImage(shape, labelAreaOn({ rect: shape.rect, outline }));
  const wrap = Math.max(1, area.width);
  const detail = outlinedDetailOf(shape);
  const runs = detail === (shape.detail ?? shape.componentName) ? shape.detailRuns : undefined;
  const block = placeTextBlock({
    area,
    wrap,
    name: shape.name,
    nameBlock: { lines: lines.length, lineHeight: PART_NAME_LINE },
    detail,
    ...(runs ? { detailRuns: runs } : {}),
    ...(shape.detailLines === undefined ? {} : { lines: shape.detailLines }),
    ...(shape.textPlacement === undefined ? {} : { placement: shape.textPlacement }),
    ...(measure ? { measure } : {}),
  });
  return { lines, area, wrap, detail, runs, block };
}
