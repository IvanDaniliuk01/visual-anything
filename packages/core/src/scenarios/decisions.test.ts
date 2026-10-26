/**
 * Editing decisions as recording and Claude do (ADR 0078): an alternative added after a step,
 * rejoining after a decision, and a decision taken away; each result is what `update-scenario` takes.
 */
import type { ScenarioFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { playedSteps, readBlocks } from './blocks';
import {
  addAlternativeAfter,
  rejoinAt,
  removeDecision,
  stepsRemovedWith,
  type EditedDecisions,
} from './decisions';
import { scenarioProject, theScenario } from './test/fixtures';

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
});
