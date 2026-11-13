/**
 * The values of the explorable list (ADR 0107): Inherited and None stand apart from every id, since
 * an id never holds U+0000.
 */
import type { AppearanceChanges } from '@visual-anything/core';
import type { Appearance } from '@visual-anything/schema';

/** The list's value for taking the trait out, so that it is inherited. */
export const INHERITED = '\u0000inherited';
/** The list's value for showing none. */
export const NONE = '\u0000none';

/** What a choice in the list sets the trait to: `null` takes it out. */
export function explorableChange(value: string): AppearanceChanges['explorable'] {
  if (value === INHERITED) return null;
  if (value === NONE) return 'none';
  return { explorable: value };
}

/** The list's value for what an appearance sets. */
export function explorableValueOf(own: Appearance['explorable']): string {
  if (own === undefined) return INHERITED;
  if (own === 'none') return NONE;
  return own.explorable;
}
