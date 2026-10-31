// @vitest-environment node
/** The hover shared by element id (ADR 0076): each place says what it hovers, and stops only its own. */
import { describe, expect, it, vi } from 'vitest';
import { HoverStore } from './hover';

describe('the shared hover', () => {
  it('holds what was hovered last, and where', () => {
    const store = new HoverStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('canvas', 'arm');
    expect(store.get()).toEqual({ element: 'arm', from: 'canvas' });
    store.set('space', 'camera');
    expect(store.get()).toEqual({ element: 'camera', from: 'space' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('takes away only what the place that stops hovering hovered', () => {
    const store = new HoverStore();
    store.set('space', 'camera');
    store.set('canvas', undefined);
    expect(store.get()).toEqual({ element: 'camera', from: 'space' });
    store.set('space', undefined);
    expect(store.get()).toBeUndefined();
  });

  it('says nothing for what changes nothing', () => {
    const store = new HoverStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('canvas', undefined);
    store.set('canvas', 'arm');
    const hovered = store.get();
    store.set('canvas', 'arm');
    expect(store.get()).toBe(hovered);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
