/**
 * Follows devicePixelRatio, which a browser zoom or a move to another screen changes, with a
 * `(resolution: <dpr>dppx)` media query renewed after each change (A3). Without `matchMedia`, as in
 * tests, nothing is followed.
 */
export function watchResolution(
  view: Window | null | undefined,
  changed: (resolution: number) => void,
): () => void {
  if (typeof view?.matchMedia !== 'function') return () => undefined;
  let stop = () => undefined as void;
  const watch = () => {
    const query = view.matchMedia(`(resolution: ${view.devicePixelRatio || 1}dppx)`);
    const listener = () => {
      query.removeEventListener('change', listener);
      changed(view.devicePixelRatio || 1);
      watch();
    };
    query.addEventListener('change', listener);
    stop = () => query.removeEventListener('change', listener);
  };
  watch();
  return () => stop();
}
