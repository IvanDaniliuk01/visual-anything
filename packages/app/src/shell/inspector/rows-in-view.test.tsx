/**
 * A row is a band of its container (ADR 0023): the inspector says so, disables what a row does not
 * draw, its shape, stroke and size, and leaves out the stacking order and the changes of container a
 * row cannot take.
 */
import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf } from '../../editor/selection';
import { VIEW, usersAndOrders } from '../../test/tables';
import { Inspector } from '../Inspector';

function Harness({ project, selected }: { project: ProjectSnapshot; selected: string }) {
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views[0];
  const scene = useMemo(() => buildScene(project, VIEW), [project]);
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const editor: Editor = {
    project,
    definitions,
    viewId: VIEW,
    scene,
    selection: selectionOf([{ kind: 'element', id: selected }]),
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

const ROW_NOTE =
  'Drawn as a row here: a band as wide as its container, with no border of its own, so its shape, stroke and size apply only where a view draws it as a shape.';

describe('the inspector of a row', () => {
  it('disables its shape and its stroke, and says why', () => {
    render(<Harness project={usersAndOrders()} selected="users-email" />);
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    expect(within(appearance).getByText(ROW_NOTE)).toBeInTheDocument();
    const shape = within(appearance).getByRole('combobox', { name: 'Shape' });
    const stroke = within(appearance).getByLabelText('Stroke');
    expect(shape).toBeDisabled();
    expect(stroke).toBeDisabled();
    expect(shape).toHaveAccessibleDescription(new RegExp(ROW_NOTE.slice(0, 40)));
    expect(stroke).toHaveAccessibleDescription(new RegExp(ROW_NOTE.slice(0, 40)));
    // A row draws its band in its fill.
    expect(within(appearance).getByLabelText('Fill')).toBeEnabled();
  });

  it('leaves out the stacking order, Take out and Move to, and says where it sits', () => {
    render(<Harness project={usersAndOrders()} selected="users-email" />);
    const view = screen.getByRole('region', { name: 'In this view' });
    expect(
      within(view).getByText('In "users": row 2 of 3, in the model’s order'),
    ).toBeInTheDocument();
    expect(
      within(view).getByText('A row moves with its container, and keeps its place among the rows.'),
    ).toBeInTheDocument();
    expect(within(view).queryByRole('button', { name: 'Take out' })).not.toBeInTheDocument();
    expect(within(view).queryByRole('button', { name: 'Move to…' })).not.toBeInTheDocument();
    expect(within(view).queryByRole('group', { name: 'Stacking order' })).not.toBeInTheDocument();
  });

  it('keeps all of it for the table that draws the rows', () => {
    render(<Harness project={usersAndOrders()} selected="users" />);
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    expect(within(appearance).queryByText(ROW_NOTE)).not.toBeInTheDocument();
    expect(within(appearance).getByRole('combobox', { name: 'Shape' })).toBeEnabled();
    const view = screen.getByRole('region', { name: 'In this view' });
    expect(within(view).getByRole('group', { name: 'Stacking order' })).toBeInTheDocument();
  });
});
