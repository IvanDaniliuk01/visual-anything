/**
 * Claude's scenario tools with decisions (ADR 0078): creating a scenario whose steps hold decisions,
 * reading its decisions and alternatives, editing them with the core's helpers as one action of
 * Claude's, and playing it with choices, or choosing an alternative, as guidance.
 */
import type { DecisionBlock, ScenarioFile } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const scenarioOf = (id: string) =>
  tools.session.snapshot.scenarios.find((each) => each.id === id) as ScenarioFile;
const decisionsOf = (id: string) => scenarioOf(id).blocks ?? [];
const stepIds = (id: string) => scenarioOf(id).steps.map((step) => step.id);
const labels = (block: DecisionBlock | undefined) =>
  block?.alternatives.map((alternative) => [alternative.label, alternative.steps]);

/**
 * Checkout: the customer orders; is the item in stock? Yes, the API reads the stock; No, the API
 * says it is sold out, which ends the scenario; then the API checks its system.
 */
async function checkout(): Promise<string> {
  const created = await tools.value('create_scenario_from_steps', {
    name: 'Checkout',
    view: 'overview',
    steps: [
      { description: 'The customer orders.', relations: ['customer-calls-api'] },
      {
        decision: 'Is the item in stock?',
        alternatives: [
          {
            label: 'Yes',
            steps: [{ description: 'The API reads the stock.', relations: ['api-reads-db'] }],
          },
          {
            label: 'No',
            ends: true,
            steps: [
              { description: 'The API says it is sold out.', relations: ['customer-calls-api'] },
            ],
          },
        ],
      },
      { description: 'The API checks its system.', relations: ['api-in-system'] },
    ],
  });
  return created.scenario as string;
}

describe('create_scenario_from_steps with decisions', () => {
  it('stores the tree as the flat list of steps with decisions over it, as one action', async () => {
    const created = await tools.value('create_scenario_from_steps', {
      name: 'Checkout',
      view: 'overview',
      steps: [
        { description: 'The customer orders.', relations: ['customer-calls-api'] },
        {
          decision: 'Is the item in stock?',
          default: 'No',
          alternatives: [
            {
              label: 'Yes',
              steps: [
                { description: 'The API reads the stock.', relations: ['api-reads-db'] },
                {
                  decision: 'Is it reserved?',
                  alternatives: [
                    { label: 'Reserved', steps: [] },
                    {
                      label: 'Free',
                      steps: [{ description: 'It holds one.', relations: ['api-in-system'] }],
                    },
                  ],
                },
              ],
            },
            {
              label: 'No',
              ends: true,
              steps: [{ description: 'Sold out.', relations: ['customer-calls-api'] }],
            },
          ],
        },
      ],
    });
    expect(created).toMatchObject({
      done: 'Create the scenario "Checkout"',
      undo: 'The person can undo it in the app.',
      steps: 4,
      decisions: 2,
    });
    const id = created.scenario as string;
    const [order, read, hold, soldOut] = stepIds(id);
    expect(scenarioOf(id).steps.map((step) => step.description)).toEqual([
      'The customer orders.',
      'The API reads the stock.',
      'It holds one.',
      'Sold out.',
    ]);
    expect(order).toBeDefined();
    const [stock, reserved] = decisionsOf(id);
    expect(stock).toMatchObject({ kind: 'decision', question: 'Is the item in stock?' });
    expect(labels(stock)).toEqual([
      ['Yes', [read, hold]],
      ['No', [soldOut]],
    ]);
    expect(stock?.alternatives[1]?.ends).toBe(true);
    expect(stock?.default).toBe(stock?.alternatives[1]?.id);
    expect(labels(reserved)).toEqual([
      ['Reserved', []],
      ['Free', [hold]],
    ]);
    // The first alternative plays by default, so none is written for it.
    expect(reserved).not.toHaveProperty('default');
    expect(tools.session.history.undo).toEqual({
      label: 'Create the scenario "Checkout"',
      author: 'claude',
    });
  });

  it('writes a scenario without decisions as before, with no blocks', async () => {
    const created = await tools.value('create_scenario_from_steps', {
      name: 'Plain',
      view: 'overview',
      steps: [{ description: 'A call.', relations: ['customer-calls-api'] }],
    });
    expect(created).not.toHaveProperty('decisions');
    expect(scenarioOf(created.scenario as string)).not.toHaveProperty('blocks');
  });

  it('refuses a default no alternative has, relations the model lacks, and what the core refuses', async () => {
    expect(
      await tools.failure('create_scenario_from_steps', {
        name: 'X',
        view: 'overview',
        steps: [
          {
            decision: 'Paid?',
            default: 'Maybe',
            alternatives: [
              { label: 'Yes', steps: [{ description: 'A.', relations: ['customer-calls-api'] }] },
              { label: 'No', steps: [] },
            ],
          },
        ],
      }),
    ).toBe(
      'Not created: the decision "Paid?" has no alternative labelled "Maybe" to play by default: it has "Yes" and "No".',
    );
    expect(
      await tools.failure('create_scenario_from_steps', {
        name: 'X',
        view: 'overview',
        steps: [
          { description: 'A.', relations: ['customer-calls-api'] },
          {
            decision: 'Paid?',
            alternatives: [
              { label: 'Yes', steps: [{ description: 'B.', relations: ['api-pays'] }] },
              { label: 'No', steps: [] },
            ],
          },
        ],
      }),
    ).toMatch(/^Not created: the model has no relation with these ids: step 2 uses "api-pays"\./);
    expect(
      await tools.failure('create_scenario_from_steps', {
        name: 'X',
        view: 'overview',
        steps: [
          {
            decision: 'Paid?',
            alternatives: [
              { label: 'Yes', steps: [] },
              { label: 'No', steps: [] },
            ],
          },
        ],
      }),
    ).toBe(
      'Refused, so nothing changed: The decision "Paid?" needs an alternative with steps. (invalid-decision)',
    );
    expect(tools.session.snapshot.scenarios).toHaveLength(1);
  });
});

describe('read_scenario with decisions', () => {
  it('gives the decisions, their alternatives and the steps each holds, and the ways it plays', async () => {
    const id = await checkout();
    const [stock] = decisionsOf(id);
    const [yes, no] = stock?.alternatives ?? [];
    const read = await tools.value('read_scenario', { scenario: id });
    expect(read.decisions).toEqual([
      {
        id: stock?.id,
        question: 'Is the item in stock?',
        playsByDefault: yes?.id,
        alternatives: [
          { id: yes?.id, label: 'Yes', steps: [2] },
          { id: no?.id, label: 'No', steps: [3], ends: true },
        ],
      },
    ]);
    expect(read.waysToPlay).toBe(2);
    const steps = read.steps as { number: number; within?: unknown }[];
    expect(steps[1]?.within).toEqual({
      decision: stock?.id,
      alternative: yes?.id,
      label: 'Yes',
      question: 'Is the item in stock?',
    });
    expect(steps[0]).not.toHaveProperty('within');
    expect(read.playsAs).toMatchObject({ steps: 3 });
  });

  it('says which alternative each broken step is in, whichever plays', async () => {
    const id = await checkout();
    await tools.asPerson({ type: 'delete', relations: ['customer-calls-api'] });
    const [stock] = decisionsOf(id);
    const no = stock?.alternatives[1];
    const read = await tools.value('read_scenario', { scenario: id });
    expect(read.brokenSteps).toEqual([
      { number: 1, step: stepIds(id)[0], missing: ['customer-calls-api'] },
      {
        number: 3,
        step: stepIds(id)[2],
        missing: ['customer-calls-api'],
        within: {
          decision: stock?.id,
          alternative: no?.id,
          label: 'No',
          question: 'Is the item in stock?',
        },
      },
    ]);
    expect((read.decisions as { alternatives: unknown[] }[])[0]?.alternatives[1]).toEqual({
      id: no?.id,
      label: 'No',
      steps: [3],
      ends: true,
      broken: [3],
    });
  });

  it('says when its decisions do not hold together, and that it plays every step in order', async () => {
    // Written by hand, or merged: the alternatives do not follow one another.
    await tools.close();
    const project = testProject();
    const [request] = project.scenarios as [ScenarioFile];
    project.scenarios = [
      {
        ...request,
        blocks: [
          {
            id: 'stock',
            kind: 'decision',
            question: 'Is the item in stock?',
            alternatives: [
              { id: 'yes', label: 'Yes', steps: ['read'] },
              { id: 'no', label: 'No', steps: ['call'] },
            ],
          },
        ],
      },
    ];
    tools = await startToolHarness(project);
    const read = await tools.value('read_scenario', { scenario: 'request' });
    expect(read.decisionsProblem).toBe(
      'The alternatives of the decision "Is the item in stock?" do not follow one another. It plays every step in order until they hold together, and every change of its steps is refused meanwhile: update_scenario\'s remove-decisions takes them away, keeping every step.',
    );
    expect(read).not.toHaveProperty('decisions');
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'remove-decisions' }],
    });
    expect(scenarioOf('request')).not.toHaveProperty('blocks');
  });
});

describe('update_scenario’s decision operations', () => {
  it('inserts a step after a step, in every alternative holding it, and after a decision', async () => {
    const id = await checkout();
    const result = await tools.value('update_scenario', {
      scenario: id,
      edits: [
        {
          op: 'insert',
          after: 2,
          step: { description: 'The API holds it.', relations: ['api-in-system'] },
        },
        {
          op: 'insert',
          afterDecision: decisionsOf(id)[0]?.id,
          step: { description: 'The customer is told.', relations: ['customer-calls-api'] },
        },
      ],
    });
    expect(result).toMatchObject({ done: 'Edit the scenario "Checkout"', steps: 6 });
    expect(scenarioOf(id).steps.map((step) => step.description)).toEqual([
      'The customer orders.',
      'The API reads the stock.',
      'The API holds it.',
      'The API says it is sold out.',
      'The customer is told.',
      'The API checks its system.',
    ]);
    const ids = stepIds(id);
    expect(labels(decisionsOf(id)[0])).toEqual([
      ['Yes', [ids[1], ids[2]]],
      ['No', [ids[3]]],
    ]);
    expect(tools.session.history.undo).toEqual({
      label: 'Edit the scenario "Checkout"',
      author: 'claude',
    });
  });

  it('adds an alternative to the decision right after a step, or starts a new decision there', async () => {
    const id = await checkout();
    await tools.value('update_scenario', {
      scenario: id,
      edits: [
        {
          op: 'add-alternative',
          after: 1,
          label: 'Back-ordered',
          steps: [
            { description: 'The API orders more.', relations: ['api-reads-db'] },
            { description: 'It waits.', relations: ['api-in-system'] },
          ],
        },
      ],
    });
    let ids = stepIds(id);
    expect(labels(decisionsOf(id)[0])).toEqual([
      ['Yes', [ids[1]]],
      ['No', [ids[2]]],
      ['Back-ordered', [ids[3], ids[4]]],
    ]);
    await tools.value('update_scenario', {
      scenario: id,
      edits: [
        {
          op: 'add-alternative',
          after: 6,
          question: 'Is it paid?',
          keptLabel: 'Paid',
          label: 'Not paid',
          steps: [{ description: 'The API asks again.', relations: ['customer-calls-api'] }],
        },
      ],
    });
    ids = stepIds(id);
    const paid = decisionsOf(id).find((each) => each.question === 'Is it paid?');
    expect(labels(paid)).toEqual([
      ['Paid', []],
      ['Not paid', [ids[6]]],
    ]);
  });

  it('adds an alternative where nothing happens, and one last to a decision by its id', async () => {
    const id = await checkout();
    const stock = decisionsOf(id)[0]?.id;
    await tools.value('update_scenario', {
      scenario: id,
      edits: [
        { op: 'add-alternative', decision: stock, label: 'Unknown', steps: [], ends: true },
        {
          op: 'add-alternative',
          decision: stock,
          label: 'Elsewhere',
          steps: [{ description: 'Another shop has it.', relations: ['api-reads-db'] }],
        },
      ],
    });
    const ids = stepIds(id);
    const block = decisionsOf(id)[0];
    expect(labels(block)).toEqual([
      ['Yes', [ids[1]]],
      ['No', [ids[2]]],
      ['Unknown', []],
      ['Elsewhere', [ids[3]]],
    ]);
    expect(block?.alternatives[2]?.ends).toBe(true);
  });

  it('asks for the question when an alternative starts a new decision', async () => {
    const id = await checkout();
    expect(
      await tools.failure('update_scenario', {
        scenario: id,
        edits: [
          {
            op: 'add-alternative',
            after: 4,
            label: 'Not paid',
            steps: [{ description: 'A.', relations: ['customer-calls-api'] }],
          },
        ],
      }),
    ).toBe(
      'Not changed: edit 1 (add-alternative): no decision starts right after step 4, so this alternative starts one: give its question, and keptLabel for the alternative that keeps the steps that follow.',
    );
  });

  it('groups steps into a decision, renames and sets the default, and changes an alternative', async () => {
    const id = await checkout();
    const stock = decisionsOf(id)[0];
    await tools.value('update_scenario', {
      scenario: id,
      edits: [
        {
          op: 'set-decision',
          decision: stock?.id,
          question: 'In stock?',
          default: stock?.alternatives[1]?.id,
        },
        {
          op: 'set-alternative',
          alternative: stock?.alternatives[1]?.id,
          label: 'Sold out',
          ends: false,
        },
        {
          op: 'add-decision',
          question: 'Checked?',
          alternatives: [
            { label: 'Checked', steps: [4] },
            { label: 'Skipped', steps: [] },
          ],
          default: 'Skipped',
        },
      ],
    });
    const [first, second] = decisionsOf(id);
    expect(first).toMatchObject({ question: 'In stock?', default: stock?.alternatives[1]?.id });
    expect(first?.alternatives[1]).toEqual({
      id: stock?.alternatives[1]?.id,
      label: 'Sold out',
      steps: [stepIds(id)[2]],
    });
    expect(labels(second)).toEqual([
      ['Checked', [stepIds(id)[3]]],
      ['Skipped', []],
    ]);
    expect(second?.default).toBe(second?.alternatives[1]?.id);
  });

  it('rejoins at a step of an alternative', async () => {
    const id = await checkout();
    await tools.value('update_scenario', {
      scenario: id,
      edits: [
        { op: 'insert', after: 2, step: { description: 'Shared.', relations: ['api-in-system'] } },
      ],
    });
    await tools.value('update_scenario', { scenario: id, edits: [{ op: 'rejoin', step: 3 }] });
    const ids = stepIds(id);
    expect(scenarioOf(id).steps.map((step) => step.description)).toEqual([
      'The customer orders.',
      'The API reads the stock.',
      'The API says it is sold out.',
      'Shared.',
      'The API checks its system.',
    ]);
    expect(labels(decisionsOf(id)[0])).toEqual([
      ['Yes', [ids[1]]],
      ['No', [ids[2]]],
    ]);
    expect(
      await tools.failure('update_scenario', { scenario: id, edits: [{ op: 'rejoin', step: 1 }] }),
    ).toBe('Not changed: edit 1 (rejoin): step 1 is in no alternative, so nothing rejoins there.');
  });

  it('removes a decision only with cascade when it takes steps out, keeping the default’s', async () => {
    const id = await checkout();
    const stock = decisionsOf(id)[0]?.id;
    const before = scenarioOf(id);
    expect(
      await tools.failure('update_scenario', {
        scenario: id,
        edits: [{ op: 'remove-decision', decision: stock }],
      }),
    ).toBe(
      'Not changed: removing the decision "Is the item in stock?" keeps the steps of "Yes", which plays by default, and deletes step 3 ("The API says it is sold out."). Tell the person, then call again with cascade: true.',
    );
    expect(scenarioOf(id)).toBe(before);
    await tools.value('update_scenario', {
      scenario: id,
      edits: [{ op: 'remove-decision', decision: stock }],
      cascade: true,
    });
    expect(scenarioOf(id).steps.map((step) => step.description)).toEqual([
      'The customer orders.',
      'The API reads the stock.',
      'The API checks its system.',
    ]);
    expect(scenarioOf(id)).not.toHaveProperty('blocks');
  });

  it('removes every decision, keeping every step in order', async () => {
    const id = await checkout();
    await tools.value('update_scenario', { scenario: id, edits: [{ op: 'remove-decisions' }] });
    expect(scenarioOf(id).steps).toHaveLength(4);
    expect(scenarioOf(id)).not.toHaveProperty('blocks');
  });

  it('keeps the decisions whole through plain edits, and refuses in the core’s words what breaks them', async () => {
    const id = await checkout();
    await tools.value('update_scenario', {
      scenario: id,
      edits: [
        { op: 'remove', step: 3 },
        { op: 'describe', step: 2, description: 'The API reads the stock again.' },
      ],
    });
    expect(labels(decisionsOf(id)[0])).toEqual([
      ['Yes', [stepIds(id)[1]]],
      ['No', []],
    ]);
    const other = await checkout();
    const before = scenarioOf(other);
    expect(
      await tools.failure('update_scenario', {
        scenario: other,
        edits: [{ op: 'add', at: 3, step: { description: 'A.', relations: ['api-in-system'] } }],
      }),
    ).toBe(
      'Not changed: The alternatives of the decision "Is the item in stock?" do not follow one another. To add a step inside an alternative, insert puts it after another step, in every alternative that holds that step.',
    );
    expect(scenarioOf(other)).toBe(before);
  });

  it('refuses decisions and alternatives the scenario does not have', async () => {
    const id = await checkout();
    expect(
      await tools.failure('update_scenario', {
        scenario: id,
        edits: [{ op: 'set-decision', decision: 'nothing', question: 'Q?' }],
      }),
    ).toBe(
      'Not changed: edit 1 (set-decision): the scenario has no decision "nothing": read_scenario lists its decisions.',
    );
    expect(
      await tools.failure('update_scenario', {
        scenario: id,
        edits: [{ op: 'set-alternative', alternative: 'nothing', label: 'L' }],
      }),
    ).toBe(
      'Not changed: edit 1 (set-alternative): the scenario has no alternative "nothing": read_scenario lists its decisions and their alternatives.',
    );
  });
});

describe('playing a scenario with choices', () => {
  it('plays, opens and goes to a step with choices, and says which alternatives play', async () => {
    const id = await checkout();
    const app = await tools.openApp();
    const [stock] = decisionsOf(id);
    const [yes, no] = stock?.alternatives ?? [];
    const played = await tools.value('play_scenario', {
      scenario: id,
      choices: { [stock?.id as string]: no?.id as string },
    });
    expect(played).toMatchObject({
      shown: 1,
      plays: [
        {
          decision: stock?.id,
          question: 'Is the item in stock?',
          alternative: no?.id,
          label: 'No',
          ends: true,
        },
      ],
    });
    await tools.value('open_scenario', { scenario: id, choices: {} });
    await expect.poll(() => tools.guidanceOf(app).length).toBe(2);
    expect(tools.guidanceOf(app)).toEqual([
      {
        kind: 'playback',
        scenario: id,
        action: 'play',
        choices: { [stock?.id as string]: no?.id },
      },
      { kind: 'playback', scenario: id, action: 'open', choices: {} },
    ]);
    // Without choices, the tab's own stay; the answer says each decision's default.
    const plain = await tools.value('play_scenario', { scenario: id });
    expect(plain.plays).toBeUndefined();
    expect(plain.decisions).toMatch(/the alternatives chosen in the tab/);
    expect(yes).toBeDefined();
  });

  it('says which alternatives going to a step chooses', async () => {
    const id = await checkout();
    await tools.openApp();
    const [stock] = decisionsOf(id);
    const went = await tools.value('go_to_step', { scenario: id, step: 3 });
    expect(went).toMatchObject({
      step: { number: 3, description: 'The API says it is sold out.' },
      chooses: [
        {
          decision: stock?.id,
          question: 'Is the item in stock?',
          alternative: stock?.alternatives[1]?.id,
          label: 'No',
        },
      ],
    });
    // Choices that do not reach the step are completed so that they do.
    const reached = await tools.value('go_to_step', {
      scenario: id,
      step: 3,
      choices: { [stock?.id as string]: stock?.alternatives[0]?.id as string },
    });
    expect(reached.plays).toEqual([
      expect.objectContaining({ alternative: stock?.alternatives[1]?.id, label: 'No' }),
    ]);
    expect(reached.note).toMatch(
      /^Step 3 is in "No" at "Is the item in stock\?", so that plays there/,
    );
  });

  it('refuses choices at decisions, or of alternatives, the scenario does not have', async () => {
    const id = await checkout();
    const [stock] = decisionsOf(id);
    expect(
      await tools.failure('play_scenario', { scenario: id, choices: { nothing: 'yes' } }),
    ).toBe(
      'The scenario "Checkout" has no decision "nothing": read_scenario lists its decisions and their alternatives.',
    );
    expect(
      await tools.failure('play_scenario', {
        scenario: id,
        choices: { [stock?.id as string]: 'maybe' },
      }),
    ).toBe(
      `The decision "Is the item in stock?" has no alternative "maybe": its alternatives are "${stock?.alternatives[0]?.id}" (Yes) and "${stock?.alternatives[1]?.id}" (No).`,
    );
  });
});

describe('choose_alternative', () => {
  it('chooses an alternative in the open app, as guidance that records nothing', async () => {
    const id = await checkout();
    const app = await tools.openApp();
    const [stock] = decisionsOf(id);
    const no = stock?.alternatives[1];
    const actions = tools.session.actions.length;
    const chosen = await tools.value('choose_alternative', {
      scenario: id,
      decision: stock?.id,
      alternative: no?.id,
    });
    expect(chosen).toMatchObject({
      shown: 1,
      chose: { question: 'Is the item in stock?', label: 'No', steps: [3], ends: true },
    });
    await expect
      .poll(() => tools.guidanceOf(app))
      .toEqual([
        {
          kind: 'playback',
          scenario: id,
          action: 'choose',
          decision: stock?.id,
          alternative: no?.id,
        },
      ]);
    expect(tools.session.actions).toHaveLength(actions);
  });

  it('refuses a decision or an alternative the scenario does not have', async () => {
    const id = await checkout();
    expect(
      await tools.failure('choose_alternative', {
        scenario: 'request',
        decision: 'stock',
        alternative: 'no',
      }),
    ).toBe('The scenario "A request" has no decisions: there is nothing to choose.');
    expect(
      await tools.failure('choose_alternative', {
        scenario: id,
        decision: 'stock',
        alternative: 'no',
      }),
    ).toBe(
      'The scenario "Checkout" has no decision "stock": read_scenario lists its decisions and their alternatives.',
    );
  });
});
