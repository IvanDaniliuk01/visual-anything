/**
 * Expanding and collapsing by zoom (ADR 0055): a collapsed container whose appearance expands from a
 * scale shows expanded once the canvas zooms into it there, collapses again 10% below, and stays
 * collapsed after the person collapses it until the zoom falls below; nothing is stored.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import { buildSceneAfresh } from '../scene';
import { NOT_EXPANDED, collapsedWithout } from './collapsed';
import { expandedByZoom } from './expansion';
import { ZoomExpansion } from './useZoomExpansion';

const VIEW = 'system-overview';

/** The sample with Scheduling collapsed, its System component expanding from scale 2. */
function project(): ProjectSnapshot {
  const sample = loadSample();
  const collapsed: ProjectSnapshot = {
    ...sample,
    views: sample.views.map((view) =>
      view.id === VIEW ? { ...view, collapsed: ['scheduling'] } : view,
    ),
  };
  const outcome = executeCommand(collapsed, {
    type: 'set-component-appearance',
    component: 'systems.system',
    appearanceTraits: { expandFrom: 2 },
  });
  if (!outcome.ok) throw new Error('Refused.');
  return outcome.state;
}

const VIEWPORT = { width: 800, height: 600 };

function viewOf(state: ProjectSnapshot): ViewFile {
  return state.views.find((view) => view.id === VIEW) as ViewFile;
}

describe('expandedByZoom', () => {
  const state = project();
  const view = viewOf(state);
  const scene = buildSceneAfresh(state, VIEW);
  const scheduling = scene.shapes.find((shape) => shape.element === 'scheduling');
  if (!scheduling) throw new Error('No Scheduling.');
  // A camera whose screen's middle is Scheduling's, at a scale.
  const onIt = (scale: number) => ({
    camera: {
      x: VIEWPORT.width / 2 - (scheduling.rect.x + scheduling.rect.width / 2) * scale,
      y: VIEWPORT.height / 2 - (scheduling.rect.y + scheduling.rect.height / 2) * scale,
      scale,
    },
    viewport: VIEWPORT,
  });
  const away = (scale: number) => ({ camera: { x: 1e7, y: 1e7, scale }, viewport: VIEWPORT });

  it('expands a collapsed container once the zoom reaches its scale with it on screen', () => {
    expect([
      ...expandedByZoom(state, view, scene, onIt(1.9), NOT_EXPANDED, new Set()).expanded,
    ]).toEqual([]);
    expect([
      ...expandedByZoom(state, view, scene, onIt(2), NOT_EXPANDED, new Set()).expanded,
    ]).toEqual(['scheduling']);
    // Zooming elsewhere expands nothing.
    expect([
      ...expandedByZoom(state, view, scene, away(3), NOT_EXPANDED, new Set()).expanded,
    ]).toEqual([]);
  });

  it('collapses it again only 10% below, wherever the canvas looks', () => {
    const expanded = new Set(['scheduling']);
    expect([
      ...expandedByZoom(state, view, scene, away(1.85), expanded, new Set()).expanded,
    ]).toEqual(['scheduling']);
    expect([
      ...expandedByZoom(state, view, scene, away(1.79), expanded, new Set()).expanded,
    ]).toEqual([]);
  });

  it('keeps one collapsed by hand until the zoom falls below, then lets it go', () => {
    const held = new Set(['scheduling']);
    const close = expandedByZoom(state, view, scene, onIt(3), NOT_EXPANDED, held);
    expect([...close.expanded]).toEqual([]);
    expect(close.released).toEqual([]);
    expect(expandedByZoom(state, view, scene, onIt(1.7), NOT_EXPANDED, held).released).toEqual([
      'scheduling',
    ]);
  });

  it('expands nothing whose appearance does not say so', () => {
    const sample = loadSample();
    const plain: ProjectSnapshot = {
      ...sample,
      views: sample.views.map((each) =>
        each.id === VIEW ? { ...each, collapsed: ['scheduling'] } : each,
      ),
    };
    const result = expandedByZoom(
      plain,
      viewOf(plain),
      buildSceneAfresh(plain, VIEW),
      onIt(8),
      NOT_EXPANDED,
      new Set(),
    );
    expect(result.expanded.size).toBe(0);
  });
});

describe('ZoomExpansion', () => {
  it('says which containers show expanded, the same set while they are the same, and lets the person collapse one again', () => {
    const state = project();
    const view = viewOf(state);
    const scene = buildSceneAfresh(state, VIEW);
    const store = new ZoomExpansion();
    let told = 0;
    store.subscribe(() => (told += 1));
    const scheduling = scene.shapes.find((shape) => shape.element === 'scheduling');
    if (!scheduling) throw new Error('No Scheduling.');
    const look = (scale: number) => ({
      camera: {
        x: VIEWPORT.width / 2 - (scheduling.rect.x + scheduling.rect.width / 2) * scale,
        y: VIEWPORT.height / 2 - (scheduling.rect.y + scheduling.rect.height / 2) * scale,
        scale,
      },
      viewport: VIEWPORT,
    });
    store.follow(state, view, scene, look(1));
    expect(store.expandedIn(VIEW)).toBe(NOT_EXPANDED);
    store.follow(state, view, scene, look(2.5));
    const expanded = store.expandedIn(VIEW);
    expect([...expanded]).toEqual(['scheduling']);
    expect(told).toBe(1);
    store.follow(state, view, scene, look(2.6));
    expect(store.expandedIn(VIEW)).toBe(expanded);
    expect(told).toBe(1);
    // Collapsed by hand: no command needed, and it stays so while zoomed in.
    expect(store.collapseAgain(VIEW, ['scheduling', 'patient'])).toEqual(['scheduling']);
    expect(store.expandedIn(VIEW)).toBe(NOT_EXPANDED);
    store.follow(state, view, scene, look(3));
    expect(store.expandedIn(VIEW).size).toBe(0);
    // Below where it expands, it is let go, and expands again when the zoom comes back.
    store.follow(state, view, scene, look(1));
    store.follow(state, view, scene, look(2.5));
    expect([...store.expandedIn(VIEW)]).toEqual(['scheduling']);
    // The view file never changed.
    expect(viewOf(state).collapsed).toEqual(['scheduling']);
  });
});

describe('collapsedWithout', () => {
  it('gives the same set for the same sets, and the collapsed set itself when it expands none', () => {
    const collapsed = new Set(['a', 'b']);
    const expanded = new Set(['b']);
    expect(collapsedWithout(collapsed, NOT_EXPANDED)).toBe(collapsed);
    expect(collapsedWithout(collapsed, new Set(['c']))).toBe(collapsed);
    const left = collapsedWithout(collapsed, expanded);
    expect([...left]).toEqual(['a']);
    expect(collapsedWithout(collapsed, expanded)).toBe(left);
  });
});
