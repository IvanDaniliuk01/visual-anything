/**
 * Claude's tools while its changes wait in a proposal (ADR 0073): every write tool's answer says the
 * change was proposed and not applied, `run_commands` takes `propose`, the read tools read the
 * proposed copy and say so, `read_proposal` says what waits or how it ended, and `withdraw_proposal`
 * takes it back. The whole way goes from an MCP client through the bridge to a running program.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { openPreferences } from '../preferences';
import type { LiveClient } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS } from './tools';

let tools: ToolHarness | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
});

async function harness(review: boolean): Promise<ToolHarness> {
  const { store } = await openPreferences(null);
  if (review) await store.set({ reviewClaude: true });
  tools = await startToolHarness(undefined, { preferences: store });
  return tools;
}

const SERVICES = { component: 'systems.service', exactComponent: true };
const WORKER = { elements: [{ component: 'systems.service', name: 'Worker' }] };

/** Waits until an app has been shown a proposal, or told how one closed, and gives the last. */
async function lastOf<T extends 'proposal/shown' | 'proposal/closed'>(app: LiveClient, type: T) {
  await expect
    .poll(() => app.messages.some((each) => each.type === type), { timeout: 5000 })
    .toBe(true);
  const found = app.messages.filter((each) => each.type === type).at(-1);
  return found as Extract<LiveClient['messages'][number], { type: T }>;
}

describe('a write tool while the person reviews Claude’s changes', () => {
  it('answers that the change was proposed, not applied', async () => {
    const { session, value } = await harness(true);
    const answer = await value('add_to_model', WORKER);
    expect(answer).toMatchObject({
      proposed: 'Create "Worker"',
      applied: false,
      proposal: expect.any(String),
      changes: [expect.stringMatching(/^element:.* added$/)],
      review: expect.stringContaining('open_app'),
    });
    expect(answer.note).toMatch(/^Proposed, not applied/);
    expect(answer).not.toHaveProperty('done');
    expect(answer).not.toHaveProperty('undo');
    expect(session.snapshot.model.elements.some((each) => each.name === 'Worker')).toBe(false);
    expect(session.history).toEqual({});
  });

  it('says an app is open to review it', async () => {
    const { value, openApp } = await harness(true);
    await openApp();
    const answer = await value('update_element', { id: 'api', name: 'Gateway' });
    expect(answer.review).toMatch(/^An app is open/);
  });
});

describe('the read tools while a proposal waits', () => {
  it('read the proposed copy, and say it holds changes not yet applied', async () => {
    const { value, asPerson, session } = await harness(true);
    const before = await value('find_elements', SERVICES);
    expect(before).not.toHaveProperty('proposed');
    const made = await value('add_to_model', WORKER);

    const found = await value('find_elements', SERVICES);
    expect(found).toMatchObject({ total: 2, proposed: expect.stringContaining(String(made.proposal)) });
    const brief = await value('get_project');
    expect(brief.proposed).toMatch(/not yet applied/);

    // The person's action rebases it, and Claude reads both.
    await asPerson({ type: 'update-element', id: 'db', changes: { name: 'Store' } });
    const db = await value('get_item', { id: 'db' });
    expect(JSON.stringify(db)).toContain('Store');
    expect(await value('find_elements', SERVICES)).toMatchObject({ total: 2 });
    expect(session.snapshot.model.elements.some((each) => each.name === 'Worker')).toBe(false);
  });

  it('read the project now again once the proposal closes', async () => {
    const { value } = await harness(true);
    await value('add_to_model', WORKER);
    await value('withdraw_proposal');
    const found = await value('find_elements', SERVICES);
    expect(found).toMatchObject({ total: 1 });
    expect(found).not.toHaveProperty('proposed');
  });
});

describe('run_commands with propose', () => {
  it('proposes its commands while the review is off', async () => {
    const { value, session } = await harness(false);
    const direct = await value('update_element', { id: 'db', name: 'Store' });
    expect(direct).toHaveProperty('done');

    const answer = await value('run_commands', {
      label: 'Rename the API',
      propose: true,
      commands: [{ type: 'update-element', id: 'api', changes: { name: 'Gateway' } }],
    });
    expect(answer).toMatchObject({ proposed: 'Rename the API', applied: false });
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('API');
  });

  it('describes propose, with an example', () => {
    const runCommands = TOOLS.find((each) => each.name === 'run_commands');
    expect(Object.keys(runCommands?.input ?? {})).toContain('propose');
    expect(runCommands?.description).toContain('"propose": true');
  });
});

describe('read_proposal', () => {
  it('says when none waits', async () => {
    const { value } = await harness(true);
    expect(await value('read_proposal')).toMatchObject({ waiting: false });
  });

  it('lists the changes that wait, with what each needs and whose too', async () => {
    const { value, asPerson } = await harness(true);
    await value('add_to_model', {
      elements: [{ ref: 'cache', component: 'systems.database', name: 'Cache' }],
      relations: [{ from: 'api', to: 'cache', relationType: 'systems.reads-from' }],
    });
    await value('update_element', { id: 'api', name: 'Gateway' });
    await asPerson({ type: 'update-element', id: 'api', changes: { name: 'Edge' } });
    // Claude's value wins in the proposed project, so only the proposal's marks tell of the change.
    await expect
      .poll(async () => JSON.stringify(await value('read_proposal')), { timeout: 5000 })
      .toContain('changedByPersonToo');

    const read = await value('read_proposal');
    expect(read).toMatchObject({ waiting: true, labels: [expect.any(String), expect.any(String)] });
    const changes = read.changes as {
      key: string;
      status: string;
      name?: string;
      needs?: string[];
      changedByPersonToo?: boolean;
      differs?: string[];
    }[];
    const element = changes.find((each) => each.name === 'Cache');
    expect(element).toMatchObject({ status: 'added' });
    const relation = changes.find((each) => each.key.startsWith('relation:'));
    expect(relation?.needs).toContain(element?.key);
    const renamed = changes.find((each) => each.key === 'element:api changed');
    expect(renamed).toMatchObject({ changedByPersonToo: true, differs: ['name'] });
    expect(read).not.toHaveProperty('proposed');
  });

  it('says what the person accepted, and Claude reads the project as it then is', async () => {
    const { value, openApp, session } = await harness(true);
    const app = await openApp();
    await value('add_to_model', {
      elements: [
        { component: 'systems.service', name: 'Worker' },
        { component: 'systems.database', name: 'Cache' },
      ],
    });
    const shown = await lastOf(app, 'proposal/shown');
    const [first] = shown.proposal.changes;
    app.send({
      type: 'proposal/accept',
      requestId: 'accept',
      proposal: shown.proposal.id,
      changes: [first?.key],
    });
    const closed = await lastOf(app, 'proposal/closed');
    expect(closed).toMatchObject({ how: 'accepted', requestId: 'accept' });

    await expect
      .poll(async () => (await value('read_proposal')).waiting, { timeout: 5000 })
      .toBe(false);
    const read = await value('read_proposal');
    expect(read).toMatchObject({
      last: { proposal: shown.proposal.id, how: 'accepted', accepted: [first?.key] },
    });
    expect(session.history.undo?.author).toBe('claude');
    const names = session.snapshot.model.elements.map((each) => each.name);
    const found = await value('find_elements', {});
    expect(found.total).toBe(names.length);
  });

  it('says a refused proposal applied nothing', async () => {
    const { value, openApp } = await harness(true);
    const app = await openApp();
    await value('add_to_model', WORKER);
    const shown = await lastOf(app, 'proposal/shown');
    app.send({ type: 'proposal/refuse', requestId: 'no', proposal: shown.proposal.id });
    await lastOf(app, 'proposal/closed');
    await expect
      .poll(async () => (await value('read_proposal')).waiting, { timeout: 5000 })
      .toBe(false);
    expect(await value('read_proposal')).toMatchObject({ last: { how: 'refused' } });
    expect(await value('find_elements', SERVICES)).toMatchObject({ total: 1 });
  });
});

describe('withdraw_proposal', () => {
  it('withdraws Claude’s own proposal, and every app hears of it', async () => {
    const { value, failure, openApp, session } = await harness(true);
    const app = await openApp();
    const made = await value('add_to_model', WORKER);
    expect(await value('withdraw_proposal')).toEqual({
      withdrawn: made.proposal,
      note: expect.any(String),
    });
    const closed = await lastOf(app, 'proposal/closed');
    expect(closed).toMatchObject({ how: 'withdrawn', proposal: made.proposal });
    expect(session.history).toEqual({});
    expect(await failure('withdraw_proposal')).toMatch(/No proposal of yours waits/);
  });
});

describe('the descriptions', () => {
  it('give read_proposal and withdraw_proposal an example each', () => {
    for (const name of ['read_proposal', 'withdraw_proposal']) {
      const tool = TOOLS.find((each) => each.name === name);
      expect(tool?.description).toContain('Example:');
    }
    expect(TOOLS.find((each) => each.name === 'read_proposal')?.hints.readOnlyHint).toBe(true);
    expect(TOOLS.find((each) => each.name === 'withdraw_proposal')?.hints.readOnlyHint).toBe(false);
  });
});
