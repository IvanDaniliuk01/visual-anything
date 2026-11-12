/**
 * Which lines getting back to automatic routes acts on (ADR 0092 §1): the selected lines and those of
 * the selected shapes, or of shapes inside them; every line for Ctrl+Shift+E with nothing selected;
 * the lines wholly inside a dragged box; and what Reset routes and Attach ends automatically send.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionOf } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { indexScene } from '../hit';
import { buildScene } from '../scene';
import { linesOf, linesWithin, resetAction, resetDone, resetTargets } from './resets';

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

/** The API's call from the agent attached by hand, and the DB's read through a bend point. */
const routed = run(
  sample,
  {
    type: 'set-route',
    view: VIEW,
    relation: 'agent-to-api',
    to: { kind: 'border', side: 'top', at: 0.5 },
  },
  { type: 'set-route', view: VIEW, relation: 'api-reads-db', bendPoints: [{ x: 862, y: 320 }] },
);
const scene = buildScene(sample, VIEW);
const ALL = [
  'patient-to-whatsapp',
  'whatsapp-to-agent',
  'agent-to-api',
  'api-reads-db',
  'api-writes-db',
  'api-to-reminders',
];

describe('the lines of shapes', () => {
  it('are those with an end on one of the shapes, or on a shape inside one', () => {
    expect(linesOf(scene, new Set(['appointments-db']))).toEqual(['api-reads-db', 'api-writes-db']);
    expect(linesOf(scene, new Set(['scheduling']))).toEqual([
      'agent-to-api',
      'api-reads-db',
      'api-writes-db',
      'api-to-reminders',
    ]);
    expect(linesOf(scene, new Set(['patient']))).toEqual(['patient-to-whatsapp']);
  });

  it('are every line without shapes, but those the emphasis hides', () => {
    expect(linesOf(scene)).toEqual(ALL);
    const hidden = { has: (key: string) => key === 'api-writes-db' };
    expect(linesOf(scene, undefined, hidden)).toEqual(ALL.filter((id) => id !== 'api-writes-db'));
  });

  it('join the selected lines for Reset routes, each once', () => {
    const selection = selectionOf([
      { kind: 'relation', id: 'patient-to-whatsapp' },
      { kind: 'relation', id: 'api-reads-db' },
      { kind: 'element', id: 'appointments-db' },
      { kind: 'free-shape', id: 'a-note' },
    ]);
    expect(resetTargets(scene, selection)).toEqual([
      'patient-to-whatsapp',
      'api-reads-db',
      'api-writes-db',
    ]);
    expect(resetTargets(scene, EMPTY_SELECTION)).toEqual([]);
  });
});

describe('a dragged box', () => {
  it('takes the lines that lie wholly inside it', () => {
    const indexed = indexScene(scene);
    // The API's two lines down to the DB run at 862 and 882, from 280 to 368.
    expect(linesWithin(indexed, { x: 850, y: 270, width: 50, height: 110 })).toEqual([
      'api-reads-db',
      'api-writes-db',
    ]);
    expect(linesWithin(indexed, { x: 850, y: 270, width: 20, height: 110 })).toEqual([
      'api-reads-db',
    ]);
    // Only partly inside: not taken.
    expect(linesWithin(indexed, { x: 850, y: 300, width: 50, height: 110 })).toEqual([]);
    const hidden = { has: (key: string) => key === 'api-reads-db' };
    expect(linesWithin(indexed, { x: 850, y: 270, width: 50, height: 110 }, hidden)).toEqual([
      'api-writes-db',
    ]);
  });
});

describe('Reset routes and Attach ends automatically', () => {
  const ofScheduling = selectionOf([{ kind: 'element', id: 'scheduling' }]);

  it('reset the routes by hand of the selected shapes’ lines, in one action', () => {
    const action = resetAction(routed, VIEW, buildScene(routed, VIEW), ofScheduling, 'routes');
    expect(action).toEqual({
      command: { type: 'reset-route', view: VIEW, relations: ['agent-to-api', 'api-reads-db'] },
      count: 2,
    });
    expect(resetDone('routes', 2)).toBe('Reset 2 routes.');
  });

  it('attach the ends by hand automatically, keeping the bend points', () => {
    const action = resetAction(routed, VIEW, buildScene(routed, VIEW), ofScheduling, 'ends');
    if (!('command' in action)) throw new Error(action.reason);
    expect(action.count).toBe(1);
    const after = run(routed, action.command);
    const routes = after.views.find((view) => view.id === VIEW)?.routes;
    expect(Object.keys(routes ?? {})).toEqual(['api-reads-db']);
    expect(routes?.['api-reads-db']?.bendPoints).toEqual([{ x: 862, y: 320 }]);
    expect(resetDone('ends', 1)).toBe('Attached the ends of 1 line automatically.');
  });

  it('say why they do nothing', () => {
    const drawn = buildScene(routed, VIEW);
    expect(resetAction(routed, VIEW, drawn, EMPTY_SELECTION, 'routes')).toEqual({
      reason: 'Select lines, or shapes, to reset their routes.',
    });
    expect(
      resetAction(routed, VIEW, drawn, selectionOf([{ kind: 'element', id: 'patient' }]), 'routes'),
    ).toEqual({ reason: 'Each of these lines is routed automatically already.' });
    expect(
      resetAction(
        routed,
        VIEW,
        drawn,
        selectionOf([{ kind: 'relation', id: 'api-reads-db' }]),
        'ends',
      ),
    ).toEqual({ reason: 'Each end of these lines is attached automatically already.' });
    expect(
      resetAction(routed, VIEW, drawn, selectionOf([{ kind: 'free-shape', id: 'x' }]), 'routes'),
    ).toEqual({ reason: 'The selection has no lines.' });
  });
});
