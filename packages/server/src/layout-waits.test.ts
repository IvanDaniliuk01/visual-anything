import { describe, expect, it } from 'vitest';
import { LAYOUT_WAIT_MOST, layoutWait } from './layout-waits';

describe('how long a layout guidance waits', () => {
  it('waits for each layout it asks for, and a margin', () => {
    expect(layoutWait(1, 20_000, 10_000)).toBe(30_000);
    expect(layoutWait(3, 20_000, 10_000)).toBe(70_000);
    expect(layoutWait(0, 20_000, 10_000)).toBe(30_000);
  });

  it('never waits more than five minutes, however many containers it names', () => {
    expect(LAYOUT_WAIT_MOST).toBe(300_000);
    expect(layoutWait(500, 20_000, 10_000)).toBe(300_000);
  });
});
