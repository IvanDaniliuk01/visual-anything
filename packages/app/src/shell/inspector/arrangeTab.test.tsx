/**
 * The format panel's Arrange tab (ADR 0088, A6.3): a shape's width, height, place, turn, mirroring
 * and pinning, for one shape or several, each change one action that pins what it sets, mixed values
 * shown, and turning refused, saying why, for a container.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { arrangeCommand, arrangeValues, normalized } from '../../canvas/arrange';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene, type ElementShape } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf, type Selectable } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { Inspector } from '../Inspector';

const VIEW = 'system-overview';
const ELEMENT = 'appointments-api';
const sample = loadSample();

function Harness({
  project,
  selected,
  send,
}: {
  project: ProjectSnapshot;
  selected: Selectable[];
  send: SendCommand;
}) {
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views.find((each) => each.id === VIEW);
  const scene = useMemo(() => buildScene(project, VIEW), [project]);
  const editor: Editor = {
    project,
    definitions,
    viewId: VIEW,
    scene,
    selection: selectionOf(selected),
    select: vi.fn(),
    send,
    reveal: vi.fn(),
  };
  return (
    <EditorContext.Provider value={editor}>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </EditorContext.Provider>
  );
}

const element = (id: string): Selectable => ({ kind: 'element', id });

function arranged(selected: Selectable[], project = sample) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(<Harness project={project} selected={selected} send={send} />);
  const appearance = screen.getByRole('region', { name: /^Appearance/ });
  fireEvent.click(within(appearance).getByRole('tab', { name: 'Arrange' }));
  return { send, appearance };
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function enter(control: HTMLElement, value: string): Promise<void> {
  fireEvent.change(control, { target: { value } });
  await settle(() => fireEvent.keyDown(control, { key: 'Enter' }));
}

function shapeOf(element: string, project = sample): ElementShape {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape;
}

/** The positions of the one `set-positions` a command holds. */
function positionsIn(command: Command | undefined) {
  if (command?.type !== 'batch') throw new Error('Not a batch');
  expect(command.commands).toHaveLength(1);
  const [only] = command.commands;
  if (only?.type !== 'set-positions') throw new Error('Not set-positions');
  return only.positions;
}

describe('the Arrange tab', () => {
  it('shows the shape’s size, place and turn, and sets the width in one pinned action', async () => {
    const shape = shapeOf(ELEMENT);
    const { send, appearance } = arranged([element(ELEMENT)]);
    const width = within(appearance).getByRole('spinbutton', { name: 'Width' });
    expect(width).toHaveValue(shape.rect.width);
    expect(within(appearance).getByRole('spinbutton', { name: 'Height' })).toHaveValue(
      shape.rect.height,
    );
    expect(within(appearance).getByRole('spinbutton', { name: 'From the left' })).toHaveValue(
      shape.offset.x,
    );
    expect(within(appearance).getByRole('spinbutton', { name: 'Turn (degrees)' })).toHaveValue(0);

    await enter(width, '300');
    const [command] = sent(send);
    expect(send).toHaveBeenCalledTimes(1);
    const [position] = positionsIn(command);
    expect(position).toMatchObject({
      element: ELEMENT,
      x: shape.offset.x,
      y: shape.offset.y,
      width: 300,
      pinned: true,
    });
    expect(executeCommand(sample, command as Command).ok).toBe(true);
  });

  it('keeps the proportions when asked', async () => {
    const shape = shapeOf(ELEMENT);
    const { send, appearance } = arranged([element(ELEMENT)]);
    fireEvent.click(within(appearance).getByRole('checkbox', { name: 'Keep proportions' }));
    await enter(
      within(appearance).getByRole('spinbutton', { name: 'Width' }),
      String(shape.rect.width * 2),
    );
    const [position] = positionsIn(sent(send)[0]);
    expect(position?.height).toBe(shape.rect.height * 2);
  });

  it('turns by a quarter, mirrors, and sets a turn in degrees, each one action', async () => {
    const { send, appearance } = arranged([element(ELEMENT)]);
    await settle(() =>
      fireEvent.click(within(appearance).getByRole('button', { name: 'Turn 90°' })),
    );
    const mirror = within(appearance).getByRole('button', { name: 'Mirror horizontally' });
    expect(mirror).toHaveAttribute('aria-pressed', 'false');
    await settle(() => fireEvent.click(mirror));
    await enter(within(appearance).getByRole('spinbutton', { name: 'Turn (degrees)' }), '-45');
    const commands = sent(send);
    expect(commands).toHaveLength(3);
    expect(positionsIn(commands[0])[0]).toMatchObject({ rotation: 90, pinned: true });
    expect(positionsIn(commands[1])[0]).toMatchObject({ flip: 'horizontal' });
    expect(positionsIn(commands[2])[0]).toMatchObject({ rotation: 315 });
  });

  it('shows a turned shape’s turn and mirroring', () => {
    const shape = shapeOf(ELEMENT);
    const project = executeCommand(sample, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        {
          element: ELEMENT,
          ...(shape.container === undefined ? {} : { container: shape.container }),
          x: shape.offset.x,
          y: shape.offset.y,
          rotation: 30,
          flip: 'both',
          pinned: true,
        },
      ],
    });
    if (!project.ok) throw new Error('refused');
    const { appearance } = arranged([element(ELEMENT)], project.state);
    expect(within(appearance).getByRole('spinbutton', { name: 'Turn (degrees)' })).toHaveValue(30);
    expect(within(appearance).getByRole('button', { name: 'Mirror vertically' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(appearance).getByRole('button', { name: 'Pinned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('refuses to turn a container, saying why', () => {
    const container = buildScene(sample, VIEW).shapes.find((each) => each.holdsContents);
    if (!container) throw new Error('No container');
    const { appearance } = arranged([element(container.element)]);
    const turn = within(appearance).getByRole('button', { name: 'Turn 90°' });
    expect(turn).toBeDisabled();
    expect(turn).toHaveAccessibleDescription(/never turned or mirrored/);
    expect(within(appearance).getByRole('spinbutton', { name: 'Turn (degrees)' })).toBeDisabled();
    expect(within(appearance).getByRole('spinbutton', { name: 'Width' })).toBeEnabled();
  });

  it('sets each of several shapes, shows what they do not share as mixed, and pins them', async () => {
    const shapes = buildScene(sample, VIEW).shapes.filter(
      (each) => !each.holdsContents && each.row === undefined && each.container === 'scheduling',
    );
    expect(shapes.length).toBeGreaterThan(1);
    const [a, b] = shapes as [ElementShape, ElementShape];
    const { send, appearance } = arranged([element(a.element), element(b.element)]);
    const left = within(appearance).getByRole('spinbutton', { name: 'From the left' });
    const top = within(appearance).getByRole('spinbutton', { name: 'From the top' });
    expect(a.offset.x !== b.offset.x || a.offset.y !== b.offset.y).toBe(true);
    const differs = a.offset.x !== b.offset.x ? left : top;
    expect(differs).toHaveValue(null);
    expect(differs).toHaveAttribute('placeholder', 'Mixed');
    await enter(left, '48');
    const positions = positionsIn(sent(send)[0]);
    expect(positions).toHaveLength(2);
    for (const position of positions) expect(position).toMatchObject({ x: 48, pinned: true });
  });

  it('unpins a pinned shape, its place kept', async () => {
    const shape = shapeOf(ELEMENT);
    const command = arrangeCommand(VIEW, [shape], { kind: 'pinned', value: true });
    const done = executeCommand(sample, command as Command);
    if (!done.ok) throw new Error('refused');
    const { send, appearance } = arranged([element(ELEMENT)], done.state);
    await settle(() => fireEvent.click(within(appearance).getByRole('button', { name: 'Pinned' })));
    const [position] = positionsIn(sent(send)[0]);
    expect(position?.pinned).toBeUndefined();
    expect(position).toMatchObject({ x: shape.offset.x, y: shape.offset.y });
  });
});

describe('the Arrange numbers', () => {
  it('keeps turns from 0 up to 360', () => {
    expect(normalized(-90)).toBe(270);
    expect(normalized(450)).toBe(90);
    expect(normalized(360)).toBe(0);
  });

  it('sends nothing for a change that changes nothing on a pinned shape', () => {
    const shape = { ...shapeOf(ELEMENT), positioned: 'pinned' as const };
    expect(arrangeCommand(VIEW, [shape], { kind: 'x', value: shape.offset.x })).toBeUndefined();
    expect(arrangeValues([shape]).pinned).toEqual({ mixed: false, value: true });
  });

  it('turns no container', () => {
    const container = buildScene(sample, VIEW).shapes.find((each) => each.holdsContents);
    if (!container) throw new Error('No container');
    expect(arrangeCommand(VIEW, [container], { kind: 'turn' })).toBeUndefined();
  });
});
