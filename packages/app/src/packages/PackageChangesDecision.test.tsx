/**
 * Accepting a package's changes applies what the person saw (ADR 0089, M14's review): Accept previews
 * the changes again on the project as it is, sends the command when the comparison is the one shown,
 * and shows the new comparison in its place, saying so, when the project changed under the review.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type PackageCodeChanges,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { codeProject } from '../code/test/project';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import type { CommandResult } from '../live/connection';
import { PackageChangesStore } from './changes';
import { PackageChangesDecision } from './PackageChangesReview';

const RENAME: PackageCodeChanges = {
  label: 'Rename the oven',
  commands: [{ type: 'update-element', id: 'oven', changes: { name: 'Stove' } }],
};

async function setUp() {
  const store = new PackageChangesStore();
  let project: ProjectSnapshot = codeProject();
  store.attach(() => project);
  await store.run({
    package: { id: 'gauges', name: 'Gauges' },
    label: 'Rename',
    ask: () => Promise.resolve({ ok: true, value: RENAME }),
  });
  const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  const editor = (): Editor => ({
    project,
    definitions: definitionsIn(project),
    viewId: 'kitchen',
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send,
    reveal: () => {},
  });
  const Shown = () => {
    const state = store.snapshot();
    if (state.state !== 'reviewing') return null;
    return (
      <EditorContext.Provider value={editor()}>
        {/* Keyed by the review, as the Changes tab opens it again for a new one. */}
        <PackageChangesDecision
          key={JSON.stringify(state.older.model)}
          store={store}
          review={state}
        />
      </EditorContext.Provider>
    );
  };
  const view = render(<Shown />);
  store.subscribe(() => view.rerender(<Shown />));
  const apply = (command: Command) => {
    const outcome = executeCommand(project, command, { author: 'user' });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
    project = outcome.state;
  };
  return { store, send, apply };
}

describe('accepting a package’s changes', () => {
  it('sends the command previewed when the project is the one shown', async () => {
    const { send, store } = await setUp();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'batch', ...RENAME }));
    expect(store.snapshot()).toEqual({ state: 'idle' });
  });

  it('shows the changes again, rather than applying them, once the project moved under them', async () => {
    const { send, apply } = await setUp();
    apply({ type: 'update-element', id: 'oven', changes: { name: 'Range' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(send).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The project changed since these changes were shown',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('says why when the changes no longer apply, and sends nothing', async () => {
    const { send, apply } = await setUp();
    apply({ type: 'delete', elements: ['oven'] });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The project changed, and the changes no longer apply to it:',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
