/**
 * Claude hears which attributes an element carries that its component does not define (M3d, "Fixes
 * from use"): in the answer of every write that sets them or that gives the element another
 * component, once per component and only those the write set (#17), and in full in `get_item`. They
 * are particularities (CONTEXT.md): kept, never refused. A component with open attributes (ADR 0105)
 * takes them on purpose, and nothing names them.
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
    openApp: () => Promise.resolve({ how: 'browser' as const }),
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
  it('are named in add_to_model’s answer once per component, and kept', async () => {
    const answer = await value('add_to_model', {
      label: 'Add the payments service',
      elements: [
        {
          id: 'payments',
          component: 'systems.service',
          name: 'Payments',
          attributes: { owner: 'Team B', default: 'now()', flavour: 'vanilla' },
        },
        {
          id: 'refunds',
          component: 'systems.service',
          name: 'Refunds',
          attributes: { flavour: 'mint', region: 'eu' },
        },
        { id: 'ledger', component: 'systems.database', name: 'Ledger' },
      ],
    });
    expect(answer.undefinedAttributes).toEqual([
      { component: 'systems.service', elements: 2, attributes: ['default', 'flavour', 'region'] },
    ]);
    expect(String(answer.undefinedAttributesNote)).toContain('particularities');
    expect(String(answer.undefinedAttributesNote)).toContain('openAttributes');
    const stored = session.snapshot.model.elements.find((each) => each.id === 'payments');
    expect(stored?.attributes).toEqual({ owner: 'Team B', default: 'now()', flavour: 'vanilla' });
  });

  it('are named when update_element sets one, or gives the element a component that lacks them', async () => {
    const set = await value('update_element', { id: 'api', attributes: { region: 'eu' } });
    expect(set.undefinedAttributes).toEqual([
      { component: 'systems.service', elements: 1, attributes: ['region'] },
    ]);
    const plain = await value('update_element', { id: 'db', name: 'Main DB' });
    expect(plain.undefinedAttributes).toBeUndefined();
    const moved = await value('update_element', { id: 'api', component: 'systems.person' });
    expect(moved.undefinedAttributes).toEqual([
      { component: 'systems.person', elements: 1, attributes: ['owner', 'region'] },
    ]);
  });

  it('leave out those the element already carried, unchanged, before the write', async () => {
    await value('update_element', { id: 'api', attributes: { region: 'eu', tier: 1 } });
    const again = await value('update_element', {
      id: 'api',
      attributes: { region: 'eu', zone: 'b' },
    });
    expect(again.undefinedAttributes).toEqual([
      { component: 'systems.service', elements: 1, attributes: ['zone'] },
    ]);
    const changed = await value('update_element', { id: 'api', attributes: { tier: 2 } });
    expect(changed.undefinedAttributes).toEqual([
      { component: 'systems.service', elements: 1, attributes: ['tier'] },
    ]);
    const same = await value('update_element', { id: 'api', attributes: { tier: 2 } });
    expect(same.undefinedAttributes).toBeUndefined();
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
        { type: 'update-element', id: 'db', changes: { attributes: { replicas: 2 } } },
      ],
    });
    expect(answer.undefinedAttributes).toEqual([
      { component: 'systems.service', elements: 1, attributes: ['durable'] },
      { component: 'systems.database', elements: 1, attributes: ['replicas'] },
    ]);
  });

  it('name each attribute once, at most 20 per component, never per element nor its value', async () => {
    const rows = Array.from({ length: 20 }, (_, n) => ({
      id: `row-${n}`,
      component: 'systems.service',
      name: `Row ${n}`,
      attributes: Object.fromEntries(
        Array.from({ length: 10 }, (_, k) => [`column${(n + k) % 25}`, `value ${n}-${k}`]),
      ),
    }));
    const answer = await value('add_to_model', { label: 'Add rows', elements: rows });
    const [entry, ...others] = answer.undefinedAttributes as Record<string, unknown>[];
    expect(others).toEqual([]);
    expect(entry).toEqual({
      component: 'systems.service',
      elements: 20,
      attributes: Array.from({ length: 20 }, (_, k) => `column${k}`),
      moreAttributes: 5,
    });
    expect(JSON.stringify(answer)).not.toContain('value 0-0');
    expect(JSON.stringify(answer.undefinedAttributes)).not.toContain('row-0');
  });

  it('are named by get_item, beside the definitions the element has', async () => {
    await value('update_element', { id: 'api', attributes: { region: 'eu' } });
    await value('update_element', { id: 'api', attributes: { zone: 'b' } });
    const item = await value('get_item', { id: 'api' });
    expect(item.undefinedAttributes).toEqual(['region', 'zone']);
    const db = await value('get_item', { id: 'db' });
    expect(db.undefinedAttributes).toBeUndefined();
  });
});

describe('a component with open attributes (ADR 0105)', () => {
  async function defineRow(openAttributes?: boolean) {
    await value('define_component', {
      package: 'shop',
      component: {
        id: 'shop.row',
        name: 'Row',
        derivesFrom: 'systems.box',
        ...(openAttributes === undefined ? {} : { openAttributes }),
      },
    });
  }

  it('takes attributes it does not define with no word about them in write answers', async () => {
    await defineRow(true);
    await value('define_component', {
      package: 'shop',
      component: { id: 'shop.wide-row', name: 'Wide row', derivesFrom: 'shop.row' },
    });
    const answer = await value('add_to_model', {
      label: 'Add rows',
      elements: [
        { id: 'r1', component: 'shop.row', name: 'R1', attributes: { a: 1, b: 2 } },
        { id: 'r2', component: 'shop.wide-row', name: 'R2', attributes: { c: 3 } },
      ],
    });
    expect(answer.undefinedAttributes).toBeUndefined();
    expect(answer.undefinedAttributesNote).toBeUndefined();
    const item = await value('get_item', { id: 'r2' });
    expect(item.undefinedAttributes).toBeUndefined();
    expect(item.openAttributes).toBe(true);
    expect(item.attributes).toEqual({ c: 3 });
  });

  it('is set and taken back with update_component, and list_definitions says so', async () => {
    await defineRow();
    await value('add_to_model', {
      label: 'Add a row',
      elements: [{ id: 'r1', component: 'shop.row', name: 'R1', attributes: { a: 1 } }],
    });
    expect((await value('get_item', { id: 'r1' })).undefinedAttributes).toEqual(['a']);
    await value('update_component', { id: 'shop.row', openAttributes: true });
    expect((await value('get_item', { id: 'r1' })).undefinedAttributes).toBeUndefined();
    const listed = await value('list_definitions', { package: 'shop' });
    const row = (listed.components as Record<string, unknown>[]).find(
      (each) => each.id === 'shop.row',
    );
    expect(row?.openAttributes).toBe(true);
    await value('update_component', { id: 'shop.row', openAttributes: null });
    expect((await value('get_item', { id: 'r1' })).undefinedAttributes).toEqual(['a']);
  });
});
