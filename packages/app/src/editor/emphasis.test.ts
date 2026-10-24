import { describe, expect, it, vi } from 'vitest';
import { EmphasisStore } from './emphasis';

describe('EmphasisStore', () => {
  it('draws the union of what every source emphasizes', () => {
    const store = new EmphasisStore();
    store.set('filter', { hidden: new Set(['a']) });
    store.set('focus', { dimmed: new Set(['b']), hidden: new Set(['c']) });
    store.set('playback', {
      highlighted: new Set(['r']),
      markers: [{ relation: 'r', progress: 0.5 }],
    });
    expect(store.get()).toEqual({
      hidden: new Set(['a', 'c']),
      dimmed: new Set(['b']),
      highlighted: new Set(['r']),
      markers: [{ relation: 'r', progress: 0.5 }],
    });
  });

  it('keeps the same union until a source changes, and tells listeners when one does', () => {
    const store = new EmphasisStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const focus = { dimmed: new Set(['b']) };
    store.set('focus', focus);
    const first = store.get();
    store.set('focus', focus);
    expect(store.get()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
    store.set('focus', undefined);
    expect(store.get()).toEqual({});
    expect(listener).toHaveBeenCalledTimes(2);
    store.set('focus', undefined);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
