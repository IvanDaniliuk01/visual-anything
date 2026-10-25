/**
 * The inspector and the open view's scope (ADR-0040): with nothing selected, the scope editor; with
 * an element selected, Leave out of this view, Add to this view, and the relations that leave the
 * view. Each change is one command, applied here with the core as the local program would.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Scope } from '@visual-anything/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf, type Selectable } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { Inspector } from '../Inspector';

const VIEW = 'system-overview';

function scoped(scope: Scope | undefined): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    views: project.views.map((view) => (view.id === VIEW ? { ...view, scope } : view)),
  };
}

function Harness({
  initial,
  selected,
  sent,
}: {
  initial: ProjectSnapshot;
  selected: Selectable[];
  sent: (command: Command) => void;
}) {
  const [project, setProject] = useState(initial);
  const latest = useRef(initial);
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views[0];
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const send: SendCommand = (command) => {
    sent(command);
    const outcome = executeCommand(latest.current, command);
    if (!outcome.ok) return Promise.resolve({ ok: false });
    latest.current = outcome.state;
    setProject(outcome.state);
    return Promise.resolve({ ok: true });
  };
  const editor: Editor = {
    project,
    definitions,
    viewId: view?.id,
    scene,
    selection: selectionOf(selected),
    select: () => {},
    send,
    reveal: () => {},
  };
  return (
    <EditorContext.Provider value={editor}>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </EditorContext.Provider>
  );
}

function renderWith(project: ProjectSnapshot, selected: Selectable[] = []) {
  const sent = vi.fn<(command: Command) => void>();
  render(<Harness initial={project} selected={selected} sent={sent} />);
  return { sent, inspector: screen.getByRole('complementary', { name: 'Inspector' }) };
}

describe('the scope editor, with nothing selected', () => {
  it('says the view shows the whole model, and adds a rule as one command', async () => {
    const { sent, inspector } = renderWith(scoped(undefined));
    const editor = within(inspector).getByRole('region', { name: 'What it shows' });
    expect(within(editor).getByText('The whole model: 8 elements.')).toBeTruthy();
    fireEvent.click(within(editor).getByRole('button', { name: 'Show by a rule…' }));
    fireEvent.change(within(editor).getByLabelText('Component'), {
      target: { value: 'systems.person' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Add the rule' }));
    expect(sent).toHaveBeenCalledWith({
      type: 'set-scope',
      view: VIEW,
      scope: { include: [{ kind: 'component', component: 'systems.person' }] },
    });
    expect(
      await within(editor).findByText('1 of 8 elements, as its scope gives them.'),
    ).toBeTruthy();
    expect(within(editor).getByText('Component')).toBeTruthy();
    expect(within(editor).getByText(/“Person”, and what derives from it/)).toBeTruthy();
  });

  it('lists the rules and what is added and left out by hand, each taken back as one command', async () => {
    const { sent, inspector } = renderWith(
      scoped({
        exclude: [{ kind: 'contents', container: 'scheduling', depth: 1 }],
        added: ['appointments-db'],
        leftOut: ['patient'],
      }),
    );
    const editor = within(inspector).getByRole('region', { name: 'What it shows' });
    expect(
      within(editor).getByText(/“Scheduling” and what sits inside it, 1 level down/),
    ).toBeTruthy();
    fireEvent.click(
      within(editor).getByRole('button', { name: 'Add “Patient” back to this view' }),
    );
    expect(sent).toHaveBeenLastCalledWith({
      type: 'add-to-view',
      view: VIEW,
      elements: ['patient'],
    });
    fireEvent.click(
      within(editor).getByRole('button', { name: 'Stop adding “Appointments DB” by hand' }),
    );
    expect(sent).toHaveBeenLastCalledWith({
      type: 'set-scope',
      view: VIEW,
      scope: { exclude: [{ kind: 'contents', container: 'scheduling', depth: 1 }], added: [] },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Show the whole model' }));
    expect(sent).toHaveBeenLastCalledWith({ type: 'set-scope', view: VIEW, scope: null });
    expect(await within(editor).findByText('The whole model: 8 elements.')).toBeTruthy();
  });
});

describe('an element and the scope, in the inspector', () => {
  it('leaves a shown element out of the view as one command', () => {
    const { sent, inspector } = renderWith(scoped(undefined), [{ kind: 'element', id: 'patient' }]);
    const section = within(inspector).getByRole('region', { name: 'Scope of this view' });
    fireEvent.click(within(section).getByRole('button', { name: 'Leave out of this view' }));
    expect(sent).toHaveBeenCalledWith({
      type: 'leave-out-of-view',
      view: VIEW,
      elements: ['patient'],
    });
  });

  it('adds an element the scope leaves out', () => {
    const { sent, inspector } = renderWith(scoped({ leftOut: ['patient'] }), [
      { kind: 'element', id: 'patient' },
    ]);
    const section = within(inspector).getByRole('region', { name: 'Scope of this view' });
    expect(within(section).getByText(/leaves it out: its scope does not show it/)).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Add to this view' }));
    expect(sent).toHaveBeenCalledWith({ type: 'add-to-view', view: VIEW, elements: ['patient'] });
  });

  it('lists the relations that leave the view, with Add to this view for their far ends', () => {
    const { sent, inspector } = renderWith(scoped({ leftOut: ['appointments-db'] }), [
      { kind: 'element', id: 'appointments-api' },
    ]);
    const section = within(inspector).getByRole('region', { name: 'Scope of this view' });
    expect(within(section).getByText('2 relations leave this view')).toBeTruthy();
    const adds = within(section).getAllByRole('button', {
      name: 'Add “Appointments DB” to this view',
    });
    expect(adds).toHaveLength(2);
    fireEvent.click(adds[0]!);
    expect(sent).toHaveBeenCalledWith({
      type: 'add-to-view',
      view: VIEW,
      elements: ['appointments-db'],
    });
  });
});
