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

// What a tour's step brings in fades in by its halos (ADR 0077).
describe('EmphasisStore’s marks that arrive', () => {
  it('fades in what a source says arrives, unless another source highlights it already', () => {
    const store = new EmphasisStore();
    store.set('tour', {
      highlighted: new Set(['a', 'b', 'c']),
      arriving: { keys: new Set(['b', 'c']), duration: 200 },
    });
    expect(store.get().arriving).toEqual({ keys: new Set(['b', 'c']), duration: 200 });
    store.set('playback', { highlighted: new Set(['c']) });
    expect(store.get().highlighted).toEqual(new Set(['a', 'b', 'c']));
    expect(store.get().arriving).toEqual({ keys: new Set(['b']), duration: 200 });
    store.set('playback', { highlighted: new Set(['b', 'c']) });
    expect(store.get().arriving).toBeUndefined();
  });

  it('keeps what arrives the same while other sources change, so that its fade goes on', () => {
    const store = new EmphasisStore();
    store.set('tour', {
      highlighted: new Set(['a']),
      arriving: { keys: new Set(['a']), duration: 200 },
    });
    const arriving = store.get().arriving;
    store.set('playback', { markers: [{ relation: 'r', progress: 0.2 }] });
    store.set('playback', { markers: [{ relation: 'r', progress: 0.4 }] });
    expect(store.get().arriving).toBe(arriving);
    store.set('tour', {
      highlighted: new Set(['a']),
      arriving: { keys: new Set(['a']), duration: 200 },
    });
    // The same marks asked to arrive again by the same source arrive again.
    expect(store.get().arriving).not.toBe(arriving);
    store.set('tour', { highlighted: new Set(['a']) });
    expect(store.get().arriving).toBeUndefined();
  });
});
