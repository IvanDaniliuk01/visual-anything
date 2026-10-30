import type { LayoutDoneMessage } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { LAYOUT_WAIT_MOST, LayoutWaits, layoutWait, type LayoutGuidance } from './layout-waits';

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

describe('the layouts Claude asks for', () => {
  const guidance = { kind: 'layout', view: 'overview' } as unknown as LayoutGuidance;
  const done = (requestId: string): LayoutDoneMessage => ({
    type: 'layout/done',
    requestId,
    layouts: [],
  });

  it('takes an answer that comes while the layout is still being sent', async () => {
    const app = {};
    const waits: LayoutWaits = new LayoutWaits((_guidance, answer) => {
      waits.answered(app, done(answer));
      return Promise.resolve([app]);
    });
    await expect(waits.layOut(guidance)).resolves.toEqual({ apps: 1, layouts: [] });
  });

  it('ends at once when the app it reached went while it was being sent', async () => {
    const app = {};
    const waits: LayoutWaits = new LayoutWaits(() => {
      waits.gone(app);
      return Promise.resolve([app]);
    });
    await expect(waits.layOut(guidance)).resolves.toEqual({ apps: 1, unanswered: 'gone' });
  });

  it('waits no longer for a layout it could not send, and sends the next one', async () => {
    const app = {};
    let first = true;
    const waits: LayoutWaits = new LayoutWaits((_guidance, answer) => {
      if (first) {
        first = false;
        return Promise.reject(new Error('not sent'));
      }
      queueMicrotask(() => waits.answered(app, done(answer)));
      return Promise.resolve([app]);
    });
    await expect(waits.layOut(guidance)).rejects.toThrow('not sent');
    await expect(waits.layOut(guidance)).resolves.toEqual({ apps: 1, layouts: [] });
    // Closing ends nothing more: the layout that was not sent left no wait behind.
    waits.close();
  });
});
