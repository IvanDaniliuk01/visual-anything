/**
 * The families the canvas and the exports write text in (ADR 0083, ADR 0086), with no DOM, so that
 * the SVG writer, which the command line runs in Node, names the same fonts the canvas loads
 * (`robotoFonts.ts`).
 */

/** The family Roboto's five styles are registered under. */
export const ROBOTO = 'Visual Anything Roboto';
/** The family Roboto Mono is registered under. */
export const ROBOTO_MONO = 'Visual Anything Roboto Mono';

/** The fonts the canvas writes text in, first available first: Roboto, then the system's until it loads. */
export const SANS_FAMILY: readonly string[] = [
  ROBOTO,
  'system-ui',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'sans-serif',
];

/** The fonts code and a table's column types are written in: Roboto Mono, then the system's. */
export const MONO_FAMILY: readonly string[] = [
  ROBOTO_MONO,
  'ui-monospace',
  'Cascadia Mono',
  'Roboto Mono',
  'Consolas',
  'monospace',
];
