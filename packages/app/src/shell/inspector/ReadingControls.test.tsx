/**
 * How a view reads many lines, in its inspector (ADR 0080, section 5): Rows draws every row or only
 * key rows, and the checkbox turns the fading of the lines a selection does not touch off and on,
 * each one action, with the history's labels in Spanish too.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { untranslatedParts } from '../../i18n/translate';
import { loadSample } from '../../test/sample';
import { ReadingControls } from './ReadingControls';
import { viewFadesCommand, viewRowsCommand } from './viewReading';

const sample = loadSample();
const VIEW = 'system-overview';

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function controlsFor(project: ProjectSnapshot) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const view = project.views.find((each) => each.id === VIEW);
  if (!view) throw new Error('No view.');
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: VIEW,
    scene: buildScene(project, VIEW),
    selection: EMPTY_SELECTION,
    select: () => undefined,
    send,
    reveal: () => undefined,
  };
  render(
    <EditorContext.Provider value={editor}>
      <ReadingControls view={view} />
    </EditorContext.Provider>,
  );
  return { send, view };
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 3; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('a view’s Rows and the fading of lines', () => {
  it('draws only key rows, as one action', async () => {
    const { send } = controlsFor(sample);
    const rows = screen.getByRole('combobox', { name: 'Rows' });
    expect(rows).toHaveValue('all');
    await settle(() => fireEvent.change(rows, { target: { value: 'keys' } }));
    const [command] = send.mock.calls.map(([each]) => each);
    expect(command).toEqual({
      type: 'batch',
      label: 'Draw only the key rows in "System overview"',
      commands: [{ type: 'update-view', id: VIEW, changes: { rows: 'keys' } }],
    });
    const keys = run(sample, command as Command);
    expect(keys.views.find((each) => each.id === VIEW)?.rows).toBe('keys');
    const view = keys.views.find((each) => each.id === VIEW);
    if (!view) throw new Error('No view.');
    expect(viewRowsCommand(view, 'all')).toMatchObject({
      label: 'Draw every row in "System overview"',
      commands: [{ changes: { rows: null } }],
    });
    expect(viewRowsCommand(view, 'keys')).toBeUndefined();
  });

  it('turns the fading of lines off and on again', async () => {
    const { send, view } = controlsFor(sample);
    const fades = screen.getByRole('checkbox', { name: 'Fade the other lines when selecting' });
    expect(fades).toBeChecked();
    await settle(() => fireEvent.click(fades));
    const [command] = send.mock.calls.map(([each]) => each);
    expect(command).toEqual({
      type: 'batch',
      label: 'Keep every line when selecting in "System overview"',
      commands: [{ type: 'update-view', id: VIEW, changes: { selectionFadesLines: false } }],
    });
    const off = run(sample, command as Command).views.find((each) => each.id === VIEW);
    if (!off) throw new Error('No view.');
    expect(viewFadesCommand(off, true)).toMatchObject({
      label: 'Fade the other lines when selecting in "System overview"',
      commands: [{ changes: { selectionFadesLines: null } }],
    });
    expect(viewFadesCommand(view, true)).toBeUndefined();
  });

  it('has its history labels in Spanish', () => {
    for (const label of [
      'Draw only the key rows in "X"',
      'Draw every row in "X"',
      'Fade the other lines when selecting in "X"',
      'Keep every line when selecting in "X"',
    ]) {
      expect(untranslatedParts('es', label)).toEqual([]);
    }
  });
});
