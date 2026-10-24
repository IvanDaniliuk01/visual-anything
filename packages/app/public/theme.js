/*
 * Writes the theme on the page before its first paint, so that a tab opened in the dark theme never
 * flashes light (ADR-0032). It runs before the app and its stylesheet, and only reads: the theme the
 * local program put in the address's fragment (`theme=light` or `theme=dark`), otherwise the choice
 * this tab kept, otherwise the system's setting. The app's preferences store takes over once it starts
 * (src/theme/store.ts), using the same names. Anything it does not recognize is ignored, and anything
 * the page lacks, such as session storage, counts as nothing chosen.
 */
/* global document, location, sessionStorage, matchMedia, URLSearchParams */
(() => {
  const isTheme = (value) => value === 'light' || value === 'dark';
  const read = (get) => {
    try {
      return get();
    } catch {
      return null;
    }
  };
  const hinted = read(() => new URLSearchParams(location.hash.slice(1)).get('theme'));
  const kept = read(() => sessionStorage.getItem('visual-anything.theme'));
  const systemDark = read(() => matchMedia('(prefers-color-scheme: dark)').matches) === true;
  const theme = isTheme(hinted) ? hinted : isTheme(kept) ? kept : systemDark ? 'dark' : 'light';
  read(() => document.documentElement.setAttribute('data-theme', theme));
})();
