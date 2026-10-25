/**
 * The scale `draw` is asked at (ADR 0054): the view's zoom, in steps, so that the code is asked again
 * only when the zoom crosses one, never at every frame of a zoom.
 */

/** The steps, from far out to close in. */
export const DRAW_SCALES: readonly number[] = Object.freeze([0.25, 0.5, 1, 2, 4]);

/** The largest step at or below a zoom; the smallest step below it. */
export function drawScaleOf(zoom: number): number {
  let step = DRAW_SCALES[0] ?? 1;
  for (const each of DRAW_SCALES) if (zoom >= each) step = each;
  return step;
}
