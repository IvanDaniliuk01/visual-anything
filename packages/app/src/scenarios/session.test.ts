import {
  STEP_TIME,
  TRAVEL_TIME,
  executeCommand,
  scenarioTimeline,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it, vi } from 'vitest';
import { loadSample, withoutDecisions } from '../test/sample';
import { ScenarioSession, type Clock, type SendScenarioCommand } from './session';

const SCENARIO = 'patient-books-appointment';
const VIEW = 'system-overview';

/** A clock whose frames come when the test says, each some milliseconds after the last. */
function testClock() {
  let now = 0;
  let waiting: (() => void) | undefined;
  const clock: Clock = {
    now: () => now,
    request: (callback) => {
      waiting = callback;
      return 1;
    },
    cancel: () => {
      waiting = undefined;
    },
  };
  return {
    clock,
    /** Lets `ms` milliseconds pass, in frames of 16. */
    pass(ms: number) {
      for (let left = ms; left > 0 && waiting; left -= 16) {
        now += Math.min(16, left);
        const frame = waiting;
        waiting = undefined;
        frame();
      }
    },
    /** Lets `ms` milliseconds pass before the next frame, as while the tab is hidden. */
    late(ms: number) {
      now += ms;
      const frame = waiting;
      waiting = undefined;
      frame?.();
    },
    get running() {
      return waiting !== undefined;
    },
  };
}

/**
 * A session over the sample, its scenario without its decision unless another project is given, with
 * a stand-in for the local program that applies each command and answers when the test says, before
 * or after the project shows the change.
 */
function setUp(start: ProjectSnapshot = withoutDecisions(), view: Id = VIEW) {
  const time = testClock();
  const session = new ScenarioSession(time.clock);
  let project = start;
  let viewId: Id | undefined = view;
  const said: string[] = [];
  const answers: (() => void)[] = [];
  const sent: Command[] = [];
  const send = vi.fn<SendScenarioCommand>((command) => {
    sent.push(command);
    return new Promise((resolve) => {
      answers.push(() => {
        const outcome = executeCommand(project, command);
        if (!outcome.ok) {
          resolve({ ok: false });
          return;
        }
        project = outcome.state;
        sync();
        resolve({ ok: true, created: outcome.created });
      });
    });
  });
  // The timeline the panel works out, with the session's choices (ADR 0078).
  const sync = () => {
    const { choices } = session.getState();
    const scenario = project.scenarios.find((each) => each.id === session.getState().scenario);
    const timeline =
      scenario && scenario.view === viewId
        ? scenarioTimeline(project, scenario, undefined, choices)
        : undefined;
    session.sync({ project, viewId, send, timeline, choices, announce: (text) => said.push(text) });
  };
  sync();
  return {
    session,
    time,
    said,
    sent,
    send,
    sync,
    get project() {
      return project;
    },
    set project(next: ProjectSnapshot) {
      project = next;
      sync();
    },
    openView(id: Id | undefined) {
      viewId = id;
      sync();
    },
    /** Answers the oldest command waiting, after applying it. */
    async answer() {
      answers.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function open(setup: ReturnType<typeof setUp>) {
  setup.session.open(SCENARIO);
  setup.sync();
}

describe('ScenarioSession', () => {
  it('opens a scenario at its first step, paused', () => {
    const setup = setUp();
    open(setup);
    expect(setup.session.getState()).toMatchObject({
      scenario: SCENARIO,
      step: 0,
      mode: 'paused',
      recording: false,
      speed: 1,
    });
    expect(setup.time.running).toBe(false);
  });

  it('plays step after step on the frames of the clock, then stops at the end', () => {
    const setup = setUp();
    open(setup);
    const { session, time } = setup;
    const states: number[] = [];
    session.subscribe(() => states.push(session.getState().step));
    session.play();
    expect(session.getState().mode).toBe('playing');
    time.pass(TRAVEL_TIME / 2);
    expect(session.getElapsed()).toBeCloseTo(TRAVEL_TIME / 2, -1);
    time.pass(STEP_TIME * 10);
    expect(session.getState()).toMatchObject({ step: 4, mode: 'paused' });
    expect(session.finished).toBe(true);
    expect(time.running).toBe(false);
    // The state changes only when the step or the mode does, not on every frame.
    expect(new Set(states)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(states.length).toBeLessThan(10);
  });

  it('plays no time it was hidden for: a late frame moves it on as one frame', () => {
    const setup = setUp();
    open(setup);
    setup.session.play();
    setup.time.pass(32);
    setup.time.late(60_000);
    expect(setup.session.getState().step).toBe(0);
    expect(setup.session.getElapsed()).toBeLessThanOrEqual(132);
  });

  it('tells the marker on every frame while it moves', () => {
    const setup = setUp();
    open(setup);
    const frames = vi.fn();
    setup.session.subscribeFrame(frames);
    setup.session.play();
    setup.time.pass(160);
    expect(frames.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('pauses, steps and goes faster', () => {
    const setup = setUp();
    open(setup);
    const { session, time } = setup;
    session.setSpeed(2);
    session.play();
    time.pass(STEP_TIME / 2);
    expect(session.getState().step).toBe(1);
    session.pause();
    time.pass(STEP_TIME * 4);
    expect(session.getState()).toMatchObject({ step: 1, mode: 'paused' });
    session.next();
    expect(session.getState()).toMatchObject({ step: 2, mode: 'stepping' });
    time.pass(TRAVEL_TIME);
    expect(session.getState()).toMatchObject({ step: 2, mode: 'paused' });
    session.previous();
    session.previous();
    expect(session.getState().step).toBe(0);
    session.goTo(3);
    expect(session.getState().step).toBe(3);
    session.toggle();
    expect(session.getState().mode).toBe('playing');
    session.toggle();
    expect(session.getState().mode).toBe('paused');
  });

  it('plays only while the scenario’s view is open', () => {
    const setup = setUp();
    open(setup);
    setup.session.play();
    setup.openView(undefined);
    expect(setup.session.getState().mode).toBe('paused');
    setup.session.play();
    expect(setup.session.getState().mode).toBe('paused');
    expect(setup.time.running).toBe(false);
  });

  it('closes the scenario once it is deleted, here or elsewhere', () => {
    const setup = setUp();
    open(setup);
    setup.project = { ...setup.project, scenarios: [] };
    expect(setup.session.getState().scenario).toBeUndefined();
  });

  it('keeps a scenario just created open until the project holding it comes, and records into it', () => {
    const setup = setUp();
    const created = executeCommand(setup.project, {
      type: 'create-scenario',
      scenario: { id: 'fresh', name: 'Fresh', view: VIEW, steps: [] },
    });
    if (!created.ok) throw new Error('The scenario was not created.');
    // The answer came first: the project the tab shows does not hold it yet.
    setup.session.open('fresh');
    setup.session.setRecording(true);
    setup.sync();
    expect(setup.session.getState()).toMatchObject({
      scenario: 'fresh',
      recording: true,
      canRecord: false,
    });
    setup.project = created.state;
    expect(setup.session.getState().canRecord).toBe(true);
  });

  it('never changes the project while it plays', () => {
    const setup = setUp();
    open(setup);
    const before = setup.project;
    setup.session.play();
    setup.time.pass(STEP_TIME * 6);
    expect(setup.project).toBe(before);
    expect(setup.send).not.toHaveBeenCalled();
  });
});

describe('ScenarioSession, recording', () => {
  it('records only while recording is on, the scenario’s view is open and the project can be changed', () => {
    const setup = setUp();
    open(setup);
    const { session } = setup;
    session.record('agent-to-api', false);
    expect(setup.send).not.toHaveBeenCalled();
    session.setRecording(true);
    expect(session.getState()).toMatchObject({ recording: true, canRecord: true, step: 4 });
    setup.openView(undefined);
    expect(session.getState().canRecord).toBe(false);
    session.record('agent-to-api', false);
    expect(setup.send).not.toHaveBeenCalled();
  });

  it('records each click as one labelled command, after the last step, and goes to the step it recorded', async () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.record('api-reads-db', false);
    expect(setup.sent).toHaveLength(1);
    expect(setup.sent[0]).toMatchObject({
      type: 'batch',
      label: 'Record step 6 of “Patient books an appointment”',
    });
    await setup.answer();
    const steps = setup.project.scenarios[0]!.steps;
    expect(steps).toHaveLength(6);
    expect(steps[5]).toMatchObject({ description: '', relations: ['api-reads-db'] });
    expect(setup.session.getState()).toMatchObject({ step: 5, mode: 'stepping' });
    expect(setup.said.at(-1)).toBe('Recorded step 6: Appointments API reads from Appointments DB.');
  });

  it('adds a relation clicked with Shift to the step it is on', async () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.goTo(0);
    setup.session.record('whatsapp-to-agent', true);
    await setup.answer();
    expect(setup.project.scenarios[0]!.steps[0]!.relations).toEqual([
      'patient-to-whatsapp',
      'whatsapp-to-agent',
    ]);
    expect(setup.sent[0]).toMatchObject({
      label: 'Add a relation to step 1 of “Patient books an appointment”',
    });
  });

  it('works out each click from the scenario as the click before it left it', async () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.record('api-reads-db', false);
    setup.session.record('api-writes-db', false);
    setup.session.record('api-to-reminders', true);
    expect(setup.sent).toHaveLength(1);
    await setup.answer();
    expect(setup.sent).toHaveLength(2);
    await setup.answer();
    await setup.answer();
    const steps = setup.project.scenarios[0]!.steps;
    expect(steps.slice(5).map((each) => each.relations)).toEqual([
      ['api-reads-db'],
      ['api-writes-db', 'api-to-reminders'],
    ]);
    expect(setup.session.getState().step).toBe(6);
  });

  it('waits for the change of a click whose answer came first', async () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    // The answer comes, but the project still shows the scenario as it was.
    let answer: () => void = () => undefined;
    let land: () => void = () => undefined;
    setup.send.mockImplementationOnce(
      (command) =>
        new Promise((resolve) => {
          const outcome = executeCommand(setup.project, command);
          answer = () => resolve({ ok: outcome.ok });
          land = () => {
            if (outcome.ok) setup.project = outcome.state;
          };
        }),
    );
    setup.session.record('api-reads-db', false);
    setup.session.record('api-writes-db', false);
    answer();
    await Promise.resolve();
    await Promise.resolve();
    expect(setup.send).toHaveBeenCalledTimes(1);
    expect(setup.session.getState().step).toBe(4);
    land();
    expect(setup.session.getState().step).toBe(5);
    expect(setup.send).toHaveBeenCalledTimes(2);
    await setup.answer();
    expect(setup.project.scenarios[0]!.steps).toHaveLength(7);
  });

  it('drops the clicks waiting when one is refused', async () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.send.mockImplementationOnce(() => Promise.resolve({ ok: false }));
    setup.session.record('api-reads-db', false);
    setup.session.record('api-writes-db', false);
    await Promise.resolve();
    await Promise.resolve();
    expect(setup.send).toHaveBeenCalledTimes(1);
  });

  it('records nothing for a line that stands for several relations, and says why', () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.record('aggregated:scheduling', false);
    expect(setup.send).not.toHaveBeenCalled();
    expect(setup.said.at(-1)).toMatch(/stands for several relations/);
  });

  it('keeps a step its only relation, and says so', () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.goTo(0);
    setup.session.record('patient-to-whatsapp', true);
    expect(setup.send).not.toHaveBeenCalled();
    expect(setup.said.at(-1)).toMatch(/^Step 1 activates only this relation/);
  });

  it('stops recording when it plays', () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.play();
    expect(setup.session.getState()).toMatchObject({ recording: false, mode: 'playing' });
  });
});

describe('ScenarioSession guided by Claude', () => {
  /** The sample with a second scenario over the same view. */
  function withSecond(): ProjectSnapshot {
    const created = executeCommand(loadSample(), {
      type: 'create-scenario',
      scenario: {
        id: 'second',
        name: 'Second',
        view: VIEW,
        steps: [{ description: 'Reply.', relations: ['agent-to-api'] }],
      },
    });
    if (!created.ok) throw new Error('The second scenario is not valid.');
    return created.state;
  }

  it('counts the steps the person or Claude ask for, which playback brings into view', () => {
    const setup = setUp();
    open(setup);
    const { session } = setup;
    const asks = () => session.getState().asks;
    const opened = asks();
    session.next();
    session.goTo(2);
    session.previous();
    session.play();
    expect(asks()).toBe(opened + 4);
    session.pause();
    expect(asks()).toBe(opened + 4);
    session.guide({ scenario: SCENARIO, action: 'go-to-step', step: 3 });
    expect(asks()).toBe(opened + 5);
  });

  it('counts nothing an address asks for, which places the camera itself', () => {
    const setup = setUp();
    const { session } = setup;
    session.guide({ scenario: SCENARIO, action: 'go-to-step', step: 3 }, { quiet: true });
    setup.sync();
    expect(session.getState()).toMatchObject({ scenario: SCENARIO, step: 3, asks: 0 });
    session.guide({ scenario: SCENARIO, action: 'open' }, { quiet: true });
    expect(session.getState().asks).toBe(0);
    // Claude going to a step counts, and so does opening a scenario.
    session.guide({ scenario: SCENARIO, action: 'go-to-step', step: 2 });
    setup.sync();
    expect(session.getState()).toMatchObject({ step: 2, asks: 1 });
    session.close();
    session.guide({ scenario: SCENARIO, action: 'open' });
    expect(session.getState()).toMatchObject({ scenario: SCENARIO, asks: 2 });
  });

  it('opens a scenario at its first step, paused, even the one open', () => {
    const setup = setUp();
    open(setup);
    setup.session.goTo(2);
    setup.session.guide({ scenario: SCENARIO, action: 'open' });
    expect(setup.session.getState()).toMatchObject({ scenario: SCENARIO, step: 0, mode: 'paused' });
  });

  it('plays the open scenario at once', () => {
    const setup = setUp();
    open(setup);
    setup.session.guide({ scenario: SCENARIO, action: 'play' });
    expect(setup.session.getState().mode).toBe('playing');
  });

  it('opens a scenario first, and plays it once its timeline comes', () => {
    const setup = setUp();
    setup.session.guide({ scenario: SCENARIO, action: 'play' });
    expect(setup.session.getState()).toMatchObject({ scenario: SCENARIO, mode: 'paused' });
    setup.sync();
    expect(setup.session.getState()).toMatchObject({ scenario: SCENARIO, mode: 'playing' });
  });

  it('waits for the timeline of the scenario it opens, not the one open before', () => {
    const setup = setUp(withSecond());
    setup.session.open('second');
    setup.sync();
    setup.session.guide({ scenario: SCENARIO, action: 'go-to-step', step: 3 });
    expect(setup.session.getState()).toMatchObject({ scenario: SCENARIO, step: 0 });
    setup.sync();
    expect(setup.session.getState()).toMatchObject({ step: 3, mode: 'stepping' });
  });

  it('plays once the scenario’s view opens', () => {
    const setup = setUp();
    setup.openView('elsewhere');
    open(setup);
    setup.session.guide({ scenario: SCENARIO, action: 'play' });
    expect(setup.session.getState().mode).toBe('paused');
    setup.openView(VIEW);
    expect(setup.session.getState().mode).toBe('playing');
  });

  it('forgets what it was asked when the view does not open with the next change', () => {
    const setup = setUp();
    setup.openView('elsewhere');
    setup.session.guide({ scenario: SCENARIO, action: 'play' });
    setup.sync();
    setup.openView(VIEW);
    expect(setup.session.getState().mode).toBe('paused');
  });

  it('pauses, goes to a step, and steps forwards and back, as the person would', () => {
    const setup = setUp();
    open(setup);
    const { session } = setup;
    session.guide({ scenario: SCENARIO, action: 'play' });
    session.guide({ scenario: SCENARIO, action: 'pause' });
    expect(session.getState().mode).toBe('paused');
    session.guide({ scenario: SCENARIO, action: 'go-to-step', step: 2 });
    expect(session.getState()).toMatchObject({ step: 2, mode: 'stepping' });
    session.guide({ scenario: SCENARIO, action: 'next-step' });
    expect(session.getState().step).toBe(3);
    session.guide({ scenario: SCENARIO, action: 'previous-step' });
    session.guide({ scenario: SCENARIO, action: 'previous-step' });
    expect(session.getState().step).toBe(1);
  });

  it('goes to the nearest step for one past the last', () => {
    const setup = setUp();
    open(setup);
    setup.session.goToStep(99);
    expect(setup.session.getState().step).toBe(4);
  });

  it('lets the person pause what Claude plays', () => {
    const setup = setUp();
    open(setup);
    setup.session.guide({ scenario: SCENARIO, action: 'play' });
    setup.session.toggle();
    expect(setup.session.getState().mode).toBe('paused');
    expect(setup.time.running).toBe(false);
  });
});

describe('ScenarioSession, with decisions (ADR 0078)', () => {
  const ORDER = 'an-order';
  const STOCK = 'stock-check';
  const NO = { decision: STOCK, alternative: 'out-of-stock' };

  function setUpOrder() {
    const setup = setUp(loadSample('order-process'), 'order-process');
    setup.session.open(ORDER);
    setup.sync();
    return setup;
  }

  function order(setup: ReturnType<typeof setUp>) {
    return setup.project.scenarios.find((each) => each.id === ORDER)!;
  }

  /** The ids of the steps the scenario plays now, as the panel's timeline has them. */
  function played(setup: ReturnType<typeof setUp>): Id[] {
    return scenarioTimeline(
      setup.project,
      order(setup),
      undefined,
      setup.session.getState().choices,
    ).entries.flatMap((entry) => entry.steps);
  }

  it('opens with every decision playing its default, and chooses another, saying so', () => {
    const setup = setUpOrder();
    const { session } = setup;
    expect(session.getState().choices).toEqual({});
    session.goToStep(2);
    session.choose(NO);
    setup.sync();
    expect(session.getState()).toMatchObject({ choices: { [STOCK]: 'out-of-stock' }, step: 2 });
    expect(setup.said.at(-1)).toBe('“No” plays at “Is every item in stock?”.');
    expect(played(setup)).toContain('to-cancel');
    expect(played(setup)).not.toContain('pack');
    session.next();
    expect(session.getState().step).toBe(9);
  });

  it('goes to the first step of the alternative chosen from a step of another', () => {
    const setup = setUpOrder();
    setup.session.goToStep(4);
    setup.session.choose(NO);
    setup.sync();
    expect(setup.session.getState()).toMatchObject({ step: 9, mode: 'stepping' });
  });

  it('chooses what reaches a step of an alternative not chosen, and says so', () => {
    const setup = setUpOrder();
    setup.session.goToStep(10);
    setup.sync();
    expect(setup.session.getState()).toMatchObject({
      choices: { [STOCK]: 'out-of-stock' },
      step: 10,
    });
    expect(setup.said.at(-1)).toBe('“No” plays at “Is every item in stock?”.');
  });

  it('chooses as Claude asks, opening the scenario first, and says so', () => {
    const setup = setUp(loadSample('order-process'), 'order-process');
    const { session } = setup;
    session.guide({ scenario: ORDER, action: 'choose', ...NO });
    expect(session.getState()).toMatchObject({ scenario: ORDER, choices: {} });
    setup.sync();
    expect(session.getState()).toMatchObject({
      scenario: ORDER,
      choices: { [STOCK]: 'out-of-stock' },
      step: 0,
    });
    expect(setup.said.at(-1)).toBe('“No” plays at “Is every item in stock?”.');
    expect(setup.send).not.toHaveBeenCalled();
  });

  it('plays and goes to a step with the choices Claude gives, in place of the tab’s', () => {
    const setup = setUpOrder();
    const { session } = setup;
    session.choose(NO);
    setup.sync();
    session.guide({ scenario: ORDER, action: 'play', choices: {} });
    expect(session.getState().choices).toEqual({});
    expect(setup.said.at(-1)).toBe('“Yes” plays at “Is every item in stock?”.');
    setup.sync();
    expect(session.getState().mode).toBe('playing');
    session.guide({
      scenario: ORDER,
      action: 'go-to-step',
      step: 9,
      choices: { [STOCK]: 'out-of-stock' },
    });
    setup.sync();
    expect(session.getState()).toMatchObject({
      step: 9,
      choices: { [STOCK]: 'out-of-stock' },
    });
  });

  it('opens with the choices Claude gives, and keeps the tab’s when it gives none', () => {
    const setup = setUp(loadSample('order-process'), 'order-process');
    const { session } = setup;
    session.guide({ scenario: ORDER, action: 'open', choices: { [STOCK]: 'out-of-stock' } });
    expect(session.getState()).toMatchObject({
      scenario: ORDER,
      step: 0,
      mode: 'paused',
      choices: { [STOCK]: 'out-of-stock' },
    });
    setup.sync();
    session.guide({ scenario: ORDER, action: 'play' });
    setup.sync();
    expect(session.getState()).toMatchObject({
      mode: 'playing',
      choices: { [STOCK]: 'out-of-stock' },
    });
  });

  it('forgets the choices when another scenario opens, and never sends them', () => {
    const setup = setUpOrder();
    setup.session.choose(NO);
    setup.session.open('order-states');
    expect(setup.session.getState().choices).toEqual({});
    expect(setup.send).not.toHaveBeenCalled();
  });

  it('stops before each decision when asked, and plays on past it', () => {
    const setup = setUpOrder();
    const { session, time } = setup;
    session.setStopAtDecisions(true);
    session.play();
    time.pass(STEP_TIME * 4);
    expect(session.getState()).toMatchObject({ step: 2, mode: 'paused' });
    expect(session.position.elapsed).toBe(STEP_TIME);
    expect(setup.said.at(-1)).toBe(
      'Paused before “Is every item in stock?”. Choose an alternative, then play on.',
    );
    session.choose(NO);
    setup.sync();
    expect(session.getState()).toMatchObject({ step: 2, mode: 'paused' });
    session.play();
    time.pass(100);
    expect(session.getState()).toMatchObject({ step: 9, mode: 'playing' });
  });

  it('plays past every decision without the option', () => {
    const setup = setUpOrder();
    setup.session.play();
    setup.time.pass(STEP_TIME * 3 + 100);
    expect(setup.session.getState()).toMatchObject({ step: 3, mode: 'playing' });
  });

  it('records after a step of an alternative, in that alternative', async () => {
    const setup = setUpOrder();
    const { session } = setup;
    session.setRecording(true);
    // The last step that plays: the default alternative's.
    expect(session.getState().step).toBe(8);
    session.record('places-order', false);
    expect(setup.sent[0]).toMatchObject({ label: 'Record step 10 of “An order”' });
    await setup.answer();
    const added = order(setup).steps[9]!;
    expect(added.relations).toEqual(['places-order']);
    expect(order(setup).blocks?.[0]?.alternatives[0]?.steps.at(-1)).toBe(added.id);
    expect(session.getState()).toMatchObject({ step: 9, mode: 'stepping' });
  });

  it('adds an alternative with its first click, as one command, and records on in it', async () => {
    const setup = setUpOrder();
    const { session } = setup;
    session.setRecording(true);
    session.addAlternative({ label: 'Some of them', question: '', kept: '' }, 2);
    expect(session.getState()).toMatchObject({ step: 2, place: { kind: 'new-alternative' } });
    expect(setup.said.at(-1)).toBe('Click the first relation of “Some of them” on the canvas.');
    session.record('places-order', false);
    expect(setup.sent).toHaveLength(1);
    expect(setup.sent[0]).toMatchObject({
      label: 'Add the alternative “Some of them” after step 3 of “An order”',
    });
    await setup.answer();
    const decision = order(setup).blocks?.[0];
    expect(decision?.alternatives.map((each) => each.label)).toEqual(['Yes', 'No', 'Some of them']);
    expect(session.getState()).toMatchObject({
      step: 12,
      choices: { [STOCK]: decision?.alternatives[2]?.id },
      place: { kind: 'after-step' },
    });
    expect(setup.said.at(-1)).toMatch(/^Recorded step 13, the first of “Some of them”: /);
    // The next click goes on in it.
    session.record('received-to-check', false);
    await setup.answer();
    expect(order(setup).blocks?.[0]?.alternatives[2]?.steps).toHaveLength(2);
  });

  it('starts a new decision after a step outside any, whose first alternative keeps what followed', async () => {
    const setup = setUpOrder();
    const { session } = setup;
    session.setRecording(true);
    session.addAlternative({ question: 'Is the customer known?', kept: 'Yes', label: 'No' }, 0);
    session.record('places-order', false);
    expect(setup.sent[0]).toMatchObject({
      label: 'Add the decision “Is the customer known?” after step 1 of “An order”',
    });
    await setup.answer();
    const known = order(setup).blocks?.find((each) => each.question === 'Is the customer known?');
    expect(known?.alternatives.map((each) => [each.label, each.steps.length])).toEqual([
      ['Yes', 11],
      ['No', 1],
    ]);
  });

  it('records after the decision once the alternative ends', async () => {
    const setup = setUpOrder();
    const { session } = setup;
    session.setRecording(true);
    session.endAlternative();
    expect(session.getState().place).toEqual({ kind: 'after-decision', decision: STOCK });
    expect(setup.said.at(-1)).toBe('The next click records after “Is every item in stock?”.');
    session.record('places-order', false);
    await setup.answer();
    const scenario = order(setup);
    expect(scenario.steps).toHaveLength(13);
    const added = scenario.steps[12]!;
    expect(scenario.blocks?.[0]?.alternatives.flatMap((each) => each.steps)).not.toContain(
      added.id,
    );
    expect(played(setup).at(-1)).toBe(added.id);
    expect(session.getState()).toMatchObject({ step: 12, place: { kind: 'after-step' } });
  });

  it('records a scenario without decisions exactly as before, its steps only', async () => {
    const setup = setUp();
    open(setup);
    setup.session.setRecording(true);
    setup.session.record('api-reads-db', false);
    const sent = setup.sent[0] as Extract<Command, { type: 'batch' }>;
    const update = sent.commands[0] as Extract<Command, { type: 'update-scenario' }>;
    expect(Object.keys(update.changes)).toEqual(['steps']);
    await setup.answer();
    expect(setup.project.scenarios[0]).not.toHaveProperty('blocks');
  });
});
