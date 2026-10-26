/**
 * Shapes with free geometry for the canvas's tests (M8b, ADR 0066): an element shape drawn by a
 * geometry fitted to its rectangle, as the scene makes one, and the geometries the tests draw.
 */
import { readGeometry } from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import type { Rect } from '../canvas/geometry';
import { geometrySource, outlineIn } from '../canvas/outlines';
import type { ElementShape } from '../canvas/scene';

/** A triangle standing on its base, its apex at the top middle, stretched to its shape. */
export const APEX_UP: FreeGeometry = {
  width: 100,
  height: 100,
  outline: [{ kind: 'polygon', points: '50,0 100,100 0,100' }],
};

/** A triangle standing on its apex, its wide side at the top. */
export const APEX_DOWN: FreeGeometry = {
  width: 100,
  height: 100,
  outline: [{ kind: 'polygon', points: '0,0 100,0 50,100' }],
};

/** An ellipse filling its box. */
export const OVAL: FreeGeometry = {
  width: 100,
  height: 100,
  outline: [{ kind: 'ellipse', cx: 50, cy: 50, rx: 50, ry: 50 }],
};

/** An element shape drawn by `geometry`, fitted to `rect`; its key says which shapes it sits in. */
export function outlinedShape(
  key: string,
  geometry: FreeGeometry,
  rect: Rect,
  extra: Partial<ElementShape> = {},
): ElementShape {
  const read = readGeometry(geometry);
  if (!read.ok) throw new Error(`Not geometry: ${JSON.stringify(read)}`);
  const parts = key.split('/');
  const element = parts.at(-1) as string;
  return {
    key,
    element,
    ...(parts.length > 1
      ? { container: parts.at(-2), containerShape: parts.slice(0, -1).join('/') }
      : {}),
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: element,
    componentName: 'Organ',
    kind: 'rectangle',
    fill: '#F4C7C3',
    stroke: '#A23B2E',
    rect,
    extent: rect,
    holdsContents: false,
    outline: outlineIn(geometrySource(read.outline), rect.width, rect.height),
    ...extra,
  };
}
