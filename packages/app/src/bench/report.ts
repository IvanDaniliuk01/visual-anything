/**
 * What the benchmark pages share: the frame budget and its pass rules, percentiles, and the rows and
 * the verdict they show.
 */

/** The target: 60 frames per second, which leaves 16.7 ms for each. */
export const TARGET_FPS = 60;
/** What the work of a frame may take: on average, at the 95th percentile, and at worst two frames. */
export const WORK = { average: 10, p95: 13, worst: 2000 / TARGET_FPS };
/** What frames as shown may take: they may run a little late now and then. */
export const SHOWN = { average: 1000 / (TARGET_FPS * 0.92), p95: 25 };
/**
 * What the frames of a theme switch or a recolor may take while their tiles are drawn again (A1 and
 * A2): 95% within a frame at 60 fps, and every one within two.
 */
export const RESTYLING = { p95: 1000 / TARGET_FPS, worst: 2000 / TARGET_FPS };

/** The value below which `fraction` of the values fall; 0 when there are none. */
export function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/** A series of times, in milliseconds, in the figures the pages show. */
export interface Summary {
  count: number;
  average: number;
  p50: number;
  p95: number;
  worst: number;
}

export function summarize(values: readonly number[]): Summary {
  return {
    count: values.length,
    average: values.reduce((sum, each) => sum + each, 0) / Math.max(1, values.length),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    worst: Math.max(0, ...values),
  };
}

/** Adds a row of cells to a table's body; `className` marks it as passing or failing, when given. */
export function addRow(body: HTMLElement, className: string, values: string[]): void {
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  for (const value of values) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.appendChild(td);
  }
  body.appendChild(tr);
}

/** Says whether every phase passed, in the colour that goes with it. */
export function showVerdict(
  element: HTMLElement,
  passed: boolean,
  text: { pass: string; fail: string },
): void {
  element.className = passed ? 'pass' : 'fail';
  element.textContent = passed ? text.pass : text.fail;
}
