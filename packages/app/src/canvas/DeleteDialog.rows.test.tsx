import { previewDelete } from '@visual-anything/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VIEW, tablesProject } from '../test/tables';
import { DeleteDialog } from './DeleteDialog';

describe('deleting a table', () => {
  // users' columns, one of which invoices holds too.
  const project = tablesProject({
    tables: [
      {
        id: 'users',
        columns: [
          { id: 'users-id', name: 'id' },
          { id: 'tenant', name: 'tenant_id' },
        ],
      },
      { id: 'invoices', columns: [] },
    ],
    relations: [
      {
        id: 'tenant-in-invoices',
        relationType: 'data-modeling.is-column-of',
        from: 'tenant',
        to: 'invoices',
      },
    ],
  });
  const preview = previewDelete(project, { elements: ['users'] }, VIEW);

  it('offers its rows, checked, and what else it holds, unchecked, naming where it stays', () => {
    const onChange = vi.fn();
    render(
      <DeleteDialog
        project={project}
        preview={preview}
        freeShapes={0}
        held={{ contents: preview.contents, rows: true, others: false, onChange }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const rows = screen.getByRole('checkbox', { name: 'Also delete its row' });
    expect((rows as HTMLInputElement).checked).toBe(true);
    const others = screen.getByRole('checkbox', { name: 'Also delete 1 more element it holds:' });
    expect((others as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('tenant_id is also in invoices')).toBeTruthy();
    fireEvent.click(others);
    expect(onChange).toHaveBeenCalledWith('other', true);
    fireEvent.click(rows);
    expect(onChange).toHaveBeenCalledWith('rows', false);
  });
});
