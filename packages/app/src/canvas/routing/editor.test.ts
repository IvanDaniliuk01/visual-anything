import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../../test/FakeApplication';
import { loadSample } from '../../test/sample';
import { worldToScreen } from '../camera';
import { CanvasController } from '../controller';
import { centerOf, type Point } from '../geometry';
import { indexScene } from '../hit';
import { buildScene, relationLinesOf, type RelationLine } from '../scene';
import { handlesOf } from './handles';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'system-overview';
const sample = loadSample();

function run(project: ProjectSnapshot, ...commands: Command[]): ProjectSnapshot {
  let state = project;
  for (const command of commands) {
    const outcome = executeCommand(state, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    state = outcome.state;
  }
  return state;
}

function point(type: string, host: HTMLElement, at: Point, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, clientX: at.x, clientY: at.y, button: 0, ...extra });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(host, event);
}

function key(host: HTMLElement, name: string, extra: Record<string, unknown> = {}) {
  fireEvent.keyDown(host, { key: name, ...extra });
}

/** A canvas showing a project with one relation selected, and what it sends and says. */
async function canvasWith(project: ProjectSnapshot, relation: string) {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
  const sent: Command[] = [];
  const said: string[] = [];
  const menus: { at: Point; relations: readonly string[] }[] = [];
  const controller = new CanvasController(host, {
    select: () => undefined,
    command: (command) => {
      sent.push(command);
      return Promise.resolve(true);
    },
    relate: () => undefined,
    remove: () => undefined,
    rename: () => undefined,
    camera: () => undefined,
    // jsdom draws no text: the labels the frames write fail, as the canvas reports.
    failure: () => undefined,
    announce: (text) => said.push(text),
    relationMenu: (at, relations) => menus.push({ at, relations }),
  });
  const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  const indexed = indexScene(buildScene(project, VIEW));
  controller.update(project, VIEW, indexed, true);
  controller.setSelection(selectionOf([{ kind: 'relation', id: relation }]));
  const line = relationLinesOf(indexed.scene).get(relation) as RelationLine;
  const on = (world: Point) => worldToScreen(controller.camera, world);
  const shapeOf = (element: string) =>
    indexed.scene.shapes.find((shape) => shape.element === element) as (typeof indexed.scene.shapes)[number];
  return { host, controller, sent, said, menus, line, on, shapeOf, indexed };
}

/** Drags from one point to another on screen, through a few moves. */
function dragOn(host: HTMLElement, from: Point, to: Point, extra: Record<string, unknown> = {}) {
  point('pointerdown', host, from, extra);
  for (const step of [0.25, 0.5, 1]) {
    point('pointermove', host, { x: from.x + (to.x - from.x) * step, y: from.y + (to.y - from.y) * step }, extra);
  }
  point('pointerup', host, to, extra);
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('dragging an end of the selected relation', () => {
  it('attaches it to a place on its own shape’s border', async () => {
    const { host, sent, line, on, shapeOf } = await canvasWith(sample, 'agent-to-api');
    const api = shapeOf('appointments-api').rect;
    dragOn(host, on(line.to), on({ x: api.x + api.width / 4, y: api.y + 1 }));
    expect(sent).toEqual([
      {
        type: 'set-route',
        view: VIEW,
        relation: 'agent-to-api',
        to: { kind: 'border', side: 'top', at: 0.25 },
      },
    ]);
  });

  it('reconnects the relation when dropped on another element', async () => {
    const { host, sent, line, on, shapeOf } = await canvasWith(sample, 'agent-to-api');
    dragOn(host, on(line.to), on(centerOf(shapeOf('reminder-service').rect)));
    expect(sent).toEqual([
      {
        type: 'batch',
        label: 'Reconnect "HTTPS" to "Reminder service"',
        commands: [{ type: 'update-relation', id: 'agent-to-api', changes: { to: 'reminder-service' } }],
      },
    ]);
  });

  it('sends nothing when let go over nothing, or where it was', async () => {
    const { host, sent, line, on, shapeOf } = await canvasWith(sample, 'agent-to-api');
    dragOn(host, on(line.to), { x: 2, y: 2 });
    dragOn(host, on(line.to), on(centerOf(shapeOf('appointments-api').rect)));
    expect(sent).toEqual([]);
  });
});

describe('bend points', () => {
  const straight = run(sample, {
    type: 'set-route',
    view: VIEW,
    relation: 'api-to-reminders',
    style: 'straight',
  });

  it('are added by dragging the middle of a segment, relative to the frame', async () => {
    const { host, sent, line, on, shapeOf } = await canvasWith(straight, 'api-to-reminders');
    const [, middle] = handlesOf(line, 1);
    const target = { x: (middle?.at.x ?? 0) + 3, y: (middle?.at.y ?? 0) + 60 };
    // With Alt, exactly where it is let go, not at a neighbour's x or y.
    dragOn(host, on(middle?.at as Point), on(target), { altKey: true });
    const scheduling = shapeOf('scheduling').rect;
    expect(sent).toHaveLength(1);
    const [command] = sent as [Extract<Command, { type: 'set-route' }>];
    expect(command.type).toBe('set-route');
    const [bend] = command.bendPoints ?? [];
    expect(bend?.x).toBeCloseTo(target.x - scheduling.x, 0);
    expect(bend?.y).toBeCloseTo(target.y - scheduling.y, 0);
  });

  it('are removed with a double-click, or chosen and deleted', async () => {
    const bent = run(straight, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-to-reminders',
      bendPoints: [{ x: 200, y: 300 }],
    });
    const { host, sent, line, on } = await canvasWith(bent, 'api-to-reminders');
    const bend = line.hand?.bendPoints[0] as Point;
    fireEvent.dblClick(host, { clientX: on(bend).x, clientY: on(bend).y });
    point('pointerdown', host, on(bend));
    point('pointerup', host, on(bend));
    key(host, 'Delete');
    expect(sent).toEqual([
      { type: 'set-route', view: VIEW, relation: 'api-to-reminders', bendPoints: null },
      { type: 'set-route', view: VIEW, relation: 'api-to-reminders', bendPoints: null },
    ]);
  });
});

describe('the relation’s menu', () => {
  it('opens with Shift+F10 on the selected relation', async () => {
    const { host, menus, line, on } = await canvasWith(sample, 'agent-to-api');
    key(host, 'F10', { shiftKey: true });
    expect(menus).toEqual([{ at: on(line.middle), relations: ['agent-to-api'] }]);
  });
});

describe('editing a route from the keyboard', () => {
  it('moves a handle with the arrow keys and applies it as one action', async () => {
    const bent = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-to-reminders',
      bendPoints: [{ x: 200, y: 300 }],
      style: 'straight',
    });
    const { host, controller, sent, said } = await canvasWith(bent, 'api-to-reminders');
    expect(controller.editRoute('api-to-reminders')).toBe(true);
    expect(said.at(-1)).toMatch(/^Editing the route of "Appointments API → Reminder service"/);
    // Start, the first middle, then the bend point.
    key(host, 'Tab');
    key(host, 'Tab');
    expect(said.at(-1)).toBe('Bend point 1 of 1');
    key(host, 'ArrowRight', { shiftKey: true });
    key(host, 'ArrowDown');
    expect(sent).toEqual([]);
    key(host, 'Enter');
    expect(sent).toEqual([
      {
        type: 'set-route',
        view: VIEW,
        relation: 'api-to-reminders',
        bendPoints: [{ x: 208, y: 301 }],
      },
    ]);
    expect(said.at(-1)).toBe('Route "Appointments API → Reminder service" by hand in "System overview"');
  });

  it('attaches an end automatically, and cancels with Escape', async () => {
    const attached = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'agent-to-api',
      to: { kind: 'border', side: 'top', at: 0.5 },
    });
    const { host, controller, sent } = await canvasWith(attached, 'agent-to-api');
    controller.editRoute('agent-to-api');
    key(host, 'Tab', { shiftKey: true });
    key(host, 'a');
    key(host, 'Escape');
    expect(sent).toEqual([]);
    controller.editRoute('agent-to-api');
    key(host, 'Tab', { shiftKey: true });
    key(host, 'a');
    key(host, 'Enter');
    expect(sent).toEqual([{ type: 'set-route', view: VIEW, relation: 'agent-to-api', to: null }]);
  });
});
