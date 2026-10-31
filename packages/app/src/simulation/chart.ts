/**
 * The line of a simulated number's chart (ADR 0085): its points in the chart's drawing box, at most
 * `MOST_POINTS` of them sampled evenly over the ticks held, whatever their number, and its range.
 */
import type { SimulatedTick } from '@visual-anything/core';

/** The chart's drawing box: as wide as the section, by the CSS, and this tall in its own units. */
export const CHART_WIDTH = 100;
export const CHART_HEIGHT = 32;
/** The most points its line has, however many ticks the run holds. */
export const MOST_POINTS = 400;

/** A number's line over the ticks held: its points in the drawing box, and its range. */
export interface ChartLine {
  points: string;
  /** How many points it has. */
  count: number;
  low: number;
  high: number;
  /** Where a value is drawn, in the box's height. */
  y: (value: number) => number;
}

/** The line of one number over ticks; none when no tick answered it as a finite number. */
export function chartLine(ticks: readonly SimulatedTick[], name: string): ChartLine | undefined {
  const values: { at: number; value: number }[] = [];
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const [at, tick] of ticks.entries()) {
    const value = tick.values[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    values.push({ at, value });
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (values.length === 0) return undefined;
  const span = high - low;
  const bottom = span === 0 ? low - 1 : low;
  const top = span === 0 ? high + 1 : high;
  const y = (value: number) => CHART_HEIGHT - ((value - bottom) / (top - bottom)) * CHART_HEIGHT;
  const last = Math.max(1, ticks.length - 1);
  const point = (each: { at: number; value: number }) =>
    `${round((each.at / last) * CHART_WIDTH)},${round(y(each.value))}`;
  const points: string[] = [];
  // The first and the last always, and evenly between them.
  const between = Math.min(values.length, MOST_POINTS);
  for (let k = 0; k < between; k++) {
    const at = between === 1 ? 0 : Math.round((k * (values.length - 1)) / (between - 1));
    points.push(point(values[at] as { at: number; value: number }));
  }
  return { points: points.join(' '), count: points.length, low, high, y };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
