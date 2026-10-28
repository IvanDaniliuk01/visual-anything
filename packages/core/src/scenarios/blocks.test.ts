/**
 * Decisions between labelled alternatives (ADR 0078): blocks over a scenario's flat list of steps,
 * read and checked, the steps each set of choices plays, the choices that reach a step, and the
 * scenario commands and opening that keep them whole.
 */
import type { DecisionBlock, ScenarioFile, Step } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import { previewDelete } from '../rules';
import type { ProjectSnapshot } from '../snapshot';
import {
  alternativeOf,
  alternativesOf,
  choicesToReach,
  chosenAlternative,
  combinationsOf,
  decisionsAt,
  decisionsReached,
  playedSteps,
  readBlocks,
} from './blocks';
import { scenarioProject } from './test/fixtures';
import { choicesFrom, reference, tree, written } from './test/trees';
import { brokenStepsOf, entryOfStep, scenarioTimeline } from './timeline';

describe('decisions over a scenario’s steps', () => {
  it('play what the tree plays, for any choices, and hold together as written', () => {
    fc.assert(
      fc.property(tree, fc.array(fc.nat({ max: 3 }), { maxLength: 40 }), (segments, picks) => {
        const { scenario } = written(segments);
        expect(readBlocks(scenario).ok).toBe(true);
        const choices = choicesFrom(scenario, picks);
        const played = playedSteps(scenario, choices).map((at) => scenario.steps[at]?.id);
        expect(played).toEqual(reference(segments, choices));
      }),
      { numRuns: 400 },
    );
  });

  it('meet each decision playback reaches on a step it plays, and those holding a step on it', () => {
    fc.assert(
      fc.property(tree, fc.array(fc.nat({ max: 3 }), { maxLength: 40 }), (segments, picks) => {
        const { scenario } = written(segments);
        const choices = choicesFrom(scenario, picks);
        const entered: string[] = [];
        reference(segments, choices, (decision) => entered.push(decision));
        const played = playedSteps(scenario, choices);
        const met: string[] = [];
        for (const at of played) {
          const here = decisionsAt(scenario, at, choices);
          const step = scenario.steps[at]?.id as string;
          // Those holding the step are the alternatives it is in, outermost first.
          expect(
            here
              .filter((each) => each.place === 'holding')
              .map((each) => ({ decision: each.decision.id, alternative: each.alternative.id })),
          ).toEqual(alternativesOf(scenario, step));
          // Only the first step that plays meets decisions reached before it.
          if (at !== played[0]) expect(here.some((each) => each.place === 'before')).toBe(false);
          met.push(...here.map((each) => each.decision.id));
        }
        // A decision holding several steps is met on each of them.
        if (played.length > 0) expect([...new Set(met)].sort()).toEqual([...entered].sort());
        // A step that does not play meets none.
        for (const at of scenario.steps.keys()) {
          if (!played.includes(at)) expect(decisionsAt(scenario, at, choices)).toEqual([]);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('reach every step with some choices', () => {
    fc.assert(
      fc.property(tree, (segments) => {
        const { scenario } = written(segments);
        for (const [at, step] of scenario.steps.entries()) {
          const choices = choicesToReach(scenario, step.id);
          expect(choices, step.id).toBeDefined();
          expect(playedSteps(scenario, choices)).toContain(at);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('play every step in order without decisions, as the timeline always has', () => {
    const scenario = scenarioProject().scenarios[0] as ScenarioFile;
    expect(playedSteps(scenario)).toEqual(scenario.steps.map((_, at) => at));
    expect(combinationsOf(scenario)).toBe(1);
    const project = scenarioProject();
    expect(scenarioTimeline(project, scenario, undefined, { any: 'thing' })).toEqual(
      scenarioTimeline(project, scenario),
    );
  });
});

/** The sample's scenario with its last two steps as the alternatives of one decision. */
function withDecision(project: ProjectSnapshot = scenarioProject()): {
  project: ProjectSnapshot;
  scenario: ScenarioFile;
} {
  const base = project.scenarios[0] as ScenarioFile;
  const [yes, no] = base.steps.slice(-2).map((step) => step.id) as [string, string];
  const scenario: ScenarioFile = {
    ...base,
    blocks: [
      {
        id: 'slots',
        kind: 'decision',
        question: 'Are there free slots?',
        alternatives: [
          { id: 'yes', label: 'Yes', steps: [yes] },
          { id: 'no', label: 'No, the week is full', steps: [no], ends: true },
        ],
      },
    ],
  };
  return {
    project: { ...project, scenarios: [scenario, ...project.scenarios.slice(1)] },
    scenario,
  };
}

describe('the timeline with choices', () => {
  it('plays the alternative chosen, or else the first, and stands an unplayed step for the next entry', () => {
    const { project, scenario } = withDecision();
    const count = scenario.steps.length;
    const first = scenarioTimeline(project, scenario);
    expect(first.entries.flatMap((entry) => entry.steps)).toEqual(
      scenario.steps.filter((_, at) => at !== count - 1).map((step) => step.id),
    );
    const chosen = scenarioTimeline(project, scenario, undefined, { slots: 'no' });
    expect(chosen.entries.flatMap((entry) => entry.steps)).toEqual(
      scenario.steps.filter((_, at) => at !== count - 2).map((step) => step.id),
    );
    // The step not played stands for the entry played next, which is the last one here.
    expect(entryOfStep(chosen, count - 2)).toBe(chosen.entries.length - 1);
    expect(alternativeOf(scenario, scenario.steps[count - 1]?.id as string)).toEqual({
      decision: 'slots',
      alternative: 'no',
    });
  });
});

describe('the decisions playback meets', () => {
  const at = (scenario: ScenarioFile, step: number, choices?: Record<string, string>) =>
    decisionsAt(scenario, step, choices).map((each) => [
      each.decision.id,
      each.alternative.id,
      each.place,
    ]);

  it('meets a decision on the step before it, then on each step of the alternative it plays', () => {
    const { scenario } = withDecision();
    expect(at(scenario, 1)).toEqual([]);
    expect(at(scenario, 2)).toEqual([['slots', 'yes', 'ahead']]);
    expect(at(scenario, 3)).toEqual([['slots', 'yes', 'holding']]);
    expect(at(scenario, 2, { slots: 'no' })).toEqual([['slots', 'no', 'ahead']]);
    expect(at(scenario, 4, { slots: 'no' })).toEqual([['slots', 'no', 'holding']]);
    // A step the choices do not play meets nothing.
    expect(at(scenario, 3, { slots: 'no' })).toEqual([]);
    // Without decisions, nothing.
    expect(decisionsAt(scenarioProject().scenarios[0] as ScenarioFile, 2)).toEqual([]);
  });

  it('meets a decision whose alternative is empty, nested ones, and one reached before any step', () => {
    const base = scenarioProject().scenarios[0] as ScenarioFile;
    const [a, b, c] = base.steps.map((step) => step.id) as [string, string, string];
    const nested: ScenarioFile = {
      ...base,
      blocks: [
        {
          id: 'outer',
          kind: 'decision',
          question: 'Outer?',
          alternatives: [
            { id: 'x', label: 'X', steps: [b, c] },
            { id: 'y', label: 'Y', steps: [] },
          ],
        },
        {
          id: 'inner',
          kind: 'decision',
          question: 'Inner?',
          alternatives: [
            { id: 'p', label: 'P', steps: [c] },
            { id: 'q', label: 'Q', steps: [] },
          ],
        },
      ],
    };
    expect(at(nested, 0)).toEqual([['outer', 'x', 'ahead']]);
    expect(at(nested, 1)).toEqual([
      ['outer', 'x', 'holding'],
      ['inner', 'p', 'ahead'],
    ]);
    expect(at(nested, 2)).toEqual([
      ['outer', 'x', 'holding'],
      ['inner', 'p', 'holding'],
    ]);
    expect(at(nested, 1, { inner: 'q' })).toEqual([
      ['outer', 'x', 'holding'],
      ['inner', 'q', 'ahead'],
    ]);
    expect(at(nested, 0, { outer: 'y' })).toEqual([['outer', 'y', 'ahead']]);
    expect(at(nested, 3, { outer: 'y' })).toEqual([]);

    const first: ScenarioFile = {
      ...base,
      blocks: [
        {
          id: 'start',
          kind: 'decision',
          question: 'How does it start?',
          default: 'quiet',
          alternatives: [
            { id: 'loud', label: 'Loudly', steps: [a] },
            { id: 'quiet', label: 'Quietly', steps: [] },
          ],
        },
      ],
    };
    expect(at(first, 1)).toEqual([['start', 'quiet', 'before']]);
    expect(at(first, 2)).toEqual([]);
  });
});

describe('the decisions playback reaches', () => {
  it('are those the tree reaches, in order, each with the alternative it plays', () => {
    fc.assert(
      fc.property(tree, fc.array(fc.nat({ max: 3 }), { maxLength: 40 }), (segments, picks) => {
        const { scenario } = written(segments);
        const choices = choicesFrom(scenario, picks);
        const entered: string[] = [];
        reference(segments, choices, (decision) => entered.push(decision));
        const reached = decisionsReached(scenario, choices);
        expect(reached.map((each) => each.decision.id)).toEqual(entered);
        for (const each of reached) {
          expect(each.alternative).toBe(chosenAlternative(each.decision, choices));
        }
      }),
      { numRuns: 300 },
    );
  });

  it('stop at an alternative that ends the scenario, and are none without decisions', () => {
    const base = scenarioProject().scenarios[0] as ScenarioFile;
    const two: ScenarioFile = {
      ...base,
      blocks: [
        {
          id: 'first',
          kind: 'decision',
          question: 'First?',
          alternatives: [
            { id: 'go', label: 'Go', steps: ['read'] },
            { id: 'stop', label: 'Stop', steps: ['delegate'], ends: true },
          ],
        },
        {
          id: 'second',
          kind: 'decision',
          question: 'Second?',
          default: 'q',
          alternatives: [
            { id: 'p', label: 'P', steps: ['fetch'] },
            { id: 'q', label: 'Q', steps: ['answer'] },
          ],
        },
      ],
    };
    const pairs = (scenario: ScenarioFile, choices?: Record<string, string>) =>
      decisionsReached(scenario, choices).map((each) => [each.decision.id, each.alternative.id]);
    expect(pairs(two)).toEqual([
      ['first', 'go'],
      ['second', 'q'],
    ]);
    expect(pairs(two, { second: 'p' })).toEqual([
      ['first', 'go'],
      ['second', 'p'],
    ]);
    expect(pairs(two, { first: 'stop' })).toEqual([['first', 'stop']]);
    expect(pairs(base)).toEqual([]);
    // Decisions that do not hold together play every step in order, and reach none.
    const apart: ScenarioFile = {
      ...two,
      blocks: [{ ...(two.blocks?.[0] as DecisionBlock), id: 'read' }],
    };
    expect(pairs(apart)).toEqual([]);
  });
});

describe('scenario commands with decisions', () => {
  const run = (state: ProjectSnapshot, command: Command) => executeCommand(state, command);

  it('take decisions whole, and refuse those that do not hold together', () => {
    const { scenario } = withDecision();
    const project = scenarioProject();
    const set = (blocks: unknown): Command => ({
      type: 'update-scenario',
      id: scenario.id,
      changes: { blocks: blocks as DecisionBlock[] },
    });
    const ok = run(project, set(scenario.blocks));
    expect(ok.ok && ok.state.scenarios[0]?.blocks).toEqual(scenario.blocks);
    const [first, second] = scenario.steps.map((step) => step.id) as [string, string];
    const refusal = (blocks: unknown) => {
      const outcome = run(project, set(blocks));
      return outcome.ok ? undefined : outcome.problems.map((each) => [each.code, each.message]);
    };
    expect(refusal([{ id: 'd', kind: 'decision', question: 'Q?', alternatives: [] }])).toEqual([
      [
        'invalid-command',
        'A decision has an id, the kind "decision", a question, its alternatives and maybe a default; an alternative has an id, a label, its steps and maybe ends.',
      ],
    ]);
    const decision = (alternatives: unknown[], more: object = {}) => [
      { id: 'd', kind: 'decision', question: 'Which way?', alternatives, ...more },
    ];
    expect(
      refusal(
        decision([
          { id: 'a', label: 'A', steps: ['nope'] },
          { id: 'b', label: 'B', steps: [] },
        ]),
      ),
    ).toEqual([
      [
        'invalid-decision',
        'The alternative "A" lists "nope", which is not a step of the scenario.',
      ],
    ]);
    expect(
      refusal(
        decision([
          { id: 'a', label: 'A', steps: [second] },
          { id: 'b', label: 'B', steps: [first] },
        ]),
      ),
    ).toEqual([
      [
        'invalid-decision',
        'The alternatives of the decision "Which way?" do not follow one another.',
      ],
    ]);
    expect(
      refusal(
        decision(
          [
            { id: 'a', label: 'A', steps: [first] },
            { id: 'b', label: 'B', steps: [] },
          ],
          { default: 'c' },
        ),
      ),
    ).toEqual([
      [
        'invalid-decision',
        'The decision "Which way?" names a default that is none of its alternatives.',
      ],
    ]);
    const nulled = ok.ok && run(ok.state, set(null));
    expect(nulled && nulled.ok && nulled.state.scenarios[0]?.blocks).toBeUndefined();
  });

  it('keep decisions without the steps a change takes away, and drop one left with none', () => {
    const { project, scenario } = withDecision();
    const without = (ids: string[]) =>
      run(project, {
        type: 'update-scenario',
        id: scenario.id,
        changes: { steps: scenario.steps.filter((step) => !ids.includes(step.id)) },
      });
    const last = scenario.steps.at(-1)?.id as string;
    const one = without([last]);
    expect(one.ok && one.state.scenarios[0]?.blocks?.[0]?.alternatives[1]?.steps).toEqual([]);
    const both = without(scenario.steps.slice(-2).map((step) => step.id));
    expect(both.ok && both.state.scenarios[0]?.blocks).toBeUndefined();
    // Moving an alternative's step away from its stretch is refused.
    const moved = [...scenario.steps];
    const [step] = moved.splice(-1, 1) as [Step];
    moved.unshift(step);
    const outcome = run(project, {
      type: 'update-scenario',
      id: scenario.id,
      changes: { steps: moved },
    });
    expect(outcome.ok ? [] : outcome.problems.map((each) => each.code)).toEqual([
      'invalid-decision',
    ]);
  });

  it('keep an alternative’s steps in reading order when a change moves one inside it', () => {
    const { project, scenario } = withDecision();
    const [, , delegate = '', fetch = '', answer = ''] = scenario.steps.map((step) => step.id);
    const longer: ScenarioFile = {
      ...scenario,
      blocks: [
        {
          id: 'slots',
          kind: 'decision',
          question: 'Are there free slots?',
          alternatives: [
            { id: 'yes', label: 'Yes', steps: [delegate, fetch] },
            { id: 'no', label: 'No', steps: [answer] },
          ],
        },
      ],
    };
    const moved = [...longer.steps];
    [moved[2], moved[3]] = [moved[3] as Step, moved[2] as Step];
    const outcome = run(
      { ...project, scenarios: [longer] },
      { type: 'update-scenario', id: longer.id, changes: { steps: moved } },
    );
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    expect(outcome.state.scenarios[0]?.blocks?.[0]?.alternatives[0]?.steps).toEqual([
      fetch,
      delegate,
    ]);
  });

  it('keep a broken step in its alternative, which says where it is', () => {
    const { project, scenario } = withDecision();
    const last = scenario.steps.at(-1) as Step;
    const deleted = run(project, { type: 'delete', relations: [...last.relations] });
    if (!deleted.ok) throw new Error(deleted.problems.map((each) => each.message).join(' '));
    const kept = deleted.state.scenarios[0] as ScenarioFile;
    expect(kept.steps.map((step) => step.id)).toEqual(scenario.steps.map((step) => step.id));
    expect(
      brokenStepsOf(deleted.state, kept).find((each) => each.step === last.id)?.within,
    ).toEqual({
      decision: 'slots',
      alternative: 'no',
    });
    // The preview of the deletion says so first, and says nothing of where a step without one is.
    expect(previewDelete(project, { relations: [...last.relations] }).brokenSteps).toEqual([
      { scenario: scenario.id, step: scenario.steps[0]?.id },
      { scenario: scenario.id, step: last.id, within: { decision: 'slots', alternative: 'no' } },
    ]);
  });

  it('warn on opening about decisions that cross, and play every step in order', () => {
    const { project, scenario } = withDecision();
    const [first, second, third] = scenario.steps.map((step) => step.id) as [
      string,
      string,
      string,
    ];
    const crossing: ScenarioFile = {
      ...scenario,
      blocks: [
        {
          id: 'one',
          kind: 'decision',
          question: 'One?',
          alternatives: [
            { id: 'one-a', label: 'A', steps: [first] },
            { id: 'one-b', label: 'B', steps: [second] },
          ],
        },
        {
          id: 'two',
          kind: 'decision',
          question: 'Two?',
          alternatives: [
            { id: 'two-a', label: 'A', steps: [second] },
            { id: 'two-b', label: 'B', steps: [third] },
          ],
        },
      ],
    };
    const written: ProjectSnapshot = { ...project, scenarios: [crossing] };
    const warning = checkProject(written).warnings.find((each) => each.code === 'invalid-decision');
    expect(warning?.message).toBe(
      'The decisions of the scenario "A request" do not hold together: The decisions "One?" and "Two?" cross: one must sit inside an alternative of the other, or stand apart. It plays every step in order.',
    );
    expect(playedSteps(crossing)).toEqual(crossing.steps.map((_, at) => at));
  });
});
