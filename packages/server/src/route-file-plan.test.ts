/** Which files a change to a view's routes touches (ADR 0039): only that view's file. */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { affectedFiles, contentOf } from './file-plan';
import { testProject } from './test-support';

function affected(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return { files: affectedFiles(outcome.operations, state, outcome.state), outcome };
}

describe('affectedFiles, for routes', () => {
  it('saves the view file when a route is set or reset, and its content holds the route', () => {
    const set = affected({
      type: 'set-route',
      view: 'overview',
      relation: 'customer-calls-api',
      to: { kind: 'border', side: 'left', at: 0.5 },
      style: 'curved',
    });
    expect(set.files).toEqual(['view:overview']);
    expect(set.outcome.ok && contentOf('view:overview', set.outcome.state)).toMatchObject({
      kind: 'view',
      value: {
        routes: {
          'customer-calls-api': { to: { kind: 'border', side: 'left', at: 0.5 }, style: 'curved' },
        },
      },
    });
    if (!set.outcome.ok) return;
    const reset = affected(
      { type: 'reset-route', view: 'overview', relations: ['customer-calls-api'] },
      set.outcome.state,
    );
    expect(reset.files).toEqual(['view:overview']);
  });

  it('saves the model and the view files when a delete takes a route with its relation', () => {
    const set = affected({
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      style: 'straight',
    });
    if (!set.outcome.ok) return;
    const deleted = affected({ type: 'delete', relations: ['api-reads-db'] }, set.outcome.state);
    expect(deleted.files).toEqual(['model', 'view:overview']);
  });
});
