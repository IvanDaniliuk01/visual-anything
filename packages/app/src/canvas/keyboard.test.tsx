import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { RELATES_TO_ID } from '@visual-anything/schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { fitCamera, worldToScreen } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { centerOf } from './geometry';
import { CANVAS_KEYS_HINT } from './keys';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const sample = loadSample();
const VIEW = 'system-overview';
const LABEL = 'System overview';
const SIZE = { width: 1000, height: 600 };

interface HarnessProps {
  project?: ProjectSnapshot;
  onCommand?: SendCommand;
  initial?: Selection;
  revealed?: { key: string; request: number };
}

/** The canvas area with its selection kept, and its scene built from the project, as the shell does. */
function Harness({ project = sample, onCommand, initial, revealed }: HarnessProps) {
  const [selection, setSelection] = useState(initial ?? EMPTY_SELECTION);
  const view = project.views.find((each) => each.id === VIEW)!;
  const scene = useMemo(() => buildScene(project, VIEW), [project]);
  return (
    <CanvasArea
      project={project}
      view={view}
      scene={scene}
      label={LABEL}
      selection={selection}
      onSelect={setSelection}
      {...(onCommand ? { onCommand } : {})}
      {...(revealed ? { revealed } : {})}
    />
  );
}

/** Starts the canvas at a known size; `at` is where a shape's middle is on screen. */
async function started(props: HarnessProps = {}) {
  const result = render(<Harness {...props} />);
  const host = screen.getByRole('application', { name: LABEL });
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  const camera = fitCamera(buildScene(sample, VIEW).bounds, SIZE, 32);
  const at = (key: string) => {
    const shape = buildScene(sample, VIEW).shapes.find((each) => each.key === key);
    if (!shape) throw new Error(key);
    return worldToScreen(camera, centerOf(shape.rect));
  };
  return { ...result, host, at };
}

function clickOn(host: HTMLElement, point: { x: number; y: number }): void {
  for (const type of ['pointerdown', 'pointerup']) {
    fireEvent(
      host,
      new MouseEvent(type, { bubbles: true, clientX: point.x, clientY: point.y, button: 0 }),
    );
  }
}

function press(host: HTMLElement, key: string, init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(host, { key, ...init });
}

/** What the live region says. */
function said(): string {
  return screen.getByRole('status', { name: 'Selection' }).textContent?.trim() ?? '';
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('The canvas from the keyboard', () => {
  it('describes its keys to screen readers, and lists them in its keyboard help', async () => {
    const { host } = await started();
    expect(host).toHaveAccessibleDescription(CANVAS_KEYS_HINT);
    expect(screen.getByText('Keyboard')).toBeInTheDocument();
    expect(screen.getByText('] and [, or . and ,')).toBeInTheDocument();
    expect(screen.getByText('Shift+arrow keys')).toBeInTheDocument();
    expect(
      screen.getByText('Ctrl+↑ and Ctrl+↓ (⌘ on macOS), or Ctrl+] and Ctrl+['),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ctrl+Shift+↑ and Ctrl+Shift+↓, or Ctrl+} and Ctrl+{ (⌥⌘] and ⌥⌘[ on macOS)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Shift+F10 or the menu key')).toBeInTheDocument();
    expect(screen.getByText('Alt while dragging (⌥ on macOS)')).toBeInTheDocument();
    expect(CANVAS_KEYS_HINT).toContain(', and Shift+F10 opens the selected shape’s menu.');
  });

  it('selects the shape nearest the middle when nothing is selected, and says what it is', async () => {
    const { host } = await started();
    expect(press(host, 'ArrowRight')).toBe(false);
    expect(said()).toBe('Clinic booking, System, in World, no relations.');
  });

  it('goes to the nearest shape in each direction, entering containers on the way', async () => {
    const { host, at } = await started();
    clickOn(host, at('patient'));
    press(host, 'ArrowRight');
    expect(said()).toBe('WhatsApp channel, Chat channel, in Clinic booking, 2 relations.');
    press(host, 'ArrowRight');
    press(host, 'ArrowRight');
    expect(said()).toBe('Appointments API, Service, in Scheduling, 4 relations.');
    press(host, 'ArrowDown');
    expect(said()).toBe('Appointments DB, Calendar, in Scheduling, 2 relations.');
    press(host, 'ArrowLeft');
    expect(said()).toBe('Booking agent, AI agent, in Clinic booking, 2 relations.');
  });

  it('says when no shape lies in a direction, and keeps the selection', async () => {
    const { host, at } = await started();
    clickOn(host, at('clinic-booking/scheduling/reminder-service'));
    press(host, 'ArrowRight');
    expect(said()).toBe('No shape to the right.');
    press(host, 'ArrowLeft');
    expect(said()).toBe('Appointments API, Service, in Scheduling, 4 relations.');
  });

  it('selects the container with Alt+Up and the first shape inside with Alt+Down', async () => {
    const { host, at } = await started();
    clickOn(host, at('clinic-booking/scheduling/appointments-api'));
    press(host, 'ArrowUp', { altKey: true });
    expect(said()).toBe('Scheduling, System, in Clinic booking, no relations.');
    press(host, 'ArrowUp', { altKey: true });
    press(host, 'ArrowUp', { altKey: true });
    expect(said()).toBe('Clinic booking sits directly in World.');
    press(host, 'ArrowDown', { altKey: true });
    expect(said()).toBe('WhatsApp channel, Chat channel, in Clinic booking, 2 relations.');
    // Alt with Left and Right goes back and forward in the browser's history.
    expect(press(host, 'ArrowLeft', { altKey: true })).toBe(true);
  });

  it('steps through an element’s relations with ] and [, and follows one with Enter', async () => {
    const { host, at } = await started();
    clickOn(host, at('clinic-booking/booking-agent'));
    press(host, ']');
    expect(said()).toBe(
      'Booking agent communicates with Appointments API, “HTTPS”, relation 1 of 2 of Booking agent.',
    );
    press(host, ']');
    expect(said()).toBe(
      'WhatsApp channel communicates with Booking agent, relation 2 of 2 of Booking agent.',
    );
    press(host, '[');
    expect(said()).toMatch(/relation 1 of 2 of Booking agent\.$/);
    press(host, 'Enter');
    expect(said()).toBe('Appointments API, Service, in Scheduling, 4 relations.');
    // ] goes on from the relation the move came along: the last of the Appointments API's.
    press(host, ']');
    expect(said()).toBe(
      'Appointments API communicates with Reminder service, relation 1 of 4 of Appointments API.',
    );
    press(host, 'Enter');
    expect(said()).toBe('Reminder service, Service, in Scheduling, 1 relation.');
  });

  it('selects with Alt+Down a shape a container holds outside its rectangle', async () => {
    const { host } = await started({
      project: withSchedulingContentsMovedUp(sample, 400),
      initial: selectionOf([{ kind: 'element', id: 'scheduling' }]),
    });
    press(host, 'ArrowDown', { altKey: true });
    expect(said()).toBe('Appointments DB, Calendar, in Scheduling, 2 relations.');
  });

  it('steps on with ] into the relations that end on a relation, and follows one back', async () => {
    const { host, at } = await started({ project: withRelationsOnRelations(sample) });
    clickOn(host, at('clinic-booking/scheduling/appointments-api'));
    press(host, ']');
    press(host, ']');
    expect(said()).toMatch(/^Appointments API writes to Appointments DB.*relation 2 of 6/);
    press(host, ']');
    expect(said()).toBe(
      'writes to relates to reads from, ending on Appointments API writes to Appointments DB, relation 3 of 6 of Appointments API.',
    );
    press(host, '[');
    expect(said()).toMatch(/relation 2 of 6 of Appointments API\.$/);
    press(host, ']');
    press(host, 'Enter');
    // Its far end, away from the relation it was reached through, is another relation.
    expect(said()).toBe('Appointments API reads from Appointments DB.');
  });

  it('steps from a relation between relations selected elsewhere, through an element it reaches', async () => {
    const { host } = await started({
      project: withRelationsOnRelations(sample),
      initial: selectionOf([{ kind: 'relation', id: 'reads-and-writes' }]),
    });
    press(host, ']');
    expect(said()).toMatch(/relation 4 of 6 of Appointments API\.$/);
  });

  it('steps with . and , too, and with [ and ] typed with AltGr', async () => {
    const { host, at } = await started();
    clickOn(host, at('clinic-booking/booking-agent'));
    press(host, '.');
    expect(said()).toMatch(/relation 1 of 2 of Booking agent.$/);
    press(host, '.');
    expect(said()).toMatch(/relation 2 of 2 of Booking agent.$/);
    press(host, ',');
    expect(said()).toMatch(/relation 1 of 2 of Booking agent.$/);
    // AltGr comes as Ctrl and Alt together, as on a Spanish or German keyboard on Windows.
    const altGr = { ctrlKey: true, altKey: true, modifierAltGraph: true };
    expect(press(host, ']', altGr)).toBe(false);
    expect(said()).toMatch(/relation 2 of 2 of Booking agent.$/);
  });

  it('follows a relation selected elsewhere to the end it points to', async () => {
    const { host } = await started({
      initial: selectionOf([{ kind: 'relation', id: 'api-reads-db' }]),
    });
    press(host, 'Enter');
    expect(said()).toBe('Appointments DB, Calendar, in Scheduling, 2 relations.');
  });

  it('leaves Ctrl, ⌘ and Alt with [ and ] alone', async () => {
    const { host, at } = await started();
    clickOn(host, at('clinic-booking/booking-agent'));
    press(host, 'ArrowRight');
    const before = said();
    expect(press(host, ']', { ctrlKey: true })).toBe(true);
    expect(press(host, '[', { metaKey: true })).toBe(true);
    expect(press(host, ']', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(press(host, ']', { altKey: true })).toBe(true);
    expect(said()).toBe(before);
  });

  it('leaves Tab alone, so that it leaves the canvas', async () => {
    const { host } = await started();
    expect(press(host, 'Tab')).toBe(true);
    expect(press(host, 'Tab', { shiftKey: true })).toBe(true);
  });

  it('moves on from a shape the outline revealed', async () => {
    const { host } = await started({
      initial: selectionOf([{ kind: 'element', id: 'appointments-api' }]),
      revealed: { key: 'clinic-booking/scheduling/appointments-api', request: 1 },
    });
    press(host, 'ArrowRight');
    expect(said()).toBe('Reminder service, Service, in Scheduling, 1 relation.');
  });

  it('clears the selection with Escape, and says so', async () => {
    const { host, at } = await started();
    clickOn(host, at('patient'));
    press(host, 'Escape');
    expect(said()).toBe('Nothing is selected.');
  });
});

describe('Editing from the keyboard', () => {
  it('renames the selected element in place with Enter, and with F2', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at } = await started({ onCommand });
    clickOn(host, at('patient'));
    press(host, 'Enter');
    const field = screen.getByRole('textbox', { name: 'Name of Patient' });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    press(host, 'F2');
    expect(screen.getByRole('textbox', { name: 'Name of Patient' })).toBeInTheDocument();
  });

  it('moves the selection a small step with Shift and an arrow key, one move a press', async () => {
    const onCommand = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    const { host, at, rerender } = await started({ onCommand });
    clickOn(host, at('patient'));
    await act(async () => {
      press(host, 'ArrowRight', { shiftKey: true });
      await Promise.resolve();
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.lastCall?.[0]).toEqual(movedTo(50, 200));

    // A press made before the move comes back waits for it, then moves on from where it left.
    await act(async () => {
      press(host, 'ArrowDown', { shiftKey: true });
      await Promise.resolve();
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender(<Harness onCommand={onCommand} project={withPatientAt(50, 200)} />);
      await Promise.resolve();
    });
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand.mock.lastCall?.[0]).toEqual(movedTo(50, 210));
  });

  it('waits with a press for a drop still on its way, and moves on from where the drop left the shapes', async () => {
    let answer: (result: { ok: boolean }) => void = () => undefined;
    const onCommand = vi.fn<SendCommand>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { host, at, rerender } = await started({ onCommand });
    const patient = at('patient');
    for (const [type, dx] of [
      ['pointerdown', 0],
      ['pointermove', 20],
      ['pointerup', 20],
    ] as const) {
      fireEvent(
        host,
        new MouseEvent(type, {
          bubbles: true,
          clientX: patient.x + dx,
          clientY: patient.y,
          button: 0,
        }),
      );
    }
    expect(onCommand).toHaveBeenCalledTimes(1);
    const dropped = (onCommand.mock.lastCall?.[0] as Extract<Command, { type: 'set-positions' }>)
      .positions[0]!;
    await act(async () => {
      press(host, 'ArrowDown', { shiftKey: true });
      await Promise.resolve();
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender(<Harness onCommand={onCommand} project={withPatientAt(dropped.x, 200)} />);
      answer({ ok: true });
      await Promise.resolve();
    });
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand.mock.lastCall?.[0]).toEqual(movedTo(dropped.x, 210));
  });

  it('moves nothing when it cannot send commands, and the arrows still select', async () => {
    const { host, at } = await started();
    clickOn(host, at('patient'));
    expect(press(host, 'ArrowRight', { shiftKey: true })).toBe(false);
    expect(said()).toBe('');
    press(host, 'ArrowRight');
    expect(said()).toBe('WhatsApp channel, Chat channel, in Clinic booking, 2 relations.');
  });
});

describe('Moving with Shift and an arrow key, through the local program', () => {
  beforeEach(() => {
    FakeWebSocket.created = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  it('sends one move a press, each once the one before came back', async () => {
    const program = await openApp();
    clickOn(program.host, program.at('patient'));
    press(program.host, 'ArrowRight', { shiftKey: true });
    expect(program.commands()).toEqual([movedTo(50, 200)]);

    await program.answer();
    press(program.host, 'ArrowDown', { shiftKey: true });
    expect(program.commands().at(-1)).toEqual(movedTo(50, 210));

    // A press made before the move comes back waits for it; a held key's repeats do not.
    press(program.host, 'ArrowLeft', { shiftKey: true });
    press(program.host, 'ArrowLeft', { shiftKey: true, repeat: true });
    expect(program.commands()).toHaveLength(2);
    await program.answer();
    expect(program.commands()).toHaveLength(3);
    expect(program.commands().at(-1)).toEqual(movedTo(40, 210));
    await program.answer();
    expect(program.commands()).toHaveLength(3);
  });

  it('moves what was selected when the key was pressed', async () => {
    const program = await openApp();
    clickOn(program.host, program.at('patient'));
    press(program.host, 'ArrowRight', { shiftKey: true });
    press(program.host, 'ArrowDown', { shiftKey: true });
    clickOn(program.host, program.at('clinic-booking/booking-agent'));
    await program.answer();
    expect(program.commands()).toEqual([movedTo(50, 200), movedTo(50, 210)]);
    // A change made elsewhere sends nothing more.
    await program.changeElsewhere({
      type: 'update-element',
      id: 'appointments-api',
      changes: { name: 'Bookings API' },
    });
    await program.answer();
    expect(program.commands()).toHaveLength(2);
  });
});

/**
 * The app open on the sample, with the canvas started; `answer` plays the local program, answering
 * the oldest command not answered yet as it does: one change, carrying the request's id.
 */
async function openApp() {
  render(<App token="s3cr3t" />);
  const socket = FakeWebSocket.created[0] as FakeWebSocket;
  let project = sample;
  let answered = 0;
  await act(async () => {
    socket.accept();
    socket.receive(
      encodeServerMessage({
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project,
        history: {},
      }),
    );
    await Promise.resolve();
  });
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const app = FakeApplication.created.at(-1) as FakeApplication;
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  const camera = fitCamera(buildScene(sample, VIEW).bounds, SIZE, 32);
  const sent = () =>
    socket.sent.flatMap((message) => (message.type === 'command' ? [message] : []));
  const deliver = async (command: Command, requestId?: string) => {
    const outcome = executeCommand(project, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    project = outcome.state;
    // The live connection applies the change, and React draws it, before the request's answer
    // reaches the canvas, as in a browser.
    await act(() => {
      socket.receive(
        encodeServerMessage({
          type: 'project/changed',
          operations: outcome.operations,
          kind: 'do',
          label: outcome.label,
          author: requestId === undefined ? 'claude' : 'user',
          history: {},
          ...(requestId === undefined ? {} : { requestId }),
          warnings: [],
          created: outcome.created,
        }),
      );
      return Promise.resolve();
    });
  };
  return {
    host,
    at: (key: string) => {
      const shape = buildScene(sample, VIEW).shapes.find((each) => each.key === key);
      if (!shape) throw new Error(key);
      return worldToScreen(camera, centerOf(shape.rect));
    },
    commands: (): Command[] => sent().map((message) => message.command),
    async answer() {
      const message = sent()[answered];
      if (!message) return;
      answered += 1;
      await deliver(message.command, message.requestId);
    },
    changeElsewhere: (command: Command) => deliver(command),
  };
}

/** The command that pins the Patient at a place in World. */
function movedTo(x: number, y: number): Command {
  return {
    type: 'set-positions',
    view: VIEW,
    positions: [{ element: 'patient', x, y, pinned: true }],
  };
}

/** The sample with the shapes inside Scheduling dragged up and out of it, above it. */
function withSchedulingContentsMovedUp(project: ProjectSnapshot, by: number): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) => ({
      ...view,
      positions: view.positions.map((position) =>
        position.container === 'scheduling' ? { ...position, y: position.y - by } : position,
      ),
    })),
  };
}

/**
 * The sample with relations between relations: one relating the API's reading of the database to
 * its writing, and one relating that relation to the reading.
 */
function withRelationsOnRelations(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        {
          id: 'reads-and-writes',
          relationType: RELATES_TO_ID,
          from: 'api-writes-db',
          to: 'api-reads-db',
        },
        {
          id: 'about-reading',
          relationType: RELATES_TO_ID,
          from: 'reads-and-writes',
          to: 'api-reads-db',
        },
      ],
    },
  };
}

/** The sample with the Patient moved, as the local program sends it back after a move. */
function withPatientAt(x: number, y: number): ProjectSnapshot {
  return {
    ...sample,
    views: sample.views.map((view) => ({
      ...view,
      positions: view.positions.map((position) =>
        position.element === 'patient' ? { ...position, x, y } : position,
      ),
    })),
  };
}
