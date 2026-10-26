/**
 * The Shape section's preview paints free geometry exactly as the canvas draws it: through the
 * canvas's own `drawOutline`, each fill with its holes cut, every contour stroked.
 */
import { readGeometry } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { FRAME, TRIANGLE } from '../../test/beyond';
import { paintOutline, previewPlacement, type PreviewContext } from './outlinePainter';

/** A 2D context that keeps what is painted with it. */
function recording(): { context: PreviewContext; calls: string[] } {
  const calls: string[] = [];
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`move ${Math.round(x)} ${Math.round(y)}`),
    lineTo: () => calls.push('line'),
    closePath: () => calls.push('close'),
    fill(rule?: CanvasFillRule) {
      calls.push(`fill ${String(this.fillStyle)} ${rule ?? 'nonzero'}`);
    },
    stroke(this: { strokeStyle: unknown }) {
      calls.push(`stroke ${String(this.strokeStyle)}`);
    },
    strokeRect: () => calls.push('rect'),
    setLineDash: () => undefined,
    clearRect: () => undefined,
    setTransform: () => undefined,
  };
  return { context: context as unknown as PreviewContext, calls };
}

function outlineOf(geometry: typeof FRAME) {
  const reading = readGeometry(geometry);
  if (!reading.ok) throw new Error(reading.message);
  return reading.outline;
}

describe('the preview of free geometry', () => {
  it('fills a fill with its hole cut, by the even-odd rule, and strokes both contours', () => {
    const { context, calls } = recording();
    const { placed } = previewPlacement(outlineOf(FRAME), 100, 100);
    paintOutline(context, placed, { fill: '#FFEEDD', stroke: '#112233' });
    expect(calls.filter((call) => call.startsWith('fill'))).toEqual(['fill #FFEEDD evenodd']);
    // The fill traces its outer contour and its hole together, before anything is stroked.
    const fill = calls.indexOf('fill #FFEEDD evenodd');
    expect(calls.slice(0, fill).filter((call) => call.startsWith('move'))).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith('stroke'))).toEqual([
      'stroke #112233',
      'stroke #112233',
    ]);
  });

  it('keeps a shape’s proportions and centres it in the preview', () => {
    const wide = previewPlacement(outlineOf(TRIANGLE), 200, 100);
    expect(wide.scale).toBeGreaterThan(0);
    // Fitted to its own proportions inside a wider shape, the triangle sits in its middle.
    const { fitted, x } = wide.placed;
    expect(fitted.offsetX).toBeGreaterThan(0);
    expect(x).toBeGreaterThanOrEqual(wide.x);
  });
});
