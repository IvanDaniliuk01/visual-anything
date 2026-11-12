/**
 * Getting back to automatic routes in the inspector and the relation's menu (ADR 0092 §1): the view's
 * Lines count its routes chosen by hand and offer Reset every route in this view while there is one;
 * the Arrange tab offers Reset routes and Attach ends automatically for the selection's lines; and
 * the relation's menu offers Attach ends automatically for several lines.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { RouteMenu } from '../../canvas/routing/RouteMenu';
import { buildScene, relationLinesOf } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../../editor/selection';
import { translatorFor } from '../../i18n';
import { untranslatedParts } from '../../i18n/translate';
import { loadSample } from '../../test/sample';
import { LinesArrange } from './LinesArrange';
import { LinesControl } from './LinesControl';

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

const routed = run(
  sample,
  {
    type: 'set-route',
    view: VIEW,
    relation: 'agent-to-api',
    to: { kind: 'border', side: 'top', at: 0.5 },
  },
  {
    type: 'set-route',
    view: VIEW,
    relation: 'api-reads-db',
    from: { kind: 'border', side: 'bottom', at: 0.25 },
    style: 'curved',
  },
);

function shown(project: ProjectSnapshot, what: 'lines' | 'arrange', selection: Selection) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const view = project.views.find((each) => each.id === VIEW);
  if (!view) throw new Error('No view.');
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: VIEW,
    scene: buildScene(project, VIEW),
    selection,
    select: () => undefined,
    send,
    reveal: () => undefined,
  };
  render(
    <EditorContext.Provider value={editor}>
      {what === 'lines' ? <LinesControl view={view} /> : <LinesArrange selection={selection} />}
    </EditorContext.Provider>,
  );
  return { send };
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

describe('the view’s Lines', () => {
  it('count the routes chosen by hand and reset them all in one action', async () => {
    const { send } = shown(routed, 'lines', EMPTY_SELECTION);
    expect(screen.getByText('2 routes chosen by hand in this view.')).toBeInTheDocument();
    await press('Reset every route in this view');
    expect(send.mock.lastCall?.[0]).toEqual({
      type: 'reset-route',
      view: VIEW,
      relations: ['agent-to-api', 'api-reads-db'],
    });
  });

  it('offer no reset while no route is chosen by hand', () => {
    shown(sample, 'lines', EMPTY_SELECTION);
    expect(screen.queryByRole('button', { name: 'Reset every route in this view' })).toBeNull();
  });

  it('read in Spanish', () => {
    const es = translatorFor('es');
    expect(
      es(
        {
          one: '1 route chosen by hand in this view.',
          other: '{count} routes chosen by hand in this view.',
        },
        { count: 2 },
      ),
    ).toBe('2 rutas elegidas a mano en esta vista.');
    expect(es({ one: 'Reset 1 route.', other: 'Reset {count} routes.' }, { count: 1 })).toBe(
      'Se restableció 1 ruta.',
    );
    for (const text of [
      'Reset every route in this view',
      'Reset routes',
      'Attach ends automatically',
    ]) {
      expect(es(text)).not.toBe(text);
    }
    expect(
      untranslatedParts('es', 'Attach the ends of 2 lines automatically in "System overview"'),
    ).toEqual([]);
    expect(
      untranslatedParts('es', 'Attach the ends of "Books" automatically in "System overview"'),
    ).toEqual([]);
  });
});

describe('the Arrange tab’s lines', () => {
  const scheduling = selectionOf([{ kind: 'element', id: 'scheduling' }]);

  it('reset the routes of the selected shapes’ lines', async () => {
    const { send } = shown(routed, 'arrange', scheduling);
    await press('Reset routes');
    expect(send.mock.lastCall?.[0]).toEqual({
      type: 'reset-route',
      view: VIEW,
      relations: ['agent-to-api', 'api-reads-db'],
    });
    expect(screen.getByRole('status')).toHaveTextContent('Reset 2 routes.');
  });

  it('attach their ends automatically, keeping the rest of each route', async () => {
    const { send } = shown(routed, 'arrange', scheduling);
    await press('Attach ends automatically');
    expect(send.mock.lastCall?.[0]).toMatchObject({
      type: 'batch',
      label: 'Attach the ends of 2 lines automatically in "System overview"',
      commands: [
        { type: 'set-route', relation: 'agent-to-api', to: null },
        { type: 'set-route', relation: 'api-reads-db', from: null },
      ],
    });
  });

  it('say why a press changes nothing, and show only with lines', async () => {
    const { send } = shown(routed, 'arrange', selectionOf([{ kind: 'element', id: 'patient' }]));
    await press('Reset routes');
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Each of these lines is routed automatically already.',
    );
  });
});

describe('the relation’s menu', () => {
  it('attaches the ends of several lines automatically, as one action', () => {
    const onSend = vi.fn<(command: Command) => void>();
    render(
      <RouteMenu
        project={routed}
        viewId={VIEW}
        relations={['agent-to-api', 'api-reads-db', 'api-writes-db']}
        lines={relationLinesOf(buildScene(routed, VIEW))}
        at={{ x: 10, y: 10 }}
        editable
        onSend={onSend}
        onEditRoute={() => undefined}
        onClose={() => undefined}
      />,
    );
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Reset route' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+Shift+R',
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Attach ends automatically' }));
    expect(onSend.mock.lastCall?.[0]).toMatchObject({
      type: 'batch',
      label: 'Attach the ends of 2 lines automatically in "System overview"',
    });
  });
});
