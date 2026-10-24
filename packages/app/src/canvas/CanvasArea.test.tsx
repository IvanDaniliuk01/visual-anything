import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { RELATES_TO_ID } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Container } from 'pixi.js';
import { Profiler, StrictMode, useEffect, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { fitCamera, worldToScreen } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { centerOf } from './geometry';
import { CanvasRenderer, type Overlay } from './renderer';
import { buildScene, type Scene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** Whether the canvas runs as on an Apple platform; read on each press. */
const platform = vi.hoisted(() => ({ apple: false }));
vi.mock('../live/platform', () => ({
  isAppleAgent: (agent: string) => /Mac|iPhone|iPad/.test(agent),
  get IS_APPLE() {
    return platform.apple;
  },
}));

const project = loadSample();
const view = project.views[0]!;
const scene = buildScene(project, view.id);
const LABEL = 'System overview';
const SIZE = { width: 1000, height: 600 };

function sizeOf(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
}

/** Runs `action`, which settles a pending start, and lets the canvas area react to it. */
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

/** The canvas area with its selection kept, as the shell keeps it. */
function Harness(props: {
  project?: ProjectSnapshot;
  scene?: Scene;
  onCommand?: SendCommand;
  onSelect?: (selection: Selection) => void;
  initial?: Selection;
}) {
  const shown = props.project ?? project;
  const [selection, setSelection] = useState(props.initial ?? EMPTY_SELECTION);
  const built = useMemo(() => buildScene(shown, view.id), [shown]);
  return (
    <CanvasArea
      project={shown}
      view={shown.views.find((each) => each.id === view.id) ?? view}
      scene={props.scene ?? built}
      label={LABEL}
      selection={selection}
      onSelect={(next) => {
        setSelection(next);
        props.onSelect?.(next);
      }}
      {...(props.onCommand ? { onCommand: props.onCommand } : {})}
    />
  );
}

/**
 * A stand-in for the local program and the live connection: it applies each command to the project
 * it keeps, draws the change, and answers after it, as the live connection does. `elsewhere` applies a
 * change made by someone else.
 */
function localProgram(start: ProjectSnapshot = project) {
  let current = start;
  const shows = new Set<(next: ProjectSnapshot) => void>();
  const apply = (command: Command) => {
    const outcome = executeCommand(current, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    current = outcome.state;
    for (const show of shows) show(current);
    return outcome;
  };
  const onCommand = vi.fn<SendCommand>(async (command) => {
    const outcome = apply(command);
    await Promise.resolve();
    return { ok: true, created: outcome.created };
  });
  function Live(props: { onSelect?: (selection: Selection) => void; initial?: Selection }) {
    const [shown, setShown] = useState(current);
    useEffect(() => {
      shows.add(setShown);
      return () => void shows.delete(setShown);
    }, []);
    return <Harness {...props} project={shown} onCommand={onCommand} />;
  }
  return {
    Live,
    onCommand,
    get project() {
      return current;
    },
    elsewhere: (command: Command) =>
      act(async () => {
        apply(command);
        await Promise.resolve();
      }),
  };
}

/** A command the test answers when it wants, and the answers waiting. */
function answeredLater() {
  const answers: ((result: { ok: boolean; created?: string[] }) => void)[] = [];
  const onCommand = vi.fn<SendCommand>(
    () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
  );
  return {
    onCommand,
    answer: (index: number, result: { ok: boolean; created?: string[] }) =>
      act(async () => {
        answers[index]?.(result);
        await Promise.resolve();
      }),
  };
}

/**
 * Starts the canvas at a known size, and returns its host, where a shape's middle is on screen, and
 * where a point of the scene is; `shown` is the project the canvas first draws.
 */
async function started(element: React.ReactElement, shown: ProjectSnapshot = project) {
  const result = render(element);
  const host = screen.getByRole('application');
  sizeOf(host, SIZE.width, SIZE.height);
  const [app] = FakeApplication.created as [FakeApplication];
  await settle(() => app.finishInit());
  const drawn = buildScene(shown, view.id);
  const camera = fitCamera(drawn.bounds, SIZE, 32);
  const at = (key: string) => {
    const shape = drawn.shapes.find((each) => each.key === key);
    if (!shape) throw new Error(key);
    return worldToScreen(camera, centerOf(shape.rect));
  };
  const on = (point: { x: number; y: number }) => worldToScreen(camera, point);
  return { ...result, host, app, camera, at, on };
}

function point(
  type: string,
  host: HTMLElement,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) {
  const { pointerId, ...init } = extra;
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...init });
  // jsdom's mouse events carry no pointer id; the canvas tells pointers apart by it.
  Object.defineProperty(event, 'pointerId', { value: pointerId ?? 1 });
  fireEvent(host, event);
}

/** Presses on a point, drags by (dx, dy) on screen and lets go there. */
function drag(host: HTMLElement, from: { x: number; y: number }, dx: number, dy: number) {
  point('pointerdown', host, from.x, from.y);
  point('pointermove', host, from.x + dx, from.y + dy);
  point('pointerup', host, from.x + dx, from.y + dy);
}

/** What the live region says. */
function said(): string {
  return screen.getByRole('status', { name: 'Selection' }).textContent?.trim() ?? '';
}

/** The sample with the Patient somewhere else, as the local program sends it back after a move. */
function withPatientAt(x: number, y: number): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((each) => ({
      ...each,
      positions: each.positions.map((position) =>
        position.element === 'patient' ? { ...position, x, y } : position,
      ),
    })),
  };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  platform.apple = false;
});

/** The project after a command, as the local program would have it. */
function after(shown: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(shown, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

/** The sample with Calendar created last, directly in World, over Clinic booking beside its contents. */
const withCalendar = after(project, {
  type: 'create-element',
  element: { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
  positions: [{ view: view.id, x: 300, y: 380 }],
});

/** The sample with an empty System directly in World, below everything else. */
const withEmptySystem = after(project, {
  type: 'create-element',
  element: { id: 'empty-system', component: 'systems.system', name: 'System' },
  positions: [{ view: view.id, x: 40, y: 700 }],
});

/** The sample with the relation that puts WhatsApp in Clinic booking named, so that taking it out asks. */
const withNamedMembership: ProjectSnapshot = {
  ...project,
  model: {
    ...project.model,
    relations: project.model.relations.map((relation) =>
      relation.id === 'whatsapp-in-clinic' ? { ...relation, name: 'Front door' } : relation,
    ),
  },
};

/** Presses on a point, moves to another and lets go there, with what the moves hold, such as Alt. */
function dragTo(
  host: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  extra: Record<string, unknown> = {},
) {
  point('pointerdown', host, from.x, from.y);
  point('pointermove', host, (from.x + to.x) / 2, (from.y + to.y) / 2, extra);
  point('pointermove', host, to.x, to.y, extra);
  point('pointerup', host, to.x, to.y, extra);
}

/** The caption beside a drop: its line, and its details. */
function caption(): { text: string; detail: string | undefined } {
  const element = document.querySelector('.canvas-drop-caption');
  const detail = element?.querySelector('.canvas-drop-caption-detail')?.textContent ?? undefined;
  const all = element?.textContent ?? '';
  return { text: detail === undefined ? all : all.slice(0, all.length - detail.length), detail };
}

/** Lets the answers to what was sent arrive. */
async function answers(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CanvasArea', () => {
  it('describes the view to assistive technology', () => {
    render(<Harness />);
    expect(screen.getByRole('application', { name: LABEL })).toBeInTheDocument();
  });

  it('starts a WebGL canvas and attaches it once it is ready', async () => {
    render(<Harness />);
    const host = screen.getByRole('application', { name: LABEL });
    const [app] = FakeApplication.created;
    expect(app?.initOptions).toMatchObject({ preference: 'webgl' });
    expect(host.querySelector('canvas')).toBeNull();
    await settle(() => app?.finishInit());
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('keeps one canvas when StrictMode mounts twice, destroying the Application of the first mount', async () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const host = screen.getByRole('application', { name: LABEL });
    const [first, second] = FakeApplication.created as [FakeApplication, FakeApplication];
    await settle(() => {
      second.finishInit();
      first.finishInit();
    });
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('destroys its Application when it goes away, even before its start finishes', async () => {
    const { unmount } = render(<Harness />);
    const [app] = FakeApplication.created as [FakeApplication];
    unmount();
    await settle(() => app.finishInit());
    expect(app.destroyed).toBe(true);
  });

  it('fits the scene into the canvas area when it first draws it', async () => {
    const { app, camera } = await started(<Harness />);
    const world = app.stage.contents.find((item): item is Container => item instanceof Container);
    expect(app.renderer.screen).toEqual(SIZE);
    expect(world?.scale.x).toBeCloseTo(camera.scale);
    expect(world?.position.x).toBeCloseTo(camera.x);
    expect(screen.getByRole('status', { name: 'Zoom' }).textContent).toBe(
      `${Math.round(camera.scale * 100)}%`,
    );
  });

  it('selects the shape under a click, and clears the selection on a click on empty canvas', async () => {
    const onSelect = vi.fn();
    const { host, at } = await started(<Harness onSelect={onSelect} />);
    const api = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, api.x, api.y);
    point('pointerup', host, api.x, api.y);
    expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['appointments-api']);

    point('pointerdown', host, 2, 2);
    point('pointerup', host, 2, 2);
    expect((onSelect.mock.lastCall?.[0] as Selection).elements.size).toBe(0);
  });

  it('moves a dragged shape by the distance dragged, pinned, in one command', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, camera } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointermove', host, patient.x + 50, patient.y + 20);
    point('pointerup', host, patient.x + 50, patient.y + 20);
    await act(async () => Promise.resolve());
    const command = onCommand.mock.lastCall?.[0] as Command;
    expect(command).toEqual({
      type: 'set-positions',
      view: view.id,
      positions: [
        {
          element: 'patient',
          x: Math.round(40 + 50 / camera.scale),
          y: Math.round(200 + 20 / camera.scale),
          pinned: true,
        },
      ],
    });
  });

  it('shows what a deletion cascades to before deleting it', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    const api = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, api.x, api.y);
    point('pointerup', host, api.x, api.y);
    fireEvent.keyDown(host, { key: 'Delete' });

    const dialog = screen.getByRole('dialog', { name: 'Delete "Appointments API"?' });
    expect(dialog).toHaveTextContent('These 5 relations end on what you delete');
    expect(dialog).toHaveTextContent('Patient books an appointment');
    expect(onCommand).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await Promise.resolve();
    });
    expect(onCommand.mock.lastCall?.[0]).toEqual({
      type: 'delete',
      elements: ['appointments-api'],
      relations: [],
    });
  });

  it('changes nothing without a way to send commands', async () => {
    const { host, at } = await started(<Harness />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointermove', host, patient.x + 50, patient.y);
    point('pointerup', host, patient.x + 50, patient.y);
    fireEvent.keyDown(host, { key: 'Delete' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('says so when the view draws nothing', () => {
    const empty: Scene = { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined };
    render(<Harness scene={empty} />);
    expect(screen.getByText('This view has no shapes yet.')).toBeInTheDocument();
  });

  it('explains that the canvas could not draw the view when WebGL is unavailable', async () => {
    render(<Harness />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() =>
      app.failInit(new Error('No available renderer for the current environment')),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not draw this view.*No available renderer/,
    );
  });

  it('does not render again as the camera pans', async () => {
    const rendered = vi.fn();
    render(
      <Profiler id="canvas" onRender={rendered}>
        <Harness />
      </Profiler>,
    );
    const host = screen.getByRole('application', { name: LABEL });
    sizeOf(host, SIZE.width, SIZE.height);
    await settle(() => (FakeApplication.created[0] as FakeApplication).finishInit());
    const zoom = screen.getByRole('status', { name: 'Zoom' }).textContent;
    rendered.mockClear();
    for (let step = 0; step < 5; step++) {
      fireEvent.wheel(host, { deltaX: 10, deltaY: 20 });
    }
    expect(rendered).not.toHaveBeenCalled();
    fireEvent.wheel(host, { deltaY: -100, ctrlKey: true });
    expect(screen.getByRole('status', { name: 'Zoom' }).textContent).not.toBe(zoom);
  });

  it('reports a scene it fails to draw in the canvas area, leaving the rest of the app alone', async () => {
    const broken = {
      ...scene,
      shapes: [{ ...scene.shapes[0], rect: undefined }],
    } as unknown as Scene;
    render(<Harness scene={broken} />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() => app.finishInit());
    expect(screen.getByRole('alert')).toHaveTextContent(/could not draw this view/);
    expect(screen.getByRole('application', { name: LABEL })).toBeInTheDocument();
  });
});

describe('Relating from the handle', () => {
  /** Where on screen a point beside the Patient's right side is, `beyond` pixels past it. */
  function besidePatient(camera: ReturnType<typeof fitCamera>, beyond: number) {
    const { rect } = scene.shapes.find((each) => each.key === 'patient')!;
    const edge = worldToScreen(camera, { x: rect.x + rect.width, y: rect.y + rect.height / 2 });
    return { x: edge.x + beyond, y: edge.y };
  }

  it('keeps the handle of a shape as the pointer goes to it, across the gap beside the shape', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, camera } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointermove', host, patient.x, patient.y);
    // Slowly, through the gap where neither the shape nor the handle is under the pointer.
    for (const beyond of [1, 3, 6, 10, 14]) {
      const where = besidePatient(camera, beyond);
      point('pointermove', host, where.x, where.y);
    }
    expect(host.style.cursor).toBe('crosshair');
    const handle = besidePatient(camera, 14);
    const whatsapp = at('clinic-booking/whatsapp');
    point('pointerdown', host, handle.x, handle.y);
    point('pointermove', host, whatsapp.x, whatsapp.y);
    point('pointerup', host, whatsapp.x, whatsapp.y);
    expect(screen.getByRole('menu', { name: 'Relate Patient to WhatsApp channel' })).toBeVisible();
  });

  it('draws the handle where the hovered shape is now, after it moved elsewhere', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setOverlay');
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, camera, rerender } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointermove', host, patient.x, patient.y);
    const moved = withPatientAt(100, 300);
    await act(async () => {
      rerender(<Harness onCommand={onCommand} project={moved} />);
      await Promise.resolve();
    });
    const { rect } = buildScene(moved, view.id).shapes.find((each) => each.key === 'patient')!;
    const handle = (overlays.mock.lastCall?.[0] as Overlay).handle;
    expect(handle?.x).toBeCloseTo(rect.x + rect.width + 14 / camera.scale);
    expect(handle?.y).toBeCloseTo(rect.y + rect.height / 2);
  });
});

describe('Dragging shapes', () => {
  it('keeps drawing a second drag when the first drop’s change comes back, and shows where the first lands', async () => {
    const startDrag = vi.spyOn(CanvasRenderer.prototype, 'startDrag');
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setOverlay');
    const { onCommand, answer } = answeredLater();
    const { host, at, camera, rerender } = await started(<Harness onCommand={onCommand} />);
    drag(host, at('patient'), 50, 0);
    expect(onCommand).toHaveBeenCalledTimes(1);
    const dropped = (onCommand.mock.lastCall?.[0] as Extract<Command, { type: 'set-positions' }>)
      .positions[0]!;

    const api = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, api.x, api.y);
    point('pointermove', host, api.x + 30, api.y);
    const renderer = startDrag.mock.contexts[1] as CanvasRenderer;
    // The second drag took the first drop's drawing away: the first drop shows where it lands.
    const { rect } = scene.shapes.find((each) => each.key === 'patient')!;
    const ghost = (overlays.mock.lastCall?.[0] as Overlay).ghost ?? [];
    expect(ghost).toHaveLength(1);
    expect(ghost[0]?.x).toBeCloseTo(rect.x + 50 / camera.scale);
    expect(ghost[0]).toMatchObject({ y: rect.y, width: rect.width, height: rect.height });

    await act(async () => {
      rerender(<Harness onCommand={onCommand} project={withPatientAt(dropped.x, dropped.y)} />);
      await Promise.resolve();
    });
    await answer(0, { ok: true });
    expect(renderer.dragging).toBe(true);
    expect((overlays.mock.lastCall?.[0] as Overlay).ghost ?? []).toEqual([]);
    point('pointermove', host, api.x + 40, api.y);
    point('pointerup', host, api.x + 40, api.y);
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it('draws a drop’s change with one rebuild of the canvas, whichever comes first', async () => {
    const rebuilds = vi.spyOn(
      CanvasRenderer.prototype as unknown as { rebuild: () => void },
      'rebuild',
    );
    const { onCommand, answer } = answeredLater();
    const { host, at, rerender } = await started(<Harness onCommand={onCommand} />);
    drag(host, at('patient'), 50, 0);
    const dropped = (onCommand.mock.lastCall?.[0] as Extract<Command, { type: 'set-positions' }>)
      .positions[0]!;
    await answer(0, { ok: true });
    rebuilds.mockClear();
    await act(async () => {
      rerender(<Harness onCommand={onCommand} project={withPatientAt(dropped.x, dropped.y)} />);
      await Promise.resolve();
    });
    expect(rebuilds).toHaveBeenCalledTimes(1);
  });

  it('keeps a drag going when another pointer comes down', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y, { pointerId: 1 });
    point('pointermove', host, patient.x + 50, patient.y, { pointerId: 1 });
    point('pointerdown', host, 2, 2, { pointerId: 2 });
    point('pointercancel', host, 2, 2, { pointerId: 2 });
    point('pointerup', host, 2, 2, { pointerId: 2 });
    point('pointerup', host, patient.x + 50, patient.y, { pointerId: 1 });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({ type: 'set-positions' });
  });

  it('leaves the canvas alone when a drop is answered after the canvas went away', async () => {
    const endDrag = vi.spyOn(CanvasRenderer.prototype, 'endDrag');
    const { onCommand, answer } = answeredLater();
    const { host, at, unmount } = await started(<Harness onCommand={onCommand} />);
    drag(host, at('patient'), 50, 0);
    unmount();
    endDrag.mockClear();
    await answer(0, { ok: false });
    expect(endDrag).not.toHaveBeenCalled();
  });

  it('pans with Space held, and selects again once the canvas lost the focus while Space was down', async () => {
    const onSelect = vi.fn();
    const { host, at } = await started(<Harness onSelect={onSelect} />);
    const elsewhere = document.body.appendChild(document.createElement('button'));
    try {
      host.focus();
      fireEvent.keyDown(host, { key: ' ' });
      // Space goes up while the focus is elsewhere, so the canvas never hears it.
      elsewhere.focus();
      fireEvent.keyUp(elsewhere, { key: ' ' });
      const patient = at('patient');
      point('pointerdown', host, patient.x, patient.y);
      point('pointerup', host, patient.x, patient.y);
      expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['patient']);
      expect(host.style.cursor).not.toBe('grab');

      // The same when the window loses the focus.
      fireEvent.keyDown(host, { key: ' ' });
      fireEvent.blur(window);
      const whatsapp = at('clinic-booking/whatsapp');
      point('pointerdown', host, whatsapp.x, whatsapp.y);
      point('pointerup', host, whatsapp.x, whatsapp.y);
      expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['whatsapp']);
    } finally {
      elsewhere.remove();
    }
  });
});

describe('Editing a name in place', () => {
  it('leaves the focus where it went when the editor closes because the focus left it', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    const elsewhere = document.body.appendChild(document.createElement('button'));
    try {
      const patient = at('patient');
      point('pointerdown', host, patient.x, patient.y);
      point('pointerup', host, patient.x, patient.y);
      fireEvent.keyDown(host, { key: 'Enter' });
      const field = screen.getByRole('textbox', { name: 'Name of Patient' });
      fireEvent.change(field, { target: { value: 'Client' } });
      const refocused = vi.fn();
      host.addEventListener('focus', refocused);
      act(() => elsewhere.focus());
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(refocused).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(elsewhere);
      expect(onCommand).toHaveBeenCalledWith({
        type: 'update-element',
        id: 'patient',
        changes: { name: 'Client' },
      });
    } finally {
      elsewhere.remove();
    }
  });

  it('gives the focus back to the canvas when Enter commits', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointerup', host, patient.x, patient.y);
    fireEvent.keyDown(host, { key: 'Enter' });
    const field = screen.getByRole('textbox', { name: 'Name of Patient' });
    fireEvent.change(field, { target: { value: 'Client' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(document.activeElement).toBe(host);
  });

  it('closes when its element goes away, says so, and opens again for what is added next', async () => {
    const program = localProgram();
    const { host, at } = await started(<program.Live />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointerup', host, patient.x, patient.y);
    fireEvent.keyDown(host, { key: 'Enter' });
    screen.getByRole('textbox', { name: 'Name of Patient' });

    await program.elsewhere({ type: 'delete', elements: ['patient'], relations: [] });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(said()).toBe('Patient is no longer in this view, so its name was not changed.');
    expect(document.activeElement).toBe(host);

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'systems.service' } });
      await Promise.resolve();
    });
    expect(await screen.findByRole('textbox', { name: 'Name of Service' })).toBeInTheDocument();
  });

  it('follows its element into another container without losing what was typed', async () => {
    const program = localProgram();
    const { host, at } = await started(<program.Live />);
    const agent = at('clinic-booking/booking-agent');
    point('pointerdown', host, agent.x, agent.y);
    point('pointerup', host, agent.x, agent.y);
    fireEvent.keyDown(host, { key: 'Enter' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Booking agent' }), {
      target: { value: 'Booking bot' },
    });
    await program.elsewhere({
      type: 'batch',
      label: 'Move the Booking agent into Scheduling',
      commands: [
        { type: 'delete', elements: [], relations: ['agent-in-clinic'] },
        {
          type: 'create-relation',
          relation: { relationType: 'systems.is-part-of', from: 'booking-agent', to: 'scheduling' },
        },
      ],
    });
    expect(screen.getByRole('textbox', { name: 'Name of Booking agent' })).toHaveValue(
      'Booking bot',
    );
  });
});

describe('Deleting', () => {
  it('keeps the preview up to date while it is open, and closes it once nothing it deletes is left', async () => {
    const program = localProgram();
    const { host, at } = await started(<program.Live />);
    const reminders = at('clinic-booking/scheduling/reminder-service');
    point('pointerdown', host, reminders.x, reminders.y);
    point('pointerup', host, reminders.x, reminders.y);
    fireEvent.keyDown(host, { key: 'Delete' });
    const dialog = screen.getByRole('dialog', { name: 'Delete "Reminder service"?' });
    expect(dialog).toHaveTextContent('These 2 relations end on what you delete');

    await program.elsewhere({
      type: 'create-relation',
      relation: {
        relationType: 'systems.communicates-with',
        from: 'booking-agent',
        to: 'reminder-service',
      },
    });
    expect(dialog).toHaveTextContent('These 3 relations end on what you delete');

    await program.elsewhere({ type: 'delete', elements: ['reminder-service'], relations: [] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(host);
  });
});

describe('When the project can no longer be changed', () => {
  it('closes the relation menu and the delete preview, which could change nothing', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, rerender } = await started(<Harness onCommand={onCommand} />);
    const api = at('clinic-booking/scheduling/appointments-api');
    point('pointerdown', host, api.x, api.y);
    point('pointerup', host, api.x, api.y);
    fireEvent.keyDown(host, { key: 'Delete' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says that nothing was changed when a name is committed after the connection went', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, rerender } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointerup', host, patient.x, patient.y);
    fireEvent.keyDown(host, { key: 'Enter' });
    rerender(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Name of Patient' });
    fireEvent.change(field, { target: { value: 'Client' } });
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(onCommand).not.toHaveBeenCalled();
    expect(said()).toBe('Visual Anything is not connected, so nothing was changed.');
  });
});

describe('Answers that come after the user moved on', () => {
  it('leaves alone what the user selected while an element was being added', async () => {
    const { onCommand, answer } = answeredLater();
    const onSelect = vi.fn();
    const { host, at } = await started(<Harness onCommand={onCommand} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'systems.service' } });
    expect(onCommand).toHaveBeenCalledTimes(1);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointerup', host, patient.x, patient.y);
    await answer(0, { ok: true, created: ['service-1'] });
    expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['patient']);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('selects a new relation only when nothing else was chosen meanwhile, and never takes the focus back', async () => {
    const { onCommand, answer } = answeredLater();
    const onSelect = vi.fn();
    const { host, at, camera } = await started(
      <Harness
        onCommand={onCommand}
        onSelect={onSelect}
        initial={selectionOf([{ kind: 'element', id: 'patient' }])}
      />,
    );
    const elsewhere = document.body.appendChild(document.createElement('button'));
    try {
      // Relates the selected Patient to the WhatsApp channel from its handle.
      const { rect } = scene.shapes.find((each) => each.key === 'patient')!;
      const edge = worldToScreen(camera, {
        x: rect.x + rect.width,
        y: rect.y + rect.height / 2,
      });
      const whatsapp = at('clinic-booking/whatsapp');
      point('pointerdown', host, edge.x + 14, edge.y);
      point('pointermove', host, whatsapp.x, whatsapp.y);
      point('pointerup', host, whatsapp.x, whatsapp.y);
      fireEvent.click(screen.getAllByRole('menuitem')[0]!);
      expect(onCommand).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(host);
      act(() => elsewhere.focus());
      await answer(0, { ok: true, created: ['relation-1'] });
      expect(document.activeElement).toBe(elsewhere);
      expect(onSelect).not.toHaveBeenCalled();

      // Answered while the user stays where they were, the new relation is selected.
      host.focus();
      point('pointerdown', host, edge.x + 14, edge.y);
      point('pointermove', host, whatsapp.x, whatsapp.y);
      point('pointerup', host, whatsapp.x, whatsapp.y);
      fireEvent.click(screen.getAllByRole('menuitem')[0]!);
      await answer(1, { ok: true, created: ['relation-2'] });
      expect([...(onSelect.mock.lastCall?.[0] as Selection).relations]).toEqual(['relation-2']);
    } finally {
      elsewhere.remove();
    }
  });
});

describe('Dropping shapes into and out of containers', () => {
  it('puts Patient inside Clinic booking when it is dropped on it, and says so', async () => {
    const program = localProgram();
    const { host, at, on } = await started(<program.Live />);
    dragTo(host, at('patient'), on({ x: 400, y: 420 }));
    await answers();
    const [command] = program.onCommand.mock.calls.at(-1) ?? [];
    expect(command).toMatchObject({
      type: 'change-container',
      view: view.id,
      to: 'clinic-booking',
      shapes: [{ element: 'patient' }],
    });
    expect(said()).toBe('Put "Patient" inside "Clinic booking".');
    expect(
      program.project.model.relations.some(
        (relation) => relation.from === 'patient' && relation.to === 'clinic-booking',
      ),
    ).toBe(true);
  });

  it('only moves shapes dragged with Alt held, and keeps Alt from the browser', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, on } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    const target = on({ x: 400, y: 420 });
    point('pointerdown', host, patient.x, patient.y);
    point('pointermove', host, target.x, target.y);
    expect(caption().text).toBe('Put inside "Clinic booking"');
    expect(fireEvent.keyDown(host, { key: 'Alt', altKey: true })).toBe(false);
    // Patient is drawn before Clinic booking, so only moving it there lands it behind.
    expect(caption()).toEqual({ text: 'Moves only', detail: 'Lands behind "Clinic booking"' });
    expect(fireEvent.keyUp(host, { key: 'Alt' })).toBe(false);
    expect(caption().text).toBe('Put inside "Clinic booking"');
    point('pointermove', host, target.x + 1, target.y, { altKey: true });
    point('pointerup', host, target.x + 1, target.y, { altKey: true });
    await answers();
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({ type: 'set-positions' });
    expect(caption().text).toBe('');
  });

  it('takes WhatsApp out of Clinic booking once it is dragged clear of it', async () => {
    const program = localProgram();
    const { host, at, on } = await started(<program.Live />);
    dragTo(host, at('clinic-booking/whatsapp'), on({ x: 100, y: 600 }));
    await answers();
    const [command] = program.onCommand.mock.calls.at(-1) ?? [];
    expect(command).toMatchObject({
      type: 'change-container',
      shapes: [{ element: 'whatsapp', from: 'clinic-booking' }],
    });
    expect(command).not.toHaveProperty('to');
    expect(said()).toBe('Take "WhatsApp channel" out of "Clinic booking".');
    expect(program.project.model.relations.some((each) => each.id === 'whatsapp-in-clinic')).toBe(
      false,
    );
  });

  it('only moves the contents of a container rearranged inside it', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, on } = await started(<Harness onCommand={onCommand} />);
    dragTo(host, at('clinic-booking/scheduling/appointments-api'), on({ x: 900, y: 320 }));
    await answers();
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({
      type: 'set-positions',
      positions: [{ element: 'appointments-api', container: 'scheduling' }],
    });
  });

  it('says where a drop goes as the pointer moves, and arms a shape that holds nothing once the pointer rests on it', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, on } = await started(<Harness onCommand={onCommand} />);
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setOverlay');
    vi.useFakeTimers();
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    const scheduling = on({ x: 1000, y: 420 });
    point('pointermove', host, scheduling.x, scheduling.y);
    expect(caption()).toEqual({ text: 'Put inside "Scheduling"', detail: 'Alt: move only' });
    const outlined = (overlays.mock.lastCall?.[0] as Overlay).drop;
    expect(outlined?.into).toMatchObject({ x: 740, y: 100, width: 440, height: 380 });

    const agent = at('clinic-booking/booking-agent');
    point('pointermove', host, agent.x, agent.y);
    expect(caption()).toEqual({
      text: 'Hold still to put inside "Booking agent"',
      detail: 'Release now: put inside "Clinic booking" · Alt: move only',
    });
    // Moving a little keeps the rest going; resting long enough arms it.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    point('pointermove', host, agent.x + 3, agent.y);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(caption().text).toBe('Put inside "Booking agent"');
    point('pointerup', host, agent.x + 3, agent.y);
    vi.useRealTimers();
    await answers();
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({
      type: 'change-container',
      to: 'booking-agent',
    });
    expect(caption().text).toBe('');
  });

  it('clears the caption and the rest when Escape cancels the drag', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    vi.useFakeTimers();
    const patient = at('patient');
    const agent = at('clinic-booking/booking-agent');
    point('pointerdown', host, patient.x, patient.y);
    point('pointermove', host, agent.x, agent.y);
    expect(caption().text).toBe('Hold still to put inside "Booking agent"');
    fireEvent.keyDown(host, { key: 'Escape' });
    expect(caption().text).toBe('');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(caption().text).toBe('');
    point('pointerup', host, agent.x, agent.y);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('asks before a drop that deletes more than the relation that placed it, showing where the shapes land, and Cancel changes nothing', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setOverlay');
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, on } = await started(
      <Harness project={withNamedMembership} onCommand={onCommand} />,
      withNamedMembership,
    );
    dragTo(host, at('clinic-booking/whatsapp'), on({ x: 100, y: 600 }));
    const dialog = screen.getByRole('dialog', {
      name: 'Take "WhatsApp channel" out of "Clinic booking"?',
    });
    expect(dialog).toHaveTextContent('This takes away the relation "Front door".');
    expect(dialog).toHaveTextContent('It has a name, a description or attributes of its own');
    expect(onCommand).not.toHaveBeenCalled();
    const ghost = (overlays.mock.lastCall?.[0] as Overlay).ghost ?? [];
    expect(ghost).toHaveLength(1);
    expect(ghost[0]).toMatchObject({ width: 180, height: 72 });
    expect(ghost[0]?.x).toBeCloseTo(10, 0);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onCommand).not.toHaveBeenCalled();
    expect((overlays.mock.lastCall?.[0] as Overlay).ghost).toBeUndefined();
    expect(document.activeElement).toBe(host);
  });

  it('sends a drop once it is confirmed, and shows where its shapes land until its change comes back', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setOverlay');
    const program = localProgram(withNamedMembership);
    const { host, at, on } = await started(<program.Live />, withNamedMembership);
    dragTo(host, at('clinic-booking/whatsapp'), on({ x: 100, y: 600 }));
    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Take out' }));
      await Promise.resolve();
    });
    await answers();
    expect(program.onCommand).toHaveBeenCalledTimes(1);
    expect(program.onCommand.mock.lastCall?.[0]).toMatchObject({ type: 'change-container' });
    expect(said()).toBe('Take "WhatsApp channel" out of "Clinic booking".');
    expect((overlays.mock.lastCall?.[0] as Overlay).ghost).toBeUndefined();
  });

  it('keeps the question up to date while the project changes', async () => {
    const program = localProgram(withNamedMembership);
    const { host, at, on } = await started(<program.Live />, withNamedMembership);
    dragTo(host, at('clinic-booking/whatsapp'), on({ x: 100, y: 600 }));
    const dialog = screen.getByRole('dialog');
    await program.elsewhere({
      type: 'create-relation',
      relation: {
        relationType: RELATES_TO_ID,
        from: 'booking-agent',
        to: 'whatsapp-in-clinic',
      },
    });
    expect(dialog).toHaveTextContent('This relation ends on it, so it goes too:');
    expect(screen.getByRole('dialog')).toBe(dialog);
  });
});

describe('Adding elements', () => {
  it('adds next to an empty System selected directly in World, and inside it from its menu', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(
      <Harness project={withEmptySystem} onCommand={onCommand} />,
      withEmptySystem,
    );
    const system = at('empty-system');
    point('pointerdown', host, system.x, system.y);
    point('pointerup', host, system.x, system.y);
    const select = screen.getByRole('combobox', { name: 'Add an element' });
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Add element…');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'systems.service' } });
      await Promise.resolve();
    });
    const beside = onCommand.mock.lastCall?.[0] as Extract<Command, { type: 'create-element' }>;
    expect(beside).toMatchObject({ type: 'create-element', element: { name: 'Service' } });
    expect(beside).not.toHaveProperty('containers');
    expect(beside.positions?.[0]).not.toHaveProperty('container');

    fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu', { name: 'System' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Add inside "System"…' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const inside = screen.getByRole('combobox', { name: 'Add an element inside "System"' });
    expect(document.activeElement).toBe(inside);
    expect(within(inside).getAllByRole('option')[0]).toHaveTextContent('Add inside "System"…');
    expect(inside).toHaveAttribute(
      'title',
      'Adds the element inside "System". With nothing selected, elements are added directly in World.',
    );
    await act(async () => {
      fireEvent.change(inside, { target: { value: 'systems.service' } });
      await Promise.resolve();
    });
    expect(onCommand.mock.lastCall?.[0]).toEqual({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Service' },
      containers: [{ container: 'empty-system', relationType: 'systems.is-part-of' }],
    });
    // The target served once.
    expect(screen.getByRole('combobox', { name: 'Add an element' })).toBeInTheDocument();
  });

  it('ends the target set from the menu when the list loses the focus', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(
      <Harness project={withEmptySystem} onCommand={onCommand} />,
      withEmptySystem,
    );
    const system = at('empty-system');
    point('pointerdown', host, system.x, system.y);
    point('pointerup', host, system.x, system.y);
    fireEvent.keyDown(host, { key: 'ContextMenu' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add inside "System"…' }));
    const inside = screen.getByRole('combobox', { name: 'Add an element inside "System"' });
    act(() => host.focus());
    fireEvent.blur(inside);
    expect(screen.getByRole('combobox', { name: 'Add an element' })).toBeInTheDocument();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('makes siblings of elements added one after another, each named as it comes', async () => {
    const program = localProgram();
    const { host, on } = await started(<program.Live />);
    const booking = on({ x: 600, y: 450 });
    point('pointerdown', host, booking.x, booking.y);
    point('pointerup', host, booking.x, booking.y);

    const add = async (name: string) => {
      await act(async () => {
        fireEvent.change(screen.getByRole('combobox', { name: /^Add an element/ }), {
          target: { value: 'systems.service' },
        });
        await Promise.resolve();
      });
      await answers();
      const field = await screen.findByRole('textbox', { name: 'Name of Service' });
      fireEvent.change(field, { target: { value: name } });
      await act(async () => {
        fireEvent.keyDown(field, { key: 'Enter' });
        await Promise.resolve();
      });
      await answers();
    };
    expect(
      screen.getByRole('combobox', { name: 'Add an element inside "Clinic booking"' }),
    ).toHaveAttribute(
      'title',
      'Adds the element inside "Clinic booking". With nothing selected, elements are added directly in World.',
    );
    await add('Billing');
    const select = screen.getByRole('combobox', { name: 'Add an element inside "Clinic booking"' });
    expect(select).toHaveAttribute(
      'title',
      'Adds the element inside "Clinic booking", where "Billing" sits. To add inside "Billing" itself, use Add inside "Billing"… in its menu or in the inspector.',
    );
    await add('Invoices');
    const inClinic = (name: string) => {
      const element = program.project.model.elements.find((each) => each.name === name);
      return program.project.model.relations.some(
        (relation) => relation.from === element?.id && relation.to === 'clinic-booking',
      );
    };
    expect(inClinic('Billing')).toBe(true);
    expect(inClinic('Invoices')).toBe(true);
    const creates = program.onCommand.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === 'create-element');
    expect(creates).toHaveLength(2);
    for (const command of creates) expect(command).not.toHaveProperty('positions');
  });
});

describe('The stacking order', () => {
  it('brings the selection forward with Ctrl+↑, takes the key, and says what it did', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, on } = await started(
      <Harness project={withCalendar} onCommand={onCommand} />,
      withCalendar,
    );
    const booking = on({ x: 600, y: 450 });
    point('pointerdown', host, booking.x, booking.y);
    point('pointerup', host, booking.x, booking.y);
    expect(fireEvent.keyDown(host, { key: 'ArrowUp', ctrlKey: true })).toBe(false);
    await answers();
    expect(onCommand.mock.lastCall?.[0]).toEqual({
      type: 'restack',
      view: view.id,
      moves: [{ shape: { element: 'clinic-booking' }, to: { inFrontOf: 'calendar' } }],
    });
    expect(said()).toBe('"Clinic booking" is now in front of "Calendar".');
  });

  it('sends the selection backward with ⌘[ while a toolbar button has the focus', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(
      <Harness project={withCalendar} onCommand={onCommand} />,
      withCalendar,
    );
    const calendar = at('calendar');
    point('pointerdown', host, calendar.x, calendar.y);
    point('pointerup', host, calendar.x, calendar.y);
    const note = screen.getByRole('button', { name: 'Note' });
    act(() => note.focus());
    expect(fireEvent.keyDown(note, { key: '[', metaKey: true })).toBe(false);
    await answers();
    expect(onCommand.mock.lastCall?.[0]).toEqual({
      type: 'restack',
      view: view.id,
      moves: [{ shape: { element: 'calendar' }, to: { behind: 'clinic-booking' } }],
    });
    expect(document.activeElement).toBe(note);
  });

  it('says why a press changes nothing, from the toolbar as from the keys', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(
      <Harness project={withCalendar} onCommand={onCommand} />,
      withCalendar,
    );
    const calendar = at('calendar');
    point('pointerdown', host, calendar.x, calendar.y);
    point('pointerup', host, calendar.x, calendar.y);
    const group = screen.getByRole('group', { name: 'Stacking order' });
    const front = within(group).getByRole('button', { name: 'Bring to front' });
    expect(front).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(front);
    expect(said()).toBe(
      '"Calendar" is already in front of everything it overlaps directly in World. It sits over "Clinic booking" without being inside it; Put inside "Clinic booking" orders it among the shapes there.',
    );
    point('pointerdown', host, 2, 2);
    point('pointerup', host, 2, 2);
    expect(fireEvent.keyDown(host, { key: ']', ctrlKey: true })).toBe(false);
    expect(said()).toBe(
      'Select shapes of elements to change their stacking order. Relations, notes and arrows are always drawn in front of them.',
    );
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('never takes [ typed in the inline editor', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started(<Harness onCommand={onCommand} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointerup', host, patient.x, patient.y);
    fireEvent.keyDown(host, { key: 'Enter' });
    const field = screen.getByRole('textbox', { name: 'Name of Patient' });
    expect(fireEvent.keyDown(field, { key: '[' })).toBe(true);
    expect(fireEvent.keyDown(field, { key: '[', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(field, { key: 'ArrowUp', ctrlKey: true })).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe('The shape menu', () => {
  it('opens on a right-click with the shapes under the pointer, and puts the shape inside the container under its middle', async () => {
    const program = localProgram(withCalendar);
    const { host, at } = await started(<program.Live />, withCalendar);
    const calendar = at('calendar');
    point('pointerdown', host, calendar.x, calendar.y, { button: 2 });
    point('pointerup', host, calendar.x, calendar.y, { button: 2 });
    expect(fireEvent.contextMenu(host, { clientX: calendar.x, clientY: calendar.y })).toBe(false);
    const menu = screen.getByRole('menu', { name: 'Calendar' });
    expect(within(menu).getByRole('group', { name: 'Under the pointer' })).toHaveTextContent(
      'Select "Clinic booking"',
    );
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Put inside "Clinic booking"' }));
      await Promise.resolve();
    });
    await answers();
    expect(program.onCommand.mock.lastCall?.[0]).toMatchObject({
      type: 'change-container',
      to: 'clinic-booking',
      shapes: [{ element: 'calendar', at: { x: 60, y: 340 } }],
    });
    expect(said()).toBe('Put "Calendar" inside "Clinic booking".');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(host);
  });

  it('selects a covered shape from the shapes under the pointer', async () => {
    const onSelect = vi.fn();
    const { host, at } = await started(
      <Harness project={withCalendar} onSelect={onSelect} />,
      withCalendar,
    );
    const calendar = at('calendar');
    point('pointerdown', host, calendar.x, calendar.y, { button: 2 });
    fireEvent.contextMenu(host, { clientX: calendar.x, clientY: calendar.y });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Select "Clinic booking"' }));
    expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['clinic-booking']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('on Apple platforms, opens on Ctrl+click without adding to the selection', async () => {
    platform.apple = true;
    const onSelect = vi.fn();
    const { host, at } = await started(<Harness onSelect={onSelect} />);
    const patient = at('patient');
    point('pointerdown', host, patient.x, patient.y);
    point('pointerup', host, patient.x, patient.y);
    const whatsapp = at('clinic-booking/whatsapp');
    point('pointerdown', host, whatsapp.x, whatsapp.y, { ctrlKey: true });
    point('pointermove', host, whatsapp.x + 30, whatsapp.y, { ctrlKey: true });
    point('pointerup', host, whatsapp.x + 30, whatsapp.y, { ctrlKey: true });
    expect([...(onSelect.mock.lastCall?.[0] as Selection).elements]).toEqual(['whatsapp']);
    fireEvent.contextMenu(host, { clientX: whatsapp.x, clientY: whatsapp.y });
    expect(screen.getByRole('menu', { name: 'WhatsApp channel' })).toBeInTheDocument();

    // ⌘ still adds to the selection there.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    point('pointerdown', host, patient.x, patient.y, { metaKey: true });
    point('pointerup', host, patient.x, patient.y, { metaKey: true });
    expect([...(onSelect.mock.lastCall?.[0] as Selection).elements].sort()).toEqual([
      'patient',
      'whatsapp',
    ]);
  });

  it('opens once from the keyboard, for the current shape, wherever the event says it is', async () => {
    const { host, at } = await started(<Harness />);
    const whatsapp = at('clinic-booking/whatsapp');
    point('pointerdown', host, whatsapp.x, whatsapp.y);
    point('pointerup', host, whatsapp.x, whatsapp.y);
    expect(fireEvent.keyDown(host, { key: 'ContextMenu' })).toBe(false);
    const menu = screen.getByRole('menu', { name: 'WhatsApp channel' });
    const items = within(menu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    // The event that follows the key is the key's: the menu stays as it is.
    const patient = at('patient');
    expect(fireEvent.contextMenu(host, { clientX: patient.x, clientY: patient.y })).toBe(false);
    expect(screen.getByRole('menu', { name: 'WhatsApp channel' })).toBe(menu);
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(host);
    // With no key or press before it, the event comes from the keyboard too.
    fireEvent.contextMenu(host, { clientX: patient.x, clientY: patient.y });
    expect(screen.getByRole('menu', { name: 'WhatsApp channel' })).toBeInTheDocument();
  });

  it('moves a shape to a container chosen by name', async () => {
    const program = localProgram();
    const { host, at } = await started(<program.Live />);
    const whatsapp = at('clinic-booking/whatsapp');
    point('pointerdown', host, whatsapp.x, whatsapp.y);
    point('pointerup', host, whatsapp.x, whatsapp.y);
    fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    const chooser = screen.getByRole('dialog', { name: 'Move "WhatsApp channel" to…' });
    const field = within(chooser).getByRole('combobox');
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'sched' } });
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
      await Promise.resolve();
    });
    await answers();
    expect(program.onCommand.mock.lastCall?.[0]).toEqual({
      type: 'change-container',
      view: view.id,
      to: 'scheduling',
      shapes: [{ element: 'whatsapp', from: 'clinic-booking' }],
    });
    expect(said()).toBe('Move "WhatsApp channel" from "Clinic booking" into "Scheduling".');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(host);
  });

  it('asks before taking a shape out from the menu, without a ghost', async () => {
    const overlays = vi.spyOn(CanvasRenderer.prototype, 'setOverlay');
    const program = localProgram(withNamedMembership);
    const { host, at } = await started(<program.Live />, withNamedMembership);
    const whatsapp = at('clinic-booking/whatsapp');
    point('pointerdown', host, whatsapp.x, whatsapp.y);
    point('pointerup', host, whatsapp.x, whatsapp.y);
    fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Take out of "Clinic booking"' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Take "WhatsApp channel" out of "Clinic booking"?',
    });
    expect((overlays.mock.lastCall?.[0] as Overlay).ghost).toBeUndefined();
    expect(program.onCommand).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Take out' }));
      await Promise.resolve();
    });
    await answers();
    expect(program.onCommand.mock.lastCall?.[0]).toMatchObject({
      type: 'change-container',
      shapes: [{ element: 'whatsapp', from: 'clinic-booking', at: { x: 1260, y: 40 } }],
    });
    expect(said()).toBe('Take "WhatsApp channel" out of "Clinic booking".');
    expect(document.activeElement).toBe(host);
  });
});
