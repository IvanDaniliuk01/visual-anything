import fc from 'fast-check';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { collapsedIn, containmentInView, endsOf } from './containment';
import { scenarioProject, step, theScenario, withSteps } from './test/fixtures';
import { brokenStepsOf, entryOfStep, isBroken, scenarioTimeline, type Timeline } from './timeline';

/** What each entry of a timeline plays, in short: a step's id, or the steps and container of an aggregate. */
function shapeOf(timeline: Timeline): string[] {
  return timeline.entries.map((entry) =>
    entry.kind === 'step'
      ? entry.steps.join()
      : `${entry.steps.join('+')} in ${entry.container} (${entry.count})`,
  );
}

function timelineOf(collapsed: Id[] | undefined, steps?: Parameters<typeof withSteps>[1]) {
  const base = scenarioProject(collapsed);
  const project = steps ? withSteps(base, steps) : base;
  return scenarioTimeline(project, theScenario(project));
}

describe('collapsedIn', () => {
  it('reads the containers a view collapses, each once, leaving out World and what is no element', () => {
    const project = scenarioProject(['store', 'system', 'store', 'world', 'gone', 'api-in-system']);
    const [view] = project.views;
    expect([...collapsedIn(project, view!)]).toEqual(['store', 'system']);
  });

  it('is empty for a view that collapses nothing, or a list that is no list', () => {
    const project = scenarioProject();
    const [view] = project.views;
    expect(collapsedIn(project, view!).size).toBe(0);
    const odd = { ...view!, collapsed: 'system' } as unknown as typeof view;
    expect(collapsedIn(project, odd!).size).toBe(0);
  });
});

describe('containmentInView', () => {
  it('gives every container an element sits inside, directly or not, through the view’s nesting relation types', () => {
    const project = scenarioProject();
    const containment = containmentInView(project, project.views[0]!);
    expect([...containment.enclosing('blob')].sort()).toEqual(['store', 'system']);
    expect([...containment.enclosing('cache')].sort()).toEqual(['store', 'system']);
    expect([...containment.enclosing('system')]).toEqual([]);
    expect([...containment.enclosing('client')]).toEqual([]);
  });

  it('nests nothing in a view that no relation type that nests arranges', () => {
    const project = scenarioProject();
    const flat = { ...project.views[0]!, nestingRelationTypes: [] };
    expect([...containmentInView(project, flat).enclosing('blob')]).toEqual([]);
  });

  it('ends even when the model holds a containment cycle', () => {
    const project = scenarioProject();
    const looped = {
      ...project,
      model: {
        ...project.model,
        relations: [
          ...project.model.relations,
          { id: 'system-in-blob', relationType: 'test.inside', from: 'system', to: 'blob' },
        ],
      },
    };
    const enclosing = containmentInView(looped, looped.views[0]!).enclosing('blob');
    expect([...enclosing].sort()).toEqual(['blob', 'store', 'system']);
  });
});

describe('endsOf', () => {
  it('gives the elements a relation ends on, following relations that end on relations', () => {
    const project = scenarioProject();
    expect(endsOf(project, 'api-reads-db')).toEqual(['api', 'db']);
    expect(endsOf(project, 'contract-governs-call')).toEqual(['contract', 'client', 'api']);
    expect(endsOf(project, 'gone')).toEqual([]);
  });
});

describe('scenarioTimeline', () => {
  it('plays every step on its own when no container is collapsed', () => {
    const timeline = timelineOf(undefined);
    expect(shapeOf(timeline)).toEqual(['call', 'read', 'delegate', 'fetch', 'answer']);
    expect(timeline.entries[0]).toEqual({
      kind: 'step',
      first: 0,
      count: 1,
      steps: ['call'],
      relations: ['client-calls-api'],
      missing: [],
    });
    expect(timeline.entryOf).toEqual([0, 1, 2, 3, 4]);
    expect(timeline.steps).toBe(5);
  });

  it('plays consecutive steps entirely inside a collapsed container as one aggregated step with a count', () => {
    const timeline = timelineOf(['system']);
    expect(shapeOf(timeline)).toEqual(['call', 'read+delegate+fetch in system (3)', 'answer']);
    expect(timeline.entries[1]).toEqual({
      kind: 'aggregated',
      first: 1,
      count: 3,
      steps: ['read', 'delegate', 'fetch'],
      container: 'system',
      relations: ['api-reads-db', 'api-calls-worker', 'worker-reads-blob'],
    });
    expect(timeline.entryOf).toEqual([0, 1, 1, 1, 2]);
  });

  it('aggregates a single step inside a collapsed container, and leaves steps that leave it alone', () => {
    // The API sits outside the store, so calling the worker comes into the store from outside.
    expect(shapeOf(timelineOf(['store']))).toEqual([
      'call',
      'read',
      'delegate',
      'fetch in store (1)',
      'answer',
    ]);
  });

  it('aggregates at the outermost collapsed container, which hides the ones inside it', () => {
    expect(shapeOf(timelineOf(['store', 'system']))).toEqual([
      'call',
      'read+delegate+fetch in system (3)',
      'answer',
    ]);
  });

  it('counts an element with several containers inside each of them', () => {
    const steps = [step('cached', 'worker-reads-cache'), step('blob', 'worker-reads-blob')];
    expect(shapeOf(timelineOf(['store'], steps))).toEqual(['cached+blob in store (2)']);
  });

  it('never aggregates a step whose relation ends on its own container', () => {
    const steps = [step('nest', 'api-in-system'), step('read', 'api-reads-db')];
    expect(shapeOf(timelineOf(['system'], steps))).toEqual(['nest', 'read in system (1)']);
  });

  it('follows a relation that ends on a relation to the elements it reaches', () => {
    const steps = [step('govern', 'contract-governs-call'), step('read', 'api-reads-db')];
    expect(shapeOf(timelineOf(['system'], steps))).toEqual(['govern', 'read in system (1)']);
  });

  it('keeps a broken step on its own, so that it shows and can be fixed, and splits the run around it', () => {
    const steps = [
      step('read', 'api-reads-db'),
      step('lost', 'api-reads-db', 'deleted-relation'),
      step('fetch', 'worker-reads-blob'),
    ];
    const timeline = timelineOf(['system'], steps);
    expect(shapeOf(timeline)).toEqual(['read in system (1)', 'lost', 'fetch in system (1)']);
    const lost = timeline.entries[1]!;
    expect(lost).toMatchObject({
      kind: 'step',
      relations: ['api-reads-db'],
      missing: ['deleted-relation'],
    });
    expect(isBroken(lost)).toBe(true);
    expect(isBroken(timeline.entries[0]!)).toBe(false);
  });

  it('aggregates nothing over a view the project does not have', () => {
    const project = scenarioProject(['system']);
    const timeline = scenarioTimeline(project, { ...theScenario(project), view: 'elsewhere' });
    expect(timeline.entries).toHaveLength(5);
  });

  it('is empty for a scenario with no steps', () => {
    const timeline = timelineOf(['system'], []);
    expect(timeline).toEqual({ entries: [], entryOf: [], steps: 0 });
  });
});

describe('entryOfStep', () => {
  it('finds the entry that plays a step, holding the index within the steps', () => {
    const timeline = timelineOf(['system']);
    expect(entryOfStep(timeline, 0)).toBe(0);
    expect(entryOfStep(timeline, 2)).toBe(1);
    expect(entryOfStep(timeline, 4)).toBe(2);
    expect(entryOfStep(timeline, 99)).toBe(2);
    expect(entryOfStep(timeline, -3)).toBe(0);
    expect(entryOfStep(timelineOf(undefined, []), 0)).toBeUndefined();
  });
});

describe('brokenStepsOf', () => {
  it('lists the broken steps, where they are and the relations they miss', () => {
    const project = withSteps(scenarioProject(), [
      step('ok', 'api-reads-db'),
      step('lost', 'gone-1', 'api-reads-db', 'gone-2'),
    ]);
    expect(brokenStepsOf(project, theScenario(project))).toEqual([
      { step: 'lost', index: 1, missing: ['gone-1', 'gone-2'] },
    ]);
  });
});

/** Every relation of the fixture that a step can use, and two that are gone. */
const RELATIONS = [
  'client-calls-api',
  'api-reads-db',
  'api-calls-worker',
  'worker-reads-blob',
  'worker-reads-cache',
  'contract-governs-call',
  'api-in-system',
  'store-in-system',
  'gone-1',
  'gone-2',
];
const CONTAINERS = ['system', 'store', 'api', 'client', 'world'];

const scenarioSteps = fc
  .array(fc.uniqueArray(fc.constantFrom(...RELATIONS), { minLength: 1, maxLength: 3 }), {
    maxLength: 12,
  })
  .map((lists) => lists.map((relations, at) => step(`s${at}`, ...relations)));

describe('scenarioTimeline, for any steps and any collapsed containers', () => {
  it('plays every step exactly once, in order, and aggregates only runs inside one collapsed container', () => {
    fc.assert(
      fc.property(scenarioSteps, fc.subarray(CONTAINERS), (steps, collapsed) => {
        const project = withSteps(scenarioProject(collapsed), steps);
        const timeline = scenarioTimeline(project, theScenario(project));
        const view = project.views[0]!;
        const shown = collapsedIn(project, view);
        const containment = containmentInView(project, view);

        // Every step once, in order: the entries tile the steps.
        expect(timeline.steps).toBe(steps.length);
        let next = 0;
        timeline.entries.forEach((entry, at) => {
          expect(entry.first).toBe(next);
          expect(entry.count).toBe(entry.steps.length);
          expect(entry.count).toBeGreaterThan(0);
          expect(entry.steps).toEqual(steps.slice(next, next + entry.count).map((each) => each.id));
          for (let index = next; index < next + entry.count; index++) {
            expect(timeline.entryOf[index]).toBe(at);
            expect(entryOfStep(timeline, index)).toBe(at);
          }
          next += entry.count;
        });
        expect(next).toBe(steps.length);

        timeline.entries.forEach((entry, at) => {
          if (entry.kind === 'step') {
            const [only] = steps.slice(entry.first, entry.first + 1);
            expect([...entry.relations, ...entry.missing].sort()).toEqual(
              [...(only?.relations ?? [])].sort(),
            );
            return;
          }
          // An aggregated step: a shown collapsed container, no broken step, every end inside it.
          expect(shown.has(entry.container)).toBe(true);
          for (const id of entry.steps) {
            const each = steps.find((candidate) => candidate.id === id)!;
            expect(
              each.relations.every((relation) =>
                project.model.relations.some((r) => r.id === relation),
              ),
            ).toBe(true);
            for (const relation of each.relations) {
              for (const end of endsOf(project, relation)) {
                expect(containment.enclosing(end).has(entry.container)).toBe(true);
              }
            }
          }
          // Runs are as long as they can be: the entries beside it play elsewhere.
          const before = timeline.entries[at - 1];
          const after = timeline.entries[at + 1];
          if (before?.kind === 'aggregated') expect(before.container).not.toBe(entry.container);
          if (after?.kind === 'aggregated') expect(after.container).not.toBe(entry.container);
        });
      }),
    );
  });

  it('plays every step on its own when nothing is collapsed', () => {
    fc.assert(
      fc.property(scenarioSteps, (steps) => {
        const project = withSteps(scenarioProject(), steps);
        const timeline = scenarioTimeline(project, theScenario(project));
        expect(timeline.entries.every((entry) => entry.kind === 'step')).toBe(true);
        expect(timeline.entries).toHaveLength(steps.length);
      }),
    );
  });
});
