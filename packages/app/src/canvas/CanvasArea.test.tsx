import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
function localProgram() {
  let current = project;
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

/** Starts the canvas at a known size, and returns its host and where a scene point is on screen. */
async function started(element: React.ReactElement) {
  const result = render(element);
  const host = screen.getByRole('application', { name: LABEL });
  sizeOf(host, SIZE.width, SIZE.height);
  const [app] = FakeApplication.created as [FakeApplication];
  await settle(() => app.finishInit());
  const camera = fitCamera(scene.bounds, SIZE, 32);
  const at = (key: string) => {
    const shape = scene.shapes.find((each) => each.key === key);
    if (!shape) throw new Error(key);
    return worldToScreen(camera, centerOf(shape.rect));
  };
  return { ...result, host, app, camera, at };
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
});

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
