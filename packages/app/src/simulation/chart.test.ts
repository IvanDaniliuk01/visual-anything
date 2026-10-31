/** The line of a simulated number's chart (ADR 0085): sampled evenly, its ends always in it. */
import type { SimulatedTick } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { CHART_HEIGHT, CHART_WIDTH, MOST_POINTS, chartLine } from './chart';

function ticks(values: readonly (number | string)[]): SimulatedTick[] {
  return values.map((queue) => ({ values: { queue }, marks: [] }));
}

describe('a chart line', () => {
  it('draws each tick across the box, the lowest at the bottom and the highest at the top', () => {
    const line = chartLine(ticks([0, 5, 10]), 'queue');
    expect(line).toMatchObject({ low: 0, high: 10, count: 3 });
    expect(line?.points).toBe(`0,${CHART_HEIGHT} 50,${CHART_HEIGHT / 2} ${CHART_WIDTH},0`);
  });

  it('keeps to its most points over many ticks, the first and the last among them', () => {
    const many = ticks(Array.from({ length: 10_000 }, (_, at) => at));
    const line = chartLine(many, 'queue');
    expect(line?.count).toBe(MOST_POINTS);
    const points = line?.points.split(' ') ?? [];
    expect(points[0]).toBe(`0,${CHART_HEIGHT}`);
    expect(points.at(-1)).toBe(`${CHART_WIDTH},0`);
  });

  it('draws a flat line through the middle, and nothing for a value no tick answered', () => {
    const flat = chartLine(ticks([3, 3]), 'queue');
    expect(flat?.y(3)).toBe(CHART_HEIGHT / 2);
    expect(chartLine(ticks(['a', 'b']), 'queue')).toBeUndefined();
    expect(chartLine(ticks([1]), 'other')).toBeUndefined();
  });
});
