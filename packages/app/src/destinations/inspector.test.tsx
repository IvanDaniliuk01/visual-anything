/**
 * The inspector's destinations and external identifiers (ADR 0056): an element lists what its
 * destinations open, each with Follow; its identifiers are added, changed and removed by scheme, each
 * change one command; and a destination attribute's value is edited by what it opens. Each command
 * runs here through the core, as the local program would run it.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { selectionOf } from '../editor/selection';
import { Inspector } from '../shell/Inspector';
import { loadSample } from '../test/sample';
import type { Follower } from './follower';

const DB = 'appointments-db';

/** The sample, whose Calendar component defines a destination attribute, set on the DB. */
function linkedSample(): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    packages: sample.packages.map((file) =>
      file.id === 'clinic'
        ? {
            ...file,
            components: file.components.map((each) =>
              each.id === 'clinic.calendar'
                ? {
                    ...each,
                    attributes: [
                      ...(each.attributes ?? []),
                      { name: 'runbook', type: 'destination' as const },
                    ],
                  }
                : each,
            ),
          }
        : file,
    ),
    model: {
      ...sample.model,
      elements: sample.model.elements.map((element) =>
        element.id === DB
          ? {
              ...element,
              ids: { wikidata: 'Q8513' },
              attributes: {
                ...element.attributes,
                runbook: { url: 'https://runbooks.example.org/appointments-db' },
              },
            }
          : element,
      ),
    },
  };
}

function Harness({
  initial,
  sent,
  follower,
}: {
  initial: ProjectSnapshot;
  sent: (command: Command) => void;
  follower: Follower;
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
    selection: selectionOf([{ kind: 'element', id: DB }]),
    select: () => {},
    send,
    reveal: () => {},
    follow: follower,
  };
  return (
    <EditorContext.Provider value={editor}>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </EditorContext.Provider>
  );
}

function renderInspector() {
  const sent = vi.fn<(command: Command) => void>();
  const follow = vi.fn<Follower['follow']>();
  render(<Harness initial={linkedSample()} sent={sent} follower={{ follow }} />);
  return { sent, follow, inspector: screen.getByRole('complementary', { name: 'Inspector' }) };
}

describe('the inspector’s destinations', () => {
  it('lists what each destination opens, and follows it', () => {
    const { follow, inspector } = renderInspector();
    const section = within(inspector).getByRole('region', { name: 'Destinations' });
    expect(section.textContent).toContain('runbook');
    expect(section.textContent).toContain('Opens a page of runbooks.example.org');
    fireEvent.click(within(section).getByRole('button', { name: /^Follow “runbook”/ }));
    expect(follow).toHaveBeenCalledWith({ url: 'https://runbooks.example.org/appointments-db' });
  });

  it('edits a destination by what it opens, and is refused one that is not', () => {
    const { sent, inspector } = renderInspector();
    const address = within(inspector).getByRole('textbox', {
      name: 'Web address, starting with https://',
    });
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    expect(sent).not.toHaveBeenCalled();
    fireEvent.change(address, { target: { value: 'https://runbooks.example.org/v2' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    expect(sent).toHaveBeenCalledWith({
      type: 'update-element',
      id: DB,
      changes: { attributes: { runbook: { url: 'https://runbooks.example.org/v2' } } },
    });
  });
});

describe('the inspector’s external identifiers', () => {
  it('lists them by scheme, and changes, adds and removes them, one command each', () => {
    const { sent, inspector } = renderInspector();
    const section = within(inspector).getByRole('region', { name: 'External identifiers' });
    const wikidata = within(section).getByRole('textbox', { name: 'wikidata' });
    expect((wikidata as HTMLInputElement).value).toBe('Q8513');

    fireEvent.change(wikidata, { target: { value: 'Q192588' } });
    fireEvent.keyDown(wikidata, { key: 'Enter' });
    expect(sent).toHaveBeenLastCalledWith({
      type: 'update-element',
      id: DB,
      changes: { ids: { wikidata: 'Q192588' } },
    });

    fireEvent.change(within(section).getByRole('textbox', { name: 'Scheme' }), {
      target: { value: 'schema' },
    });
    fireEvent.change(within(section).getByRole('textbox', { name: 'Identifier' }), {
      target: { value: 'Database' },
    });
    fireEvent.click(within(section).getByRole('button', { name: 'Add' }));
    expect(sent).toHaveBeenLastCalledWith({
      type: 'update-element',
      id: DB,
      changes: { ids: { schema: 'Database' } },
    });

    fireEvent.click(within(section).getByRole('button', { name: 'Remove wikidata' }));
    expect(sent).toHaveBeenLastCalledWith({
      type: 'update-element',
      id: DB,
      changes: { ids: { wikidata: null } },
    });
  });

  it('says what a scheme must be before sending anything', () => {
    const { sent, inspector } = renderInspector();
    const section = within(inspector).getByRole('region', { name: 'External identifiers' });
    fireEvent.change(within(section).getByRole('textbox', { name: 'Scheme' }), {
      target: { value: 'Not A Scheme' },
    });
    fireEvent.change(within(section).getByRole('textbox', { name: 'Identifier' }), {
      target: { value: 'x' },
    });
    fireEvent.click(within(section).getByRole('button', { name: 'Add' }));
    expect(within(section).getByRole('alert').textContent).toBe(
      'A scheme is a short lowercase name, such as uberon, fma or wikidata.',
    );
    expect(sent).not.toHaveBeenCalled();
  });
});
