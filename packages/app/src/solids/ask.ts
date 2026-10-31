/**
 * What is asked of the solid client for a shape's solid's picture (ADR 0075): its key, its view and
 * how large it shows. Pure, with no DOM, so that the local program's exports make asks as the app does.
 */
import { solidPictureKey, type ShapeSolid } from '../canvas/shape-solids';
import type { SolidView } from './views';

/** A picture the canvas wants. */
export interface SolidPictureAsk extends Omit<SolidView, 'size'> {
  /** `solidPictureKey` of the shape it is drawn on. */
  key: string;
  /** How many device pixels its longer side takes on the screen now, which picks its bucket. */
  pixels: number;
  /** Its width over its height. */
  aspect: number;
  /** How far its middle is from the middle of the screen: the nearest are asked for first. */
  distance: number;
}

/**
 * What the solid client is asked for to draw a shape's solid: its picture by its key, at `pixels`
 * device pixels on its longer side, `distance` from the middle of the screen. None for a shape that
 * draws its placeholder whatever comes.
 */
export function solidAskFor(
  shape: { solid?: ShapeSolid },
  pixels: number,
  distance: number,
): SolidPictureAsk | undefined {
  const { solid } = shape;
  const key = solidPictureKey(shape);
  if (!solid || key === undefined) return undefined;
  return {
    key,
    solid: solid.hash,
    pixels,
    aspect: solid.rect.width / solid.rect.height,
    distance,
    camera: solid.camera,
    lighting: solid.lighting,
    hidden: solid.hidden ?? [],
    parts: solid.placement === 'parts',
    ...(solid.only === undefined ? {} : { only: solid.only }),
  };
}
