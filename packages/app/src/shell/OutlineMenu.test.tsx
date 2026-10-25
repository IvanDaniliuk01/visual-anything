/**
 * The outline's menu (ADR-0040): a secondary press or the menu key on an element's row offers Leave
 * out of this view and Add to this view, each sent as one command; Escape closes it.
 */
import { definitionsOf, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Scope } from '@visual-anything/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { useSelection } from '../editor/useSelection';
import { loadSample } from '../test/sample';
import { ModelPanel } from './ModelPanel';

const VIEW = 'system-overview';

function scoped(scope: Scope | undefined): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    views: project.views.map((view) => (view.id === VIEW ? { ...view, scope } : view)),
  };
}

function Harness({
  project,
  sent,
}: {
  project: ProjectSnapshot;
  sent: (command: Command) => void;
}) {
  const view = project.views[0];
  const [selection, setSelection] = useSelection(project, view);
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const definitions = definitionsOf(project.packages);
  const editor: Editor = {
    project,
    definitions,
    viewId: view?.id,
    scene,
    selection,
    select: setSelection,
    send: (command) => {
      sent(command);
      return Promise.resolve({ ok: true });
    },
    reveal: () => {},
  };
  return (
    <EditorContext.Provider value={editor}>
      <ModelPanel project={project} definitions={definitions} openViewId={view?.id} />
    </EditorContext.Provider>
  );
}

function rowNamed(name: RegExp): HTMLElement {
  const tree = screen.getByRole('tree', { name: 'Outline of System overview' });
  return within(tree).getByRole('treeitem', { name });
}

describe('the outline’s menu', () => {
  it('leaves an element out of the view from its row', () => {
    const sent = vi.fn<(command: Command) => void>();
    render(<Harness project={scoped(undefined)} sent={sent} />);
    fireEvent.contextMenu(rowNamed(/^Patient/), { clientX: 30, clientY: 40 });
    const menu = screen.getByRole('menu', { name: 'Patient' });
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Leave "Patient" out of this view' }),
    );
    expect(sent).toHaveBeenCalledWith({
      type: 'leave-out-of-view',
      view: VIEW,
      elements: ['patient'],
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('says how many relations leave the view from a row, and adds their far ends', () => {
    const sent = vi.fn<(command: Command) => void>();
    render(<Harness project={scoped({ leftOut: ['appointments-db'] })} sent={sent} />);
    const api = rowNamed(/^Appointments API/);
    expect(api.textContent).toContain('2 relations leave this view');
    fireEvent.contextMenu(api);
    const menu = screen.getByRole('menu', { name: 'Appointments API' });
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Add to this view the element they relate to' }),
    );
    expect(sent).toHaveBeenCalledWith({
      type: 'add-to-view',
      view: VIEW,
      elements: ['appointments-db'],
    });
  });

  it('closes on Escape, sending nothing', () => {
    const sent = vi.fn<(command: Command) => void>();
    render(<Harness project={scoped(undefined)} sent={sent} />);
    fireEvent.contextMenu(rowNamed(/^Patient/));
    const menu = screen.getByRole('menu', { name: 'Patient' });
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(sent).not.toHaveBeenCalled();
  });
});
