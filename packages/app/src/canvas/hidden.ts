/**
 * Whether the page is hidden, as a tab in the background or a minimized window is (#16). Its browser
 * draws no frames there, so `requestAnimationFrame` never runs, and it puts timers and idle work off:
 * what Claude's pictures and layouts do in such a tab never waits for a frame.
 */
export function pageHidden(
  target: Document | undefined = typeof document === 'undefined' ? undefined : document,
): boolean {
  return target?.visibilityState === 'hidden';
}
