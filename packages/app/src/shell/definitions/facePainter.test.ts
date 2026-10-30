/**
 * The Face section's preview paints a face drawing as the canvas draws it (ADR 0083): the shape's
 * body, its boxes and bands in their tokens' colors, its runs in Roboto at the places the core gave
 * them, and its regions dashed.
 */
import { DATA_MODELING, compileFace, facePalette, layOutFace } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_MARGIN,
  PREVIEW_WIDTH,
  fontOf,
  paintFacePreview,
  previewPlacementOf,
  type FacePreviewContext,
} from './facePainter';

/** A 2D context that keeps what is painted with it. */
function recording(): { context: FacePreviewContext; calls: string[] } {
  const calls: string[] = [];
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'top',
    beginPath: () => undefined,
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect ${x} ${y} ${w} ${h}`),
    roundRect: () => calls.push('round'),
    fill(this: { fillStyle: string }) {
      calls.push(`fill ${this.fillStyle}`);
    },
    stroke(this: { strokeStyle: string }) {
      calls.push(`stroke ${this.strokeStyle}`);
    },
    fillRect(this: { fillStyle: string }) {
      calls.push(`fillRect ${this.fillStyle}`);
    },
    strokeRect: () => calls.push('dashed'),
    fillText(this: { font: string; fillStyle: string }, text: string, x: number, y: number) {
      calls.push(`text ${text} ${Math.round(x)} ${Math.round(y)} ${this.font} ${this.fillStyle}`);
    },
    setLineDash: () => undefined,
    clearRect: () => undefined,
    setTransform: () => undefined,
  };
  return { context: context as unknown as FacePreviewContext, calls };
}

const tableFace = () => {
  const face = DATA_MODELING.components[0]!.appearance!.face;
  if (face === undefined || face === 'none') throw new Error('Table has no face');
  return compileFace({
    size: 'shape',
    markup: face.markup ?? [],
    style: face.style ?? [],
    variants: [],
  });
};

describe('the face preview’s painter', () => {
  it('paints the body, the runs where the core placed them, and the rows dashed', () => {
    const drawing = layOutFace(
      tableFace(),
      {
        name: 'orders',
        component: 'Table',
        attributes: [{ name: 'schema', value: 'billing' }],
        rowsHeight: 52,
      },
      { width: 240 },
    );
    const { context, calls } = recording();
    const palette = facePalette('light', '#E3ECFA', '#1F4E8C');
    paintFacePreview(context, drawing, { width: 240, height: drawing.height }, palette);
    expect(calls.slice(0, 3)).toEqual(['rect 0 0 240 84', 'fill #E3ECFA', 'stroke #1F4E8C']);
    expect(calls).toContain(
      `text orders 12 21 700 14px "Visual Anything Roboto", sans-serif ${palette.text}`,
    );
    expect(calls.find((each) => each.startsWith('text billing'))).toContain(
      `400 11px "Visual Anything Roboto", sans-serif ${palette['text-muted']}`,
    );
    expect(calls.at(-1)).toBe('dashed');
  });

  it('writes each variant of Roboto as the canvas loads it', () => {
    expect(fontOf('regular', 11)).toBe('400 11px "Visual Anything Roboto", sans-serif');
    expect(fontOf('boldItalic', 12)).toBe('italic 700 12px "Visual Anything Roboto", sans-serif');
    expect(fontOf('mono', 10)).toBe('400 10px "Visual Anything Roboto Mono", monospace');
  });

  it('fits a wide shape to the panel, and never enlarges a small one', () => {
    expect(previewPlacementOf(120, 40)).toEqual({
      scale: 1,
      width: 120 + 2 * PREVIEW_MARGIN,
      height: 40 + 2 * PREVIEW_MARGIN,
    });
    const wide = previewPlacementOf(1000, 100);
    expect(wide.width).toBeLessThanOrEqual(PREVIEW_WIDTH);
    expect(wide.scale).toBeCloseTo((PREVIEW_WIDTH - 2 * PREVIEW_MARGIN) / 1000);
  });
});
