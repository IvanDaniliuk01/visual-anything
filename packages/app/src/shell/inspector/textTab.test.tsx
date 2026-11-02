/**
 * The format panel's Text tab (ADR 0088, A6.2): every part of how one element, its component or
 * several elements write their names, each change one command, mixed values, and the hints of a text
 * color that reads poorly.
 */
import {
  definitionsIn,
  drawnColorsOf,
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
import {
  TEXT_ROWS,
  componentTextCommand,
  elementsTextCommand,
  storedChoice,
  textContrastHints,
  textValues,
} from './textTraits';
import { BASE_DRAWING } from '../../canvas/drawing';

const VIEW = 'system-overview';
const ELEMENT = 'appointments-api';
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

/** The inspector of a selection, on its Text tab. */
function textTab(selected: Selectable[], project = sample) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(<Harness project={project} selected={selected} send={send} />);
  const appearance = screen.getByRole('region', { name: /^Appearance/ });
  fireEvent.click(within(appearance).getByRole('tab', { name: 'Text' }));
  return { send, appearance };
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

const own = (text: Record<string, unknown>): Command => ({
  type: 'update-element',
  id: ELEMENT,
  changes: { appearanceTraits: { text } },
});

describe('the Text tab of one element', () => {
  it('shows every part, and keeps the detail, the badges and where its text sits', () => {
    const { appearance } = textTab([element(ELEMENT)]);
    for (const label of [
      'Font',
      'Text size',
      'Weight',
      'Italics',
      'Underline',
      'Alignment',
      'Where its name is written',
      'Text padding',
      'Long names',
      'Where its text sits',
    ]) {
      expect(within(appearance).getByLabelText(label)).toBeEnabled();
    }
    expect(
      within(appearance).getByRole('group', { name: 'Swatches for text color' }),
    ).toBeInTheDocument();
    expect(within(appearance).getByText('Detail')).toBeInTheDocument();
  });

  it('sets each part of its own, one command each', async () => {
    const { send, appearance } = textTab([element(ELEMENT)]);
    const get = (name: string) => within(appearance).getByLabelText(name);
    await choose(get('Font'), 'mono');
    await enter(get('Text size'), '20');
    await choose(get('Weight'), 'false');
    await choose(get('Italics'), 'true');
    await choose(get('Underline'), 'true');
    await choose(get('Alignment'), 'right');
    await choose(get('Where its name is written'), 'above');
    await choose(get('Long names'), 'false');
    await enter(get('Text padding'), '12');
    const swatches = within(appearance).getByRole('group', { name: 'Swatches for text color' });
    await settle(() =>
      fireEvent.click(within(swatches).getByRole('button', { name: 'Use Blue, #3E63DD' })),
    );
    expect(sent(send)).toEqual([
      own({ font: 'mono' }),
      own({ size: 20 }),
      own({ bold: false }),
      own({ italic: true }),
      own({ underline: true }),
      own({ align: 'right' }),
      own({ position: 'above' }),
      own({ wrap: false }),
      own({ padding: 12 }),
      own({ color: '#3E63DD' }),
    ]);
  });

  it('refuses a size out of range in words, and sends nothing', async () => {
    const { send, appearance } = textTab([element(ELEMENT)]);
    await enter(within(appearance).getByRole('spinbutton', { name: 'Text size' }), '60');
    expect(send).not.toHaveBeenCalled();
    expect(within(appearance).getByText('Write a number from 8 to 48.')).toBeInTheDocument();
  });

  it('takes a part back to the inherited value', async () => {
    const project = applied(sample, own({ size: 20, italic: true }));
    const { send, appearance } = textTab([element(ELEMENT)], project);
    const back = within(appearance).getByRole('button', {
      name: 'Use the inherited value for Text size',
    });
    await settle(() => fireEvent.click(back));
    expect(sent(send)).toEqual([own({ size: null })]);
  });

  it('sets every element of its component, taking the element’s own part back alone', async () => {
    const project = applied(sample, own({ size: 20, bold: true }));
    const { send, appearance } = textTab([element(ELEMENT)], project);
    fireEvent.click(within(appearance).getByRole('radio', { name: /^Every / }));
    await enter(within(appearance).getByRole('spinbutton', { name: 'Text size' }), '16');
    const component = project.model.elements.find((each) => each.id === ELEMENT)
      ?.component as string;
    expect(sent(send)).toEqual([
      componentTextCommand(
        project,
        component,
        'size',
        16,
        project.model.elements.find((each) => each.id === ELEMENT),
      ),
    ]);
    const [command] = sent(send);
    expect(command?.type).toBe('batch');
    if (command?.type === 'batch') {
      expect(command.commands[1]).toEqual(own({ size: null }));
    }
  });

  it('points out a text color that reads poorly on its fill, never refusing it', () => {
    const project = applied(sample, {
      type: 'update-element',
      id: ELEMENT,
      changes: { appearanceTraits: { fill: '#FFFFFF', text: { color: '#F2F2F2' } } },
    });
    const { appearance } = textTab([element(ELEMENT)], project);
    expect(
      within(appearance).getByText(/Its text reads poorly on its fill on the light canvas/),
    ).toBeInTheDocument();
  });
});

describe('the Text tab of several elements', () => {
  const two = [element(ELEMENT), element('reminder-service')];

  it('shows a value they do not share as mixed, and sets it on all of them in one action', async () => {
    const project = applied(sample, own({ size: 20 }));
    const { send, appearance } = textTab(two, project);
    const size = within(appearance).getByRole('spinbutton', { name: 'Text size' });
    expect(size).toHaveValue(null);
    expect(size).toHaveAttribute('placeholder', 'Mixed');
    await enter(size, '18');
    const [command] = sent(send);
    expect(command).toEqual({
      type: 'batch',
      label: 'Change the text of 2 shapes',
      commands: [
        own({ size: 18 }),
        {
          type: 'update-element',
          id: 'reminder-service',
          changes: { appearanceTraits: { text: { size: 18 } } },
        },
      ],
    });
  });

  it('shows a value they share', () => {
    const { appearance } = textTab(two);
    expect(within(appearance).getByRole('combobox', { name: 'Alignment' })).toHaveValue('center');
  });
});

describe('the Text traits', () => {
  it('read what is drawn where no appearance sets a part', () => {
    const values = textValues({ text: {} } as never, BASE_DRAWING, '#FFFFFF');
    expect(values).toMatchObject({
      font: BASE_DRAWING.text.font,
      size: BASE_DRAWING.text.nameSize,
      bold: true,
      italic: false,
      underline: false,
      align: 'center',
      position: 'inside',
      wrap: true,
      padding: BASE_DRAWING.text.padding,
      background: undefined,
    });
    expect(values.color).toMatch(/^#/);
    expect(TEXT_ROWS.map((row) => row.part)).toEqual([
      'font',
      'size',
      'bold',
      'italic',
      'underline',
      'align',
      'position',
      'color',
      'background',
      'border',
      'wrap',
      'padding',
    ]);
    expect(storedChoice('wrap', 'false')).toBe(false);
    expect(storedChoice('align', 'left')).toBe('left');
  });

  it('hint on the background when there is one, on either canvas, adapted on the dark one when asked', () => {
    const colors = {
      light: { fill: '#FFFFFF', stroke: '#000000' },
      dark: { fill: '#1F2933', stroke: '#FFFFFF' },
    };
    expect(textContrastHints(colors, {}, 'as-stored')).toEqual([]);
    expect(textContrastHints(colors, { color: '#000000' }, 'as-stored')).toEqual([
      expect.stringMatching(/fill on the dark canvas/),
    ]);
    expect(
      textContrastHints(colors, { color: '#777777', background: '#7D7D7D' }, 'as-stored'),
    ).toHaveLength(2);
    expect(
      textContrastHints(colors, { color: '#000000', background: '#FFFFFF' }, 'as-stored'),
    ).toEqual([]);
  });

  it('make one command for one element, and a batch for several', () => {
    const elements = sample.model.elements.slice(0, 3);
    expect(elementsTextCommand([], 'bold', true)).toBeUndefined();
    expect(elementsTextCommand(elements.slice(0, 1), 'bold', true)?.type).toBe('update-element');
    const batch = elementsTextCommand(elements, 'bold', true);
    expect(batch).toMatchObject({ type: 'batch', label: 'Change the text of 3 shapes' });
    // The colors the hints read are the drawn ones.
    expect(drawnColorsOf(elements[0] as never, definitionsIn(sample), 'light').fill).toMatch(/^#/);
  });
});
