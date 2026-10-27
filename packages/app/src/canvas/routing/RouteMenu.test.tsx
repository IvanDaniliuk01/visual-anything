import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { translateMessage, untranslatedParts } from '../../i18n/translate';
import { loadSample } from '../../test/sample';
import { buildScene, relationLinesOf } from '../scene';
import { onRouteEditingRequest } from './requests';
import { RouteMenu } from './RouteMenu';
import { RouteSection } from './RouteSection';

const VIEW = 'system-overview';
const sample = loadSample();

function run(project: ProjectSnapshot, ...commands: Command[]): ProjectSnapshot {
  let state = project;
  for (const command of commands) {
    const outcome = executeCommand(state, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    state = outcome.state;
  }
  return state;
}

const routed = run(sample, {
  type: 'set-route',
  view: VIEW,
  relation: 'agent-to-api',
  to: { kind: 'border', side: 'top', at: 0.5 },
  style: 'curved',
});

function menuFor(project: ProjectSnapshot, relations: string[], editable = true) {
  const onSend = vi.fn<(command: Command) => void>();
  const onEditRoute = vi.fn<(relation: string) => void>();
  const onClose = vi.fn();
  render(
    <RouteMenu
      project={project}
      viewId={VIEW}
      relations={relations}
      lines={relationLinesOf(buildScene(project, VIEW))}
      at={{ x: 10, y: 10 }}
      editable={editable}
      onSend={onSend}
      onEditRoute={onEditRoute}
      onClose={onClose}
    />,
  );
  return { onSend, onEditRoute, onClose };
}

describe('the relation’s menu', () => {
  it('offers the style, Reset route, an automatic end and Edit the route…', () => {
    const { onSend, onEditRoute } = menuFor(routed, ['agent-to-api']);
    expect(screen.getByRole('menuitemradio', { name: 'Curved' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Orthogonal' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.queryByRole('menuitem', { name: 'Attach the start automatically' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Attach the end automatically' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Straight' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset route' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit the route…' }));
    expect(onSend.mock.calls.map(([command]) => command)).toEqual([
      { type: 'set-route', view: VIEW, relation: 'agent-to-api', to: null },
      { type: 'set-route', view: VIEW, relation: 'agent-to-api', style: 'straight' },
      { type: 'reset-route', view: VIEW, relations: ['agent-to-api'] },
    ]);
    expect(onEditRoute).toHaveBeenCalledWith('agent-to-api');
  });

  it('says a relation routed automatically has nothing to reset', () => {
    const { onSend } = menuFor(sample, ['api-reads-db']);
    const reset = screen.getByRole('menuitem', { name: /Reset route/ });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(reset).toHaveTextContent('It is routed automatically');
    fireEvent.click(reset);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('draws several relations in a style as one action', () => {
    const { onSend } = menuFor(sample, ['api-reads-db', 'api-writes-db']);
    expect(screen.queryByRole('menuitem', { name: 'Edit the route…' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Curved' }));
    expect(onSend.mock.calls[0]?.[0]).toMatchObject({
      type: 'batch',
      label: 'Draw 2 relations curved in "System overview"',
    });
  });

  it('changes nothing while the project cannot be changed', () => {
    const { onSend, onEditRoute } = menuFor(routed, ['agent-to-api'], false);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Straight' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit the route…' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(onEditRoute).not.toHaveBeenCalled();
  });
});

describe('the inspector’s Route section', () => {
  function sectionFor(project: ProjectSnapshot, relation: string) {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
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
        <RouteSection relation={relation} />
      </EditorContext.Provider>,
    );
    return { send };
  }

  it('says where each end attaches and how many bend points there are', () => {
    sectionFor(routed, 'agent-to-api');
    expect(screen.getByText('Automatic')).toBeInTheDocument();
    expect(screen.getByText('On the top side')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveValue('curved');
  });

  it('changes the style, and asks the canvas to edit the route from the keys', () => {
    const { send } = sectionFor(routed, 'agent-to-api');
    fireEvent.change(screen.getByRole('combobox', { name: 'Style' }), {
      target: { value: 'straight' },
    });
    expect(send).toHaveBeenCalledWith({
      type: 'set-route',
      view: VIEW,
      relation: 'agent-to-api',
      style: 'straight',
    });
    const asked: string[] = [];
    const stop = onRouteEditingRequest((relation) => asked.push(relation));
    fireEvent.click(screen.getByRole('button', { name: 'Edit the route…' }));
    stop();
    expect(asked).toEqual(['agent-to-api']);
  });

  it('cannot reset a route chosen by nothing', () => {
    sectionFor(sample, 'api-reads-db');
    expect(screen.getByRole('button', { name: 'Reset route' })).toBeDisabled();
  });
});

describe('the history’s labels of routes', () => {
  it('read in Spanish', () => {
    const labels = [
      'Route "HTTPS" by hand in "System overview"',
      'Reset the route of "HTTPS" in "System overview"',
      'Reset 3 routes in "System overview"',
      'Draw "HTTPS" curved in "System overview"',
      'Draw 2 relations straight in "System overview"',
      'Reconnect "HTTPS" to "Reminder service"',
    ];
    for (const label of labels) expect(untranslatedParts('es', label)).toEqual([]);
    expect(translateMessage('es', labels[0] as string)).toBe(
      'Trazar "HTTPS" a mano en "System overview"',
    );
  });

  it('are the ones the core writes', () => {
    const outcome = executeCommand(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'agent-to-api',
      style: 'curved',
    });
    expect(outcome.ok && outcome.label).toBe('Draw "HTTPS" curved in "System overview"');
  });
});

// M8b W55: the Style control's Automatic (ADR 0039's clarification, ADR 0069).
describe('the Style control’s Automatic', () => {
  const curvedView = run(sample, {
    type: 'update-view',
    id: VIEW,
    changes: { routeStyle: 'curved' },
  });

  it('is chosen for a route that chooses no style, and says the automatic style', () => {
    menuFor(curvedView, ['api-reads-db']);
    const automatic = screen.getByRole('menuitemradio', { name: 'Automatic: curved' });
    expect(automatic).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Curved' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('gives a route its automatic style back, as one action labelled for it', () => {
    const { onSend } = menuFor(routed, ['agent-to-api']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Automatic: orthogonal' }));
    const [command] = onSend.mock.calls.map(([each]) => each);
    expect(command).toEqual({
      type: 'batch',
      label: 'Draw "HTTPS" in its automatic style in "System overview"',
      commands: [{ type: 'set-route', view: VIEW, relation: 'agent-to-api', style: 'orthogonal' }],
    });
    // The route keeps its end chosen by hand and loses only its style.
    const after = run(routed, command as Command);
    expect(after.views.find((view) => view.id === VIEW)?.routes?.['agent-to-api']).toEqual({
      to: { kind: 'border', side: 'top', at: 0.5 },
    });
  });

  it('sends nothing for relations whose routes choose no style', () => {
    const { onSend } = menuFor(sample, ['api-reads-db', 'api-writes-db']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Automatic: orthogonal' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends nothing for a style a view’s Lines draw the line in already', () => {
    const { onSend } = menuFor(curvedView, ['api-reads-db']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Curved' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('is offered in the inspector’s Route section, with the automatic style', () => {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
    const editor: Editor = {
      project: routed,
      definitions: definitionsIn(routed),
      viewId: VIEW,
      scene: buildScene(routed, VIEW),
      selection: EMPTY_SELECTION,
      select: () => undefined,
      send,
      reveal: () => undefined,
    };
    render(
      <EditorContext.Provider value={editor}>
        <RouteSection relation="agent-to-api" />
      </EditorContext.Provider>,
    );
    const style = screen.getByRole('combobox', { name: 'Style' });
    expect(screen.getByRole('option', { name: 'Automatic: orthogonal' })).toBeInTheDocument();
    fireEvent.change(style, { target: { value: 'automatic' } });
    expect(send).toHaveBeenCalledWith({
      type: 'batch',
      label: 'Draw "HTTPS" in its automatic style in "System overview"',
      commands: [{ type: 'set-route', view: VIEW, relation: 'agent-to-api', style: 'orthogonal' }],
    });
  });

  it('labels its actions in Spanish too', () => {
    const labels = [
      'Draw "HTTPS" in its automatic style in "System overview"',
      'Draw 2 relations in their automatic styles in "System overview"',
    ];
    for (const label of labels) expect(untranslatedParts('es', label)).toEqual([]);
  });
});
