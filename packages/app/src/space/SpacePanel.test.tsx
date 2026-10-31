/**
 * The physical-space panel's place (ADR 0076), against the stand-in worker that draws boxes: it shows
 * while the open view's panel is open, says which element it shows, draws through the solid client
 * and hands its frames to a `bitmaprenderer` canvas, sends the worker only what changed as the
 * selection and the shared hover change, says how to put something in physical space when the view
 * holds nothing there, closes from its bar, the toolbar's Physical space and Alt+Shift+P, and resizes
 * from its edge.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_KEYS } from '../canvas/keys';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { createSolidClient, type SolidClient } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { workcell } from '../test/space';
import { changeOf } from './changes';
import { SpacePanelContext } from './context';
import { SPACE_KEYS } from './keys';
import { SpacePanel } from './SpacePanel';
import { SpacePanelToggle } from './SpacePanelToggle';
import { SpacePanelStore } from './store';
import { useSpacePanelShortcut } from './useSpacePanelShortcut';

const VIEW = 'cell-view';

function setUp(options: { project?: ProjectSnapshot; client?: boolean } = {}) {
  const project = options.project ?? workcell();
  const view = project.views[0];
  if (!view) throw new Error('The workcell has a view.');
  const scene = buildScene(project, VIEW);
  const store = new SpacePanelStore({
    frames: { request: (callback) => (callback(), 0), cancel: () => {} },
    windowWidth: () => 1600,
  });
  const hovers = new HoverStore();
  const workers: StandInSolidWorker[] = [];
  const client: SolidClient | undefined =
    options.client === false
      ? undefined
      : createSolidClient({
          files: {
            get: () => Promise.resolve({ ok: false, code: 'solid-file-missing', message: 'No.' }),
          },
          start: () => {
            const worker = new StandInSolidWorker();
            workers.push(worker);
            return worker;
          },
        });
  const editor = { project, viewId: VIEW } as unknown as Editor;
  function Harness({ selection, children }: { selection: Selection; children?: ReactNode }) {
    useSpacePanelShortcut(store, VIEW, false);
    return (
      <EditorContext.Provider value={editor}>
        <SpacePanelContext value={store}>
          <HoverContext value={hovers}>
            <SpacePanelToggle />
            <SpacePanel
              id="space-panel"
              store={store}
              project={project}
              view={view as NonNullable<typeof view>}
              scene={scene}
              selection={selection}
              client={client}
            />
            {children}
          </HoverContext>
        </SpacePanelContext>
      </EditorContext.Provider>
    );
  }
  const rendered = render(<Harness selection={EMPTY_SELECTION} />);
  const select = (selection: Selection) => rendered.rerender(<Harness selection={selection} />);
  return { project, store, hovers, client, workers, worker: () => workers.at(-1), select };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 10; round++) await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the physical-space panel', () => {
  it('shows nothing while the open view’s panel is closed', () => {
    const { workers } = setUp();
    expect(screen.queryByRole('region', { name: 'Physical space' })).toBeNull();
    expect(workers).toHaveLength(0);
  });

  it('opens on the element it shows, draws through the worker, and hands frames to a bitmap canvas', async () => {
    const transfer = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
      kind === 'bitmaprenderer' ? { transferFromImageBitmap: transfer } : null) as never);
    const { store, worker } = setUp();
    act(() => store.open(VIEW));
    await settle();
    const panel = screen.getByRole('region', { name: 'Physical space' });
    expect(panel).toHaveTextContent('Shows “World”');
    expect(screen.getByRole('img', { name: 'Physical space: 5 elements' })).toBeInTheDocument();
    const [shown] = worker()?.ofType('space/show') ?? [];
    expect(shown?.entries.map((entry) => entry.element)).toEqual([
      'world',
      'table',
      'arm',
      'camera',
      'elbow',
    ]);
    expect(transfer).toHaveBeenCalled();
    expect(
      screen.getByRole('separator', { name: 'Width of the physical-space panel' }),
    ).toHaveAttribute('aria-valuenow', '480');
  });

  it('sends only the states as the selection and the shared hover change', async () => {
    const { store, hovers, worker, select } = setUp();
    act(() => store.open(VIEW));
    await settle();
    act(() => select(selectionOf([{ kind: 'element', id: 'arm' }])));
    act(() => hovers.set('canvas', 'camera'));
    const updates = worker()?.ofType('space/update') ?? [];
    expect(updates.map((update) => Object.keys(update).sort())).toEqual([
      ['space', 'states', 'type'],
      ['space', 'states', 'type'],
    ]);
    expect(updates.map((update) => ({ states: update.states }))).toEqual([
      { states: [{ element: 'arm', selected: true }] },
      {
        states: [
          { element: 'arm', selected: true },
          { element: 'camera', hovered: true },
        ],
      },
    ]);
  });

  it('says how to put something in physical space when the view holds nothing there', () => {
    const { store, workers } = setUp({ project: workcell({ posed: false }) });
    act(() => store.open(VIEW, {}));
    expect(screen.getByRole('region', { name: 'Physical space' })).toHaveTextContent(
      'Nothing this view shows is in physical space yet.',
    );
    expect(workers).toHaveLength(0);
  });

  it('says it draws while connected, without a solid client', () => {
    const { store } = setUp({ client: false });
    act(() => store.open(VIEW));
    expect(
      screen.getByText('Physical space is drawn while Visual Anything is connected.'),
    ).toBeInTheDocument();
  });

  it('closes from its bar, and stops its drawing', async () => {
    const { store, worker } = setUp();
    act(() => store.open(VIEW));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Close the physical-space panel' }));
    expect(store.state(VIEW)).toBeUndefined();
    expect(screen.queryByRole('region', { name: 'Physical space' })).toBeNull();
    expect(worker()?.ofType('space/end')).toHaveLength(1);
  });

  it('opens and closes from the toolbar’s Physical space, on what the chooser picks', () => {
    const { store } = setUp({ project: workcell({ posed: false }) });
    store.setChooser(() => ({ root: 'spare' }));
    const toggle = screen.getByRole('button', { name: 'Physical space' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-keyshortcuts', 'Alt+Shift+P');
    fireEvent.click(toggle);
    expect(store.state(VIEW)).toEqual({ root: 'spare' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Physical space' })).toHaveTextContent(
      'Shows “Spare arm”',
    );
    fireEvent.click(toggle);
    expect(store.state(VIEW)).toBeUndefined();
  });

  it('opens and closes with Alt+Shift+P, but not while typing', () => {
    const { store } = setUp();
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', altKey: true, shiftKey: true });
    expect(store.state(VIEW)).toEqual({});
    // Option+Shift+P types another letter on macOS: the key's place says which it is.
    fireEvent.keyDown(window, { key: '∏', code: 'KeyP', altKey: true, shiftKey: true });
    expect(store.state(VIEW)).toBeUndefined();
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'P', code: 'KeyP', altKey: true, shiftKey: true });
    expect(store.state(VIEW)).toBeUndefined();
    field.remove();
    expect(CANVAS_KEYS).toEqual(expect.arrayContaining([...SPACE_KEYS]));
  });

  it('resizes from its edge with the keys, and back to its width with a double click', () => {
    const { store } = setUp();
    act(() => store.open(VIEW));
    const edge = screen.getByRole('separator', { name: 'Width of the physical-space panel' });
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(store.width).toBe(496);
    fireEvent.keyDown(edge, { key: 'Home' });
    expect(store.width).toBe(280);
    expect(edge).toHaveAttribute('aria-valuenow', '280');
    fireEvent.doubleClick(edge);
    expect(store.width).toBe(480);
  });
});

describe('what the panel sends the worker as it changes', () => {
  it('names only what changed, and lets a camera and a cut go', () => {
    const entries = [] as const;
    const before = { size: { width: 10, height: 10 }, entries, states: [] };
    const camera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 1 };
    expect(changeOf(before, { ...before, size: { width: 10, height: 10 } })).toBeUndefined();
    expect(changeOf(before, { ...before, camera, names: true })).toEqual({ camera, names: true });
    expect(changeOf({ ...before, camera, explode: 1 }, before)).toEqual({
      camera: null,
      explode: 0,
    });
    expect(
      changeOf({ ...before, cut: { axis: 'x', at: 0, keep: 'above' } }, { ...before, states: [] }),
    ).toEqual({ cut: null, states: [] });
  });
});
