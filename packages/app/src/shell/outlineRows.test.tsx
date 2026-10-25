/**
 * A row does not draw what its element holds (ADR 0023): the outline lists those elements inside the
 * row's own row, as "Not drawn: inside a row", so that they can still be reached and selected.
 */
import { definitionsOf } from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { VIEW, tablesProject } from '../test/tables';
import { Outline } from './Outline';
import {
  isItemSelected,
  outlineOf,
  revealKeyOf,
  selectablesOf,
  textOf,
  type OutlineItem,
} from './outlineItems';
import { shownRows } from './tree';

/** A table whose email column holds a rule, which the column, a row, does not draw. */
const project = tablesProject({
  tables: [
    {
      id: 'users',
      at: { x: 0, y: 0 },
      columns: [
        { id: 'users-id', name: 'id' },
        { id: 'users-email', name: 'email' },
      ],
    },
  ],
  elements: [{ id: 'email-rule', component: 'systems.box', name: 'Email rule' }],
  relations: [
    {
      id: 'rule-in-email',
      relationType: 'systems.is-part-of',
      from: 'email-rule',
      to: 'users-email',
    },
  ],
});
const scene = buildScene(project, VIEW);

function item(id: string): OutlineItem {
  const outline = outlineOf(scene, project);
  const found = shownRows(outline, () => true).rows.find((row) => row.id === id);
  if (!found) throw new Error(`The outline has no row ${id}.`);
  return found.item;
}

describe('the outline of a row that holds elements', () => {
  it('lists what the row holds inside its row, as not drawn', () => {
    const outline = outlineOf(scene, project);
    const email = item('users/users-email');
    expect(outline.countInside(email)).toBe(1);
    const [held] = outline.inside(email);
    expect(held).toMatchObject({ kind: 'undrawn', element: 'email-rule', name: 'Email rule' });
    if (!held) return;
    expect(textOf(held)).toBe('Email rule');
    expect(selectablesOf(held)).toEqual([{ kind: 'element', id: 'email-rule' }]);
    expect(isItemSelected(selectionOf([{ kind: 'element', id: 'email-rule' }]), held)).toBe(true);
    // The canvas shows the row that holds it.
    expect(revealKeyOf(held)).toBe('users/users-email');
  });

  it('finds the row of an element only a row holds, inside that row', () => {
    const outline = outlineOf(scene, project);
    expect(outline.placeOf({ kind: 'element', id: 'email-rule' })).toEqual({
      id: 'users/users-email/email-rule',
      outer: ['users', 'users/users-email'],
    });
  });

  it('says so in the outline', () => {
    const editor: Editor = {
      project,
      definitions: definitionsOf(project.packages),
      viewId: VIEW,
      scene,
      selection: EMPTY_SELECTION,
      select: vi.fn(),
      send: undefined,
      reveal: vi.fn(),
    };
    render(
      <EditorContext.Provider value={editor}>
        <Outline active />
      </EditorContext.Provider>,
    );
    const tree = screen.getByRole('tree', { name: 'Outline of Tables' });
    // Rows are closed at first: the table holds rows, which hold nothing drawn.
    expect(within(tree).queryByText('Email rule')).not.toBeInTheDocument();
    const email = within(tree).getByRole('treeitem', { name: /^email/ });
    expect(email).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(email.querySelector('.tree-toggle') as Element);
    const held = within(tree).getByRole('treeitem', { name: /^Email rule/ });
    expect(held).toHaveTextContent('Email rule');
    expect(held).toHaveTextContent('Not drawn: inside a row');
    expect(held).toHaveAttribute('aria-level', '3');
  });
});
