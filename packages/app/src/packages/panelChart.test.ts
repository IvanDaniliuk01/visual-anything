/** The drawing of a package panel's charts (ADR 0089's M14.4 clarification). */
import { describe, expect, it } from 'vitest';
import {
  PANEL_CHART_HEIGHT,
  PANEL_CHART_WIDTH,
  SERIES_COLORS,
  chartBars,
  chartLinePoints,
  chartScale,
  seriesColor,
} from './panelChart';

describe('a panel’s chart', () => {
  it('scales a bar chart from zero, and a line chart over its numbers alone', () => {
    const series = [{ name: 'a', values: [2, 4] }];
    const bars = chartScale(series, true);
    expect([bars.low, bars.high]).toEqual([0, 4]);
    expect(bars.y(0)).toBe(PANEL_CHART_HEIGHT);
    expect(bars.y(4)).toBe(0);
    const line = chartScale(series, false);
    expect([line.low, line.high]).toEqual([2, 4]);
    expect(line.y(2)).toBe(PANEL_CHART_HEIGHT);
  });

  it('draws a flat line in the middle when every number is the same', () => {
    const scale = chartScale([{ name: 'a', values: [3, 3] }], false);
    expect(scale.y(3)).toBe(PANEL_CHART_HEIGHT / 2);
  });

  it('groups bars by label, series side by side, rising from zero or hanging below it', () => {
    const series = [
      { name: 'a', values: [2, -2] },
      { name: 'b', values: [1, 0] },
    ];
    const scale = chartScale(series, true);
    const bars = chartBars(['x', 'y'], series, scale);
    expect(bars).toHaveLength(4);
    const [ax, bx, ay] = bars;
    expect(ax).toMatchObject({ series: 0, label: 0, value: 2, y: 0, height: 20 });
    expect(bx!.x).toBeGreaterThan(ax!.x);
    expect(ay).toMatchObject({ series: 0, label: 1, value: -2, y: 20, height: 20 });
    // Every bar stays inside the box, with a gap at each side of each label.
    for (const bar of bars) {
      expect(bar.x).toBeGreaterThan(0);
      expect(bar.x + bar.width).toBeLessThan(PANEL_CHART_WIDTH);
    }
  });

  it('spreads a line over the width, one point a label', () => {
    const scale = chartScale([{ name: 'a', values: [0, 1, 2] }], false);
    expect(chartLinePoints([0, 1, 2], scale)).toBe(`0,40 50,20 ${PANEL_CHART_WIDTH},0`);
    expect(chartLinePoints([5], chartScale([{ name: 'a', values: [5] }], false))).toBe('50,20');
  });

  it('colors six series in a fixed order, never cycled', () => {
    expect(new Set(SERIES_COLORS).size).toBe(6);
    expect(seriesColor(0)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(9)).toBe(SERIES_COLORS[5]);
  });
});
