/**
 * The styles of automatic routes (ADR 0069): a relation type's Route in the component editor, a
 * relation's own in its inspector, and a view's Lines, each one command where the project can change
 * it, with the history's labels in Spanish too.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { buildScene } from '../../canvas/scene';
import type { SendCommand } from '../../canvas/CanvasArea';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION, type Selectable, type Selection } from '../../editor/selection';
import { untranslatedParts } from '../../i18n/translate';
import { beyondBoxes } from '../../test/beyond';
import { DefinitionsHarness } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';
import { LinesControl } from './LinesControl';
import { inheritedRelationTypeRoute, viewLinesCommand } from './routeStyles';

const sample = loadSample();
const VIEW = 'system-overview';

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function renderPanels(project: ProjectSnapshot, selected: Selectable[]) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(
    <DefinitionsHarness
      project={project}
      selected={selected}
      editable
      send={send}
      select={vi.fn<(selection: Selection) => void>()}
      onReady={() => undefined}
    />,
  );
  return { send, inspector: screen.getByRole('complementary', { name: 'Inspector' }) };
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 3; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('a relation type’s Route', () => {
  it('chooses the style of its automatic routes, or inherits it, each one action', async () => {
    const { inspector, send } = renderPanels(beyondBoxes(), [{ kind: 'relation', id: 'flow' }]);
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Edit “flows to”' })),
    );
    const route = within(inspector).getByRole('region', { name: 'Route' });
    const control = within(route).getByRole('combobox', { name: 'Automatic routes' });
    expect(control).toHaveValue('inherit');
    expect(
      within(route).getByRole('option', { name: 'Inherited: as each view draws its lines' }),
    ).toBeInTheDocument();
    expect(control).toHaveAccessibleDescription('built in, from relates to');
    await settle(() => fireEvent.change(control, { target: { value: 'curved' } }));
    expect(sent(send)).toEqual([
      {
        type: 'set-relation-type-appearance',
        relationType: 'anatomy.flows',
        appearanceTraits: { route: 'curved' },
      },
    ]);
    expect(within(route).getByRole('combobox', { name: 'Automatic routes' })).toHaveValue('curved');
    expect(
      within(route).getByRole('combobox', { name: 'Automatic routes' }),
    ).toHaveAccessibleDescription('its own');
    await settle(() =>
      fireEvent.change(within(route).getByRole('combobox', { name: 'Automatic routes' }), {
        target: { value: 'inherit' },
      }),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'set-relation-type-appearance',
      relationType: 'anatomy.flows',
      appearanceTraits: { route: null },
    });
  });

  it('inherits the style of the relation type it derives from', () => {
    const project = beyondBoxes();
    const derived: ProjectSnapshot = {
      ...project,
      packages: project.packages.map((file) => ({
        ...file,
        relationTypes: [
          ...(file.relationTypes ?? []).map((each) =>
            each.id === 'anatomy.flows'
              ? { ...each, appearance: { route: 'curved' as const } }
              : each,
          ),
          {
            id: 'anatomy.pumps',
            name: 'pumps',
            derivesFrom: 'anatomy.flows',
          },
        ],
      })),
    };
    expect(inheritedRelationTypeRoute(derived, 'anatomy.pumps')).toBe('curved');
    expect(inheritedRelationTypeRoute(derived, 'anatomy.flows')).toBeUndefined();
  });
});

describe('a relation’s automatic route', () => {
  it('sets its own, as a particularity, and its relation type’s in the project file', async () => {
    const { inspector, send } = renderPanels(sample, [{ kind: 'relation', id: 'api-reads-db' }]);
    const appearance = within(inspector).getByRole('region', { name: 'Appearance' });
    await settle(() =>
      fireEvent.change(within(appearance).getByRole('combobox', { name: 'Automatic route' }), {
        target: { value: 'curved' },
      }),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-relation',
        id: 'api-reads-db',
        changes: { appearanceTraits: { route: 'curved' } },
      },
    ]);
    await settle(() =>
      fireEvent.click(within(appearance).getByRole('radio', { name: 'Every reads from' })),
    );
    const ofType = within(appearance).getByRole('combobox', { name: 'Automatic route' });
    expect(ofType).toHaveValue('inherit');
    expect(ofType).toHaveAccessibleDescription(
      /This relation has an automatic route of its own: a change here takes it back/,
    );
    await settle(() => fireEvent.change(ofType, { target: { value: 'straight' } }));
    const command = sent(send).at(-1) as Command;
    expect(command).toEqual({
      type: 'batch',
      label: 'Change the appearance of the relation type "reads from"',
      commands: [
        {
          type: 'set-relation-type-appearance',
          relationType: 'systems.reads-from',
          appearanceTraits: { route: 'straight' },
        },
        {
          type: 'update-relation',
          id: 'api-reads-db',
          changes: { appearanceTraits: { route: null } },
        },
      ],
    });
    expect(untranslatedParts('es', (command as { label: string }).label)).toEqual([]);
  });
});

describe('a view’s Lines', () => {
  function linesFor(project: ProjectSnapshot) {
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
        <LinesControl view={view} />
      </EditorContext.Provider>,
    );
    return { send };
  }

  it('draws the view’s automatic routes straight or curved, as one action', async () => {
    const { send } = linesFor(sample);
    const lines = screen.getByRole('combobox', { name: 'Lines' });
    expect(lines).toHaveValue('orthogonal');
    await settle(() => fireEvent.change(lines, { target: { value: 'curved' } }));
    const [command] = sent(send);
    expect(command).toEqual({
      type: 'batch',
      label: 'Draw the lines of "System overview" curved',
      commands: [{ type: 'update-view', id: VIEW, changes: { routeStyle: 'curved' } }],
    });
    const curved = run(sample, command as Command);
    expect(curved.views.find((view) => view.id === VIEW)?.routeStyle).toBe('curved');
  });

  it('draws them orthogonal again by taking the view’s style out', () => {
    const curved = run(sample, {
      type: 'update-view',
      id: VIEW,
      changes: { routeStyle: 'curved' },
    });
    const view = curved.views.find((each) => each.id === VIEW);
    if (!view) throw new Error('No view.');
    expect(viewLinesCommand(view, 'orthogonal')).toEqual({
      type: 'batch',
      label: 'Draw the lines of "System overview" orthogonal',
      commands: [{ type: 'update-view', id: VIEW, changes: { routeStyle: null } }],
    });
    expect(viewLinesCommand(view, 'curved')).toBeUndefined();
  });

  it('labels its actions in Spanish too', () => {
    for (const style of ['orthogonal', 'straight', 'curved']) {
      expect(untranslatedParts('es', `Draw the lines of "System overview" ${style}`)).toEqual([]);
    }
  });
});
