/**
 * Resizing, aligning and the alignment guides on the canvas (ADR 0074): a shape selected alone shows
 * handles, dragging one stores its size and place as one action, Escape cancels, Shift and Alt change
 * how it grows, and the grid and the guides place its sides; a drag snaps to the guides of the shapes
 * beside it unless Ctrl is held; and Alt+Shift with an arrow key, the toolbar's Align and the shape
 * menu align the selection.
 */
import type { Command, PositionChange, ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf, type Selectable, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { changePreferences, resetPreferencesForTests } from '../theme/store';
import { fitCamera, worldToScreen, type Camera } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { centerOf, type Point, type Rect } from './geometry';
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
const drawn = buildScene(sample, VIEW);

function rectOf(key: string): Rect {
  const shape = drawn.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(key);
  return shape.rect;
}

const elements = (...ids: string[]): Selection =>
  selectionOf(ids.map((id): Selectable => ({ kind: 'element', id })));

function Harness(props: {
  project?: ProjectSnapshot;
  onCommand?: SendCommand;
  initial?: Selection;
}) {
  const shown = props.project ?? sample;
  const [selection, setSelection] = useState<Selection>(props.initial ?? EMPTY_SELECTION);
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

async function started(initial?: Selection, onCommand?: SendCommand) {
  render(<Harness {...(initial ? { initial } : {})} {...(onCommand ? { onCommand } : {})} />);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  const camera: Camera = fitCamera(drawn.bounds, SIZE, 32);
  const on = (point: Point) => worldToScreen(camera, point);
  return { host, camera, on };
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
}

async function answers(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const accepted = () => vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));

function positionsOf(command: Command | undefined): PositionChange[] {
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
});

const patient = rectOf('patient');
const east = { x: patient.x + patient.width, y: patient.y + patient.height / 2 };

describe('Resizing a shape', () => {
  it('shows eight handles on a shape selected alone, and none on two', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setShapeEditOverlay');
    await started(elements('patient'), accepted());
    const shown = overlays.mock.lastCall?.[0];
    expect(shown?.handles?.rect).toEqual(patient);
    expect(shown?.handles?.names).toHaveLength(8);
    overlays.mockClear();
    render(<Harness initial={elements('patient', 'clinic-booking')} onCommand={accepted()} />);
    expect(overlays.mock.calls.some(([overlay]) => overlay?.handles !== undefined)).toBe(false);
  });

  it('stores the size and place of a handle dragged, pinned, as one action, with its ghost meanwhile', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setShapeEditOverlay');
    const onCommand = accepted();
    const { host, on, camera } = await started(elements('patient'), onCommand);
    const from = on(east);
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 10, y: from.y + 30 });
    point('pointermove', host, { x: from.x + 20, y: from.y + 30 });
    const ghost = overlays.mock.lastCall?.[0]?.ghost;
    const right = Math.ceil(patient.x + patient.width + 20 / camera.scale);
    expect(ghost).toEqual({ ...patient, width: right - patient.x });
    // Its size shows beside the pointer.
    expect(document.querySelector('.canvas-drop-caption')?.textContent).toBe(
      `${right - patient.x} × ${patient.height}`,
    );
    point('pointerup', host, { x: from.x + 20, y: from.y + 30 });
    await answers();
    const command = onCommand.mock.lastCall?.[0];
    expect(command).toMatchObject({ type: 'batch', label: 'Resize "Patient"' });
    expect(positionsOf(command)).toEqual([
      { element: 'patient', x: 40, y: 200, width: right - patient.x, pinned: true },
    ]);
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveTextContent(
      'Resize "Patient".',
    );
  });

  it('puts the sides it moves on the grid while it snaps', async () => {
    const onCommand = accepted();
    const { host, on } = await started(elements('patient'), onCommand);
    act(() => changePreferences({ grid: true }));
    const from = on(east);
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 21, y: from.y });
    point('pointerup', host, { x: from.x + 21, y: from.y });
    await answers();
    const [stored] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect((stored!.x + stored!.width!) % 8).toBe(0);
  });

  it('resizes from its middle with Alt, and keeps its proportions with Shift', async () => {
    const onCommand = accepted();
    const { host, on } = await started(elements('patient'), onCommand);
    const from = on(east);
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 20, y: from.y }, { altKey: true });
    point('pointerup', host, { x: from.x + 20, y: from.y }, { altKey: true });
    await answers();
    const [middle] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(middle!.x).toBeLessThan(40);
    expect(Math.abs(middle!.x + middle!.width! / 2 - (40 + patient.width / 2))).toBeLessThanOrEqual(
      1,
    );

    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 40, y: from.y }, { shiftKey: true });
    point('pointerup', host, { x: from.x + 40, y: from.y }, { shiftKey: true });
    await answers();
    const [kept] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(kept!.height).toBeGreaterThan(patient.height);
    expect(Math.abs(kept!.width! / kept!.height! - patient.width / patient.height)).toBeLessThan(
      0.05,
    );
  });

  it('cancels with Escape, sending nothing', async () => {
    const onCommand = accepted();
    const { host, on } = await started(elements('patient'), onCommand);
    const from = on(east);
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 40, y: from.y });
    fireEvent.keyDown(host, { key: 'Escape' });
    point('pointerup', host, { x: from.x + 40, y: from.y });
    await answers();
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe('Alignment guides', () => {
  it('snap a dragged shape level with the one beside it, unless Ctrl is held', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setShapeEditOverlay');
    const onCommand = accepted();
    const { host, on } = await started(undefined, onCommand);
    // WhatsApp sits level with Booking agent; dragged a few pixels down, it stays level.
    const from = on(centerOf(rectOf('clinic-booking/whatsapp')));
    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 50, y: from.y + 2 });
    point('pointermove', host, { x: from.x + 60, y: from.y + 4 });
    const guides = overlays.mock.lastCall?.[0]?.guides ?? [];
    expect(
      guides.some((line) => line.axis === 'y' && line.at === rectOf('clinic-booking/whatsapp').y),
    ).toBe(true);
    point('pointerup', host, { x: from.x + 60, y: from.y + 4 });
    await answers();
    const [guided] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(guided).toMatchObject({ element: 'whatsapp', y: 168 });

    point('pointerdown', host, from);
    point('pointermove', host, { x: from.x + 50, y: from.y + 2 }, { ctrlKey: true });
    point('pointermove', host, { x: from.x + 60, y: from.y + 4 }, { ctrlKey: true });
    point('pointerup', host, { x: from.x + 60, y: from.y + 4 }, { ctrlKey: true });
    await answers();
    const [free] = positionsOf(onCommand.mock.lastCall?.[0]);
    expect(free!.y).toBeGreaterThan(168);
  });
});

describe('Aligning the selection', () => {
  it('aligns to a side with Alt+Shift and an arrow key, and says what it did', async () => {
    const onCommand = accepted();
    const { host } = await started(elements('patient', 'clinic-booking'), onCommand);
    await act(async () => {
      fireEvent.keyDown(host, { key: 'ArrowLeft', altKey: true, shiftKey: true });
      await Promise.resolve();
    });
    await answers();
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({
      type: 'batch',
      label: 'Align 2 shapes to the left',
    });
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveTextContent(
      'Align 2 shapes to the left.',
    );
  });

  it('says why nothing aligns with a single shape', async () => {
    const onCommand = accepted();
    const { host } = await started(elements('patient'), onCommand);
    act(() => {
      fireEvent.keyDown(host, { key: 'ArrowUp', altKey: true, shiftKey: true });
    });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveTextContent(
      'Select two or more shapes to align them.',
    );
  });

  it('aligns from the toolbar’s Align menu', async () => {
    const onCommand = accepted();
    await started(elements('patient', 'clinic-booking'), onCommand);
    fireEvent.click(screen.getByRole('button', { name: 'Align' }));
    const menu = screen.getByRole('menu', { name: 'Align' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(10);
    // Two shapes do not distribute: the item says why, and the menu stays.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Distribute horizontally' }));
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveTextContent(
      'Select three or more shapes to distribute them.',
    );
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Align top' }));
      await Promise.resolve();
    });
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({ label: 'Align 2 shapes to the top' });
    expect(screen.queryByRole('menu', { name: 'Align' })).not.toBeInTheDocument();
  });

  it('offers aligning in the shape menu of a selection of two', async () => {
    const onCommand = accepted();
    const { host } = await started(elements('patient', 'clinic-booking'), onCommand);
    act(() => {
      fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    });
    const menu = screen.getByRole('menu', { name: 'Patient' });
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Same height' }));
      await Promise.resolve();
    });
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({
      label: 'Give 2 shapes the same height',
    });
  });
});
