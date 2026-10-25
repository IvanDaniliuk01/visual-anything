import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OVERFLOW_ORDER, OverflowPlan, isWrapped } from './overflow';

/** A toolbar row whose groups have these widths, besides what always stays: wraps past its width. */
function row(widths: readonly number[], fixed: number) {
  return (under: number, width: number) =>
    fixed + widths.slice(under).reduce((sum, each) => sum + each, 0) > width;
}

/** Steps the plan until it settles, as the toolbar does from one layout to the next. */
function settle(
  plan: OverflowPlan,
  wraps: (under: number, width: number) => boolean,
  width: number,
) {
  for (let steps = 0; steps < 50; steps++) {
    const before = plan.under;
    plan.next(wraps(plan.under, width), width);
    if (plan.under === before) return plan.under;
  }
  throw new Error('The plan never settled.');
}

describe('OverflowPlan', () => {
  it('puts groups under More, in order, until the row fits on one line', () => {
    const plan = new OverflowPlan(OVERFLOW_ORDER.length);
    const wraps = row([100, 150, 60, 110, 340, 40], 330);
    expect(settle(plan, wraps, 2000)).toBe(0);
    expect(settle(plan, wraps, 820)).toBe(3);
    expect(settle(plan, wraps, 400)).toBe(5);
    expect(settle(plan, wraps, 350)).toBe(6);
  });

  it('brings them back as the row gets wider, and only then', () => {
    const plan = new OverflowPlan(OVERFLOW_ORDER.length);
    const wraps = row([100, 150, 60, 110, 340, 40], 330);
    expect(settle(plan, wraps, 500)).toBe(5);
    expect(settle(plan, wraps, 500)).toBe(5);
    expect(settle(plan, wraps, 1000)).toBe(2);
    expect(settle(plan, wraps, 1200)).toBe(0);
  });

  it('never puts more under More than it holds, and stays put when even that wraps', () => {
    const plan = new OverflowPlan(2);
    expect(settle(plan, () => true, 100)).toBe(2);
    expect(plan.next(true, 100)).toBe(2);
  });

  it('settles, for any widths and any sequence of row widths, on the fewest groups that fit', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 400 }),
        fc.array(fc.integer({ min: 50, max: 2500 }), { minLength: 1, maxLength: 8 }),
        (widths, fixed, sizes) => {
          const plan = new OverflowPlan(widths.length);
          const wraps = row(widths, fixed);
          for (const width of sizes) {
            const under = settle(plan, wraps, width);
            const fewest = [...widths.keys(), widths.length].find((each) => !wraps(each, width));
            expect(under).toBe(fewest ?? widths.length);
          }
        },
      ),
    );
  });
});

describe('isWrapped', () => {
  const box = (top: number, height: number, width = 30) =>
    ({ top, bottom: top + height, width }) as DOMRect;

  it('sees a row whose items all sit on its first line', () => {
    expect(isWrapped([box(10, 28), box(12, 24), box(8, 32)])).toBe(false);
  });

  it('sees an item that went to a line below', () => {
    expect(isWrapped([box(10, 28), box(12, 24), box(44, 28)])).toBe(true);
  });

  it('passes over items that take no room', () => {
    expect(isWrapped([box(10, 28), box(300, 0, 0)])).toBe(false);
    expect(isWrapped([])).toBe(false);
  });
});
