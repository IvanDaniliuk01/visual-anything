/**
 * Bend points snap to the grid while it shows and snapping is on, as hand moves do (ADR 0039, A3): a
 * dragged bend point lands on a multiple of 8 canvas units in the frame its route's bend points are
 * kept in, unless a neighbour's x or y is within reach, which keeps a run straight; Alt places it
 * freely; and Shift with an arrow key takes it to the next grid line.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../../test/FakeApplication';
import { loadSample } from '../../test/sample';
import { worldToScreen } from '../camera';
import { CanvasController } from '../controller';
import type { Point } from '../geometry';
import { indexScene } from '../hit';
import { buildScene, relationLinesOf, type RelationLine } from '../scene';
import { handlesOf } from './handles';
import { snapBend } from './snap';

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

describe('snapBend on the grid', () => {
  const grid = { origin: { x: 100, y: 40 }, step: 8 };

  it('lands on a multiple of the step in the frame, and says it was not kept as it is', () => {
    expect(snapBend({ x: 213, y: 97 }, [], 1, false, grid)).toEqual({
      at: { x: 212, y: 96 },
      snapped: { x: false, y: false },
    });
  });

  it('takes a neighbour’s x or y within reach first, so that runs stay straight', () => {
    const snapped = snapBend({ x: 213, y: 97 }, [{ x: 215, y: 0 }], 1, false, grid);
    expect(snapped).toEqual({ at: { x: 215, y: 96 }, snapped: { x: true, y: false } });
  });

  it('places it freely with Alt, and leaves it to its neighbours without a grid', () => {
    expect(snapBend({ x: 213, y: 97 }, [], 1, true, grid).at).toEqual({ x: 213, y: 97 });
    expect(snapBend({ x: 213, y: 97 }, [], 1, false).at).toEqual({ x: 213, y: 97 });
  });
});

function point(type: string, host: HTMLElement, at: Point, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: at.x,
    clientY: at.y,
    button: 0,
    ...extra,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(host, event);
}

function dragOn(host: HTMLElement, from: Point, to: Point, extra: Record<string, unknown> = {}) {
  point('pointerdown', host, from, extra);
  for (const step of [0.25, 0.5, 1]) {
    point(
      'pointermove',
      host,
      { x: from.x + (to.x - from.x) * step, y: from.y + (to.y - from.y) * step },
      extra,
    );
  }
  point('pointerup', host, to, extra);
}

/** A canvas showing a project with one relation selected, with the grid and snapping as given. */
async function canvasWith(project: ProjectSnapshot, relation: string, grid: boolean) {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
  const sent: Command[] = [];
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
    failure: () => undefined,
    announce: () => undefined,
  });
  const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  controller.setGrid({ grid, snapToGrid: true, rulers: false });
  const indexed = indexScene(buildScene(project, VIEW));
  controller.update(project, VIEW, indexed, true);
  controller.setSelection(selectionOf([{ kind: 'relation', id: relation }]));
  const line = relationLinesOf(indexed.scene).get(relation) as RelationLine;
  const on = (world: Point) => worldToScreen(controller.camera, world);
  return { host, controller, sent, line, on };
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

const straight = run(sample, {
  type: 'set-route',
  view: VIEW,
  relation: 'api-to-reminders',
  style: 'straight',
});

/** The bend points a drag sent, relative to their frame. */
function bendsOf(sent: Command[]): Point[] {
  const [command] = sent as [Extract<Command, { type: 'set-route' }>];
  expect(command?.type).toBe('set-route');
  return command.bendPoints ?? [];
}

describe('dragging a bend point while the grid shows', () => {
  it('stores it on a multiple of 8 in its frame', async () => {
    const { host, sent, line, on } = await canvasWith(straight, 'api-to-reminders', true);
    const [, middle] = handlesOf(line, 1);
    const target = { x: (middle?.at.x ?? 0) + 37, y: (middle?.at.y ?? 0) + 61 };
    dragOn(host, on(middle?.at as Point), on(target));
    const [bend] = bendsOf(sent);
    expect((bend?.x ?? 1) % 8).toBe(0);
    expect((bend?.y ?? 1) % 8).toBe(0);
  });

  it('places it freely with Alt', async () => {
    const { host, sent, line, on } = await canvasWith(straight, 'api-to-reminders', true);
    const [, middle] = handlesOf(line, 1);
    const target = { x: (middle?.at.x ?? 0) + 37, y: (middle?.at.y ?? 0) + 61 };
    dragOn(host, on(middle?.at as Point), on(target), { altKey: true });
    const [bend] = bendsOf(sent);
    expect([(bend?.x ?? 0) % 8, (bend?.y ?? 0) % 8]).not.toEqual([0, 0]);
  });

  it('does not snap to the grid while the grid is hidden', async () => {
    const { host, sent, line, on } = await canvasWith(straight, 'api-to-reminders', false);
    const [, middle] = handlesOf(line, 1);
    const target = { x: (middle?.at.x ?? 0) + 37, y: (middle?.at.y ?? 0) + 61 };
    dragOn(host, on(middle?.at as Point), on(target));
    const [bend] = bendsOf(sent);
    expect([(bend?.x ?? 0) % 8, (bend?.y ?? 0) % 8]).not.toEqual([0, 0]);
  });
});

describe('moving a bend point from the keyboard while the grid shows', () => {
  it('takes it to the next grid line with Shift and an arrow key, and by 1 without', async () => {
    const bent = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-to-reminders',
      bendPoints: [{ x: 203, y: 301 }],
      style: 'straight',
    });
    const { host, controller, sent } = await canvasWith(bent, 'api-to-reminders', true);
    expect(controller.editRoute('api-to-reminders')).toBe(true);
    // Start, the first middle, then the bend point.
    fireEvent.keyDown(host, { key: 'Tab' });
    fireEvent.keyDown(host, { key: 'Tab' });
    fireEvent.keyDown(host, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(host, { key: 'ArrowDown' });
    fireEvent.keyDown(host, { key: 'Enter' });
    expect(sent).toEqual([
      {
        type: 'set-route',
        view: VIEW,
        relation: 'api-to-reminders',
        bendPoints: [{ x: 208, y: 302 }],
      },
    ]);
  });
});
