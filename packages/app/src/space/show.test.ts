/**
 * Show in physical space (ADR 0076): the panel shows the element, unless it is in physical space
 * under World, which the panel then shows and frames it in.
 */
import { describe, expect, it, vi } from 'vitest';
import { workcell } from '../test/space';
import { showInSpace, showInSpaceOf } from './show';
import { SpacePanelStore } from './store';

const CAMERA = { target: { x: 0, y: 0, z: 0 }, azimuth: 10, elevation: 20, distance: 3 };

function setUp() {
  const store = new SpacePanelStore({
    frames: { request: () => 0, cancel: () => {} },
    windowWidth: () => 1600,
  });
  const project = workcell();
  const view = project.views[0];
  if (!view) throw new Error('no view');
  return { store, project, view };
}

describe('Show in physical space', () => {
  it('shows an element that is not in physical space under World, with its solid', () => {
    const { store, project, view } = setUp();
    expect(showInSpace(store, project, view, 'spare')).toEqual({ kind: 'shows', element: 'spare' });
    expect(store.state(view.id)).toEqual({ root: 'spare' });
    expect(store.framing(view.id)).toBeUndefined();
  });

  it('keeps the panel as it is when it shows that element already', () => {
    const { store, project, view } = setUp();
    store.set(view.id, { root: 'spare', camera: CAMERA });
    showInSpace(store, project, view, 'spare');
    expect(store.state(view.id)).toEqual({ root: 'spare', camera: CAMERA });
  });

  it('frames an element in physical space under World, in World', () => {
    const { store, project, view } = setUp();
    store.set(view.id, { root: 'arm' });
    expect(showInSpace(store, project, view, 'camera')).toEqual({
      kind: 'frames',
      element: 'camera',
    });
    expect(store.state(view.id)).toEqual({});
    expect(store.framing(view.id)).toEqual({ elements: ['camera'], serial: 1 });
    // An anchored part of a posed solid is in physical space under World too.
    expect(showInSpaceOf(project, view, 'elbow')).toEqual({ kind: 'frames', element: 'elbow' });
  });

  it('keeps World’s camera when the panel shows World already, and frames everything for World', () => {
    const { store, project, view } = setUp();
    store.set(view.id, { camera: CAMERA });
    showInSpace(store, project, view, 'table');
    expect(store.state(view.id)).toEqual({ camera: CAMERA });
    showInSpace(store, project, view, 'world');
    expect(store.framing(view.id)).toEqual({ elements: [], serial: 2 });
  });
});

describe('a request to frame elements in the panel', () => {
  it('is kept until the panel did it, a newer one replacing it', () => {
    const { store } = setUp();
    const listener = vi.fn();
    store.subscribe(listener);
    store.frame('v', ['a']);
    // A closed panel keeps none.
    expect(store.framing('v')).toBeUndefined();
    store.open('v', {});
    store.frame('v', ['a']);
    store.frame('v', ['b']);
    const asked = store.framing('v');
    expect(asked?.elements).toEqual(['b']);
    store.framed('v', (asked?.serial ?? 0) - 1);
    expect(store.framing('v')).toBe(asked);
    store.framed('v', asked?.serial ?? 0);
    expect(store.framing('v')).toBeUndefined();
    store.frame('v', ['c']);
    store.close('v');
    expect(store.framing('v')).toBeUndefined();
    expect(listener).toHaveBeenCalled();
  });
});
