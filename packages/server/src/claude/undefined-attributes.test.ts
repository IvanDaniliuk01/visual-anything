/**
 * Claude hears which attributes an element carries that its component does not define (M3d, "Fixes
 * from use"): in the answer of every write that sets them or that gives the element another
 * component, and in `get_item`. They are particularities (CONTEXT.md): kept, never refused.
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
  folder = await mkdtemp(join(tmpdir(), 'va-undefined-'));
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

describe('attributes a component does not define', () => {
  it('are named in add_to_model’s answer, and kept', async () => {
    const answer = await value('add_to_model', {
      label: 'Add the payments service',
      elements: [
        {
          id: 'payments',
          component: 'systems.service',
          name: 'Payments',
          attributes: { owner: 'Team B', default: 'now()', flavour: 'vanilla' },
        },
        { id: 'ledger', component: 'systems.database', name: 'Ledger' },
      ],
    });
    expect(answer.undefinedAttributes).toEqual([
      {
        element: 'payments',
        name: 'Payments',
        component: 'systems.service',
        attributes: ['default', 'flavour'],
      },
    ]);
    expect(String(answer.undefinedAttributesNote)).toContain('particularities');
    const stored = session.snapshot.model.elements.find((each) => each.id === 'payments');
    expect(stored?.attributes).toEqual({ owner: 'Team B', default: 'now()', flavour: 'vanilla' });
  });

  it('are named when update_element sets one, or gives the element a component that lacks them', async () => {
    const set = await value('update_element', { id: 'api', attributes: { region: 'eu' } });
    expect(set.undefinedAttributes).toEqual([
      { element: 'api', name: 'API', component: 'systems.service', attributes: ['region'] },
    ]);
    const plain = await value('update_element', { id: 'db', name: 'Main DB' });
    expect(plain.undefinedAttributes).toBeUndefined();
  });

  it('are named for the elements a run_commands batch creates or changes', async () => {
    const answer = await value('run_commands', {
      label: 'Add a queue',
      commands: [
        {
          type: 'create-element',
          element: {
            id: 'queue',
            component: 'systems.service',
            name: 'Queue',
            attributes: { durable: true },
          },
        },
        { type: 'update-element', id: 'api', changes: { attributes: { owner: 'Team C' } } },
      ],
    });
    expect(answer.undefinedAttributes).toEqual([
      { element: 'queue', name: 'Queue', component: 'systems.service', attributes: ['durable'] },
    ]);
  });

  it('are named by get_item, beside the definitions the element has', async () => {
    await value('update_element', { id: 'api', attributes: { region: 'eu' } });
    const item = await value('get_item', { id: 'api' });
    expect(item.undefinedAttributes).toEqual(['region']);
    const db = await value('get_item', { id: 'db' });
    expect(db.undefinedAttributes).toBeUndefined();
  });
});
