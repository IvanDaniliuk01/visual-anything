/**
 * Following destinations from the canvas (ADR 0056): double-clicking the mark follows the shape's
 * first destination, double-clicking anywhere else on the shape still edits its name, Alt+Enter
 * follows the selected shape's, and the shape's menu lists each destination.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Follower } from '../destinations/follower';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { definitionsIn } from '@visual-anything/core';
import { fitCamera, worldToScreen } from './camera';
import { CanvasArea } from './CanvasArea';
import { destinationMarkRect } from './destinationMark';
import { centerOf } from './geometry';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'system-overview';
const SIZE = { width: 1000, height: 600 };
const API = 'appointments-api';
const DOCS = { url: 'https://docs.example.org/appointments' };

/** The sample, with the API leading to its documentation. */
function linked(): ProjectSnapshot {
  const outcome = executeCommand(loadSample(), {
    type: 'update-element',
    id: API,
    changes: { attributes: { docs: DOCS } },
  });
  if (!outcome.ok) throw new Error('The sample takes a destination.');
  return outcome.state;
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

function setUp(initial: Selection = EMPTY_SELECTION) {
  const project = linked();
  const follow = vi.fn<Follower['follow']>();
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
      follow: { follow },
    };
    return (
      <EditorContext.Provider value={editor}>
        <CanvasArea
          project={project}
          view={view}
          scene={scene}
          label="System overview"
          selection={selection}
          onSelect={setSelection}
          onCommand={() => Promise.resolve({ ok: true })}
        />
      </EditorContext.Provider>
    );
  }
  return { Live, follow, project };
}

async function started(element: React.ReactElement, project: ProjectSnapshot) {
  render(element);
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
  const drawn = buildScene(project, VIEW);
  const camera = fitCamera(drawn.bounds, SIZE, 32);
  const shape = drawn.shapes.find((each) => each.element === API);
  if (!shape) throw new Error('The API has a shape.');
  const mark = destinationMarkRect(shape);
  if (!mark) throw new Error('The API’s shape has the mark.');
  return {
    host,
    mark: worldToScreen(camera, centerOf(mark)),
    middle: worldToScreen(camera, centerOf(shape.rect)),
  };
}

function point(type: string, host: HTMLElement, at: { x: number; y: number }, extra = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: at.x,
    clientY: at.y,
    button: 0,
    ...extra,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(host, event);
}

describe('following destinations from the canvas', () => {
  it('follows the first destination on a double-click on the mark', async () => {
    const run = setUp();
    const { host, mark } = await started(<run.Live />, run.project);
    point('dblclick', host, mark);
    expect(run.follow).toHaveBeenCalledWith(DOCS);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('still edits the name on a double-click elsewhere on the shape', async () => {
    const run = setUp();
    const { host, middle } = await started(<run.Live />, run.project);
    point('dblclick', host, middle);
    expect(run.follow).not.toHaveBeenCalled();
  });

  it('follows the selected shape’s destination with Alt+Enter', async () => {
    const run = setUp(selectionOf([{ kind: 'element', id: API }]));
    const { host } = await started(<run.Live />, run.project);
    fireEvent.keyDown(host, { key: 'Enter', altKey: true });
    expect(run.follow).toHaveBeenCalledWith(DOCS);
  });

  it('lists each destination in the shape’s menu', async () => {
    const run = setUp(selectionOf([{ kind: 'element', id: API }]));
    const { host } = await started(<run.Live />, run.project);
    await act(async () => {
      fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
      await Promise.resolve();
    });
    const item = screen.getByRole('menuitem', { name: 'Follow “docs”' });
    fireEvent.click(item);
    expect(run.follow).toHaveBeenCalledWith(DOCS);
  });
});
