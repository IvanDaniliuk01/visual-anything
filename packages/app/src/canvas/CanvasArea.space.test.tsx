/**
 * Show in physical space, in the shape's menu (ADR 0076): it opens the tab's physical-space panel
 * showing the element, or showing World and framing the element when it is in physical space there;
 * without a panel, as outside the shell, the menu has no such item.
 */
import { definitionsIn } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { selectionOf, type Selection } from '../editor/selection';
import { SpacePanelContext } from '../space/context';
import { SpacePanelStore } from '../space/store';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { workcell } from '../test/space';
import { CanvasArea } from './CanvasArea';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'cell-view';
const SIZE = { width: 1000, height: 600 };

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

function setUp(element: string, store: SpacePanelStore | null) {
  const project = workcell();
  const initial: Selection = selectionOf([{ kind: 'element', id: element }]);
  function Live() {
    const [selection, setSelection] = useState(initial);
    const view = project.views.find((each) => each.id === VIEW)!;
    const scene = useMemo(() => buildScene(project, VIEW), []);
    const editor: Editor = {
      project,
      definitions: definitionsIn(project),
      viewId: VIEW,
      scene,
      selection,
      select: setSelection,
      send: undefined,
      reveal: () => {},
    };
    return (
      <SpacePanelContext value={store}>
        <EditorContext.Provider value={editor}>
          <CanvasArea
            project={project}
            view={view}
            scene={scene}
            label="Cell"
            selection={selection}
            onSelect={setSelection}
          />
        </EditorContext.Provider>
      </SpacePanelContext>
    );
  }
  return { Live };
}

async function openMenu(element: string, store: SpacePanelStore | null) {
  const { Live } = setUp(element, store);
  render(<Live />);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  await act(async () => {
    fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    await Promise.resolve();
  });
}

const newStore = () =>
  new SpacePanelStore({ frames: { request: () => 0, cancel: () => {} }, windowWidth: () => 1600 });

describe('Show in physical space, in the shape’s menu', () => {
  it('opens the panel showing an element that is in no place, even while nothing can change', async () => {
    const store = newStore();
    await openMenu('spare', store);
    const item = screen.getByRole('menuitem', { name: 'Show in physical space' });
    expect(item.title).toBe(
      'Opens the physical-space panel showing it, with what is posed or anchored in it.',
    );
    fireEvent.click(item);
    expect(store.state(VIEW)).toEqual({ root: 'spare' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('frames an element posed under World, in World', async () => {
    const store = newStore();
    await openMenu('camera', store);
    const item = screen.getByRole('menuitem', { name: 'Show in physical space' });
    expect(item.title).toBe('Frames it in the physical-space panel, where it is in World.');
    fireEvent.click(item);
    expect(store.state(VIEW)).toEqual({});
    expect(store.framing(VIEW)?.elements).toEqual(['camera']);
  });

  it('is not offered where there is no panel', async () => {
    await openMenu('camera', null);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Show in physical space' })).toBeNull();
  });
});
