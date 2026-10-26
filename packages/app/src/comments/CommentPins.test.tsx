import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { buildScene, shownBy } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import type { CanvasCamera } from '../view-state/canvas';
import { loadSample } from '../test/sample';
import { CommentPins } from './CommentPins';
import { CommentsContext, CommentsStore } from './store';

const VIEW = 'system-overview';
const sample = loadSample();
const scene = buildScene(sample, VIEW);

/** A canvas whose camera the test moves. */
function fakeCanvas(start: Camera = { x: 10, y: 20, scale: 2 }) {
  let camera = start;
  const listeners = new Set<() => void>();
  const setCamera = vi.fn((next: Camera) => {
    camera = next;
  });
  const canvas: CanvasCamera = {
    camera: () => camera,
    viewport: () => ({ width: 5000, height: 3000 }),
    setCamera,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reveal: () => undefined,
    targetOf: () => camera,
    glideTo: (next) => setCamera(next),
  };
  const move = (next: Camera) => {
    camera = next;
    for (const listener of listeners) listener();
  };
  return { canvas, move, setCamera };
}

function renderPins(project: ProjectSnapshot = sample) {
  const store = new CommentsStore();
  const emphasis = new EmphasisStore();
  const select = vi.fn();
  const { canvas, move, setCamera } = fakeCanvas();
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: VIEW,
    scene: buildScene(project, VIEW),
    selection: EMPTY_SELECTION,
    select,
    send: undefined,
    reveal: () => undefined,
    openView: () => undefined,
  };
  const wrap = (children: ReactNode) => (
    <EditorContext value={editor}>
      <EmphasisContext value={emphasis}>
        <CommentsContext value={store}>{children}</CommentsContext>
      </EmphasisContext>
    </EditorContext>
  );
  render(wrap(<CommentPins canvas={canvas} />));
  return { store, emphasis, select, move, setCamera };
}

const reminder = () => {
  const shape = shownBy(scene, 'reminder-service');
  if (!shape) throw new Error('The sample draws no reminder service.');
  return shape;
};

describe('the comment pins', () => {
  it('pin an open thread on its element, where the camera shows it', () => {
    renderPins();
    const pin = screen.getByRole('button', { name: '1 thread: Reminder service' });
    const { rect } = reminder();
    const x = Math.round((rect.x + rect.width) * 2 + 10 - 14);
    const y = Math.round(rect.y * 2 + 20 - 14);
    expect(pin).toBeVisible();
    expect(pin.style.transform).toBe(`translate(${x}px, ${y}px)`);
  });

  it('follow the camera without drawing again', () => {
    const { move } = renderPins();
    const pin = screen.getByRole('button', { name: '1 thread: Reminder service' });
    const { rect } = reminder();
    act(() => move({ x: 0, y: 0, scale: 1 }));
    expect(pin.style.transform).toBe(
      `translate(${Math.round(rect.x + rect.width - 14)}px, ${Math.round(rect.y - 14)}px)`,
    );
    act(() => move({ x: -1e6, y: 0, scale: 1 }));
    expect(pin).not.toBeVisible();
  });

  it('show their thread in the comments tab when chosen, and select what they are on', () => {
    const { store, select } = renderPins();
    fireEvent.click(screen.getByRole('button', { name: '1 thread: Reminder service' }));
    expect(store.getState()).toMatchObject({ open: 'reminder-timing', shown: 1 });
    expect(select).toHaveBeenCalledWith(selectionOf([{ kind: 'element', id: 'reminder-service' }]));
  });

  it('hide resolved threads unless the panel shows them, and what the filters hide', () => {
    const resolved = {
      ...sample,
      comments: sample.comments.map((each) => ({ ...each, resolved: true })),
    };
    const { store } = renderPins(resolved);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => store.setFilters({ state: 'all' }));
    expect(
      screen.getByRole('button', { name: '1 resolved thread: Reminder service' }),
    ).toBeVisible();
  });

  it('hide what the filters hide', () => {
    const { emphasis } = renderPins();
    act(() => emphasis.set('filters', { hidden: new Set([reminder().key]) }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('take a click on the canvas to place a thread on a point, and Escape gives up', () => {
    const { store } = renderPins();
    act(() => store.setPlacing(true));
    const layer = screen.getByRole('button', { name: /^Place the comment/ });
    fireEvent.click(layer, { clientX: 110, clientY: 60 });
    // (110 - 10) / 2 and (60 - 20) / 2, the layer being at the page's corner in jsdom.
    expect(store.getState()).toMatchObject({
      composing: { kind: 'point', view: VIEW, x: 50, y: 20 },
      placing: false,
      shown: 1,
    });
    act(() => store.setPlacing(true));
    fireEvent.keyDown(screen.getByRole('button', { name: /^Place the comment/ }), {
      key: 'Escape',
    });
    expect(store.getState().placing).toBe(false);
  });

  it('bring a point asked for into the middle of the canvas', () => {
    const { store, setCamera } = renderPins();
    act(() => store.goToPoint(VIEW, 100, 50));
    expect(setCamera).toHaveBeenCalledWith({ scale: 2, x: 2500 - 200, y: 1500 - 100 });
  });
});
