/**
 * The format panel (ADR 0088, A6.1): its tabs, and its Style tab for one element, a component, the
 * project's default, several items at once and a relation, each change one command.
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
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf, type Selectable } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { Inspector } from '../Inspector';

const VIEW = 'system-overview';
const sample = loadSample();

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

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

function shown(selected: Selectable[], project = sample) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const view = render(<Harness project={project} selected={selected} send={send} />);
  const appearance = screen.getByRole('region', { name: /^Appearance/ });
  return { send, appearance, view };
}

const element = (id: string): Selectable => ({ kind: 'element', id });

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

async function choose(control: HTMLElement, value: string): Promise<void> {
  await settle(() => fireEvent.change(control, { target: { value } }));
}

describe('the format panel’s tabs', () => {
  it('shows Style, Text and Arrange for a shape in the view, and moves between them with the keys', () => {
    const { appearance } = shown([element('appointments-api')]);
    const tabs = within(appearance).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Style', 'Text', 'Arrange']);
    expect(within(appearance).getByRole('tablist', { name: 'Format' })).toBeInTheDocument();
    const [style, text, arrange] = tabs as [HTMLElement, HTMLElement, HTMLElement];
    expect(style).toHaveAttribute('aria-selected', 'true');
    expect(style).toHaveAttribute('tabindex', '0');
    expect(text).toHaveAttribute('tabindex', '-1');
    expect(within(appearance).getByRole('tabpanel')).toHaveAccessibleName('Style');

    fireEvent.keyDown(style, { key: 'ArrowRight' });
    expect(text).toHaveAttribute('aria-selected', 'true');
    expect(text).toHaveFocus();
    expect(within(appearance).getByText('Detail')).toBeInTheDocument();
    expect(within(appearance).getByRole('combobox', { name: 'Where its text sits' })).toBeEnabled();

    fireEvent.keyDown(text, { key: 'End' });
    expect(arrange).toHaveAttribute('aria-selected', 'true');
    expect(within(appearance).getByRole('region', { name: 'In this view' })).toBeInTheDocument();
    fireEvent.keyDown(arrange, { key: 'ArrowRight' });
    expect(style).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the next selection on the tab last chosen', () => {
    const { view } = shown([element('appointments-api')]);
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    view.unmount();
    shown([element('reminder-service')]);
    expect(screen.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');
  });

  it('puts a relation’s route in its Arrange tab', () => {
    const relation = sample.model.relations[0]?.id as string;
    const { appearance } = shown([{ kind: 'relation', id: relation }]);
    expect(
      within(appearance)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Style', 'Arrange']);
    fireEvent.click(within(appearance).getByRole('tab', { name: 'Arrange' }));
    expect(within(appearance).getByRole('region', { name: 'Route' })).toBeInTheDocument();
  });
});

describe('the Style tab of one element', () => {
  it('sets each trait of its own, one command each', async () => {
    const { send, appearance } = shown([element('appointments-api')]);
    await enter(within(appearance).getByLabelText('Border width'), '4');
    await choose(within(appearance).getByLabelText('Border dash'), 'dashed');
    await enter(within(appearance).getByLabelText('Corner radius'), '20');
    await enter(within(appearance).getByLabelText('Opacity (%)'), '50');
    await choose(within(appearance).getByLabelText('Shadow'), 'soft');
    await choose(within(appearance).getByRole('combobox', { name: 'Gradient' }), 'right');
    const traits = sent(send).map((command) =>
      command.type === 'update-element' ? command.changes.appearanceTraits : command.type,
    );
    expect(traits).toEqual([
      { borderWidth: 4 },
      { dash: 'dashed' },
      { cornerRadius: 20 },
      { opacity: 0.5 },
      { shadow: 'soft' },
      { gradient: { to: '#FFFFFF', direction: 'right' } },
    ]);
  });

  it('says where an unset trait comes from, and refuses a number out of its range', async () => {
    const { send, appearance } = shown([element('appointments-api')]);
    const width = within(appearance).getByLabelText('Border width');
    expect(width).toHaveAccessibleDescription(/from the drawing defaults/);
    await enter(width, '40');
    expect(within(appearance).getByText('Write a number from 0 to 16.')).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('offers the palette’s swatches first in its colors', async () => {
    const { send, appearance } = shown([element('appointments-api')]);
    const swatches = within(appearance).getByRole('group', { name: 'Swatches for fill' });
    expect(within(swatches).getAllByRole('button')).toHaveLength(12);
    await settle(() =>
      fireEvent.click(within(swatches).getByRole('button', { name: 'Use Red, #E5484D' })),
    );
    expect(sent(send)[0]).toMatchObject({
      type: 'update-element',
      changes: { appearanceTraits: { fill: '#E5484D' } },
    });
  });

  it('shows a gradient’s color, and points out a shape with no border that blends in', () => {
    const project = applied(sample, {
      type: 'update-element',
      id: 'appointments-api',
      changes: {
        appearanceTraits: {
          fill: '#FFFFFF',
          borderWidth: 0,
          gradient: { to: '#FCFCFC', direction: 'down' },
        },
      },
    });
    const { appearance } = shown([element('appointments-api')], project);
    expect(within(appearance).getByLabelText('Gradient color')).toHaveValue('#fcfcfc');
    expect(
      within(appearance).getByText(
        'Blends into the light canvas: it draws no border, and its fill does not reach 3:1 on it.',
      ),
    ).toBeInTheDocument();
  });

  it('sets a trait for every element of its component, taking back its own', async () => {
    const project = applied(sample, {
      type: 'update-element',
      id: 'appointments-api',
      changes: { appearanceTraits: { opacity: 0.6 } },
    });
    const { send, appearance } = shown([element('appointments-api')], project);
    fireEvent.click(within(appearance).getByRole('radio', { name: 'Every Service' }));
    await enter(within(appearance).getByLabelText('Opacity (%)'), '80');
    expect(sent(send)).toEqual([
      {
        type: 'batch',
        label: 'Change the appearance of the component "Service"',
        commands: [
          {
            type: 'set-component-appearance',
            component: 'systems.service',
            appearanceTraits: { opacity: 0.8 },
          },
          {
            type: 'update-element',
            id: 'appointments-api',
            changes: { appearanceTraits: { opacity: null } },
          },
        ],
      },
    ]);
  });

  it('makes its own style the project’s default', async () => {
    const plain = shown([element('appointments-api')]);
    expect(
      within(plain.appearance).getByRole('button', { name: 'Set as the project’s default' }),
    ).toBeDisabled();
    plain.view.unmount();
    const project = applied(sample, {
      type: 'update-element',
      id: 'appointments-api',
      changes: { appearanceTraits: { shadow: 'soft' } },
    });
    const { send, appearance } = shown([element('appointments-api')], project);
    await settle(() =>
      fireEvent.click(
        within(appearance).getByRole('button', { name: 'Set as the project’s default' }),
      ),
    );
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'essence',
        appearanceTraits: { shadow: 'soft' },
      },
    ]);
  });
});

describe('the Style tab of several items', () => {
  const project = applied(sample, {
    type: 'update-element',
    id: 'appointments-api',
    changes: { appearanceTraits: { opacity: 0.5, dash: 'dotted' } },
  });
  const both = [element('appointments-api'), element('reminder-service')];

  it('shows a value they do not share as mixed, and one they share as it is', () => {
    const { appearance } = shown(both, project);
    const opacity = within(appearance).getByLabelText('Opacity (%)');
    expect(opacity).toHaveValue(null);
    expect(opacity).toHaveAttribute('placeholder', 'Mixed');
    const dash = within(appearance).getByLabelText('Border dash');
    expect(dash).toHaveDisplayValue('Mixed');
    expect(within(appearance).getByLabelText('Shadow')).toHaveDisplayValue('No shadow');
  });

  it('sets a value on all of them in one action', async () => {
    const { send, appearance } = shown(both, project);
    await enter(within(appearance).getByLabelText('Opacity (%)'), '70');
    expect(sent(send)).toEqual([
      {
        type: 'batch',
        label: 'Change the style of 2 shapes',
        commands: [
          {
            type: 'update-element',
            id: 'appointments-api',
            changes: { appearanceTraits: { opacity: 0.7 } },
          },
          {
            type: 'update-element',
            id: 'reminder-service',
            changes: { appearanceTraits: { opacity: 0.7 } },
          },
        ],
      },
    ]);
  });

  it('sets lines’ traits on every relation selected, and arranges the shapes', async () => {
    const [first, second] = sample.model.relations as unknown as [{ id: string }, { id: string }];
    const { send, appearance } = shown([
      { kind: 'relation', id: first.id },
      { kind: 'relation', id: second.id },
      ...both,
    ]);
    await enter(within(appearance).getByLabelText('Line opacity (%)'), '40');
    expect(sent(send)[0]).toMatchObject({
      type: 'batch',
      label: 'Change the style of 2 lines',
    });
    fireEvent.click(within(appearance).getByRole('tab', { name: 'Arrange' }));
    expect(within(appearance).getByRole('group', { name: 'Stacking order' })).toBeInTheDocument();
    expect(within(appearance).getByRole('button', { name: 'Align left' })).toBeInTheDocument();
  });
});

describe('the Style tab of a relation', () => {
  it('sets its width, dash and opacity of its own', async () => {
    const relation = sample.model.relations[0]?.id as string;
    const { send, appearance } = shown([{ kind: 'relation', id: relation }]);
    await enter(within(appearance).getByLabelText('Width'), '3');
    await enter(within(appearance).getByLabelText('Opacity (%)'), '60');
    expect(sent(send)).toEqual([
      { type: 'update-relation', id: relation, changes: { appearanceTraits: { width: 3 } } },
      { type: 'update-relation', id: relation, changes: { appearanceTraits: { opacity: 0.6 } } },
    ]);
  });
});
