/**
 * The stills the app holds of explorables (ADR 0107), for the SVG and the PDF: a shape that shows an
 * explorable is drawn as its still when the canvas's image store holds one, by the key the canvas's
 * stills are kept by (`stillKey` of the core, A10.3), and as its card otherwise.
 *
 * The seam: until the canvas takes stills and keeps them in its image store, there is none to give,
 * so every explorable is exported as its card. The canvas's store answers here once it holds them.
 */
import type { ExplorableShape } from '@visual-anything/schema';
import type { ExplorableStillPicture } from './svg';

/** The still the app holds of an explorable's shape, as a drawing holds it; none yet. */
export function stillOf(shape: ExplorableShape): ExplorableStillPicture | undefined {
  void shape;
  return undefined;
}
