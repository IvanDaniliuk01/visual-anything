import { afterEach, describe, expect, it } from 'vitest';
import { FakeChannels } from '../test/FakeChannels';
import {
  TAB_GONE_AFTER,
  TAB_HEARTBEAT,
  forThisTab,
  inTheTabUsedLast,
  setTabUseForTests,
  trackTabUse,
  type TabUse,
} from './tabs';

/** Tabs of one browser on one clock, with their heartbeats in the test's hands. */
function browser() {
  const channels = new FakeChannels();
  let time = 1_000;
  const beats: (() => void)[] = [];
  const open = (shown = true): TabUse =>
    trackTabUse({
      channel: channels.open(),
      shown,
      now: () => time,
      every: (call) => {
        beats.push(call);
        return () => beats.splice(beats.indexOf(call), 1);
      },
    });
  return {
    open,
    later(ms = 1_000) {
      time += ms;
    },
    beat() {
      for (const call of [...beats]) call();
    },
    delivered: () => channels.delivered(),
  };
}

// Back to one tab alone, as the test setup leaves every test.
afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

describe('the tab the person used last', () => {
  it('is the one opened last, until another is used', async () => {
    const tabs = browser();
    const first = tabs.open();
    tabs.later();
    const second = tabs.open();
    await tabs.delivered();
    expect([first.isLastUsed(), second.isLastUsed()]).toEqual([false, true]);
    tabs.later();
    first.used();
    await tabs.delivered();
    expect([first.isLastUsed(), second.isLastUsed()]).toEqual([true, false]);
  });

  it('is not one that opened behind another, until it is used', async () => {
    const tabs = browser();
    const front = tabs.open();
    tabs.later();
    const behind = tabs.open(false);
    await tabs.delivered();
    expect([front.isLastUsed(), behind.isLastUsed()]).toEqual([true, false]);
    tabs.later();
    behind.used();
    await tabs.delivered();
    expect([front.isLastUsed(), behind.isLastUsed()]).toEqual([false, true]);
  });

  it('passes over a tab that is gone, or not heard from for a while', async () => {
    const tabs = browser();
    const first = tabs.open();
    tabs.later();
    const second = tabs.open();
    await tabs.delivered();
    second.dispose();
    await tabs.delivered();
    expect(first.isLastUsed()).toBe(true);

    tabs.open();
    await tabs.delivered();
    expect(first.isLastUsed()).toBe(false);
    // Each tab says again when it was used, so that it keeps counting while it lives.
    tabs.later(TAB_HEARTBEAT);
    tabs.beat();
    await tabs.delivered();
    expect(first.isLastUsed()).toBe(false);
    // One that stops saying so without saying it is gone, as a tab that crashes, is gone after a
    // while: no heartbeat comes here.
    tabs.later(TAB_GONE_AFTER + 1);
    expect(first.isLastUsed()).toBe(true);
  });

  it('is this one when the browser has no channel for the tabs', () => {
    const alone = trackTabUse({ channel: undefined, shown: false });
    expect(alone.isLastUsed()).toBe(true);
  });
});

describe('forThisTab', () => {
  const last = (value: boolean): TabUse => ({
    used: () => undefined,
    isLastUsed: () => value,
    dispose: () => undefined,
  });

  it('applies a request that names no view, or the view open, in every tab', () => {
    setTabUseForTests(last(false));
    expect(forThisTab({ request: 1 }, 'overview')).toBe(true);
    expect(forThisTab({ request: 2, view: 'overview' }, 'overview')).toBe(true);
  });

  it('opens another view only in the tab the person used last', () => {
    setTabUseForTests(last(false));
    expect(forThisTab({ request: 3, view: 'paths' }, 'overview')).toBe(false);
    setTabUseForTests(last(true));
    expect(forThisTab({ request: 4, view: 'paths' }, 'overview')).toBe(true);
  });

  it('decides once for each request, so that one passed over never applies later', () => {
    setTabUseForTests(last(false));
    const request = { request: 90, view: 'paths' };
    expect(forThisTab(request, 'overview')).toBe(false);
    // The person opens that view by hand, in this tab, afterwards.
    expect(forThisTab(request, 'paths')).toBe(false);
    const chosen = { request: 91, view: 'paths' };
    setTabUseForTests(last(true));
    expect(forThisTab(chosen, 'overview')).toBe(true);
    setTabUseForTests(last(false));
    expect(forThisTab(chosen, 'paths')).toBe(true);
  });

  it('takes the view a request plays over, as a scenario’s, when it names none', () => {
    setTabUseForTests(last(false));
    expect(forThisTab({ request: 5 }, 'overview', 'paths')).toBe(false);
    expect(forThisTab({ request: 6 }, 'paths', 'paths')).toBe(true);
  });

  it('plays what takes the tab full screen, as a tour, only in the tab used last', () => {
    setTabUseForTests(last(false));
    expect(inTheTabUsedLast({ tour: 'how' })).toBe(false);
    setTabUseForTests(last(true));
    expect(inTheTabUsedLast({ tour: 'how' })).toBe(true);
  });
});
