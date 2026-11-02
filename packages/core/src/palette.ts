/**
 * The palette (ADR 0088): the swatches every color field of the format panel offers first, before
 * the project's colors and recent ones. Each reads at 3:1 or more on both canvases, so a fill, a
 * border, a line or a name picked from it is seen in either theme, and no two are closer than the
 * difference the overlays need to be told apart.
 */
import type { Color } from '@visual-anything/schema';

/** A swatch: its stored color and its name, in English, which the app translates. */
export interface Swatch {
  color: Color;
  name: string;
}

/** The twelve swatches, in the order the format panel shows them. */
export const PALETTE: readonly Swatch[] = Object.freeze([
  { color: '#E5484D', name: 'Red' },
  { color: '#E2600C', name: 'Orange' },
  { color: '#B0820A', name: 'Amber' },
  { color: '#3D9A50', name: 'Green' },
  { color: '#0F9688', name: 'Teal' },
  { color: '#0789B5', name: 'Cyan' },
  { color: '#3E63DD', name: 'Blue' },
  { color: '#9B4FC2', name: 'Purple' },
  { color: '#C2449E', name: 'Magenta' },
  { color: '#E5487F', name: 'Pink' },
  { color: '#7D7D7D', name: 'Gray' },
  { color: '#A87A52', name: 'Brown' },
]);
