/**
 * The scales every stylesheet measures with, the same in both themes: spacing, sizes, radii, lines,
 * type, weights, line heights, letter spacing, stacking above the canvas, control and icon sizes,
 * motion and the rulers. Each becomes the CSS variable `--<group>-<step>`, such as `--space-50` or
 * `--z-menu`. No stylesheet writes one of these values out (`stylesheets.test.ts`); a value a
 * stylesheet needs that no step gives becomes a step here first (ADR 0033's clarification of A4).
 *
 * Spaces and sizes are named by their length in hundredths of a rem (`--space-35` is 0.35rem, 4.9 px
 * at the default text size of 14 px): they are the steps the panels were built with, kept so that
 * nothing moved when the stylesheets took them, and a later pass may fold neighbors together.
 */
export const SCALE = {
  /** Padding, margins, gaps and offsets. */
  space: {
    10: '0.1rem',
    15: '0.15rem',
    20: '0.2rem',
    25: '0.25rem',
    30: '0.3rem',
    35: '0.35rem',
    40: '0.4rem',
    45: '0.45rem',
    50: '0.5rem',
    55: '0.55rem',
    60: '0.6rem',
    65: '0.65rem',
    70: '0.7rem',
    75: '0.75rem',
    80: '0.8rem',
    90: '0.9rem',
    100: '1rem',
    110: '1.1rem',
    120: '1.2rem',
    140: '1.4rem',
    150: '1.5rem',
    160: '1.6rem',
    200: '2rem',
    275: '2.75rem',
    280: '2.8rem',
  },
  /**
   * Widths, heights and the bases of flexible boxes: marks and swatches, columns, panels, dialogs and
   * lists. `hidden` is the one-pixel box of what only screen readers read.
   */
  size: {
    hidden: '1px',
    55: '0.55rem',
    80: '0.8rem',
    100: '1rem',
    110: '1.1rem',
    115: '1.15rem',
    120: '1.2rem',
    130: '1.3rem',
    140: '1.4rem',
    160: '1.6rem',
    170: '1.7rem',
    180: '1.8rem',
    200: '2rem',
    220: '2.2rem',
    240: '2.4rem',
    275: '2.75rem',
    280: '2.8rem',
    340: '3.4rem',
    350: '3.5rem',
    400: '4rem',
    450: '4.5rem',
    600: '6rem',
    650: '6.5rem',
    700: '7rem',
    750: '7.5rem',
    800: '8rem',
    850: '8.5rem',
    1000: '10rem',
    1100: '11rem',
    1200: '12rem',
    1300: '13rem',
    1400: '14rem',
    1600: '16rem',
    1800: '18rem',
    2000: '20rem',
    2200: '22rem',
    2400: '24rem',
    2500: '25rem',
    2600: '26rem',
    2800: '28rem',
    3000: '30rem',
    3200: '32rem',
    3400: '34rem',
    3600: '36rem',
    4000: '40rem',
    4400: '44rem',
    7800: '78rem',
  },
  radius: { xs: '0.2rem', sm: '0.25rem', md: '0.4rem', lg: '0.6rem', full: '999px' },
  /**
   * The widths of lines: borders, outlines and the focus ring, separators, the bars that mark a card or
   * the current row, and the strokes of SVG drawn in the panels (a chart's line, the tour's leader
   * line), where a pixel is a unit of the drawing. `dash` is the pattern of a dashed stroke.
   */
  stroke: {
    thin: '1px',
    medium: '1.5px',
    thick: '2px',
    mark: '3px',
    bar: '4px',
    dash: '4 3',
  },
  /** 12, 13, 14, 16, 18 and 24 px at the default text size; 12 px is the floor. */
  text: {
    xs: '0.857rem',
    sm: '0.929rem',
    md: '1rem',
    lg: '1.143rem',
    xl: '1.286rem',
    '2xl': '1.714rem',
  },
  /**
   * Lengths relative to the text they sit in, for text that takes emphasis (ADR 0082): its headings,
   * its code and its padding, a link's underline, and the gutter of line numbers beside code.
   */
  em: {
    'heading-1': '1.3em',
    'heading-2': '1.15em',
    code: '0.92em',
    'code-padding': '0.2em',
    underline: '0.15em',
    gutter: '2.2em',
  },
  weight: { normal: '400', medium: '500', strong: '600', heading: '700' },
  /** `relaxed` is code's, whose line numbers keep to its lines. */
  line: { none: '1', tight: '1.25', normal: '1.45', relaxed: '1.5' },
  /** Letter spacing: the product's name, and labels set in capitals. */
  tracking: { title: '0.01em', caps: '0.05em' },
  /**
   * Notices stay visible over a modal's backdrop, and never take its focus. Marks over the canvas,
   * such as comment pins, lie under its toolbar. `behind` puts a box's own backdrop, such as the
   * canvas toolbar's bar, behind what the box holds (A5).
   */
  z: {
    behind: '-1',
    marks: '1',
    toolbar: '2',
    editor: '3',
    menu: '4',
    dialog: '10',
    notices: '20',
  },
  /** Control heights; the small one still gives a hit target of at least 24 px. */
  control: { sm: '1.75rem', md: '2.25rem' },
  /** The icons of `shell/icons.tsx`, 16 px by default, and pictures drawn at an icon's place. */
  icon: { sm: '16px', md: '24px' },
  duration: { fast: '120ms', base: '180ms' },
  ease: { out: 'cubic-bezier(0.2, 0, 0, 1)' },
  ruler: { size: '20px' },
} as const satisfies Record<string, Record<string | number, string>>;

export type Scale = typeof SCALE;
