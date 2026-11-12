import { describe, expect, it } from 'vitest';
import { liveAfter, type LiveTarget } from './live';

const A: LiveTarget = { spot: 'shape-a', explorable: 'p.graph', element: 'a' };
const B: LiveTarget = { spot: 'free-b', explorable: 'p.other' };
const SCREEN = { x: 0, y: 0, width: 800, height: 600 };

describe('one explorable live on the canvas at a time', () => {
  it('makes the one explored live, and still again the one live before', () => {
    expect(liveAfter(undefined, { kind: 'explore', target: A })).toBe(A);
    expect(liveAfter(A, { kind: 'explore', target: B })).toBe(B);
  });

  it('keeps the same one live when it is explored again', () => {
    expect(liveAfter(A, { kind: 'explore', target: { ...A } })).toBe(A);
  });

  it('turns it still with Escape', () => {
    expect(liveAfter(A, { kind: 'escape' })).toBeUndefined();
    expect(liveAfter(undefined, { kind: 'escape' })).toBeUndefined();
  });

  it('turns it still once it scrolls off screen, or its shape goes', () => {
    const on = { x: 700, y: 500, width: 200, height: 200 };
    expect(liveAfter(A, { kind: 'view', rect: on, visible: SCREEN })).toBe(A);
    const off = { x: 801, y: 0, width: 100, height: 100 };
    expect(liveAfter(A, { kind: 'view', rect: off, visible: SCREEN })).toBeUndefined();
    const above = { x: 10, y: -200, width: 100, height: 200 };
    expect(liveAfter(A, { kind: 'view', rect: above, visible: SCREEN })).toBeUndefined();
    expect(liveAfter(A, { kind: 'view', rect: undefined, visible: SCREEN })).toBeUndefined();
    expect(liveAfter(undefined, { kind: 'view', rect: on, visible: SCREEN })).toBeUndefined();
  });
});
