/**
 * The Drawing panel (A5.4, ADR 0086): each change is one `set-drawing-defaults` command for the
 * scope chosen, the project or the open view alone, that writes the layer's whole drawing; each value
 * says where it comes from, with a reset for it, for its group and for every value; it reads in
 * Spanish, and changes nothing while the project cannot be changed.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { Language } from '../../i18n/translate';
import { loadSample } from '../../test/sample';
import { DrawingPanel } from './DrawingPanel';

const sample = loadSample();
const VIEW = 'system-overview';

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

/** The sample with the project on Dense and a line width of 3, and the view's names at 20. */
const layered = run(
  run(sample, {
    type: 'set-drawing-defaults',
    drawing: { preset: 'dense', lines: { width: 3 } },
  }),
  { type: 'set-drawing-defaults', view: VIEW, drawing: { text: { nameSize: 20 } } },
);

function panelFor(
  project: ProjectSnapshot,
  { editable = true, language }: { editable?: boolean; language?: Language } = {},
) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: VIEW,
    scene: buildScene(project, VIEW),
    selection: EMPTY_SELECTION,
    select: () => undefined,
    send: editable ? send : undefined,
    reveal: () => undefined,
  };
  const panel = (
    <EditorContext.Provider value={editor}>
      <DrawingPanel />
    </EditorContext.Provider>
  );
  render(
    language === undefined ? (
      panel
    ) : (
      <LanguageProvider language={language}>{panel}</LanguageProvider>
    ),
  );
  return { send, sent: () => send.mock.calls.map(([command]) => command) };
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 3; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Opens a group's disclosure, as the person does. */
function openGroup(name: string): void {
  const summary = screen.getByText(name, { selector: 'summary > span' }).closest('summary');
  if (!summary) throw new Error(`No group ${name}.`);
  fireEvent.click(summary);
}

/** The row of a value: its control, its source and its reset. */
function rowOf(label: string): HTMLElement {
  const row = screen.getByLabelText(label).closest<HTMLElement>('.drawing-value');
  if (!row) throw new Error(`No value ${label}.`);
  return row;
}

describe('the Drawing panel', () => {
  it('writes a project’s value as its whole drawing, with no view', async () => {
    const { sent } = panelFor(sample);
    expect(screen.getByRole('radio', { name: 'This project' })).toBeChecked();
    expect(
      screen.getByText(/The project sets nothing of its own: it draws with Clean as built in/),
    ).toBeInTheDocument();
    openGroup('Lines');
    const width = screen.getByLabelText('Line width');
    expect(width).toHaveValue(1.25);
    expect(within(rowOf('Line width')).getByText('From Clean')).toBeInTheDocument();
    await settle(() => {
      fireEvent.change(width, { target: { value: '2.5' } });
      fireEvent.keyDown(width, { key: 'Enter' });
    });
    expect(sent()).toEqual([{ type: 'set-drawing-defaults', drawing: { lines: { width: 2.5 } } }]);
  });

  it('writes the open view’s drawing for “This view only”', async () => {
    const { sent } = panelFor(layered);
    fireEvent.click(screen.getByRole('radio', { name: 'This view only' }));
    openGroup('Grid');
    await settle(() =>
      fireEvent.change(screen.getByLabelText('Grid drawn as'), { target: { value: 'dots' } }),
    );
    expect(sent()).toEqual([
      {
        type: 'set-drawing-defaults',
        view: VIEW,
        drawing: { text: { nameSize: 20 }, grid: { look: 'dots' } },
      },
    ]);
    const done = run(layered, sent()[0] as Command);
    expect(done.views.find((each) => each.id === VIEW)?.drawing).toEqual({
      text: { nameSize: 20 },
      grid: { look: 'dots' },
    });
    expect(done.project.drawing).toEqual(layered.project.drawing);
  });

  it('turns a value that is yes or no on and off', async () => {
    const { sent } = panelFor(sample);
    openGroup('Aggregated relations');
    const grows = screen.getByRole('checkbox', {
      name: 'Thicker the more relations it stands for',
    });
    expect(grows).not.toBeChecked();
    await settle(() => fireEvent.click(grows));
    expect(sent()).toEqual([
      { type: 'set-drawing-defaults', drawing: { aggregated: { growsWithCount: true } } },
    ]);
  });

  it('says where each value comes from, in the project’s scope', () => {
    panelFor(layered);
    openGroup('Lines');
    openGroup('Text');
    expect(within(rowOf('Line width')).getByText('From the project')).toBeInTheDocument();
    expect(
      within(rowOf('Line width')).getByRole('button', { name: 'Reset “Line width”' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Line width')).toHaveValue(3);
    const names = rowOf('Size of names');
    expect(within(names).getByText('From Dense')).toBeInTheDocument();
    expect(within(names).queryByRole('button')).toBeNull();
    expect(within(names).getByText(/“System overview” sets its own\./)).toBeInTheDocument();
    expect(within(rowOf('Preset')).getByText('From the project')).toBeInTheDocument();
    expect(screen.getByLabelText('Preset')).toHaveValue('dense');
  });

  it('says where each value comes from, in the view’s scope', () => {
    panelFor(layered);
    fireEvent.click(screen.getByRole('radio', { name: 'This view only' }));
    openGroup('Lines');
    openGroup('Text');
    expect(within(rowOf('Size of names')).getByText('This view’s')).toBeInTheDocument();
    expect(screen.getByLabelText('Size of names')).toHaveValue(20);
    const width = rowOf('Line width');
    expect(within(width).getByText('From the project')).toBeInTheDocument();
    // What the project sets is reset in the project's scope, not the view's.
    expect(within(width).queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('Preset')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'As the project (Dense)' })).toBeInTheDocument();
  });

  it('resets a value, a group and every value, each as one command', async () => {
    const { sent } = panelFor(layered);
    openGroup('Lines');
    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Reset “Line width”' })));
    expect(sent()).toEqual([{ type: 'set-drawing-defaults', drawing: { preset: 'dense' } }]);
    await settle(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Reset every value of Lines' })),
    );
    expect(sent()[1]).toEqual({ type: 'set-drawing-defaults', drawing: { preset: 'dense' } });
    expect(screen.getByRole('button', { name: 'Reset every value of Text' })).toBeDisabled();
    await settle(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Reset every value of the project' })),
    );
    expect(sent()[2]).toEqual({ type: 'set-drawing-defaults', drawing: null });

    fireEvent.click(screen.getByRole('radio', { name: 'This view only' }));
    await settle(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Reset every value of Text' })),
    );
    expect(sent()[3]).toEqual({ type: 'set-drawing-defaults', view: VIEW, drawing: null });
    expect(screen.getByRole('button', { name: 'Reset every value of this view' })).toBeEnabled();
  });

  it('changes the preset and keeps the values the layer sets', async () => {
    const { sent } = panelFor(layered);
    await settle(() =>
      fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'expressive' } }),
    );
    expect(sent()).toEqual([
      { type: 'set-drawing-defaults', drawing: { preset: 'expressive', lines: { width: 3 } } },
    ]);
    fireEvent.click(screen.getByRole('radio', { name: 'This view only' }));
    await settle(() =>
      fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'high-contrast' } }),
    );
    expect(sent()[1]).toEqual({
      type: 'set-drawing-defaults',
      view: VIEW,
      drawing: { preset: 'high-contrast', text: { nameSize: 20 } },
    });
  });

  it('refuses a number out of its range, and sends nothing', async () => {
    const { sent } = panelFor(sample);
    openGroup('Lines');
    const width = screen.getByLabelText('Line width');
    await settle(() => {
      fireEvent.change(width, { target: { value: '12' } });
      fireEvent.keyDown(width, { key: 'Enter' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('A number from 0.5 to 8.');
    expect(sent()).toEqual([]);
  });

  it('changes nothing while the project cannot be changed', () => {
    panelFor(sample, { editable: false });
    openGroup('Lines');
    expect(screen.getByLabelText('Line width')).toBeDisabled();
    expect(screen.getByLabelText('Preset')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset every value of the project' })).toBeDisabled();
  });

  it('reads in Spanish', () => {
    panelFor(layered, { language: 'es' });
    expect(screen.getByRole('heading', { name: 'Valores de dibujo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Este proyecto' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Solo esta vista' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alto contraste' })).toBeInTheDocument();
    openGroup('Líneas');
    expect(within(rowOf('Grosor')).getByText('Del proyecto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restablecer “Grosor”' })).toBeInTheDocument();
    openGroup('Texto');
    expect(within(rowOf('Tamaño de los nombres')).getByText('De Denso')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restablecer todos los valores del proyecto' }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /\b(From|Reset|Preset|This project|Line width)\b/,
    );
  });
});
