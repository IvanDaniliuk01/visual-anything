/**
 * Steps outside the view (ADR-0040): a step whose relations the scope of its view shows none of plays
 * on its own, saying so, and is never a broken step; aggregation counts only what the view shows.
 */
import fc from 'fast-check';
import type { Id, Scope } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { shownByScope } from '../scope';
import type { ProjectSnapshot } from '../snapshot';
import { scenarioProject, step, theScenario, withSteps } from './test/fixtures';
import { isBroken, isOutside, scenarioTimeline } from './timeline';

function scoped(scope: Scope, collapsed?: Id[], steps?: Parameters<typeof withSteps>[1]) {
  const base = scenarioProject(collapsed);
  const project: ProjectSnapshot = steps ? withSteps(base, steps) : base;
  project.views[0] = { ...project.views[0]!, scope };
  return { project, timeline: scenarioTimeline(project, theScenario(project)) };
}

describe('steps outside the view', () => {
  it('marks a step whose relations the scope shows none of, and plays it on its own', () => {
    const { timeline } = scoped({ leftOut: ['client'] });
    const [call, read] = timeline.entries;
    expect(call).toMatchObject({ kind: 'step', steps: ['call'], outside: true });
    expect(isOutside(call!)).toBe(true);
    expect(isBroken(call!)).toBe(false);
    expect(isOutside(read!)).toBe(false);
    expect(read).not.toHaveProperty('outside');
  });

  it('does not mark a step that the view shows one of its relations of', () => {
    const steps = [step('both', 'client-calls-api', 'api-reads-db')];
    const { timeline } = scoped({ leftOut: ['client'] }, undefined, steps);
    expect(isOutside(timeline.entries[0]!)).toBe(false);
  });

  it('keeps a broken step a broken step, never outside the view', () => {
    const steps = [step('lost', 'deleted-relation'), step('half', 'client-calls-api', 'gone')];
    const { timeline } = scoped({ leftOut: ['client'] }, undefined, steps);
    expect(timeline.entries.map(isBroken)).toEqual([true, true]);
    expect(timeline.entries.map(isOutside)).toEqual([false, false]);
  });

  it('aggregates inside a collapsed container only what the view shows', () => {
    // The worker is left out: delegating to it and fetching from it happen outside the view.
    const { timeline } = scoped({ leftOut: ['worker'] }, ['system']);
    expect(
      timeline.entries.map((entry) =>
        entry.kind === 'step'
          ? `${entry.steps.join()}${entry.outside ? ' outside' : ''}`
          : `${entry.steps.join('+')} in ${entry.container}`,
      ),
    ).toEqual(['call', 'read in system', 'delegate outside', 'fetch outside', 'answer']);
  });

  it('aggregates nothing inside a collapsed container the scope leaves out', () => {
    const { timeline } = scoped({ leftOut: ['store'] }, ['store']);
    expect(timeline.entries.every((entry) => entry.kind === 'step')).toBe(true);
  });

  it('marks nothing in a view without a scope', () => {
    const project = scenarioProject();
    const timeline = scenarioTimeline(project, theScenario(project));
    expect(timeline.entries.some(isOutside)).toBe(false);
  });
});

const ELEMENTS = ['client', 'contract', 'system', 'api', 'db', 'store', 'worker', 'blob', 'cache'];
const RELATIONS = [
  'client-calls-api',
  'api-reads-db',
  'api-calls-worker',
  'worker-reads-blob',
  'worker-reads-cache',
  'contract-governs-call',
  'gone',
];

describe('steps outside the view, for any scope and steps', () => {
  it('marks exactly the whole steps whose relations the scope shows none of', () => {
    fc.assert(
      fc.property(
        fc.subarray(ELEMENTS),
        fc.subarray(['system', 'store']),
        fc.array(fc.subarray(RELATIONS, { minLength: 1 }), { maxLength: 6 }),
        (leftOut, collapsed, relationLists) => {
          const steps = relationLists.map((relations, at) => step(`s${at}`, ...relations));
          const { project, timeline } = scoped({ leftOut }, collapsed, steps);
          const shown = shownByScope(project, project.views[0]!);
          for (const [at, each] of steps.entries()) {
            const entry = timeline.entries[timeline.entryOf[at]!]!;
            const whole = !each.relations.includes('gone');
            const none = each.relations.every((id) => !shown.relation(id));
            expect(isOutside(entry)).toBe(whole && none);
            if (entry.kind === 'aggregated') {
              expect(each.relations.every((id) => shown.relation(id))).toBe(true);
              expect(shown.element(entry.container)).toBe(true);
            }
          }
        },
      ),
    );
  });
});
