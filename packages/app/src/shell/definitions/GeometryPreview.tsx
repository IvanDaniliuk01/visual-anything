import { outlineLabelArea, type Outline } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { PREVIEW, paintOutline, previewPlacement } from './outlinePainter';

/** The color the shape's rectangle and its label area are marked in. */
const MARK = '#8A94A6';

interface GeometryPreviewProps {
  outline: Outline;
  /** The size its shapes are drawn at, whose proportions the preview keeps. */
  width: number;
  height: number;
  /** The colors its shapes are drawn in, in the theme shown. */
  colors: { fill: Color; stroke: Color };
}

/**
 * A live preview of free geometry, drawn as the canvas draws it: the outline fitted to a shape of the
 * component's size, filled and stroked in its colors with its holes cut, the shape's rectangle dotted
 * around it, and the label area dashed. Where the browser draws no 2D canvas, it shows empty.
 */
export function GeometryPreview({ outline, width, height, colors }: GeometryPreviewProps) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const density = Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1)));
  const { fill, stroke } = colors;

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, PREVIEW.width, PREVIEW.height);
    const { scale, x, y, placed } = previewPlacement(outline, width, height);
    paintOutline(context, placed, { fill, stroke });
    context.lineWidth = 1;
    context.strokeStyle = MARK;
    context.setLineDash([1, 3]);
    context.strokeRect(x, y, width * scale, height * scale);
    const label = outlineLabelArea(placed.fitted);
    context.setLineDash([4, 3]);
    context.strokeRect(placed.x + label.x, placed.y + label.y, label.width, label.height);
    context.setLineDash([]);
  }, [outline, width, height, fill, stroke, density]);

  return (
    <canvas
      ref={ref}
      className="geometry-preview"
      width={PREVIEW.width * density}
      height={PREVIEW.height * density}
      style={{ width: PREVIEW.width, height: PREVIEW.height }}
      role="img"
      aria-label={t('Preview of its free geometry, {width} by {height}', { width, height })}
    />
  );
}
