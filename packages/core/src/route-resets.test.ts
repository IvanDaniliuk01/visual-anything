/**
 * Getting back to automatic routes (ADR 0092 §1): Reset routes forgets the routes by hand of the
 * relations given, Attach ends automatically forgets only where their ends attach, and both act on
 * every route of a view with `all`. Each is one action, and none is made when nothing would change.
 */
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { attachEndsCommand, resetRoutesCommand, routesByHandIn } from './route-resets';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';

function run(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(state, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

const routesOf = (state: ProjectSnapshot) =>
  state.views.find((view) => view.id === 'overview')?.routes;

/** The test project with both of its lines routed by hand: one through bend points, attached by hand too. */
function routed(): ProjectSnapshot {
  let state = testProject();
  state = run(state, {
    type: 'set-route',
    view: 'overview',
    relation: 'client-calls-api',
    from: { kind: 'border', side: 'right', at: 0.5 },
    bendPoints: [{ x: -40, y: 76 }],
  });
  state = run(state, {
    type: 'set-route',
    view: 'overview',
    relation: 'api-reads-db',
    style: 'curved',
  });
  return state;
}

describe('routesByHandIn', () => {
  it('lists the relations a view routes by hand, in its file’s order', () => {
    expect(routesByHandIn(routed(), 'overview')).toEqual(['client-calls-api', 'api-reads-db']);
    expect(routesByHandIn(testProject(), 'overview')).toEqual([]);
    expect(routesByHandIn(testProject(), 'nowhere')).toEqual([]);
  });
});

describe('resetRoutesCommand', () => {
  it('resets those of the relations given that are routed by hand, in one action', () => {
    const state = routed();
    const command = resetRoutesCommand(state, 'overview', [
      'client-calls-api',
      'contract-governs-call',
    ]);
    expect(command).toEqual({
      type: 'reset-route',
      view: 'overview',
      relations: ['client-calls-api'],
    });
    expect(Object.keys(routesOf(run(state, command as Command)) ?? {})).toEqual(['api-reads-db']);
  });

  it('resets every route of the view with all', () => {
    const state = routed();
    const command = resetRoutesCommand(state, 'overview', 'all');
    expect(command).toEqual({
      type: 'reset-route',
      view: 'overview',
      relations: ['client-calls-api', 'api-reads-db'],
    });
    expect(routesOf(run(state, command as Command))).toBeUndefined();
  });

  it('makes nothing when none of them is routed by hand', () => {
    expect(resetRoutesCommand(testProject(), 'overview', ['client-calls-api'])).toBeUndefined();
    expect(resetRoutesCommand(testProject(), 'overview', 'all')).toBeUndefined();
    expect(resetRoutesCommand(routed(), 'nowhere', 'all')).toBeUndefined();
  });
});

describe('attachEndsCommand', () => {
  it('forgets where the ends attach and keeps the bend points and the style', () => {
    const state = routed();
    const command = attachEndsCommand(state, 'overview', ['client-calls-api', 'api-reads-db']);
    expect(command).toEqual({
      type: 'batch',
      label: 'Attach the ends of "Client → API" automatically in "Overview"',
      commands: [{ type: 'set-route', view: 'overview', relation: 'client-calls-api', from: null }],
    });
    expect(routesOf(run(state, command as Command))).toEqual({
      'client-calls-api': { bendPoints: [{ x: -40, y: 76 }] },
      'api-reads-db': { style: 'curved' },
    });
  });

  it('attaches the ends of several routes in one action, labelled with their count', () => {
    let state = routed();
    state = run(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      to: { kind: 'border', side: 'top', at: 0.25 },
    });
    const command = attachEndsCommand(state, 'overview', 'all');
    expect(command).toEqual({
      type: 'batch',
      label: 'Attach the ends of 2 lines automatically in "Overview"',
      commands: [
        { type: 'set-route', view: 'overview', relation: 'client-calls-api', from: null },
        { type: 'set-route', view: 'overview', relation: 'api-reads-db', to: null },
      ],
    });
    const done = executeCommand(state, command as Command);
    expect(done.ok && done.label).toBe('Attach the ends of 2 lines automatically in "Overview"');
  });

  it('makes nothing when no end of them is attached by hand', () => {
    expect(attachEndsCommand(routed(), 'overview', ['api-reads-db'])).toBeUndefined();
    expect(attachEndsCommand(testProject(), 'overview', 'all')).toBeUndefined();
  });
});
