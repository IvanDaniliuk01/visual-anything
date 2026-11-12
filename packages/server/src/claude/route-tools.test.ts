/**
 * Claude's tools for routes chosen by hand (ADR 0039): `set_route` and `reset_route`, each one
 * undoable action labelled Claude.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { testProject, writeProjectFolder } from '../test-support';
import type { Program } from './bridge';
import { TOOLS, runTool, type ToolOutcome } from './tools';

let folder: string;
let session: Session;

/** The tools' program, straight on a session: commands run as Claude's, as through the endpoint. */
function programOf(target: Session): Program {
  return {
    project: () => Promise.resolve(target.snapshot),
    execute: async (command: Command) => {
      const outcome = await target.execute(command, 'claude');
      return outcome.ok
        ? {
            ok: true,
            label: outcome.label,
            changed: outcome.recorded,
            created: outcome.created,
            warnings: outcome.warnings,
          }
        : { ok: false, problems: outcome.problems };
    },
    guide: (guidance) => target.guide(guidance),
    openApp: () => Promise.resolve({ how: 'browser' as const }),
  };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-route-tools-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok) throw new Error('The test project does not open.');
  session = result.session;
});

afterEach(async () => {
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function call(name: string, args: unknown): Promise<ToolOutcome> {
  const definition = TOOLS.find((each) => each.name === name);
  if (!definition) throw new Error(`There is no tool ${name}.`);
  return runTool(definition, args, programOf(session));
}

async function value(name: string, args: unknown): Promise<Record<string, unknown>> {
  const outcome = await call(name, args);
  if (!outcome.ok) throw new Error(`${name} failed: ${outcome.message}`);
  return outcome.value as Record<string, unknown>;
}

async function failure(name: string, args: unknown): Promise<string> {
  const outcome = await call(name, args);
  if (outcome.ok) throw new Error(`${name} worked: ${JSON.stringify(outcome.value)}`);
  return outcome.message;
}

const routes = () => session.snapshot.views.find((view) => view.id === 'overview')?.routes;

describe('set_route', () => {
  it('routes a relation by hand as one action labelled Claude, and answers with the route', async () => {
    const answer = await value('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      to: { kind: 'border', side: 'left', at: 0.25 },
      style: 'curved',
    });
    expect(answer).toEqual({
      done: 'Route "HTTPS" by hand in "Overview"',
      undo: 'The person can undo it in the app.',
      route: { to: { kind: 'border', side: 'left', at: 0.25 }, style: 'curved' },
      bendPointsRelativeTo: 'the canvas',
      automaticStyle: { style: 'orthogonal', from: 'nothing sets one, so it is orthogonal' },
    });
    expect(session.history.undo?.author).toBe('claude');
    expect(routes()).toEqual({
      'customer-calls-api': { to: { kind: 'border', side: 'left', at: 0.25 }, style: 'curved' },
    });
  });

  it('says which container the bend points are relative to', async () => {
    const answer = await value('set_route', {
      view: 'overview',
      relation: 'api-reads-db',
      bendPoints: [{ x: 120, y: 100 }],
    });
    expect(answer).toMatchObject({
      route: { container: 'system', bendPoints: [{ x: 120, y: 100 }] },
      bendPointsRelativeTo: { container: 'system', name: 'Shop system' },
    });
  });

  it('attaches an end automatically again with null, and says when the route is automatic', async () => {
    await value('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      from: { kind: 'border', side: 'right', at: 0.5 },
    });
    expect(
      await value('set_route', { view: 'overview', relation: 'customer-calls-api', from: null }),
    ).toMatchObject({ done: 'Reset the route of "HTTPS" in "Overview"', route: 'automatic' });
    expect(routes()).toBeUndefined();
  });

  it('says why it refuses, with the problem code', async () => {
    const message = await failure('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      to: { kind: 'connection-point', name: 'in' },
    });
    expect(message).toContain('has no connection point named "in"');
    expect(message).toContain('(unknown-connection-point)');
    expect(routes()).toBeUndefined();
  });
});

describe('reset_route', () => {
  it('routes relations automatically again as one action', async () => {
    await value('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      style: 'straight',
    });
    await value('set_route', { view: 'overview', relation: 'api-reads-db', style: 'curved' });
    expect(
      await value('reset_route', {
        view: 'overview',
        relations: ['customer-calls-api', 'api-reads-db'],
      }),
    ).toMatchObject({ done: 'Reset 2 routes in "Overview"' });
    expect(routes()).toBeUndefined();
    expect(
      await value('reset_route', { view: 'overview', relations: ['customer-calls-api'] }),
    ).toEqual({ done: 'Nothing changed, so nothing was recorded.' });
  });

  it('resets every route of the view with all, and only the ends with attach (ADR 0092)', async () => {
    await value('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      to: { kind: 'border', side: 'left', at: 0.25 },
      style: 'straight',
    });
    await value('set_route', { view: 'overview', relation: 'api-reads-db', style: 'curved' });
    const attached = await value('reset_route', { view: 'overview', all: true, attach: true });
    expect(String(attached.done)).toMatch(/^Attach the ends of ".+" automatically in "Overview"$/);
    expect(routes()).toEqual({
      'customer-calls-api': { style: 'straight' },
      'api-reads-db': { style: 'curved' },
    });
    expect(
      await value('reset_route', { view: 'overview', relations: ['api-reads-db'], attach: true }),
    ).toEqual({
      done: 'Nothing changed, so nothing was recorded.',
      why: 'No end of these lines is attached by hand in this view.',
    });
    expect(await value('reset_route', { view: 'overview', all: true })).toMatchObject({
      done: 'Reset 2 routes in "Overview"',
    });
    expect(routes()).toBeUndefined();
    expect(await value('reset_route', { view: 'overview', all: true })).toEqual({
      done: 'Nothing changed, so nothing was recorded.',
      why: 'This view routes no relation by hand.',
    });
  });

  it('takes the relations or all, and not both', async () => {
    const both = await failure('reset_route', {
      view: 'overview',
      relations: ['api-reads-db'],
      all: true,
    });
    expect(both).toContain('not both');
    expect(await failure('reset_route', { view: 'overview' })).toContain('all: true');
    expect(await failure('reset_route', { view: 'nowhere', all: true })).toBe(
      'There is no view "nowhere".',
    );
  });
});

describe('the route tools', () => {
  it('write, and run_commands names their commands', () => {
    for (const name of ['set_route', 'reset_route']) {
      const each = TOOLS.find((tool) => tool.name === name);
      expect(each?.hints.readOnlyHint).toBe(false);
      expect(each?.description).toContain('Example:');
    }
    const run = TOOLS.find((tool) => tool.name === 'run_commands');
    expect(run?.description).toContain('"set-route"');
    expect(run?.description).toContain('"reset-route"');
  });
});
