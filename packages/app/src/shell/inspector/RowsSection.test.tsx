import {
  definitionsOf,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { rowsInView } from '../../canvas/rowCommands';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { tablesProject, usersAndOrders } from '../../test/tables';
import { RowsSection } from './RowsSection';

/** The section for one element, in an editor whose commands the core applies, as the local program would. */
function renderSection(start: ProjectSnapshot, element: string) {
  const sent: Command[] = [];
  const latest: { project: ProjectSnapshot } = { project: start };
  function Harness() {
    const [project, setProject] = useState(start);
    const now = useRef(start);
    const definitions = useMemo(() => definitionsOf(project.packages), [project.packages]);
    const send: SendCommand = (command) => {
      sent.push(command);
      const outcome = executeCommand(now.current, command);
      if (!outcome.ok) return Promise.resolve({ ok: false });
      now.current = outcome.state;
      latest.project = outcome.state;
      setProject(outcome.state);
      return Promise.resolve({ ok: true });
    };
    const editor: Editor = {
      project,
      definitions,
      viewId: project.views[0]?.id,
      scene: undefined,
      selection: EMPTY_SELECTION,
      select: vi.fn(),
      send,
      reveal: vi.fn(),
    };
    const found = project.model.elements.find((each) => each.id === element);
    return (
      <EditorContext.Provider value={editor}>
        {found && <RowsSection element={found} />}
      </EditorContext.Provider>
    );
  }
  render(<Harness />);
  return { sent, latest };
}

describe('RowsSection', () => {
  it('lists a table’s columns in the model’s order, with their details', () => {
    renderSection(usersAndOrders(), 'users');
    const section = screen.getByRole('region', { name: 'Columns' });
    const items = within(section).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.inspector-row-name')?.textContent)).toEqual([
      'id uuid · PK',
      'email text',
      'name text',
    ]);
  });

  it('moves a column down, as one reorder', async () => {
    const { sent, latest } = renderSection(usersAndOrders(), 'users');
    fireEvent.click(screen.getByRole('button', { name: 'Move “id” down' }));
    await screen.findByText('“id” moved down.');
    expect(sent).toEqual([
      { type: 'reorder-elements', elements: ['users-id'], before: 'users-name' },
    ]);
    const view = latest.project.views[0];
    expect(view && rowsInView(latest.project, view, 'users')).toEqual([
      'users-email',
      'users-id',
      'users-name',
    ]);
  });

  it('pastes a CREATE TABLE as one batch, relating what it finds and listing what it cannot', async () => {
    const project = tablesProject({
      tables: [
        { id: 'patients', columns: [{ id: 'patients-id', name: 'id', primaryKey: true }] },
        { id: 'appointments', columns: [] },
      ],
    });
    const { sent, latest } = renderSection(project, 'appointments');
    fireEvent.change(screen.getByLabelText('Type or paste columns'), {
      target: {
        value: `CREATE TABLE appointments (
          id uuid PRIMARY KEY,
          patient_id uuid NOT NULL REFERENCES patients(id),
          doctor_id uuid REFERENCES doctors(id)
        );`,
      },
    });
    expect(screen.getByText('Not related: doctors(id): no table named “doctors”')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add 3 columns' }));
    await screen.findByText('Added 3 columns to “appointments”.');
    expect(sent).toHaveLength(1);
    const [batch] = sent;
    expect(batch?.type === 'batch' && batch.label).toBe('Add 3 columns to "appointments"');
    const references = latest.project.model.relations.filter(
      (each) => each.relationType === 'data-modeling.references',
    );
    expect(references).toHaveLength(1);
    expect(references[0]?.to).toBe('patients-id');
  });

  it('nests pasted columns by "is column of" in a view that did not, and offers to show loose ones', async () => {
    const project = tablesProject({
      tables: [{ id: 'patients', columns: [{ id: 'patients-id', name: 'id' }] }],
      nesting: ['systems.is-part-of'],
    });
    const { sent } = renderSection(project, 'patients');
    expect(
      screen.getByText('This view does not nest by “is column of”, so its column sits loose.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show them as rows' }));
    await screen.findByText('The columns show as rows.');
    expect(sent[0]).toEqual({
      type: 'update-view',
      id: 'tables',
      changes: { nestingRelationTypes: ['systems.is-part-of', 'data-modeling.is-column-of'] },
    });
  });

  it('removes a column only after showing what goes with it', async () => {
    const { sent } = renderSection(usersAndOrders(), 'users');
    fireEvent.click(screen.getByRole('button', { name: 'Remove “id”' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/orders-user-fk|user_id → id/)).toBeTruthy();
    expect(sent).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Delete/ }));
    await screen.findByText('“id” was removed.');
    expect(sent[0]).toMatchObject({ type: 'delete', elements: ['users-id'] });
  });
});
