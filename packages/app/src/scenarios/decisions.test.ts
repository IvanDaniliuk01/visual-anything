/**
 * Decisions in the app (ADR 0078), over the process sample's "An order": the steps' list grouped by
 * alternative, what the canvas dims and dashes while a decision lasts and what it previews, and where
 * choosing takes playback.
 */
import { executeCommand, scenarioTimeline, type ProjectSnapshot } from '@visual-anything/core';
import type { ScenarioFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample, withoutDecisions } from '../test/sample';
import {
  choicesReaching,
  decisionAhead,
  hasDecisions,
  sayChosen,
  stepAfterChoice,
  withChoice,
} from './choosing';
import { decisionEmphasis } from './decision-emphasis';
import { listedSteps, type ListedStep } from './groups';
import { decisionRightAfter } from './record-decisions';

const project = loadSample('order-process');
const order = project.scenarios.find((each) => each.id === 'an-order') as ScenarioFile;
const NO = { decision: 'stock-check', alternative: 'out-of-stock' };

/** The list as text: steps by number, entries by their first step, decisions with their alternatives. */
function shape(items: readonly ListedStep[] | undefined): unknown[] {
  return (items ?? []).map((item) => {
    if (item.kind === 'entry') return `entry ${item.entry}`;
    if (item.kind === 'step') return `aside ${item.step + 1}`;
    return {
      [item.decision.question]: item.alternatives.map((each) => ({
        [each.alternative.label]: {
          chosen: each.chosen,
          steps: each.steps,
          broken: each.broken,
          items: shape(each.items),
        },
      })),
    };
  });
}

describe('the steps’ list of a scenario with decisions', () => {
  it('groups each alternative’s steps under it, the steps not played listed aside', () => {
    const timeline = scenarioTimeline(project, order);
    const listed = listedSteps(order, timeline, {}, () => false);
    expect(shape(listed)).toEqual([
      'entry 0',
      'entry 1',
      'entry 2',
      {
        'Is every item in stock?': [
          {
            Yes: {
              chosen: true,
              steps: 6,
              broken: 0,
              items: ['entry 3', 'entry 4', 'entry 5', 'entry 6', 'entry 7', 'entry 8'],
            },
          },
          {
            No: {
              chosen: false,
              steps: 3,
              broken: 0,
              items: ['aside 10', 'aside 11', 'aside 12'],
            },
          },
        ],
      },
    ]);
  });

  it('counts the broken steps of an alternative not chosen', () => {
    const deleted = executeCommand(project, { type: 'delete', relations: ['cancel-to-end'] });
    if (!deleted.ok) throw new Error('The deletion was refused.');
    const now = deleted.state.scenarios.find((each) => each.id === 'an-order') as ScenarioFile;
    const broken = (at: number) => now.steps[at]?.id === 'cancel';
    const listed = listedSteps(now, scenarioTimeline(deleted.state, now), {}, broken);
    const decision = listed?.find((item) => item.kind === 'decision');
    expect(decision?.kind === 'decision' && decision.alternatives[1]?.broken).toBe(1);
  });

  it('lists a scenario without decisions as its timeline, as ever', () => {
    const linear = withoutDecisions();
    const plain = linear.scenarios[0] as ScenarioFile;
    expect(hasDecisions(plain)).toBe(false);
    expect(listedSteps(plain, scenarioTimeline(linear, plain), {}, () => false)).toBe(undefined);
  });
});

describe('what a decision shows on the canvas', () => {
  it('dims and dashes what only the alternatives not chosen use, and previews one in full', () => {
    const shown = decisionEmphasis(project, order, {}, ['stock-check'], undefined);
    const aside = ['in-stock-no', 'cancel-to-end', 'sends-refund'];
    expect([...(shown?.dashed ?? [])].sort()).toEqual([...aside].sort());
    expect([...(shown?.dimmed ?? [])].sort()).toEqual([...aside].sort());
    const previewed = decisionEmphasis(project, order, {}, [], NO);
    expect([...(previewed?.dashed ?? [])].sort()).toEqual([...aside].sort());
    expect(previewed?.dimmed).toBeUndefined();
    // Nothing while no decision lasts and none is pointed at.
    expect(decisionEmphasis(project, order, {}, [], undefined)).toBeUndefined();
    // The other way round once "No" is chosen.
    const other = decisionEmphasis(
      project,
      order,
      { 'stock-check': 'out-of-stock' },
      ['stock-check'],
      undefined,
    );
    expect(other?.dashed).toContain('pick-to-pack');
    expect(other?.dashed).not.toContain('in-stock-no');
  });

  it('never dims a relation a step that plays uses', () => {
    const relations = new Set(order.steps.slice(0, 9).flatMap((step) => step.relations));
    const shown = decisionEmphasis(project, order, {}, ['stock-check'], undefined);
    for (const relation of shown?.dashed ?? []) expect(relations.has(relation)).toBe(false);
  });
});

describe('choosing', () => {
  it('stays on a step the choices still play, or goes into the alternative chosen', () => {
    const choices = withChoice({}, NO);
    expect(stepAfterChoice(order, choices, 2, NO.decision)).toBe(2);
    expect(stepAfterChoice(order, choices, 5, NO.decision)).toBe(9);
    expect(withChoice(choices, NO)).toBe(choices);
    expect(sayChosen(order, NO)).toBe('“No” plays at “Is every item in stock?”.');
  });

  it('knows the decision ahead of a step, and the choices that reach a step not played', () => {
    expect(decisionAhead(order, {}, 2)).toEqual({
      decision: 'stock-check',
      alternative: 'in-stock',
    });
    expect(decisionAhead(order, {}, 1)).toBeUndefined();
    expect(choicesReaching(order, 10, {})).toEqual({
      choices: { 'stock-check': 'out-of-stock' },
      changed: [NO],
    });
    expect(choicesReaching(order, 4, {})).toBeUndefined();
  });

  it('joins the decision that starts right after a step, and none after another', () => {
    expect(decisionRightAfter(order, 2)).toBe('stock-check');
    expect(decisionRightAfter(order, 1)).toBeUndefined();
    expect(decisionRightAfter(order, 4)).toBeUndefined();
  });
});

describe('the process sample', () => {
  it('holds a decision that plays either way', () => {
    const sample: ProjectSnapshot = project;
    expect(hasDecisions(order)).toBe(true);
    expect(
      scenarioTimeline(sample, order, undefined, { 'stock-check': 'out-of-stock' }).entries.length,
    ).toBe(6);
  });
});
