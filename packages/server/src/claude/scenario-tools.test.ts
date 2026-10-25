import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const scenarioNamed = (name: string) =>
  tools.session.snapshot.scenarios.find((each) => each.name === name);
const request = () => tools.session.snapshot.scenarios.find((each) => each.id === 'request');
const asPerson = (command: Parameters<ToolHarness['asPerson']>[0]) => tools.asPerson(command);

describe('create_scenario_from_steps', () => {
  it('creates a scenario from steps, several relations at once, as one action of Claude’s', async () => {
    const created = await tools.value('create_scenario_from_steps', {
      name: 'Checkout',
      description: 'From the log of order 1042.',
      view: 'overview',
      steps: [
        {
          description: 'The customer pays.',
          relations: ['customer-calls-api'],
          dataIn: { order: 1042 },
        },
        {
          description: 'The API reads the stock while it checks the system.',
          relations: ['api-reads-db', 'api-in-system'],
          dataOut: { inStock: true },
        },
      ],
    });
    expect(created).toMatchObject({
      done: 'Create the scenario "Checkout"',
      undo: 'The person can undo it in the app.',
      steps: 2,
    });
    expect(created.next).toMatch(/play_scenario/);
    const checkout = scenarioNamed('Checkout');
    expect(created.scenario).toBe(checkout?.id);
    expect(checkout).toMatchObject({
      view: 'overview',
      description: 'From the log of order 1042.',
      steps: [
        {
          description: 'The customer pays.',
          relations: ['customer-calls-api'],
          dataIn: { order: 1042 },
        },
        { relations: ['api-reads-db', 'api-in-system'], dataOut: { inStock: true } },
      ],
    });
    expect(tools.session.history.undo).toEqual({
      label: 'Create the scenario "Checkout"',
      author: 'claude',
    });
  });

  it('refuses relations the model does not have, naming each, so that Claude asks the person', async () => {
    const message = await tools.failure('create_scenario_from_steps', {
      name: 'From a log',
      view: 'overview',
      steps: [
        { description: 'GET /cart', relations: ['customer-calls-api'] },
        { description: 'cache miss', relations: ['api-reads-cache', 'api-reads-db'] },
        { description: 'POST /ship', relations: ['api-calls-shipping'] },
      ],
    });
    expect(message).toBe(
      'Not created: the model has no relation with these ids: step 2 uses "api-reads-cache"; step 3 uses "api-calls-shipping". Ask the person what those lines map to, or offer to add the relations first with add_to_model; find_relations finds the ones that exist.',
    );
    expect(tools.session.snapshot.scenarios).toHaveLength(1);
  });

  it('refuses a view that does not exist, a step without relations, and what the core refuses', async () => {
    expect(
      await tools.failure('create_scenario_from_steps', { name: 'X', view: 'nowhere', steps: [] }),
    ).toMatch(/There is no view "nowhere"/);
    expect(
      await tools.failure('create_scenario_from_steps', {
        name: 'X',
        view: 'overview',
        steps: [{ description: 'Nothing', relations: [] }],
      }),
    ).toMatch(/relations/);
    expect(
      await tools.failure('create_scenario_from_steps', {
        name: 'X',
        view: 'overview',
        steps: [{ description: 'Twice', relations: ['api-reads-db', 'api-reads-db'] }],
      }),
    ).toBe('Refused, so nothing changed: Step 1 lists the same relation twice. (invalid-command)');
  });
});

describe('update_scenario', () => {
  it('renames it and edits its steps in order, as one action', async () => {
    const result = await tools.value('update_scenario', {
      scenario: 'request',
      name: 'A request, read',
      edits: [
        {
          op: 'add',
          at: 2,
          step: { description: 'The API checks its system.', relations: ['api-in-system'] },
        },
        { op: 'describe', step: 'call', description: 'The customer calls the API over HTTPS.' },
        { op: 'set-data', step: 'read', dataIn: { query: 'stock' }, dataOut: null },
        { op: 'move', step: 3, to: 1 },
      ],
    });
    expect(result).toMatchObject({ done: 'Edit the scenario "A request, read"', steps: 3 });
    expect(request()?.steps).toEqual([
      {
        id: 'read',
        description: 'The API reads the DB.',
        relations: ['api-reads-db'],
        dataIn: { query: 'stock' },
      },
      {
        id: 'call',
        description: 'The customer calls the API over HTTPS.',
        relations: ['customer-calls-api'],
      },
      {
        id: expect.any(String) as string,
        description: 'The API checks its system.',
        relations: ['api-in-system'],
      },
    ]);
    expect(tools.session.history.undo).toEqual({
      label: 'Edit the scenario "A request, read"',
      author: 'claude',
    });
  });

  it('adds a relation to a step and takes one out, and removes a step', async () => {
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'add-relation', step: 1, relation: 'api-in-system' }],
    });
    expect(request()?.steps[0]?.relations).toEqual(['customer-calls-api', 'api-in-system']);
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [
        { op: 'remove-relation', step: 'call', relation: 'customer-calls-api' },
        { op: 'remove', step: 'read' },
      ],
    });
    expect(request()?.steps).toEqual([
      { id: 'call', description: 'The customer calls the API.', relations: ['api-in-system'] },
    ]);
  });

  it('repairs a broken step, and says which steps are still broken', async () => {
    await asPerson({ type: 'delete', relations: ['api-reads-db'] });
    const read = await tools.value('read_scenario', { scenario: 'request' });
    expect(read.brokenSteps).toEqual([{ number: 2, step: 'read', missing: ['api-reads-db'] }]);
    expect(
      await tools.failure('update_scenario', {
        scenario: 'request',
        edits: [{ op: 'repair', step: 'read' }],
      }),
    ).toMatch(/edit 1 \(repair\): step 2 uses only relations that were deleted: give by/);
    const renamed = await tools.value('update_scenario', {
      scenario: 'request',
      name: 'Still broken',
    });
    expect(renamed).toMatchObject({ brokenSteps: [2] });
    const repaired = await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'repair', step: 'read', by: 'db-in-system' }],
    });
    expect(repaired.brokenSteps).toBeUndefined();
    expect(request()?.steps[1]).toMatchObject({
      id: 'read',
      relations: ['db-in-system'],
      dataOut: { rows: 3 },
    });
  });

  it.each([
    [
      'a relation the model does not have',
      [{ op: 'add', step: { description: 'Ship.', relations: ['api-calls-shipping'] } }],
      /edit 1 \(add\): the model has no relation with these ids: step 3 uses "api-calls-shipping"\. Ask the person/,
    ],
    [
      'adding a relation the model does not have',
      [{ op: 'add-relation', step: 1, relation: 'nothing' }],
      /edit 1 \(add-relation\): the model has no relation "nothing"\. Ask the person/,
    ],
    [
      'a step that is not there',
      [{ op: 'remove', step: 'nothing' }],
      /edit 1 \(remove\): the scenario has no step "nothing" there: it has 2 steps\./,
    ],
    [
      'a number past the last step, after the edits before it',
      [
        { op: 'remove', step: 1 },
        { op: 'describe', step: 2, description: 'Gone.' },
      ],
      /edit 2 \(describe\): the scenario has no step 2 there: it has 1 step\./,
    ],
    [
      'taking out a step’s only relation',
      [{ op: 'remove-relation', step: 'call', relation: 'customer-calls-api' }],
      /step 1 would be left with no relation: remove the step instead/,
    ],
    [
      'taking out a relation the step does not use',
      [{ op: 'remove-relation', step: 'call', relation: 'api-reads-db' }],
      /step 1 does not use "api-reads-db"/,
    ],
  ])('refuses %s, changing nothing', async (_case, edits, message) => {
    const before = request();
    expect(await tools.failure('update_scenario', { scenario: 'request', edits })).toMatch(message);
    expect(request()).toBe(before);
  });

  it('refuses a scenario that does not exist, and a call that changes nothing', async () => {
    expect(await tools.failure('update_scenario', { scenario: 'nothing', name: 'X' })).toMatch(
      /There is no scenario "nothing"/,
    );
    expect(await tools.failure('update_scenario', { scenario: 'request', edits: [] })).toMatch(
      /Give something to change/,
    );
  });
});

describe('delete_scenario', () => {
  it('deletes a scenario as one action, and refuses one that does not exist', async () => {
    expect(await tools.value('delete_scenario', { scenario: 'request' })).toMatchObject({
      done: 'Delete the scenario "A request"',
    });
    expect(tools.session.snapshot.scenarios).toEqual([]);
    expect(await tools.failure('delete_scenario', { scenario: 'request' })).toMatch(
      /^Refused, so nothing changed: .*request/,
    );
  });
});

describe('read_scenario', () => {
  it('numbers the steps and says which play as one inside a collapsed container', async () => {
    await asPerson({
      type: 'set-collapsed',
      view: 'overview',
      elements: ['system'],
      collapsed: true,
    });
    const read = await tools.value('read_scenario', { scenario: 'request' });
    expect((read.steps as { number: number }[]).map((step) => step.number)).toEqual([1, 2]);
    expect(read.brokenSteps).toEqual([]);
    expect(read.playsAs).toEqual({
      steps: 2,
      aggregated: [{ steps: [2], container: 'system', containerName: 'Shop system' }],
    });
  });
});

describe('playing a scenario in the app', () => {
  it('sends each request to the open app as playback guidance, changing nothing', async () => {
    const app = await tools.openApp();
    const before = tools.session.snapshot;
    expect(await tools.value('open_scenario', { scenario: 'request' })).toEqual({ shown: 1 });
    await tools.value('play_scenario', { scenario: 'request' });
    await tools.value('pause_scenario', { scenario: 'request' });
    await tools.value('go_to_step', { scenario: 'request', step: 2 });
    await tools.value('go_to_step', { scenario: 'request', step: 'call' });
    await tools.value('next_step', { scenario: 'request' });
    await tools.value('previous_step', { scenario: 'request' });
    await expect.poll(() => tools.guidanceOf(app).length).toBe(7);
    expect(tools.guidanceOf(app)).toEqual([
      { kind: 'playback', scenario: 'request', action: 'open' },
      { kind: 'playback', scenario: 'request', action: 'play' },
      { kind: 'playback', scenario: 'request', action: 'pause' },
      { kind: 'playback', scenario: 'request', action: 'go-to-step', step: 1 },
      { kind: 'playback', scenario: 'request', action: 'go-to-step', step: 0 },
      { kind: 'playback', scenario: 'request', action: 'next-step' },
      { kind: 'playback', scenario: 'request', action: 'previous-step' },
    ]);
    expect(tools.session.snapshot).toBe(before);
    expect(tools.session.history).toEqual({});
  });

  it('says which step it goes to, and when it plays inside an aggregated step', async () => {
    await tools.openApp();
    expect(await tools.value('go_to_step', { scenario: 'request', step: 1 })).toEqual({
      shown: 1,
      step: { number: 1, id: 'call', description: 'The customer calls the API.' },
    });
    await asPerson({
      type: 'set-collapsed',
      view: 'overview',
      elements: ['system'],
      collapsed: true,
    });
    const inside = await tools.value('go_to_step', { scenario: 'request', step: 'read' });
    expect(inside.step).toMatchObject({
      number: 2,
      playsAs: expect.stringMatching(
        /inside the aggregated step of steps 2 to 2, since the view collapses “Shop system”/,
      ) as string,
    });
  });

  it('says when no app is open to see it', async () => {
    expect(await tools.value('play_scenario', { scenario: 'request' })).toMatchObject({
      shown: 0,
      note: expect.stringMatching(/open_app/) as string,
    });
  });

  it('refuses a scenario that does not exist, a step it does not have, and playing no steps', async () => {
    for (const name of [
      'open_scenario',
      'play_scenario',
      'pause_scenario',
      'next_step',
      'previous_step',
    ]) {
      expect(await tools.failure(name, { scenario: 'nothing' })).toMatch(
        /There is no scenario "nothing"/,
      );
    }
    expect(await tools.failure('go_to_step', { scenario: 'request', step: 3 })).toBe(
      'The scenario "A request" has no step 3: it has 2 steps.',
    );
    expect(await tools.failure('go_to_step', { scenario: 'request', step: 'nothing' })).toMatch(
      /has no step "nothing"/,
    );
    expect(await tools.failure('go_to_step', { scenario: 'request', step: 0 })).toBeTruthy();
    await tools.value('create_scenario_from_steps', { name: 'Empty', view: 'overview', steps: [] });
    const empty = scenarioNamed('Empty')?.id as string;
    expect(await tools.value('open_scenario', { scenario: empty })).toMatchObject({ shown: 0 });
    expect(await tools.failure('play_scenario', { scenario: empty })).toMatch(
      /has no steps yet: add some with update_scenario/,
    );
  });
});
