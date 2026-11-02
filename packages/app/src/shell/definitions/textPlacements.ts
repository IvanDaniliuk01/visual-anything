import type { Appearance } from '@visual-anything/schema';

export type TextPlacement = NonNullable<Appearance['textPlacement']>;

/** Where a shape may place its name and detail in its label area, in words (ADR 0082). */
export const TEXT_PLACEMENTS: readonly { placement: TextPlacement; words: string }[] = [
  { placement: 'top', words: 'At the top' },
  { placement: 'middle', words: 'In the middle' },
  { placement: 'bottom', words: 'At the bottom' },
];

export function isTextPlacement(value: string): value is TextPlacement {
  return TEXT_PLACEMENTS.some((each) => each.placement === value);
}
