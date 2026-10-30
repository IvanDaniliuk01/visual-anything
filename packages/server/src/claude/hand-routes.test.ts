/**
 * Claude hears which relations a view routes by hand (M3d, "Fixes from use"): routes the person drew,
 * or that Claude set, which layout and moves never write (ADR 0039); their bend points follow their
 * ends (its clarification of 2026-10-30). read_view and get_item name them, and set_positions and
 * update_view say which of them a change may leave running through bend points far from their ends,
 * so that Claude can reset_route them.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { testProject, writeProjectFolder } from '../test-support';
import type { Program } from './bridge';
import { TOOLS, runTool } from './tools';

let folder: string;
let session: Session;

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
    openApp: () => Promise.resolve(),
  };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-hand-routes-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok) throw new Error('The test project does not open.');
  session = result.session;
});

afterEach(async () => {
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function value(name: string, args: unknown): Promise<Record<string, unknown>> {
  const definition = TOOLS.find((each) => each.name === name);
  if (!definition) throw new Error(`There is no tool ${name}.`);
  const outcome = await runTool(definition, args, programOf(session));
  if (!outcome.ok) throw new Error(`${name} failed: ${outcome.message}`);
  return outcome.value as Record<string, unknown>;
}

/** The person routes "API reads DB" by hand, through two bend points, and attaches its start. */
async function drawnByHand(): Promise<void> {
  const outcome = await session.execute(
    {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      from: { kind: 'border', side: 'bottom', at: 0.592 },
      bendPoints: [
        { x: 184, y: 82 },
        { x: 184, y: 648 },
      ],
    },
    'user',
  );
  if (!outcome.ok) throw new Error('The route was refused.');
}

const API_READS_DB = {
  relation: 'api-reads-db',
  name: 'API → DB',
  sets: ['from', 'bendPoints'],
  bendPoints: 2,
};

describe('relations routed by hand', () => {
  it('are named by read_view, with what each route sets and what to do about it', async () => {
    expect((await value('read_view', { view: 'overview' })).routedByHand).toBeUndefined();
    await drawnByHand();
    const view = await value('read_view', { view: 'overview' });
    expect(view.routedByHand).toEqual([API_READS_DB]);
    expect(String(view.routedByHandNote)).toContain('reset_route');
  });

  it('are named by get_item, for a relation and for the elements it joins', async () => {
    await drawnByHand();
    const relation = await value('get_item', { id: 'api-reads-db' });
    expect(relation.routedByHandIn).toEqual([{ view: 'overview', name: 'Overview' }]);
    const api = await value('get_item', { id: 'api' });
    expect(api.relationsRoutedByHand).toEqual([{ relation: 'api-reads-db', view: 'overview' }]);
    const customer = await value('get_item', { id: 'customer' });
    expect(customer.relationsRoutedByHand).toBeUndefined();
  });

  it('are named by set_positions when it moves their ends apart, the bend points next to a moved end following it', async () => {
    await drawnByHand();
    const answer = await value('set_positions', {
      view: 'overview',
      positions: [{ element: 'api', container: 'system', x: 200, y: 40 }],
    });
    expect(answer.routesByHandNotFollowing).toEqual([API_READS_DB]);
    expect(String(answer.routesByHandNote)).toContain('reset_route');
    // The API leaves by its bottom: the run down from it, through both bend points, moves across with
    // it (ADR 0039's clarification of 2026-10-30).
    const route = session.snapshot.views[0]?.routes?.['api-reads-db'];
    expect(route?.bendPoints).toEqual([
      { x: 364, y: 82 },
      { x: 364, y: 648 },
    ]);
    // Both ends moved together carry the bend points with them: none is named.
    const together = await value('set_positions', {
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 208, y: 48 },
        { element: 'db', container: 'system', x: 28, y: 168 },
      ],
    });
    expect(together.routesByHandNotFollowing).toBeUndefined();
    expect(session.snapshot.views[0]?.routes?.['api-reads-db']?.bendPoints).toEqual([
      { x: 372, y: 90 },
      { x: 372, y: 656 },
    ]);
    // A move of shapes that no hand route ends on names none.
    const other = await value('set_positions', {
      view: 'overview',
      positions: [{ element: 'customer', x: -260, y: 40, pinned: true }],
    });
    expect(other.routesByHandNotFollowing).toBeUndefined();
  });

  it('are named by update_view when a route style draws them through their bend points', async () => {
    await drawnByHand();
    const answer = await value('update_view', { id: 'overview', routeStyle: 'curved' });
    expect(answer.routesByHandTakingIt).toEqual([API_READS_DB]);
  });

  it('go once reset_route sends them back to automatic routes', async () => {
    await drawnByHand();
    await value('reset_route', { view: 'overview', relations: ['api-reads-db'] });
    expect((await value('read_view', { view: 'overview' })).routedByHand).toBeUndefined();
    expect((await value('get_item', { id: 'api-reads-db' })).routedByHandIn).toBeUndefined();
  });
});
