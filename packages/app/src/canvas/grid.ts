/**
 * The grid, the rulers and snapping, worked out with no drawing: one step of 8 canvas units, used for
 * snapping, for Shift with an arrow key, for the rulers' ticks and for the built-in sizes. The grid's
 * lines come in families 8 × 5^j canvas units apart, each drawn as strongly as its spacing on screen
 * allows, so that the grid follows the zoom without popping.
 */
import type { CanvasTheme } from '../theme/themes';
import type { Point, Rect, Size } from './geometry';

/** The grid's step, in canvas units: what shapes snap to and what Shift with an arrow key moves by. */
export const GRID_STEP = 8;

/** Each family of lines is this many times as far apart as the next finer one. */
const FAMILY_RATIO = 5;

/** How many families of lines there are, from 8 to 25,000 canvas units apart. */
const FAMILIES = 6;

/** The spacing of each family of grid lines, in canvas units, finest first. */
export const FAMILY_SPACINGS: readonly number[] = Object.freeze(
  Array.from({ length: FAMILIES }, (_, family) => GRID_STEP * FAMILY_RATIO ** family),
);

/** The spacing of the coarsest family. */
const COARSEST = GRID_STEP * FAMILY_RATIO ** (FAMILIES - 1);

/** A family is drawn once its lines are this strong, and every family beyond the first at full strength is not. */
const FAINTEST = 0.1;

/** The most lines the grid draws over the whole canvas; above it, the finest family is left out. */
export const MAX_GRID_LINES = 1200;

/** The most lines a container's grid draws. */
export const MAX_CONTAINER_LINES = 400;

/** How far apart the finest lines of a container's grid are on screen, at least, in CSS pixels. */
const CONTAINER_FINEST = 6;

/**
 * While snapping, the 8-unit lines keep the theme's floor once they are this far apart on screen; the
 * floor fades in from `SNAP_FLOOR_FROM`, so that nothing pops when zooming.
 */
const SNAP_FLOOR_AT = 8;
const SNAP_FLOOR_FROM = 6;

/** The rulers' labels are this far apart on screen, at least, in CSS pixels. */
export const RULER_LABEL_GAP = 64;

/** The rulers' 4 px ticks are this far apart on screen, at least, in CSS pixels. */
const RULER_TICK_GAP = 8;

/** A family of grid lines as drawn at one scale. */
export interface DrawnFamily {
  /** How far apart its lines are, in canvas units. */
  spacing: number;
  /** How far apart they are on screen, in CSS pixels. */
  pixels: number;
  /** How strongly its lines are drawn, from 0 to 1. */
  strength: number;
}

/** One line of the grid, across or down: where it starts and how wide it is, in CSS pixels. */
export interface GridLine {
  start: number;
  width: number;
}

/** The lines of a family, in the grid's own space, each line drawn only in its coarsest family. */
export interface FamilyLines extends DrawnFamily {
  /** The lines down, by where they cross the top. */
  xs: GridLine[];
  /** The lines across, by where they cross the left side. */
  ys: GridLine[];
}

/**
 * The grid for one scale and viewport, in screen space: what panning moves by `gridOffset`, never
 * drawn again. It reaches one period of its coarsest family, and a pixel, past the viewport to the
 * right and below, since the offset moves it up to a period to the left and up.
 */
export interface GridLines {
  /** How far apart the coarsest family's lines are on screen; every family's spacing divides it. */
  period: number;
  /** What the lines cover, from the grid's own origin. */
  extent: Size;
  families: FamilyLines[];
  /** How many lines there are, across and down. */
  count: number;
}

/** How strongly lines this far apart on screen are drawn: 0 at 4 px, 1 at 200 px and beyond. */
export function lineStrength(pixels: number): number {
  if (!(pixels > 0)) return 0;
  return Math.min(1, Math.max(0, Math.log(pixels / 4) / Math.log(50)));
}

/**
 * The families drawn at a scale: from the finest whose lines are drawn at a strength of at least
 * 0.1, up to the first at full strength. The coarsest family stays when every one is fainter.
 */
export function drawnFamilies(scale: number): DrawnFamily[] {
  const families: DrawnFamily[] = [];
  for (const spacing of FAMILY_SPACINGS) {
    const pixels = spacing * scale;
    const strength = lineStrength(pixels);
    if (strength < FAINTEST && spacing !== COARSEST) continue;
    families.push({ spacing, pixels, strength });
    if (strength >= 1) break;
  }
  return families;
}

/**
 * How opaque a family's lines are drawn, white tinted in the theme's grid color: its strength times
 * the theme's grid strength. While snapping, the 8-unit lines keep the theme's floor once they are 8 px
 * apart, so that the lines shapes snap to can be seen at 100%.
 */
export function familyAlpha(
  family: DrawnFamily,
  theme: Pick<CanvasTheme, 'gridStrength' | 'gridSnapAlpha'>,
  snapping: boolean,
): number {
  const alpha = family.strength * theme.gridStrength;
  if (!snapping || family.spacing !== GRID_STEP) return alpha;
  const fade = Math.min(
    1,
    Math.max(0, (family.pixels - SNAP_FLOOR_FROM) / (SNAP_FLOOR_AT - SNAP_FLOOR_FROM)),
  );
  return Math.max(alpha, theme.gridSnapAlpha * fade);
}

/**
 * Where a line of 1 CSS px at `x` is drawn so that it covers whole device pixels: `max(1,
 * round(resolution))` of them, centered on a device pixel when that is odd and on the boundary
 * between two when it is even.
 */
export function crispLine(x: number, resolution: number): GridLine {
  const pixels = Math.max(1, Math.round(resolution));
  const device = x * resolution;
  const center = pixels % 2 === 1 ? Math.floor(device) + 0.5 : Math.round(device);
  return { start: (center - pixels / 2) / resolution, width: pixels / resolution };
}

/** The remainder of `value` by `period`, in [0, period) even for negative values. */
export function modulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/**
 * Where the grid's geometry starts on screen for a camera position along one axis: up to a period to
 * the left of or above the screen's edge, on a device pixel. Panning changes only this.
 */
export function gridOffset(camera: number, period: number, resolution: number): number {
  return Math.round((modulo(camera, period) - period) * resolution) / resolution;
}

/**
 * The grid's lines for a scale and viewport, in screen space from the grid's own origin, each line
 * once, in the coarsest drawn family it belongs to. Above `cap` lines, the finest families are left out.
 */
export function gridLines(
  scale: number,
  viewport: Size,
  resolution: number,
  cap = MAX_GRID_LINES,
): GridLines {
  let families = drawnFamilies(scale);
  const coarsest = families.at(-1) as DrawnFamily;
  const period = coarsest.pixels;
  const extent = { width: viewport.width + period + 1, height: viewport.height + period + 1 };
  const countOf = (drawn: readonly DrawnFamily[]) =>
    drawn.reduce(
      (sum, family) =>
        sum + linesAlong(extent.width, family.pixels) + linesAlong(extent.height, family.pixels),
      0,
    );
  // Coarser families' lines are counted in the finer ones too, so this is an upper bound.
  while (families.length > 1 && countOf(families) > cap) families = families.slice(1);
  const lines = families.map((family, index): FamilyLines => {
    const coarser = families[index + 1];
    const every = coarser ? Math.round(coarser.spacing / family.spacing) : 0;
    const along = (length: number) => {
      const drawn: GridLine[] = [];
      const count = linesAlong(length, family.pixels);
      for (let k = 0; k < count; k++) {
        if (every > 0 && k % every === 0) continue;
        drawn.push(crispLine(k * family.pixels, resolution));
      }
      return drawn;
    };
    return { ...family, xs: along(extent.width), ys: along(extent.height) };
  });
  const count = lines.reduce((sum, family) => sum + family.xs.length + family.ys.length, 0);
  return { period, extent, families: lines, count };
}

/** How many lines `spacing` apart fit in `length`, from 0. */
function linesAlong(length: number, spacing: number): number {
  return Math.floor(length / spacing) + 1;
}

/**
 * The families a container's grid draws at a scale: from the finest whose lines are at least 6 px
 * apart, up to the first at full strength, so that it shows the lines its contents snap to.
 */
export function containerFamilies(scale: number): DrawnFamily[] {
  const families: DrawnFamily[] = [];
  for (const spacing of FAMILY_SPACINGS) {
    const pixels = spacing * scale;
    if (pixels < CONTAINER_FINEST && spacing !== COARSEST) continue;
    families.push({ spacing, pixels, strength: lineStrength(pixels) });
    if (lineStrength(pixels) >= 1) break;
  }
  return families;
}

/** The lines of a family of a container's grid, in canvas units: where they cross its top and left. */
export interface ContainerFamilyLines extends DrawnFamily {
  xs: number[];
  ys: number[];
}

/**
 * The lines of a container's grid within `area`, at its origin + k × spacing, each line once, in the
 * coarsest family it belongs to; above `cap` lines, the finest families are left out.
 */
export function containerGridLines(
  area: Rect,
  origin: Point,
  scale: number,
  cap = MAX_CONTAINER_LINES,
): ContainerFamilyLines[] {
  let families = containerFamilies(scale);
  const countOf = (drawn: readonly DrawnFamily[]) =>
    drawn.reduce(
      (sum, family) =>
        sum +
        Math.floor(area.width / family.spacing) +
        Math.floor(area.height / family.spacing) +
        2,
      0,
    );
  while (families.length > 1 && countOf(families) > cap) families = families.slice(1);
  return families.map((family, index) => {
    const coarser = families[index + 1];
    const along = (from: number, length: number, start: number) => {
      const lines: number[] = [];
      const every = coarser ? Math.round(coarser.spacing / family.spacing) : 0;
      for (let k = Math.ceil((from - start) / family.spacing); ; k++) {
        const at = start + k * family.spacing;
        if (at > from + length) break;
        if (every > 0 && modulo(k, every) === 0) continue;
        lines.push(at);
      }
      return lines;
    };
    return {
      ...family,
      xs: along(area.x, area.width, origin.x),
      ys: along(area.y, area.height, origin.y),
    };
  });
}

/** Rounds a value to the nearest multiple of the step; never −0. */
export function snap(value: number, step = GRID_STEP): number {
  return Math.round(value / step) * step + 0;
}

/**
 * How far to move shapes dragged by `raw` so that the anchor, the moving shape that carries the
 * pressed one, lands on a multiple of the step in its frame: its container's origin, or the canvas's in
 * World. Every moving shape moves by the same distance, so the rest keep their places relative to it.
 */
export function snappedDelta(anchor: Point, raw: Point, frame: Point, step = GRID_STEP): Point {
  return {
    x: frame.x + snap(anchor.x + raw.x - frame.x, step) - anchor.x,
    y: frame.y + snap(anchor.y + raw.y - frame.y, step) - anchor.y,
  };
}

/** The next multiple of the step beyond `value` in a direction: 164 → 168 → 176 going up. */
export function nudgedOffset(value: number, direction: 1 | -1, step = GRID_STEP): number {
  const next =
    direction > 0 ? (Math.floor(value / step) + 1) * step : (Math.ceil(value / step) - 1) * step;
  return next + 0;
}

/**
 * Where the rulers mark, in canvas units: their 4 px ticks on the finest drawn family at least 8 px
 * apart, and their labels and 8 px ticks at the smallest of 1 and 2 × 8 · 5^j at least 64 px apart.
 */
export function rulerSteps(scale: number): { tick: number; label: number } {
  const tick =
    drawnFamilies(scale).find((family) => family.pixels >= RULER_TICK_GAP)?.spacing ?? COARSEST;
  for (const spacing of FAMILY_SPACINGS) {
    for (const times of [1, 2]) {
      if (spacing * times * scale >= RULER_LABEL_GAP) return { tick, label: spacing * times };
    }
  }
  return { tick, label: COARSEST * 2 };
}

/** A ruler's label: where it is on screen along its ruler, and what it says. */
export interface RulerLabel {
  at: number;
  value: number;
  text: string;
}

/**
 * The labels along a ruler `length` long: every multiple of `step` whose place on screen,
 * `camera + value × scale`, falls on it.
 */
export function rulerLabels(
  camera: number,
  scale: number,
  length: number,
  step: number,
): RulerLabel[] {
  const labels: RulerLabel[] = [];
  const first = Math.ceil(-camera / scale / step);
  for (let k = first; ; k++) {
    const value = k * step;
    const at = camera + value * scale;
    if (at > length) break;
    labels.push({ at, value, text: unitsText(value) });
  }
  return labels;
}

/** A whole number of canvas units as the rulers and the readout write it, with "−" for negatives. */
export function unitsText(value: number): string {
  const whole = Math.round(value);
  return whole < 0 ? `−${-whole}` : String(whole + 0);
}

/** How many labels the rulers keep for a viewport: enough for both rulers wherever the camera is. */
export function rulerLabelPool(viewport: Size): number {
  return (
    Math.ceil(viewport.width / RULER_LABEL_GAP) + Math.ceil(viewport.height / RULER_LABEL_GAP) + 4
  );
}
