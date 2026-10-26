/**
 * Decisions between labelled alternatives (ADR 0078): blocks over a scenario's flat list of steps,
 * read and checked, the steps each set of choices plays, the choices that reach a step, and the
 * scenario commands and opening that keep them whole.
 */
import type { DecisionBlock, DecisionChoices, ScenarioFile, Step } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { alternativeOf, choicesToReach, combinationsOf, playedSteps, readBlocks } from './blocks';
import { scenarioProject } from './test/fixtures';
import { brokenStepsOf, entryOfStep, scenarioTimeline } from './timeline';

// A scenario's structure as a tree, from which the generator writes the flat steps and the blocks,
// and against which a reference reading checks what plays.
type Segment =
  | { kind: 'steps'; count: number }
  | {
      kind: 'decision';
      alternatives: { segments: Segment[]; ends: boolean }[];
      byDefault?: number;
    };

const steps = (count: number): fc.Arbitrary<Segment> =>
  fc.constant({ kind: 'steps' as const, count });

function segmentOf(depth: number): fc.Arbitrary<Segment> {
  const plain = fc.integer({ min: 1, max: 3 }).chain(steps);
  if (depth >= 3) return plain;
  const decision = fc
    .record({
      alternatives: fc.array(
        fc.record({
          segments: fc.array(segmentOf(depth + 1), { maxLength: 2 }),
          ends: fc.boolean(),
        }),
        { minLength: 2, maxLength: 4 },
      ),
      byDefault: fc.option(fc.nat({ max: 3 }), { nil: undefined }),
    })
    .map(({ alternatives, byDefault }): Segment => {
      // At least one alternative has steps, and one does not end, so that every step can be reached.
      const fixed = alternatives.map((each, at) => ({
        segments:
          at === 0 && each.segments.length === 0
            ? [{ kind: 'steps' as const, count: 1 }]
            : each.segments,
        ends: at === 0 ? false : each.ends,
      }));
      return {
        kind: 'decision',
        alternatives: fixed,
        ...(byDefault === undefined ? {} : { byDefault: byDefault % fixed.length }),
      };
    });
  return fc.oneof({ weight: 2, arbitrary: plain }, { weight: 1, arbitrary: decision });
}

interface Written {
  scenario: ScenarioFile;
  tree: Segment[];
}

/** Writes a tree as a scenario: its steps in reading order, and a block for each decision. */
function written(tree: Segment[]): Written {
  const all: Step[] = [];
  const blocks: DecisionBlock[] = [];
  let counter = 0;
  const write = (segments: Segment[]): string[] => {
    const ids: string[] = [];
    for (const segment of segments) {
      if (segment.kind === 'steps') {
        for (let at = 0; at < segment.count; at++) {
          const id = `s${++counter}`;
          all.push({ id, description: id, relations: ['agent-to-api'] });
          ids.push(id);
        }
        continue;
      }
      const decision = `d${++counter}`;
      const block: DecisionBlock = {
        id: decision,
        kind: 'decision',
        question: `Which way at ${decision}?`,
        alternatives: [],
      };
      blocks.push(block);
      segment.alternatives.forEach((alternative, at) => {
        const inner = write(alternative.segments);
        block.alternatives.push({
          id: `${decision}-a${at}`,
          label: `Way ${at}`,
          steps: inner,
          ...(alternative.ends ? { ends: true as const } : {}),
        });
        ids.push(...inner);
      });
      if (segment.byDefault !== undefined) {
        block.default = block.alternatives[segment.byDefault]?.id;
      }
    }
    return ids;
  };
  write(tree);
  return {
    scenario: {
      id: 'scenario',
      name: 'Scenario',
      view: 'system-overview',
      steps: all,
      ...(blocks.length > 0 ? { blocks } : {}),
    },
    tree,
  };
}

/** What a tree plays with these choices, read straight from the tree: the reference. */
function reference(tree: Segment[], choices: DecisionChoices): string[] {
  let counter = 0;
  const played: string[] = [];
  let ended = false;
  const walk = (segments: Segment[], playing: boolean): void => {
    for (const segment of segments) {
      if (segment.kind === 'steps') {
        for (let at = 0; at < segment.count; at++) {
          const id = `s${++counter}`;
          if (playing && !ended) played.push(id);
        }
        continue;
      }
      const decision = `d${++counter}`;
      const asked = choices[decision];
      const index = segment.alternatives.findIndex((_, at) => `${decision}-a${at}` === asked);
      const chosen = index >= 0 ? index : (segment.byDefault ?? 0);
      segment.alternatives.forEach((alternative, at) => {
        const plays = playing && !ended && at === chosen;
        walk(alternative.segments, plays);
        if (plays && alternative.ends) ended = true;
      });
    }
  };
  walk(tree, true);
  return played;
}

const tree = fc.array(segmentOf(1), { minLength: 1, maxLength: 5 });

describe('decisions over a scenario’s steps', () => {
  it('play what the tree plays, for any choices, and hold together as written', () => {
    fc.assert(
      fc.property(tree, fc.array(fc.nat({ max: 3 }), { maxLength: 40 }), (segments, picks) => {
        const { scenario } = written(segments);
        expect(readBlocks(scenario).ok).toBe(true);
        const choices: DecisionChoices = {};
        (scenario.blocks ?? []).forEach((block, at) => {
          const pick = picks[at];
          if (pick !== undefined) {
            const alternative = block.alternatives[pick % block.alternatives.length];
            if (alternative) choices[block.id] = alternative.id;
          }
        });
        const played = playedSteps(scenario, choices).map((at) => scenario.steps[at]?.id);
        expect(played).toEqual(reference(segments, choices));
      }),
      { numRuns: 400 },
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
