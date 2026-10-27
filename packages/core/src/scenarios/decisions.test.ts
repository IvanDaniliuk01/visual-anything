/**
 * Editing decisions as recording and Claude do (ADR 0078): an alternative added after a step,
 * rejoining after a decision, and a decision taken away; each result is what `update-scenario` takes.
 */
import type { ScenarioFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { alternativeOf, alternativesOf, choicesToReach, playedSteps, readBlocks } from './blocks';
import {
  addAlternativeAfter,
  insertStep,
  rejoinAt,
  removeDecision,
  stepsRemovedWith,
  type EditedDecisions,
} from './decisions';
import { scenarioProject, theScenario } from './test/fixtures';
import { tree, written } from './test/trees';

const ids = (scenario: Pick<ScenarioFile, 'steps'>, at: number[]) =>
  at.map((index) => scenario.steps[index]?.id);

/** Sends an edit as the app would, and gives the scenario it leaves. */
function applied(project: ProjectSnapshot, edited: EditedDecisions | undefined): ScenarioFile {
  if (!edited) throw new Error('No edit.');
  const outcome = executeCommand(project, {
    type: 'update-scenario',
    id: theScenario(project).id,
    changes: { steps: edited.steps, blocks: edited.blocks },
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return theScenario(outcome.state);
}

const alternative = (n: number) => ({
  step: { id: `other-${n}`, description: `Another way ${n}.`, relations: ['api-calls-worker'] },
  alternative: { id: `way-${n}`, label: `Way ${n}` },
  decision: { id: 'how', question: 'How does it go on?', kept: { id: 'usual', label: 'As usual' } },
});

describe('editing decisions', () => {
  it('adds an alternative after a step, keeping what followed in the first, then joins the decision there', () => {
    const project = scenarioProject();
    const first = applied(
      project,
      addAlternativeAfter(theScenario(project), 'read', alternative(1)),
    );
    expect(first.steps.map((step) => step.id)).toEqual([
      'call',
      'read',
      'delegate',
      'fetch',
      'answer',
      'other-1',
    ]);
    expect(first.blocks?.[0]?.alternatives.map((each) => each.steps)).toEqual([
      ['delegate', 'fetch', 'answer'],
      ['other-1'],
    ]);
    expect(ids(first, playedSteps(first))).toEqual(['call', 'read', 'delegate', 'fetch', 'answer']);
    expect(ids(first, playedSteps(first, { how: 'way-1' }))).toEqual(['call', 'read', 'other-1']);

    const withFirst = { ...project, scenarios: [first] };
    const second = applied(withFirst, addAlternativeAfter(first, 'read', alternative(2)));
    expect(second.blocks).toHaveLength(1);
    expect(second.blocks?.[0]?.alternatives.map((each) => each.id)).toEqual([
      'usual',
      'way-1',
      'way-2',
    ]);
    expect(readBlocks(second).ok).toBe(true);
  });

  it('rejoins at a step: it and the steps after it follow the decision, whichever way it goes', () => {
    const project = scenarioProject();
    const branched = applied(
      project,
      addAlternativeAfter(theScenario(project), 'read', alternative(1)),
    );
    const rejoined = applied({ ...project, scenarios: [branched] }, rejoinAt(branched, 'fetch'));
    expect(rejoined.steps.map((step) => step.id)).toEqual([
      'call',
      'read',
      'delegate',
      'other-1',
      'fetch',
      'answer',
    ]);
    expect(ids(rejoined, playedSteps(rejoined, { how: 'way-1' }))).toEqual([
      'call',
      'read',
      'other-1',
      'fetch',
      'answer',
    ]);
    expect(rejoinAt(rejoined, 'call')).toBeUndefined();
  });

  it('takes a decision away, keeping its default way and saying which steps go', () => {
    const project = scenarioProject();
    const branched = applied(
      project,
      addAlternativeAfter(theScenario(project), 'read', alternative(1)),
    );
    expect(stepsRemovedWith(branched, 'how')).toEqual(['other-1']);
    const removed = applied({ ...project, scenarios: [branched] }, removeDecision(branched, 'how'));
    expect(removed.steps.map((step) => step.id)).toEqual([
      'call',
      'read',
      'delegate',
      'fetch',
      'answer',
    ]);
    expect(removed.blocks).toBeUndefined();
    expect(removeDecision(removed, 'how')).toBeUndefined();
  });

  it('adds an alternative inside another, which then holds the step recorded too', () => {
    const project = scenarioProject();
    const outer = applied(
      project,
      addAlternativeAfter(theScenario(project), 'read', alternative(1)),
    );
    const inner = applied(
      { ...project, scenarios: [outer] },
      addAlternativeAfter(outer, 'delegate', {
        step: { id: 'retry', description: 'It tries again.', relations: ['api-calls-worker'] },
        alternative: { id: 'again', label: 'Again' },
        decision: {
          id: 'works',
          question: 'Does it work?',
          kept: { id: 'works-yes', label: 'Yes' },
        },
      }),
    );
    expect(readBlocks(inner).ok).toBe(true);
    expect(inner.blocks?.find((block) => block.id === 'how')?.alternatives[0]?.steps).toEqual([
      'delegate',
      'fetch',
      'answer',
      'retry',
    ]);
    expect(ids(inner, playedSteps(inner, { works: 'again' }))).toEqual([
      'call',
      'read',
      'delegate',
      'retry',
    ]);

    // Rejoining inside it keeps the outer alternative's steps in reading order.
    const rejoined = applied({ ...project, scenarios: [inner] }, rejoinAt(inner, 'answer'));
    expect(rejoined.steps.map((step) => step.id)).toEqual([
      'call',
      'read',
      'delegate',
      'fetch',
      'retry',
      'answer',
      'other-1',
    ]);
    expect(ids(rejoined, playedSteps(rejoined, { works: 'again' }))).toEqual([
      'call',
      'read',
      'delegate',
      'retry',
      'answer',
    ]);
  });

  it('puts a recorded step after a step, in the alternatives holding it, or after a decision', () => {
    const project = scenarioProject();
    const branched = applied(
      project,
      addAlternativeAfter(theScenario(project), 'read', alternative(1)),
    );
    const step = (id: string) => ({ id, description: '', relations: ['api-reads-db'] });

    const inside = insertStep(branched, step('more'), { after: 'other-1' });
    expect(inside?.at).toBe(6);
    const more = applied({ ...project, scenarios: [branched] }, inside);
    expect(more.blocks?.[0]?.alternatives[1]?.steps).toEqual(['other-1', 'more']);
    expect(ids(more, playedSteps(more, { how: 'way-1' }))).toEqual([
      'call',
      'read',
      'other-1',
      'more',
    ]);

    const after = insertStep(branched, step('then'), { afterDecision: 'how' });
    expect(after?.at).toBe(6);
    const then = applied({ ...project, scenarios: [branched] }, after);
    expect(then.blocks?.[0]?.alternatives.map((each) => each.steps)).toEqual([
      ['delegate', 'fetch', 'answer'],
      ['other-1'],
    ]);
    expect(ids(then, playedSteps(then))).toEqual([
      'call',
      'read',
      'delegate',
      'fetch',
      'answer',
      'then',
    ]);
    expect(ids(then, playedSteps(then, { how: 'way-1' }))).toEqual([
      'call',
      'read',
      'other-1',
      'then',
    ]);

    expect(insertStep(branched, step('x'), { after: 'nowhere' })).toBeUndefined();
    expect(insertStep(branched, step('x'), { afterDecision: 'nowhere' })).toBeUndefined();
  });
});

describe('editing decisions, for any scenario', () => {
  /**
   * Whether the edit holds together, with the step `id` where the choices that reach it play it; or
   * why its decisions do not hold together.
   */
  const holds = (edited: EditedDecisions | undefined, id: string): boolean | string => {
    if (!edited) return false;
    const scenario = {
      steps: edited.steps.map((step, at) => ({ ...step, id: step.id ?? `kept-${at}` })),
      ...(edited.blocks ? { blocks: edited.blocks } : {}),
    };
    const read = readBlocks(scenario);
    if (!read.ok) return read.message;
    const reach = choicesToReach(scenario, id);
    const at = scenario.steps.findIndex((step) => step.id === id);
    return reach !== undefined && playedSteps(scenario, reach).includes(at);
  };

  it('records after any step, or after any decision, keeping the decisions whole', () => {
    fc.assert(
      fc.property(tree, (segments) => {
        const { scenario } = written(segments);
        const step = { id: 'recorded', description: '', relations: ['agent-to-api'] };
        for (const each of scenario.steps) {
          expect(holds(insertStep(scenario, step, { after: each.id }), 'recorded')).toBe(true);
        }
        for (const block of scenario.blocks ?? []) {
          // After a decision whose every alternative ends, nothing plays.
          if (block.alternatives.every((alternative) => alternative.ends)) continue;
          expect(holds(insertStep(scenario, step, { afterDecision: block.id }), 'recorded')).toBe(
            true,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('adds an alternative after any step, and rejoins at any step of one, keeping them whole', () => {
    fc.assert(
      fc.property(tree, (segments) => {
        const { scenario } = written(segments);
        const read = readBlocks(scenario);
        if (!read.ok) return;
        for (const each of scenario.steps) {
          const added = addAlternativeAfter(scenario, each.id, {
            step: { id: 'recorded', description: '', relations: ['agent-to-api'] },
            alternative: { id: 'new-way', label: 'New way' },
            decision: {
              id: 'new-decision',
              question: 'New?',
              kept: { id: 'old-way', label: 'Old' },
            },
          });
          // Decisions sit three deep at most, which a decision added around others can pass.
          const held = holds(added, 'recorded');
          if (held !== 'Decisions sit at most three deep.') expect(held).toBe(true);
          // At the top, with no decision inside what follows, it always holds.
          if (
            alternativesOf(scenario, each.id).length === 0 &&
            (scenario.blocks ?? []).length === 0
          ) {
            expect(held).toBe(true);
          }
          if (alternativeOf(scenario, each.id) === undefined) continue;
          const rejoined = rejoinAt(scenario, each.id);
          expect(holds(rejoined, each.id)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
