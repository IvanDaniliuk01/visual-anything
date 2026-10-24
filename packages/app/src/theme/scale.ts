/**
 * The scales every stylesheet measures with, the same in both themes: spacing, radii, type, weights,
 * line heights, stacking above the canvas, control sizes, motion and the rulers. Each becomes the CSS
 * variable `--<group>-<step>`, such as `--space-2` or `--z-menu`.
 */
export const SCALE = {
  space: { 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 5: '1.5rem', 6: '2rem' },
  radius: { sm: '0.25rem', md: '0.4rem', lg: '0.6rem', full: '999px' },
  /** 12, 13, 14, 16 and 18 px at the default text size; 12 px is the floor. */
  text: { xs: '0.857rem', sm: '0.929rem', md: '1rem', lg: '1.143rem', xl: '1.286rem' },
  weight: { medium: '500', strong: '600', heading: '700' },
  line: { tight: '1.25', normal: '1.45' },
  /** Notices stay visible over a modal's backdrop, and never take its focus. */
  z: { toolbar: '2', editor: '3', menu: '4', dialog: '10', notices: '20' },
  /** Control heights; the small one still gives a hit target of at least 24 px. */
  control: { sm: '1.75rem', md: '2.25rem' },
  duration: { fast: '120ms', base: '180ms' },
  ease: { out: 'cubic-bezier(0.2, 0, 0, 1)' },
  ruler: { size: '20px' },
} as const satisfies Record<string, Record<string | number, string>>;

export type Scale = typeof SCALE;
