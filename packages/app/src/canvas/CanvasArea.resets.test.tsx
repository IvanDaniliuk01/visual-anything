/**
 * Getting back to automatic routes, from the keys (ADR 0092 §1): Alt+Shift+R resets the routes of the
 * selected lines and of the selected shapes' lines, saying what it did or why it did nothing, as the
 * shape's menu does; Ctrl+Shift+E selects the selected shapes' lines, or every line; a dragged box
 * takes the lines wholly inside it; and Alt+Shift+L presses Layout.
 */
import {
  executeCommand,
  type Command,
  type ProjectSnapshot,
  type ResetRouteCommand,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf, type Selectable, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { resetPreferencesForTests } from '../theme/store';
import { fitCamera, worldToScreen } from './camera';
import { CanvasArea, type SendCommand } from './CanvasArea';
import type { Point } from './geometry';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const sample = loadSample();
const VIEW = 'system-overview';
const SIZE = { width: 1000, height: 600 };

function run(project: ProjectSnapshot, ...commands: Command[]): ProjectSnapshot {
  let state = project;
  for (const command of commands) {
    const outcome = executeCommand(state, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    state = outcome.state;
  }
  return state;
}

/** The agent's call to the API attached by hand, and the DB's read drawn curved. */
const routed = run(
  sample,
  {
    type: 'set-route',
    view: VIEW,
    relation: 'agent-to-api',
    to: { kind: 'border', side: 'top', at: 0.5 },
  },
  { type: 'set-route', view: VIEW, relation: 'api-reads-db', style: 'curved' },
);

const elements = (...ids: string[]): Selection =>
  selectionOf(ids.map((id): Selectable => ({ kind: 'element', id })));

/** The selection the canvas area last chose. */
let chosen: Selection = EMPTY_SELECTION;

function Harness(props: { project: ProjectSnapshot; onCommand?: SendCommand; initial: Selection }) {
  const [selection, setSelection] = useState<Selection>(props.initial);
  const view = props.project.views.find((each) => each.id === VIEW)!;
  const scene = useMemo(() => buildScene(props.project, VIEW), [props.project]);
  return (
    <CanvasArea
      project={props.project}
      view={view}
      scene={scene}
      label="System overview"
      selection={selection}
      onSelect={(next) => {
        chosen = next;
        setSelection(next);
      }}
      {...(props.onCommand ? { onCommand: props.onCommand } : {})}
    />
  );
}

async function started(
  initial: Selection,
  onCommand?: SendCommand,
  project: ProjectSnapshot = routed,
) {
  render(<Harness project={project} initial={initial} {...(onCommand ? { onCommand } : {})} />);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  const camera = fitCamera(buildScene(project, VIEW).bounds, SIZE, 32);
  return { host, on: (point: Point) => worldToScreen(camera, point) };
}

function point(type: string, host: HTMLElement, at: Point) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: at.x,
    clientY: at.y,
    button: 0,
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
const said = () => screen.getByRole('status', { name: 'Selection' });

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  chosen = EMPTY_SELECTION;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  act(() => resetPreferencesForTests());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Alt+Shift+R', () => {
  it('resets the routes of the selected shapes’ lines, in one action, and says so', async () => {
    const onCommand = accepted();
    const { host } = await started(elements('scheduling'), onCommand);
    await act(async () => {
      fireEvent.keyDown(host, { key: 'R', code: 'KeyR', altKey: true, shiftKey: true });
      await Promise.resolve();
    });
    await answers();
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.lastCall?.[0]).toEqual({
      type: 'reset-route',
      view: VIEW,
      relations: ['agent-to-api', 'api-reads-db'],
    } satisfies ResetRouteCommand);
    expect(said()).toHaveTextContent('Reset 2 routes.');
  });

  it('works by the key’s place, as ⌥⇧R types another letter on Apple keyboards', async () => {
    const onCommand = accepted();
    const { host } = await started(
      selectionOf([{ kind: 'relation', id: 'api-reads-db' }]),
      onCommand,
    );
    await act(async () => {
      fireEvent.keyDown(host, { key: '‰', code: 'KeyR', altKey: true, shiftKey: true });
      await Promise.resolve();
    });
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({ relations: ['api-reads-db'] });
  });

  it('says why it does nothing, and leaves Shift+R to the rulers', async () => {
    const onCommand = accepted();
    const { host } = await started(elements('patient'), onCommand);
    act(() => {
      fireEvent.keyDown(host, { key: 'R', code: 'KeyR', altKey: true, shiftKey: true });
    });
    expect(onCommand).not.toHaveBeenCalled();
    expect(said()).toHaveTextContent('Each of these lines is routed automatically already.');
    act(() => {
      fireEvent.keyDown(host, { key: 'R', code: 'KeyR', shiftKey: true });
    });
    expect(said()).toHaveTextContent(/rulers/);
  });

  it('is offered in the shape’s menu, with Attach ends automatically', async () => {
    const onCommand = accepted();
    const { host } = await started(elements('scheduling'), onCommand);
    act(() => {
      fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    });
    const menu = screen.getByRole('menu', { name: 'Scheduling' });
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Attach ends automatically' }));
      await Promise.resolve();
    });
    await answers();
    expect(onCommand.mock.lastCall?.[0]).toMatchObject({
      type: 'batch',
      commands: [{ type: 'set-route', relation: 'agent-to-api', to: null }],
    });
    expect(said()).toHaveTextContent('Attached the ends of 1 line automatically.');
  });
});

describe('Ctrl+Shift+E', () => {
  it('selects the lines of the selected shapes', async () => {
    const { host } = await started(elements('appointments-db'), accepted());
    act(() => {
      fireEvent.keyDown(host, { key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true });
    });
    expect([...chosen.relations]).toEqual(['api-reads-db', 'api-writes-db']);
    expect(chosen.elements.size).toBe(0);
  });

  it('selects every line when nothing is selected', async () => {
    const { host } = await started(EMPTY_SELECTION, accepted());
    act(() => {
      fireEvent.keyDown(host, { key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true });
    });
    expect(chosen.relations.size).toBe(buildScene(routed, VIEW).relations.length);
  });
});

describe('a dragged box', () => {
  it('takes the lines wholly inside it with the shapes', async () => {
    const { host, on } = await started(EMPTY_SELECTION, accepted());
    const bounds = buildScene(routed, VIEW).bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    point('pointerdown', host, on({ x: bounds.x - 20, y: bounds.y - 20 }));
    point('pointermove', host, on({ x: bounds.x + bounds.width / 2, y: bounds.y }));
    point(
      'pointermove',
      host,
      on({ x: bounds.x + bounds.width + 20, y: bounds.y + bounds.height + 20 }),
    );
    act(() => {
      point(
        'pointerup',
        host,
        on({ x: bounds.x + bounds.width + 20, y: bounds.y + bounds.height + 20 }),
      );
    });
    expect([...chosen.relations]).toEqual([
      'patient-to-whatsapp',
      'whatsapp-to-agent',
      'agent-to-api',
      'api-reads-db',
      'api-writes-db',
      'api-to-reminders',
    ]);
    expect(chosen.elements.has('patient')).toBe(true);
  });
});

describe('Alt+Shift+L', () => {
  it('presses Layout, which says why it cannot lay out while nothing can change', async () => {
    const { host } = await started(EMPTY_SELECTION);
    const layout = screen.getByRole('button', { name: /Layout/ });
    expect(layout).toHaveAttribute('aria-keyshortcuts', 'Alt+Shift+L');
    act(() => {
      fireEvent.keyDown(host, { key: 'L', code: 'KeyL', altKey: true, shiftKey: true });
    });
    expect(said()).toHaveTextContent(layout.getAttribute('title') ?? '—');
  });
});
