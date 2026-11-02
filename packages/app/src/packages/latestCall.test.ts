/**
 * Calling a package's panel (ADR 0089's M14.4 clarification): after a wait, one call at a time, and
 * only the answer of the call asked for last shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatestCall, PANEL_WAIT_MS } from './latestCall';

/** A call that answers when told to. */
function deferred(answer: string) {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  const call = vi.fn(() => promise);
  return { call, answer: () => resolve(answer) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a panel’s calls', () => {
  it('start once what is asked has stayed the same for the wait', async () => {
    const shown: string[] = [];
    const latest = new LatestCall<string>((answer) => shown.push(answer));
    const first = deferred('first');
    const second = deferred('second');
    latest.ask(first.call);
    await vi.advanceTimersByTimeAsync(PANEL_WAIT_MS - 1);
    latest.ask(second.call);
    await vi.advanceTimersByTimeAsync(PANEL_WAIT_MS - 1);
    expect(first.call).not.toHaveBeenCalled();
    expect(second.call).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(first.call).not.toHaveBeenCalled();
    expect(second.call).toHaveBeenCalledTimes(1);
    second.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual(['second']);
  });

  it('run one at a time, and drop the answer of a call asked for before the last', async () => {
    const shown: string[] = [];
    const latest = new LatestCall<string>((answer) => shown.push(answer));
    const first = deferred('first');
    const second = deferred('second');
    latest.ask(first.call, { now: true });
    expect(first.call).toHaveBeenCalledTimes(1);
    latest.ask(second.call, { now: true });
    // The first still runs, so the second waits for it.
    expect(second.call).not.toHaveBeenCalled();
    first.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual([]);
    expect(second.call).toHaveBeenCalledTimes(1);
    second.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual(['second']);
  });

  it('start a call asked for while another ran only once its wait is over', async () => {
    const shown: string[] = [];
    const latest = new LatestCall<string>((answer) => shown.push(answer));
    const first = deferred('first');
    const second = deferred('second');
    latest.ask(first.call, { now: true });
    latest.ask(second.call);
    first.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.call).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PANEL_WAIT_MS);
    expect(second.call).toHaveBeenCalledTimes(1);
    second.answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual(['second']);
  });

  it('show nothing once cancelled', async () => {
    const shown: string[] = [];
    const latest = new LatestCall<string>((answer) => shown.push(answer));
    const running = deferred('running');
    const waiting = deferred('waiting');
    latest.ask(running.call, { now: true });
    latest.ask(waiting.call);
    latest.cancel();
    running.answer();
    await vi.advanceTimersByTimeAsync(PANEL_WAIT_MS * 2);
    expect(waiting.call).not.toHaveBeenCalled();
    expect(shown).toEqual([]);
  });
});
