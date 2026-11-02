/**
 * What a picture for Claude frames, and its size (ADR 0081): the whole view, what the canvas shows, or
 * the shapes of some elements, with room around them, at the width asked for.
 */
import { MAX_CAPTURE_HEIGHT } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import type { IndexedScene } from '../canvas/hit';
import { IMAGE_MARGIN } from '../export/image';
import { MAX_PIXELS_PER_UNIT, frameOf, sizeFor, type CaptureSeen } from './frame';

/** A scene that holds only what framing reads: its bounds, and each element's shapes. */
function seen(
  shapes: Record<string, { key: string; x: number; y: number; width: number; height: number }[]>,
  more: Partial<CaptureSeen> = {},
): CaptureSeen {
  const all = Object.values(shapes).flat();
  const bounds =
    all.length === 0
      ? undefined
      : {
          x: Math.min(...all.map((each) => each.x)),
          y: Math.min(...all.map((each) => each.y)),
          width:
            Math.max(...all.map((each) => each.x + each.width)) -
            Math.min(...all.map((each) => each.x)),
          height:
            Math.max(...all.map((each) => each.y + each.height)) -
            Math.min(...all.map((each) => each.y)),
        };
  const indexed = {
    scene: {
      bounds,
      notes: [{ id: 'note', rect: { x: 500, y: 300, width: 100, height: 40 }, text: 'Hi' }],
      arrows: [{ id: 'arrow', from: { x: 700, y: 50 }, to: { x: 650, y: 10 }, arrowhead: 'end' }],
    },
    byElement: new Map(
      Object.entries(shapes).map(([element, list]) => [
        element,
        list.map(({ key, ...rect }) => ({ key, element, rect })),
      ]),
    ),
  } as unknown as IndexedScene;
  return {
    indexed,
    camera: { x: 0, y: 0, scale: 1 },
    viewport: { width: 1000, height: 500 },
    hidden: new Set(),
    ...more,
  };
}

const SHOP = {
  api: [{ key: 'api', x: 0, y: 0, width: 200, height: 100 }],
  db: [
    { key: 'db', x: 400, y: 300, width: 100, height: 100 },
    { key: 'system/db', x: 1000, y: 0, width: 100, height: 100 },
  ],
};

describe('frameOf', () => {
  it('frames the whole view with room around it', () => {
    expect(frameOf('whole', seen(SHOP))).toEqual({
      ok: true,
      frame: {
        x: -IMAGE_MARGIN,
        y: -IMAGE_MARGIN,
        width: 1100 + 2 * IMAGE_MARGIN,
        height: 400 + 2 * IMAGE_MARGIN,
      },
      asShown: false,
      whole: true,
    });
  });

  it('frames what the canvas shows now', () => {
    const framed = frameOf(
      'viewport',
      seen(SHOP, { camera: { x: 100, y: 50, scale: 2 }, viewport: { width: 800, height: 400 } }),
    );
    expect(framed).toMatchObject({ ok: true, asShown: true, whole: false });
    expect(framed.ok && framed.frame).toEqual({ x: -50, y: -25, width: 400, height: 200 });
  });

  it('frames every shape of the elements named, past those the emphasis hides', () => {
    const framed = frameOf(['db', 'gone'], seen(SHOP, { hidden: new Set(['system/db']) }));
    expect(framed).toEqual({
      ok: true,
      frame: {
        x: 400 - IMAGE_MARGIN,
        y: 300 - IMAGE_MARGIN,
        width: 100 + 2 * IMAGE_MARGIN,
        height: 100 + 2 * IMAGE_MARGIN,
      },
      asShown: false,
      whole: false,
      missing: ['gone'],
    });
  });

  it('frames notes and arrows by their ids, as it frames elements', () => {
    const framed = frameOf(['note', 'arrow'], seen(SHOP));
    expect(framed.ok).toBe(true);
    if (!framed.ok) return;
    expect(framed.missing).toBeUndefined();
    expect(framed.frame.x).toBeLessThan(500);
    expect(framed.frame.x + framed.frame.width).toBeGreaterThan(700);
    expect(framed.frame.y).toBeLessThan(10);
    expect(framed.frame.y + framed.frame.height).toBeGreaterThan(340);
  });

  it('says why it frames nothing', () => {
    expect(frameOf('whole', seen({}))).toEqual({ ok: false, failed: 'empty' });
    expect(frameOf(['gone'], seen(SHOP))).toEqual({ ok: false, failed: 'not-drawn' });
    expect(frameOf('viewport', seen(SHOP, { viewport: { width: 0, height: 0 } }))).toEqual({
      ok: false,
      failed: 'no-canvas',
    });
  });
});

describe('sizeFor', () => {
  it('draws the frame at the width asked for, as tall as it makes it', () => {
    expect(sizeFor({ x: 0, y: 0, width: 2000, height: 1000 }, 1280, false)).toEqual({
      frame: { x: 0, y: 0, width: 2000, height: 1000 },
      pixelsPerUnit: 0.64,
      width: 1280,
      height: 640,
    });
  });

  it('draws a region too tall for the width narrower, within the most height', () => {
    const size = sizeFor({ x: 0, y: 0, width: 500, height: 10_000 }, 2048, false);
    expect(size.height).toBe(MAX_CAPTURE_HEIGHT);
    expect(size.pixelsPerUnit).toBeCloseTo(MAX_CAPTURE_HEIGHT / 10_000);
    expect(size.width).toBe(Math.round(500 * size.pixelsPerUnit));
  });

  it('widens a small frame around its middle rather than zoom past twice the canvas', () => {
    const size = sizeFor({ x: 100, y: 0, width: 200, height: 100 }, 1280, false);
    expect(size.pixelsPerUnit).toBe(MAX_PIXELS_PER_UNIT);
    expect(size.frame).toEqual({ x: 200 - 320, y: 0, width: 640, height: 100 });
    expect(size).toMatchObject({ width: 1280, height: 200 });
  });

  it('keeps what the canvas shows as it shows it, whatever the zoom', () => {
    const size = sizeFor({ x: 0, y: 0, width: 100, height: 50 }, 1000, true);
    expect(size).toEqual({
      frame: { x: 0, y: 0, width: 100, height: 50 },
      pixelsPerUnit: 10,
      width: 1000,
      height: 500,
    });
  });
});
