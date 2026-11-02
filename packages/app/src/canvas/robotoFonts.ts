/**
 * Roboto on the canvas (ADR 0083, F0's canvas half): the fonts the PDF embeds, Roboto 2.137 Regular,
 * Medium, Bold, Italic and Bold Italic and Roboto Mono 3.000, loaded with `FontFace` from the bytes the app
 * already ships (`export/fonts/`), so that nothing is fetched and the page needs no new source. They
 * are registered under families of their own, so that a Roboto installed on the computer, of another
 * version and other widths, is never drawn in their place.
 *
 * The canvas draws its bitmap fonts from them once they are loaded, and measures every text in the
 * core's tables of the same fonts (`robotoWidth`), so that the canvas, the exports and faces break
 * lines alike. Where `FontFace` is missing, as in a test, nothing is loaded and the fonts the canvas
 * names after these, the system's, are drawn instead, still measured in Roboto's widths.
 *
 * Medium (500) is the weight a drawing's names may ask for besides Regular and Bold (ADR 0086), so
 * that no weight the canvas asks for is one it has not loaded, which the browser would draw as Bold.
 */
import { decodeBase64 } from '@visual-anything/core';
import { ROBOTO, ROBOTO_MONO } from './fontFamilies';

export { MONO_FAMILY, ROBOTO, ROBOTO_MONO, SANS_FAMILY } from './fontFamilies';

/**
 * A list of families as a CSS `font-family` value: a name of letters and hyphens alone, which the
 * generic families are, as it is, and any other quoted.
 */
export function cssFontFamily(families: readonly string[]): string {
  return families.map((each) => (/^[a-z-]+$/i.test(each) ? each : `"${each}"`)).join(', ');
}

/** What registers a font: the document's `FontFaceSet`, as far as this uses it. */
interface FontSet {
  add(face: FontFace): unknown;
}

let loading: Promise<boolean> | undefined;
let loaded = false;

/**
 * Loads the six fonts once, and says whether they are ready to draw. It never rejects: a font that
 * cannot be read leaves the canvas drawing in the system's fonts.
 */
export function loadRobotoFonts(): Promise<boolean> {
  loading ??= load().then(
    (done) => (loaded = done),
    () => false,
  );
  return loading;
}

/** Whether the fonts are loaded and registered. */
export function robotoLoaded(): boolean {
  return loaded;
}

async function load(): Promise<boolean> {
  const fonts = (globalThis.document as { fonts?: FontSet } | undefined)?.fonts;
  if (typeof FontFace === 'undefined' || !fonts) return false;
  const [upright, medium, emphasis] = await Promise.all([
    import('../export/fonts/roboto.json'),
    import('../export/fonts/roboto-medium.json'),
    import('../export/fonts/roboto-emphasis.json'),
  ]);
  const sources: [string, string, FontFaceDescriptors][] = [
    [ROBOTO, upright.default.regular, { weight: '400', style: 'normal' }],
    [ROBOTO, medium.default.medium, { weight: '500', style: 'normal' }],
    [ROBOTO, upright.default.bold, { weight: '700', style: 'normal' }],
    [ROBOTO, emphasis.default.italic, { weight: '400', style: 'italic' }],
    [ROBOTO, emphasis.default.boldItalic, { weight: '700', style: 'italic' }],
    [ROBOTO_MONO, emphasis.default.mono, { weight: '400', style: 'normal' }],
  ];
  const faces = sources.map(([family, base64, descriptors]) => {
    const bytes = decodeBase64(base64);
    if (!bytes) throw new Error('A font the canvas draws in could not be read.');
    // A copy in an `ArrayBuffer` of its own, which `FontFace` takes.
    return new FontFace(family, new Uint8Array(bytes), descriptors);
  });
  await Promise.all(faces.map((face) => face.load()));
  for (const face of faces) fonts.add(face);
  return true;
}

/** Forgets what was loaded, for tests. */
export function forgetRobotoFonts(): void {
  loading = undefined;
  loaded = false;
}
