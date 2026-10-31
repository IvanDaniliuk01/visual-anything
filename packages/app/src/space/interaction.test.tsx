/**
 * The physical-space panel's interaction (ADR 0076), against the stand-in worker that draws boxes:
 * dragging, the wheel and the keys move its camera, which the tab keeps; a click selects what it
 * picks, an element or a relation's line, and resting the pointer hovers it everywhere; the handles
 * move what is selected, snapped, as one `set-poses`; Place in physical space and Take out of physical
 * space are one `set-poses` each; and its list follows the selection, selects, frames and hovers.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { SpaceCamera } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { createSolidClient, type SolidClient } from '../solids/client';
import type { SpaceShift } from '../solids/protocol';
import { StandInSolidWorker } from '../solids/stand-in';
import { handleShapes } from './handles';
import { workcell } from '../test/space';
import { spaceProjection } from './camera';
import { SpacePanelContext } from './context';
import { SpacePanel } from './SpacePanel';
import { SpacePanelStore } from './store';

const VIEW = 'cell-view';
const WIDTH = 400;
const HEIGHT = 300;
/** Looking from the front, level, at the origin. */
const FRONT: SpaceCamera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 5 };

function setUp(
  options: { relationPick?: boolean; project?: ProjectSnapshot; shifts?: SpaceShift[] } = {},
) {
  const project = options.project ?? workcell();
  const view = project.views[0] as NonNullable<ProjectSnapshot['views'][number]>;
  const scene = buildScene(project, VIEW);
  const store = new SpacePanelStore({
    frames: { request: (callback) => (callback(), 0), cancel: () => {} },
    windowWidth: () => 1600,
  });
  const hovers = new HoverStore();
  const workers: StandInSolidWorker[] = [];
  const base = createSolidClient({
    files: {
      get: () => Promise.resolve({ ok: false, code: 'solid-file-missing', message: 'No.' }),
    },
    start: () => {
      const worker = new StandInSolidWorker();
      workers.push(worker);
      return worker;
    },
  });
  // Frames that say how far the exploded view moves entries, as the real worker's do.
  const shifting: SolidClient = options.shifts
    ? {
        ...base,
        showSpace: (shown, listeners) =>
          base.showSpace(shown, {
            ...listeners,
            onFrame: (frame) => listeners?.onFrame?.({ ...frame, shifts: options.shifts }),
          }),
      }
    : base;
  // A pick that answers a relation's line, as the real worker's does over a line.
  const client: SolidClient = options.relationPick
    ? {
        ...base,
        showSpace: (shown, listeners) => {
          const drawing = base.showSpace(shown, listeners);
          return {
            get space() {
              return drawing.space;
            },
            get frame() {
              return drawing.frame;
            },
            get problem() {
              return drawing.problem;
            },
            update: (change) => drawing.update(change),
            fit: (elements) => drawing.fit(elements),
            pick: () => Promise.resolve({ element: null, relation: 'camera-in-table' }),
            end: () => drawing.end(),
          };
        },
      }
    : shifting;
  const sent: Command[] = [];
  const send = vi.fn((command: Command) => {
    sent.push(command);
    return Promise.resolve({ ok: true });
  });
  const reveal = vi.fn();
  let current: Selection = EMPTY_SELECTION;
  function Harness() {
    const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
    current = selection;
    const editor = {
      project,
      viewId: VIEW,
      scene,
      selection,
      select: setSelection,
      send,
      reveal,
    } as unknown as Editor;
    return (
      <EditorContext.Provider value={editor}>
        <SpacePanelContext value={store}>
          <HoverContext value={hovers}>
            <SpacePanel
              id="space-panel"
              store={store}
              project={project}
              view={view}
              scene={scene}
              selection={selection}
              client={client}
            />
            <button
              type="button"
              onClick={() => setSelection(selectionOf([{ kind: 'element', id: 'camera' }]))}
            >
              Select the camera
            </button>
            <button
              type="button"
              onClick={() => setSelection(selectionOf([{ kind: 'element', id: 'lamp' }]))}
            >
              Select the lamp
            </button>
          </HoverContext>
        </SpacePanelContext>
      </EditorContext.Provider>
    );
  }
  render(<Harness />);
  return {
    project,
    store,
    hovers,
    sent,
    reveal,
    worker: () => workers.at(-1),
    selection: () => current,
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 10; round++) await Promise.resolve();
  });
}

/** Opens the panel looking from the front, and waits for its first frame. */
async function opened(options: Parameters<typeof setUp>[0] = {}) {
  const set = setUp(options);
  act(() => set.store.open(VIEW, { camera: FRONT }));
  await settle();
  const frames = screen.getByRole('application', { name: 'Physical space: 5 elements' });
  return { ...set, frames };
}

/** Where a point of the space falls on the panel's frames, which are drawn one to one. */
function pixelOf(point: { x: number; y: number; z: number }) {
  const at = spaceProjection(FRONT, WIDTH / HEIGHT)(point);
  return { clientX: at.x * WIDTH, clientY: at.y * HEIGHT };
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    left: 0,
    top: 0,
    right: WIDTH,
    bottom: HEIGHT,
    width: WIDTH,
    height: HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('moving the panel’s camera', () => {
  it('turns with a drag, pans with Shift, and zooms with the wheel, the tab keeping where it looks', async () => {
    const { store, frames, worker } = await opened();
    fireEvent.pointerDown(frames, { button: 0, clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(frames, { clientX: 250, clientY: 150, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(frames, { button: 0, clientX: 250, clientY: 150, pointerId: 1 });
    await waitFor(() => expect(store.state(VIEW)?.camera?.azimuth).toBeLessThan(0));
    const turned = store.state(VIEW)?.camera as SpaceCamera;
    expect(turned.target).toEqual(FRONT.target);
    const updates = worker()?.ofType('space/update') ?? [];
    expect(updates.at(-1)?.camera).toEqual(turned);
    fireEvent.pointerDown(frames, {
      button: 0,
      shiftKey: true,
      clientX: 200,
      clientY: 150,
      pointerId: 2,
    });
    fireEvent.pointerMove(frames, { clientX: 200, clientY: 100, pointerId: 2, buttons: 1 });
    fireEvent.pointerUp(frames, { button: 0, clientX: 200, clientY: 100, pointerId: 2 });
    await waitFor(() => expect(store.state(VIEW)?.camera?.target).not.toEqual(FRONT.target));
    fireEvent.wheel(frames, { deltaY: -100, clientX: 200, clientY: 150 });
    await waitFor(() => expect(store.state(VIEW)?.camera?.distance).toBeLessThan(5));
  });

  it('turns, zooms and fits with its keys, and pinches with two fingers', async () => {
    const { store, frames } = await opened();
    act(() => frames.focus());
    fireEvent.keyDown(frames, { key: 'ArrowLeft' });
    await waitFor(() => expect(store.state(VIEW)?.camera?.azimuth).toBe(15));
    fireEvent.keyDown(frames, { key: '+' });
    await waitFor(() => expect(store.state(VIEW)?.camera?.distance).toBeCloseTo(4));
    fireEvent.pointerDown(frames, { button: 0, clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerDown(frames, { button: 0, clientX: 250, clientY: 150, pointerId: 2 });
    fireEvent.pointerMove(frames, { clientX: 100, clientY: 150, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(frames, { clientX: 300, clientY: 150, pointerId: 2, buttons: 1 });
    fireEvent.pointerUp(frames, { clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(frames, { clientX: 300, clientY: 150, pointerId: 2 });
    await waitFor(() => expect(store.state(VIEW)?.camera?.distance).toBeLessThan(3));
    fireEvent.keyDown(frames, { key: '0' });
    // Fit frames everything again, from the camera's own direction.
    await waitFor(() => expect(store.state(VIEW)?.camera?.distance).toBeGreaterThan(3));
  });
});

describe('selecting and hovering in the panel', () => {
  it('selects what a click picks, says where it is, and clears on nothing', async () => {
    const { frames, selection } = await opened();
    fireEvent.pointerDown(frames, { button: 0, ...pixelOf({ x: 2, y: 0, z: 0 }), pointerId: 1 });
    fireEvent.pointerUp(frames, { button: 0, ...pixelOf({ x: 2, y: 0, z: 0 }), pointerId: 1 });
    await settle();
    expect([...selection().elements]).toEqual(['arm']);
    expect(screen.getByRole('status')).toHaveTextContent('Arm, posed in World, 2 m from it.');
    fireEvent.pointerDown(frames, { button: 0, clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(frames, { button: 0, clientX: 5, clientY: 5, pointerId: 1 });
    await settle();
    expect(selection().elements.size).toBe(0);
  });

  it('selects a relation whose line a click picks', async () => {
    const { frames, selection } = await opened({ relationPick: true });
    fireEvent.pointerDown(frames, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(frames, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    await settle();
    expect([...selection().relations]).toEqual(['camera-in-table']);
  });

  it('hovers what the pointer rests on, everywhere, until it leaves', async () => {
    const { frames, hovers } = await opened();
    fireEvent.pointerMove(frames, { ...pixelOf({ x: 2, y: 0, z: 0 }), pointerId: 1 });
    await settle();
    expect(hovers.get()).toEqual({ element: 'arm', from: 'space' });
    fireEvent.pointerLeave(frames, { pointerId: 1 });
    expect(hovers.get()).toBeUndefined();
  });
});

describe('the handles', () => {
  it('move the selected posed element along an arrow, snapped, as one set-poses', async () => {
    const { frames, worker, sent } = await opened();
    fireEvent.click(screen.getByRole('button', { name: 'Select the camera' }));
    await settle();
    const handles = worker()?.ofType('space/update').at(-1)?.handles;
    expect(handles).toEqual({ mode: 'move', at: { x: 0, y: 0.8, z: 0 } });
    const x = handleShapes(handles!, FRONT, { width: WIDTH, height: HEIGHT }).find(
      (shape) => shape.axis === 'x',
    );
    const [from, to] = x?.points ?? [];
    const grab = { clientX: (from!.x + to!.x) / 2, clientY: (from!.y + to!.y) / 2 };
    fireEvent.pointerDown(frames, { button: 0, ...grab, pointerId: 1 });
    fireEvent.pointerMove(frames, {
      clientX: grab.clientX + 37,
      clientY: grab.clientY,
      pointerId: 1,
      buttons: 1,
    });
    await settle();
    // While it is dragged, the camera is drawn where it goes, and the arrow stronger.
    const dragged = worker()?.ofType('space/update').at(-1);
    expect(dragged?.handles?.active).toBe('x');
    expect(
      dragged?.entries?.find((entry) => entry.element === 'camera')?.matrix[12],
    ).toBeGreaterThan(0);
    fireEvent.pointerUp(frames, {
      button: 0,
      clientX: grab.clientX + 37,
      clientY: grab.clientY,
      pointerId: 1,
    });
    await settle();
    expect(sent).toHaveLength(1);
    const [command] = sent;
    expect(command?.type).toBe('set-poses');
    const pose = command?.type === 'set-poses' ? command.poses[0] : undefined;
    expect(pose?.element).toBe('camera');
    expect(pose?.pose?.in).toBe('table');
    expect(pose?.pose?.at.y).toBe(0.8);
    const moved = pose?.pose?.at.x ?? 0;
    expect(moved).toBeGreaterThan(0);
    expect(Math.round(moved * 100) / 100).toBe(moved);
  });

  it('stand where the exploded view draws what they hold, and move it as the poses do', async () => {
    const shifts = [{ element: 'camera', by: { x: 0, y: 0.5, z: 0 } }];
    const { frames, worker, sent } = await opened({ shifts });
    fireEvent.click(screen.getByRole('button', { name: 'Select the camera' }));
    await settle();
    const handles = worker()?.ofType('space/update').at(-1)?.handles;
    expect(handles).toEqual({ mode: 'move', at: { x: 0, y: 1.3, z: 0 } });
    // Grabbed where they are drawn, they move the camera along the arrow from where its pose is.
    const x = handleShapes(handles!, FRONT, { width: WIDTH, height: HEIGHT }).find(
      (shape) => shape.axis === 'x',
    );
    const [from, to] = x?.points ?? [];
    const grab = { clientX: (from!.x + to!.x) / 2, clientY: (from!.y + to!.y) / 2 };
    fireEvent.pointerDown(frames, { button: 0, ...grab, pointerId: 1 });
    fireEvent.pointerMove(frames, {
      clientX: grab.clientX + 37,
      clientY: grab.clientY,
      pointerId: 1,
    });
    await settle();
    expect(worker()?.ofType('space/update').at(-1)?.handles?.at.y).toBeCloseTo(1.3, 9);
    fireEvent.pointerUp(frames, {
      button: 0,
      clientX: grab.clientX + 37,
      clientY: grab.clientY,
      pointerId: 1,
    });
    await settle();
    const [command] = sent;
    const pose = command?.type === 'set-poses' ? command.poses[0] : undefined;
    expect(pose?.pose?.at.y).toBe(0.8);
    expect(pose?.pose?.at.x).toBeGreaterThan(0);
  });

  it('let a gesture go with Escape, and choose rotating with R', async () => {
    const { frames, worker, sent } = await opened();
    fireEvent.click(screen.getByRole('button', { name: 'Select the camera' }));
    await settle();
    fireEvent.keyDown(frames, { key: 'r' });
    await settle();
    expect(worker()?.ofType('space/update').at(-1)?.handles?.mode).toBe('rotate');
    expect(screen.getByRole('button', { name: 'Rotate' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(frames, { key: 'Escape' });
    await settle();
    expect(sent).toHaveLength(0);
  });
});

describe('Place in physical space and Take out of physical space', () => {
  it('places what is selected at the point the camera turns around, and takes it out', async () => {
    const { sent } = await opened();
    const place = screen.getByRole('button', { name: 'Place in physical space' });
    const takeOut = screen.getByRole('button', { name: 'Take out of physical space' });
    expect(place).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Select the lamp' }));
    expect(place).toBeEnabled();
    expect(takeOut).toBeDisabled();
    fireEvent.click(place);
    await settle();
    expect(sent).toEqual([
      { type: 'set-poses', poses: [{ element: 'lamp', pose: { at: { x: 0, y: 0, z: 0 } } }] },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Placed “Lamp” in physical space, in World.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select the camera' }));
    fireEvent.click(takeOut);
    await settle();
    expect(sent.at(-1)).toEqual({ type: 'set-poses', poses: [{ element: 'camera', pose: null }] });
    expect(screen.getByRole('status')).toHaveTextContent('Took “Camera” out of physical space.');
  });
});

describe('the panel’s list', () => {
  it('shows what the panel shows by what holds it, follows the selection, selects, frames and hovers', async () => {
    const { store, hovers, selection } = await opened();
    const tree = screen.getByRole('tree', { name: 'What the panel shows' });
    const rows = within(tree).getAllByRole('treeitem');
    expect(
      rows.map((row) => [row.getAttribute('aria-label'), row.getAttribute('aria-level')]),
    ).toEqual([
      ['World, which the panel shows', '1'],
      ['Table, posed in World, at its origin', '2'],
      ['Camera, posed in Table, 80 cm from it', '3'],
      ['Arm, posed in World, 2 m from it', '2'],
      ['Elbow, anchored to the part “elbow” of Arm', '3'],
    ]);
    const camera = within(tree).getByRole('treeitem', { name: /^Camera/ });
    fireEvent.pointerOver(camera);
    expect(hovers.get()).toEqual({ element: 'camera', from: 'space' });
    fireEvent.click(camera);
    expect([...selection().elements]).toEqual(['camera']);
    expect(camera).toHaveAttribute('aria-selected', 'true');
    act(() => camera.focus());
    fireEvent.keyDown(camera, { key: 'Enter' });
    await waitFor(() => expect(store.state(VIEW)?.camera?.target.y).toBeCloseTo(0.8));
  });
});
