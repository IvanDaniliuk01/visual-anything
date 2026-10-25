/**
 * The grid, snapping and the rulers on the canvas (A3): hand moves, nudges and new shapes snap while
 * the grid shows, Alt places freely, Shift+G and Shift+R turn the grid and the rulers on and off, and
 * the rulers take no presses.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { ShapePosition } from '@visual-anything/schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { appliedPreferences, changePreferences, resetPreferencesForTests } from '../theme/store';
import { fitCamera, screenToWorld, worldToScreen, type Camera } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { centerOf, type Point } from './geometry';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const sample = loadSample();
const VIEW = 'system-overview';
const SIZE = { width: 1000, height: 600 };

/** The sample with some shapes moved off the grid, as a file written by hand may hold them. */
const offGrid: ProjectSnapshot = {
  ...sample,
  views: sample.views.map((view) => ({
    ...view,
    positions: view.positions.map((position) =>
      position.element === 'clinic-booking'
        ? { ...position, x: 243, y: 37 }
        : position.element === 'patient'
          ? { ...position, x: 44, y: 203 }
          : position,
    ),
  })),
};

function Harness(props: { project?: ProjectSnapshot; onCommand?: SendCommand }) {
  const shown = props.project ?? sample;
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const view = shown.views.find((each) => each.id === VIEW)!;
  const scene = useMemo(() => buildScene(shown, VIEW), [shown]);
  return (
    <CanvasArea
      project={shown}
      view={view}
      scene={scene}
      label="System overview"
      selection={selection}
      onSelect={setSelection}
      {...(props.onCommand ? { onCommand: props.onCommand } : {})}
    />
  );
}

async function started(shown: ProjectSnapshot = sample, onCommand?: SendCommand) {
  render(<Harness project={shown} {...(onCommand ? { onCommand } : {})} />);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  const drawn = buildScene(shown, VIEW);
  const camera = fitCamera(drawn.bounds, SIZE, 32);
  const at = (key: string) => {
    const shape = drawn.shapes.find((each) => each.key === key);
    if (!shape) throw new Error(key);
    return worldToScreen(camera, centerOf(shape.rect));
  };
  return { host, camera, at };
}

function point(type: string, host: HTMLElement, at: Point, extra: Record<string, unknown> = {}) {
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
  return event;
}

function preferGrid(changes: Parameters<typeof changePreferences>[0]): void {
  act(() => changePreferences(changes));
}

async function answers(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const accepted = () => vi.fn<SendCommand>(() => Promise.resolve({ ok: true, created: ['new-id'] }));

function positionsOf(command: Command | undefined): ShapePosition[] {
  if (command?.type === 'set-positions') return command.positions;
  if (command?.type === 'batch') return command.commands.flatMap(positionsOf);
  return [];
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  act(() => resetPreferencesForTests());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Snapping on the canvas', () => {
  it('stores a dragged shape at a multiple of 8 in its container, pinned, where its preview showed it', async () => {
    const onCommand = accepted();
    const dragTo = vi.spyOn(CanvasRenderer.prototype, 'dragTo');
    const { host, at, camera } = await started(sample, onCommand);
    preferGrid({ grid: true });
    const from = at('clinic-booking/whatsapp');
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 23, y: from.y + 9 });
    point('pointermove', host, { x: from.x + 37, y: from.y + 13 });
    point('pointerup', host, { x: from.x + 37, y: from.y + 13 });
    await answers();
    const preview = dragTo.mock.lastCall?.[0] as Point;
    expect(preview.x).not.toBeCloseTo(37 / camera.scale, 1);
    const [moved] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(moved).toMatchObject({ element: 'whatsapp', container: 'clinic-booking', pinned: true });
    expect(moved!.x % 8).toBe(0);
    expect(moved!.y % 8).toBe(0);
    // The drop moved it as far as the preview did.
    expect({ x: moved!.x - 40, y: moved!.y - 168 }).toEqual(preview);
    // While it was dragged, its container's grid showed and the readout said where it lands.
    const frame = dragTo.mock.lastCall?.[1];
    expect(frame).toMatchObject({ snapping: true, container: 'clinic-booking' });
    expect(frame?.readout?.text).toBe(`${moved!.x}, ${moved!.y} in Clinic booking`);
  });

  it('moves nothing while the grid is hidden but as far as the pointer went', async () => {
    const onCommand = accepted();
    const { host, at, camera } = await started(sample, onCommand);
    const from = at('clinic-booking/whatsapp');
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 37, y: from.y + 13 });
    point('pointerup', host, { x: from.x + 37, y: from.y + 13 });
    await answers();
    const [moved] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(moved!.x).toBe(Math.round(40 + 37 / camera.scale));
  });

  it('after Ctrl+A, dragging an off-grid container by a shape inside it stores the container on the grid', async () => {
    const onCommand = accepted();
    const { host, at } = await started(offGrid, onCommand);
    preferGrid({ grid: true });
    fireEvent.keyDown(host, { key: 'a', ctrlKey: true });
    const from = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 30, y: from.y + 30 });
    point('pointerup', host, { x: from.x + 30, y: from.y + 30 });
    await answers();
    const positions = positionsOf(onCommand.mock.lastCall?.[0]);
    const clinic = positions.find((each) => each.element === 'clinic-booking');
    const patient = positions.find((each) => each.element === 'patient');
    expect(clinic).toMatchObject({ pinned: true });
    expect(clinic!.x % 8).toBe(0);
    expect(clinic!.y % 8).toBe(0);
    // Patient moved alike, keeping its place relative to Clinic booking, off the grid or not.
    expect(patient!.x - clinic!.x).toBe(44 - 243);
    expect(patient!.y - clinic!.y).toBe(203 - 37);
    // What Clinic booking carries keeps its stored place.
    expect(positions.some((each) => each.element === 'appointments-api')).toBe(false);
  });

  it('places freely with Alt, picked up in the middle of a drag, and keeps the browser from its menu after', async () => {
    const onCommand = accepted();
    const dragTo = vi.spyOn(CanvasRenderer.prototype, 'dragTo');
    const { host, at, camera } = await started(sample, onCommand);
    preferGrid({ grid: true });
    const from = at('patient');
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 37, y: from.y + 13 });
    const snapped = dragTo.mock.lastCall?.[0] as Point;
    expect((40 + snapped.x) % 8).toBe(0);
    fireEvent.keyDown(host, { key: 'Alt', altKey: true });
    const free = dragTo.mock.lastCall?.[0] as Point;
    expect(free.x).toBeCloseTo(37 / camera.scale, 6);
    expect(dragTo.mock.lastCall?.[1]).toMatchObject({ snapping: false });
    point('pointerup', host, { x: from.x + 37, y: from.y + 13 }, { altKey: true });
    await answers();
    const [moved] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(moved!.x).toBe(Math.round(40 + 37 / camera.scale));
    const keyUp = new KeyboardEvent('keyup', { key: 'Alt', bubbles: true, cancelable: true });
    host.dispatchEvent(keyUp);
    expect(keyUp.defaultPrevented).toBe(true);
  });

  it('nudges by 8, and to the next grid line while snapping', async () => {
    const onCommand = accepted();
    const { host, at } = await started(offGrid, onCommand);
    point('pointerdown', host, at('patient'));
    point('pointerup', host, at('patient'));
    await act(async () => {
      fireEvent.keyDown(host, { key: 'ArrowDown', shiftKey: true });
      await Promise.resolve();
    });
    expect(positionsOf(onCommand.mock.lastCall?.[0])[0]).toMatchObject({ x: 44, y: 211 });
  });

  it('nudges the anchor to the next grid line while the grid snaps', async () => {
    const onCommand = accepted();
    const { host, at } = await started(offGrid, onCommand);
    preferGrid({ grid: true });
    point('pointerdown', host, at('patient'));
    point('pointerup', host, at('patient'));
    await act(async () => {
      fireEvent.keyDown(host, { key: 'ArrowDown', shiftKey: true });
      await Promise.resolve();
    });
    expect(positionsOf(onCommand.mock.lastCall?.[0])[0]).toMatchObject({ x: 44, y: 208 });
  });

  it('creates shapes on the grid, not pinned, while it snaps', async () => {
    const onCommand = accepted();
    await started(sample, onCommand);
    preferGrid({ grid: true });
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Add an element' }), {
        target: { value: 'systems.service' },
      });
      await Promise.resolve();
    });
    const created = onCommand.mock.calls
      .map(([command]) => command)
      .find((command) => command.type === 'create-element');
    const [position] = created?.type === 'create-element' ? (created.positions ?? []) : [];
    expect(position).toBeDefined();
    expect(position!.x % 8).toBe(0);
    expect(position!.y % 8).toBe(0);
    expect(position).not.toHaveProperty('pinned');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Note' }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Arrow' }));
      await Promise.resolve();
    });
    const shapes = onCommand.mock.calls
      .map(([command]) => command)
      .flatMap((command) => (command.type === 'create-free-shape' ? [command.shape] : []));
    const [note, arrow] = shapes;
    expect(note?.kind === 'note' && [note.x % 8, note.y % 8]).toEqual([0, 0]);
    expect(
      arrow?.kind === 'arrow' && [
        arrow.from.x % 8,
        arrow.from.y % 8,
        arrow.to.x % 8,
        arrow.to.y % 8,
      ],
    ).toEqual([0, 0, 0, 0]);
  });
});

describe('The grid and the rulers from the keyboard and the toolbar', () => {
  it('shows and hides the grid with Shift+G and the rulers with Shift+R, and says so', async () => {
    const { host } = await started();
    const grid = screen.getByRole('button', { name: 'Grid' });
    const rulers = screen.getByRole('button', { name: 'Rulers' });
    expect(grid).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Snap to grid' })).toBeDisabled();
    act(() => {
      fireEvent.keyDown(host, { key: 'G', shiftKey: true });
    });
    expect(appliedPreferences().preferences.grid).toBe(true);
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Snap to grid' })).toBeEnabled();
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveTextContent('The grid shows.');
    act(() => {
      fireEvent.keyDown(host, { key: 'R', shiftKey: true });
    });
    expect(rulers).toHaveAttribute('aria-pressed', 'true');
    expect(host.closest('.canvas-frame')).toHaveAttribute('data-rulers');
    act(() => {
      fireEvent.keyDown(host, { key: 'G', shiftKey: true });
    });
    expect(appliedPreferences().preferences.grid).toBe(false);
    // Ctrl+Shift+R is the browser's.
    act(() => {
      fireEvent.keyDown(host, { key: 'R', shiftKey: true, ctrlKey: true });
    });
    expect(appliedPreferences().preferences.rulers).toBe(true);
    // The toolbar's toggles do the same.
    fireEvent.click(rulers);
    expect(appliedPreferences().preferences.rulers).toBe(false);
  });
});

describe('The rulers on the canvas', () => {
  /** Pans the canvas so that Patient lies under the left ruler, and says where it is on screen. */
  async function underTheRuler(onCommand?: SendCommand) {
    const setCamera = vi.spyOn(CanvasRenderer.prototype, 'setCamera');
    const started_ = await started(sample, onCommand);
    preferGrid({ rulers: true });
    const fitted = setCamera.mock.lastCall?.[0] as Camera;
    const { host } = started_;
    fireEvent.wheel(host, { deltaX: 60, deltaY: 0 });
    const camera = setCamera.mock.lastCall?.[0] as Camera;
    expect(camera.x).toBeCloseTo(fitted.x - 60);
    const patient = buildScene(sample, VIEW).shapes.find((shape) => shape.key === 'patient')!;
    const onRuler = { x: 10, y: worldToScreen(camera, centerOf(patient.rect)).y };
    // That point of the screen lies on Patient.
    const world = screenToWorld(camera, onRuler);
    expect(world.x).toBeGreaterThan(patient.rect.x);
    expect(world.x).toBeLessThan(patient.rect.x + patient.rect.width);
    return { ...started_, onRuler };
  }

  it('take no presses, hover, double-clicks or secondary presses', async () => {
    const onCommand = accepted();
    const setSelection = vi.spyOn(CanvasRenderer.prototype, 'setSelection');
    const { host, onRuler } = await underTheRuler(onCommand);
    point('pointermove', host, onRuler);
    expect(setSelection.mock.lastCall?.[1]).toBeUndefined();
    point('pointerdown', host, onRuler);
    point('pointerup', host, onRuler);
    expect(setSelection.mock.lastCall?.[0].elements.size).toBe(0);
    point('dblclick', host, onRuler);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    point('pointerdown', host, onRuler, { button: 2 });
    const menu = point('contextmenu', host, onRuler, { button: 2 });
    expect(menu.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
