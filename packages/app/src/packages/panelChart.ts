/**
 * The drawing of a chart a package's panel answers (ADR 0089's M14.4 clarification), in plain SVG as
 * the Simulation section's charts are: a bar chart's bars from a baseline at zero, grouped by label
 * with a gap between them, or a line chart's lines over the labels, evenly spaced; and the range of
 * the numbers drawn.
 */
import type { PanelSeries } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { OVERLAY_PALETTE } from '../shell/inspector/overlayPalette';

/** The chart's drawing box: as wide as the section, by the CSS, and this tall in its own units. */
export const PANEL_CHART_WIDTH = 100;
export const PANEL_CHART_HEIGHT = 40;

/**
 * The colors of a chart's series, in a fixed order, never cycled: a chart holds at most 6. They are
 * the overlay palette's, each at least 3:1 against the canvas of each theme, ordered so that each two
 * next to each other stay apart for the color-blind too (CVD ΔE at least 8). The legend and the
 * table of the numbers name each series, so color never carries it alone.
 */
export const SERIES_COLORS: readonly Color[] = [0, 1, 4, 2, 3, 5].map(
  (at) => OVERLAY_PALETTE[at] as Color,
);

/** The color of the series at `at`. */
export function seriesColor(at: number): Color {
  return SERIES_COLORS[Math.min(at, SERIES_COLORS.length - 1)] as Color;
}

/** Where numbers are drawn in the box's height, and the range of those drawn. */
export interface ChartScale {
  low: number;
  high: number;
  y: (value: number) => number;
}

/** The scale of a chart's numbers; a bar chart's always holds zero, which its bars rise from. */
export function chartScale(series: readonly PanelSeries[], bars: boolean): ChartScale {
  const values = series.flatMap((each) => each.values);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (bars) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }
  const span = high - low;
  const bottom = span === 0 ? low - 1 : low;
  const top = span === 0 ? high + 1 : high;
  const y = (value: number) =>
    round(PANEL_CHART_HEIGHT - ((value - bottom) / (top - bottom)) * PANEL_CHART_HEIGHT);
  return { low, high, y };
}

/** One bar: its series, its label, its number and its box. */
export interface ChartBar {
  series: number;
  label: number;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The share of a label's room its bars take; the rest is the gap between labels. */
const GROUP_SHARE = 0.8;

/** A bar chart's bars, label by label, each label's series side by side. */
export function chartBars(
  labels: readonly string[],
  series: readonly PanelSeries[],
  scale: ChartScale,
): ChartBar[] {
  const room = PANEL_CHART_WIDTH / labels.length;
  const width = (room * GROUP_SHARE) / series.length;
  const zero = scale.y(0);
  const bars: ChartBar[] = [];
  for (const [label] of labels.entries()) {
    const start = label * room + (room * (1 - GROUP_SHARE)) / 2;
    for (const [at, each] of series.entries()) {
      const value = each.values[label] ?? 0;
      const top = scale.y(value);
      bars.push({
        series: at,
        label,
        value,
        x: round(start + at * width),
        y: Math.min(top, zero),
        width: round(width),
        height: round(Math.abs(zero - top)),
      });
    }
  }
  return bars;
}

/** Where the label at `at` sits along a line chart: evenly from one side to the other. */
export function lineX(at: number, count: number): number {
  return count <= 1 ? PANEL_CHART_WIDTH / 2 : round((at / (count - 1)) * PANEL_CHART_WIDTH);
}

/** A line chart's line for one series, as an SVG polyline's points. */
export function chartLinePoints(values: readonly number[], scale: ChartScale): string {
  return values.map((value, at) => `${lineX(at, values.length)},${scale.y(value)}`).join(' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
