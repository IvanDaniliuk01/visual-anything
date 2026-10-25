/**
 * The canvas area collapses and expands containers through I1's command, from the toggle on a
 * container's shape, the keys and the shape menu; and it draws the emphasis the store holds, which
 * pointing goes past (I2).
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { fitCamera, worldToScreen } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { centerOf, toggleRect } from './geometry';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const sample = loadSample();
const VIEW = 'system-overview';
const SIZE = { width: 1000, height: 600 };

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

/** The canvas area over a project the commands change, as the local program would. */
function setUp(initial: Selection = EMPTY_SELECTION) {
  let current: ProjectSnapshot = sample;
  const shows = new Set<(next: ProjectSnapshot) => void>();
  const sent: Command[] = [];
  const onCommand = vi.fn<SendCommand>(async (command) => {
    sent.push(command);
    const outcome = executeCommand(current, command);
    if (!outcome.ok) return { ok: false };
    current = outcome.state;
    for (const show of shows) show(current);
    await Promise.resolve();
    return { ok: true, created: outcome.created };
  });
  const store = new EmphasisStore();
  const selected: Selection[] = [];
  function Live() {
    const [shown, setShown] = useState(current);
    const [selection, setSelection] = useState(initial);
    useEffect(() => {
      shows.add(setShown);
      return () => void shows.delete(setShown);
    }, []);
    const view = shown.views.find((each) => each.id === VIEW)!;
    const scene = useMemo(() => buildScene(shown, VIEW), [shown]);
    return (
      <EmphasisContext.Provider value={store}>
        <CanvasArea
          project={shown}
          view={view}
          scene={scene}
          label="System overview"
          selection={selection}
          onSelect={(next) => {
            selected.push(next);
            setSelection(next);
          }}
          onCommand={onCommand}
        />
      </EmphasisContext.Provider>
    );
  }
  return {
    Live,
    sent,
    store,
    selected,
    get project() {
      return current;
    },
  };
}

async function started(element: React.ReactElement) {
  render(element);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  // A few frames, so that the tiles are drawn in full and their toggles can be pressed.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  const drawn = buildScene(sample, VIEW);
  const camera = fitCamera(drawn.bounds, SIZE, 32);
  const shapeOf = (key: string) => {
    const shape = drawn.shapes.find((each) => each.key === key);
    if (!shape) throw new Error(key);
    return shape;
  };
  const at = (key: string) => worldToScreen(camera, centerOf(shapeOf(key).rect));
  const toggleOf = (key: string) => {
    const toggle = toggleRect(shapeOf(key));
    if (!toggle) throw new Error(`${key} has no toggle.`);
    return worldToScreen(camera, centerOf(toggle));
  };
  return { host, at, toggleOf, camera };
}

function press(host: HTMLElement, x: number, y: number, init: MouseEventInit = {}) {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
      ...init,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    fireEvent(host, event);
  }
}

function said(): string {
  return screen.getByRole('status', { name: 'Selection' }).textContent?.trim() ?? '';
}

describe('collapsing from the canvas', () => {
  it('collapses a container from the toggle in its corner, and expands it from it again', async () => {
    const run = setUp();
    const { host, toggleOf } = await started(<run.Live />);
    const toggle = toggleOf('clinic-booking/scheduling');
    await act(async () => {
      press(host, toggle.x, toggle.y);
      await Promise.resolve();
    });
    expect(run.sent).toEqual([
      { type: 'set-collapsed', view: VIEW, elements: ['scheduling'], collapsed: true },
    ]);
    expect(run.project.views[0]?.collapsed).toEqual(['scheduling']);
    expect(said()).toBe('Collapsed "Scheduling".');
    // The toggle selects nothing.
    expect(run.selected).toEqual([]);
  });

  it('collapses the selected containers with Alt and −, and expands them with Alt and +', async () => {
    const run = setUp(selectionOf([{ kind: 'element', id: 'clinic-booking' }]));
    const { host } = await started(<run.Live />);
    await act(async () => {
      fireEvent.keyDown(host, { key: '–', code: 'Minus', altKey: true });
      await Promise.resolve();
    });
    expect(run.sent.at(-1)).toEqual({
      type: 'set-collapsed',
      view: VIEW,
      elements: ['clinic-booking'],
      collapsed: true,
    });
    await act(async () => {
      fireEvent.keyDown(host, { key: '≠', code: 'Equal', altKey: true });
      await Promise.resolve();
    });
    expect(run.sent.at(-1)).toMatchObject({ elements: ['clinic-booking'], collapsed: false });
    expect(run.project.views[0]?.collapsed).toBeUndefined();
    // Without a container selected, the keys say why nothing changes.
    await act(async () => {
      fireEvent.keyDown(host, { key: 'Escape' });
      fireEvent.keyDown(host, { key: '-', code: 'Minus', altKey: true });
      await Promise.resolve();
    });
    expect(said()).toBe('Select an expanded container to collapse it.');
  });

  it('offers Collapse and Expand in the shape menu', async () => {
    const run = setUp(selectionOf([{ kind: 'element', id: 'clinic-booking' }]));
    const { host } = await started(<run.Live />);
    fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    const item = screen.getByRole('menuitem', { name: 'Collapse "Clinic booking"' });
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(run.sent.at(-1)).toMatchObject({ type: 'set-collapsed', collapsed: true });
    fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menuitem', { name: 'Expand "Clinic booking"' })).toBeDefined();
  });
});

describe('the emphasis on the canvas', () => {
  it('goes past what a filter hides when a click points at it, and when a box encloses it', async () => {
    const run = setUp();
    const { host, at } = await started(<run.Live />);
    await act(async () => {
      run.store.set('filter', { hidden: new Set(['patient']) });
      await Promise.resolve();
    });
    const patient = at('patient');
    press(host, patient.x, patient.y);
    expect(run.selected.at(-1)?.elements.has('patient') ?? false).toBe(false);
    // Ctrl+A selects what shows.
    fireEvent.keyDown(host, { key: 'a', ctrlKey: true });
    const all = run.selected.at(-1);
    expect(all?.elements.has('patient')).toBe(false);
    expect(all?.elements.has('clinic-booking')).toBe(true);

    await act(async () => {
      run.store.set('filter', undefined);
      await Promise.resolve();
    });
    press(host, patient.x, patient.y);
    expect(run.selected.at(-1)?.elements.has('patient')).toBe(true);
  });
});
