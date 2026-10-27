/** A step that advances by itself (ADR 0077): when the next press comes, and pausing it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvanceTimer, advanceEvery } from './advance';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('advanceEvery', () => {
  it('waits for the person by default, and for its scenario when it says so', () => {
    expect(advanceEvery({})).toBeUndefined();
    expect(advanceEvery({ advance: 'after-scenario' })).toBe('after-scenario');
  });

  it('spreads a step’s reveals evenly over its time, and moves on when it ends', () => {
    expect(advanceEvery({ advance: 6000 })).toBe(6000);
    expect(advanceEvery({ advance: 6000, reveals: [{ marks: ['a'] }, { marks: ['b'] }] })).toBe(
      2000,
    );
  });
});

describe('AdvanceTimer', () => {
  it('presses forward once its time has passed', () => {
    const timer = new AdvanceTimer();
    const press = vi.fn();
    timer.run('step 0', 1000, press);
    vi.advanceTimersByTime(999);
    expect(press).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('keeps the time already waited through a pause, for the same press', () => {
    const timer = new AdvanceTimer();
    const press = vi.fn();
    const stop = timer.run('step 0', 1000, press);
    vi.advanceTimersByTime(600);
    stop();
    vi.advanceTimersByTime(5000);
    expect(press).not.toHaveBeenCalled();
    timer.run('step 0', 1000, press);
    vi.advanceTimersByTime(399);
    expect(press).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('waits its whole time again for another press', () => {
    const timer = new AdvanceTimer();
    const press = vi.fn();
    const stop = timer.run('step 0', 1000, press);
    vi.advanceTimersByTime(600);
    stop();
    timer.run('step 1', 1000, press);
    vi.advanceTimersByTime(999);
    expect(press).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(press).toHaveBeenCalledTimes(1);
  });
});
