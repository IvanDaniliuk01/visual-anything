import fc from 'fast-check';
import type { SavedViewState, TourStep } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkViewState } from '../view-state';
import { testProject } from '../test/fixtures';
import { playedSteps } from '../scenarios/blocks';
import { choicesFrom, tree, written } from '../scenarios/test/trees';
import type { ProjectSnapshot } from '../snapshot';
import {
  checkSavedViewState,
  idsNamedByTours,
  isBrokenTourStep,
  playableStep,
  playedRangeOf,
  savedViewStateOf,
  tourStepProblems,
  tourTextLength,
  viewStateOfStep,
} from './steps';

/** The test project with a second view, which its scenario does not play over. */
function project(): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    views: [
      ...state.views,
      {
        id: 'other',
        name: 'Other',
        perspective: { name: 'Ownership' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
      },
    ],
  };
}

function step(parts: Partial<TourStep> = {}): TourStep {
  return { id: 's', viewState: { view: 'overview' }, caption: { title: 'Here' }, ...parts };
}

/**
 * The project with a scenario that decides (ADR 0078): after the call, the API reads the DB when it
 * misses its cache, or answers at once when it hits it.
 */
function deciding(): ProjectSnapshot {
  const state = project();
  return {
    ...state,
    scenarios: [
      ...state.scenarios,
      {
        id: 'cached',
        name: 'Cached',
        view: 'overview',
        steps: [
          { id: 'ask', description: 'The client calls the API.', relations: ['client-calls-api'] },
          { id: 'miss', description: 'The API reads the DB.', relations: ['api-reads-db'] },
          { id: 'hit', description: 'The API answers at once.', relations: ['client-calls-api'] },
          { id: 'thanks', description: 'The client says thanks.', relations: ['client-calls-api'] },
        ],
        blocks: [
          {
            id: 'in-cache',
            kind: 'decision',
            question: 'Is it in the cache?',
            alternatives: [
              { id: 'missed', label: 'No', steps: ['miss'] },
              { id: 'found', label: 'Yes', steps: ['hit'] },
            ],
          },
        ],
      },
    ],
  };
}

const FULL: SavedViewState = {
  view: 'overview',
  camera: { x: 10, y: -20, zoom: 0.5 },
  select: ['api', 'note'],
  filters: {
    components: ['test.database'],
    conditions: [
      { of: 'elements', attribute: 'owner', test: 'is', value: 'core' },
      { of: 'relations', attribute: 'tls', test: 'set' },
    ],
  },
  focus: { degrees: 2, direction: 'outgoing', isolate: true, from: ['api'] },
  scenario: 'request',
  step: 'read',
};

describe('the view state a step keeps', () => {
  it('reads as the view state an address holds, with the lists and defaults filled in', () => {
    expect(viewStateOfStep(FULL)).toEqual({
      view: 'overview',
      camera: { x: 10, y: -20, zoom: 0.5 },
      select: ['api', 'note'],
      filters: {
        components: ['test.database'],
        relationTypes: [],
        conditions: [
          { of: 'elements', attribute: 'owner', test: 'is', value: 'core' },
          { of: 'relations', attribute: 'tls', test: 'set', value: '' },
        ],
      },
      focus: { degrees: 2, direction: 'outgoing', isolate: true, from: ['api'] },
      scenario: 'request',
      step: 'read',
    });
    expect(viewStateOfStep({ view: 'v', focus: { degrees: 'all', direction: 'both' } })).toEqual({
      view: 'v',
      focus: { degrees: 'all', direction: 'both', isolate: false },
    });
  });

  it('is written back as the step keeps it, whatever view state it came from', () => {
    expect(savedViewStateOf(viewStateOfStep(FULL))).toEqual(FULL);
    fc.assert(
      fc.property(
        fc.record({
          select: fc.uniqueArray(fc.constantFrom('a', 'b', 'c'), { maxLength: 3 }),
          components: fc.uniqueArray(fc.constantFrom('x', 'y'), { maxLength: 2 }),
          isolate: fc.boolean(),
          from: fc.uniqueArray(fc.constantFrom('a', 'b'), { maxLength: 2 }),
        }),
        ({ select, components, isolate, from }) => {
          const saved = savedViewStateOf({
            view: 'v',
            ...(select.length > 0 ? { select } : {}),
            filters: { components, relationTypes: [], conditions: [] },
            focus: { degrees: 1, direction: 'both', isolate, ...(from.length ? { from } : {}) },
          });
          // Nothing empty is written, and reading it back and writing it again changes nothing.
          expect(JSON.stringify(saved)).not.toMatch(/\[\]|"isolate":false|"value":""/);
          expect(savedViewStateOf(viewStateOfStep(saved))).toEqual(saved);
          expect(checkViewState(viewStateOfStep(saved)).ok).toBe(true);
        },
      ),
    );
  });

  it('keeps the time range of the filters, alone or beside the rest', () => {
    const range = {
      of: 'elements' as const,
      attribute: 'started',
      until: 'ended',
      kind: 'date' as const,
      from: 1767225600000,
      to: 1772323200000,
    };
    const saved: SavedViewState = { view: 'overview', filters: { range } };
    expect(viewStateOfStep(saved)).toEqual({
      view: 'overview',
      filters: { components: [], relationTypes: [], conditions: [], range },
    });
    expect(savedViewStateOf(viewStateOfStep(saved))).toEqual(saved);
    expect(checkSavedViewState(saved)).toEqual({ ok: true, state: saved });
    const beside: SavedViewState = { ...FULL, filters: { ...FULL.filters, range } };
    expect(savedViewStateOf(viewStateOfStep(beside))).toEqual(beside);
    expect(checkSavedViewState(beside)).toEqual({ ok: true, state: beside });
    // What a step wrote before view states held a time range reads as it did.
    expect(viewStateOfStep(FULL).filters).not.toHaveProperty('range');
    expect(
      checkSavedViewState({ view: 'v', filters: { range: { ...range, kind: 'week' } } }),
    ).toEqual({
      ok: false,
      message: 'A time range reads its values as one of: number, date, time.',
    });
  });

  it('keeps the alternatives chosen at its scenario’s decisions, as an address does', () => {
    const saved: SavedViewState = {
      view: 'overview',
      scenario: 'cached',
      step: 'hit',
      choices: { 'in-cache': 'found' },
    };
    expect(viewStateOfStep(saved)).toEqual(saved);
    expect(savedViewStateOf(viewStateOfStep(saved))).toEqual(saved);
    expect(checkSavedViewState(saved)).toEqual({ ok: true, state: saved });
    expect(checkSavedViewState({ ...saved, choices: {} })).toEqual({
      ok: false,
      message: 'A view state that chooses nothing leaves choices out.',
    });
  });

  it('is checked as an address is, in the form the step keeps it', () => {
    expect(checkSavedViewState(FULL)).toEqual({ ok: true, state: FULL });
    expect(checkSavedViewState({ view: 'v', filters: { components: ['x'] } })).toEqual({
      ok: true,
      state: { view: 'v', filters: { components: ['x'] } },
    });
  });

  it.each([
    ['nothing at all', undefined, 'A view state is an object.'],
    ['a list', [], 'A view state is an object.'],
    ['no view', { camera: { x: 0, y: 0, zoom: 1 } }, 'A view state names its view: view=<id>.'],
    [
      'a step without its scenario',
      { view: 'v', step: 's' },
      'A step needs its scenario: scenario=<id>.',
    ],
    ['a key of its own', { view: 'v', html: '<b>' }, 'A view state has no "html".'],
    [
      'a zoom past its limits',
      { view: 'v', camera: { x: 0, y: 0, zoom: 5000 } },
      'The camera zooms from 0.001 to 1000.',
    ],
    [
      'an empty selection',
      { view: 'v', select: [] },
      'A view state that selects nothing leaves select out.',
    ],
    [
      'too large a selection',
      { view: 'v', select: Array.from({ length: 501 }, (_, at) => `e${at}`) },
      'A view state names at most 500 ids in select.',
    ],
    [
      'a condition that needs a value',
      { view: 'v', filters: { conditions: [{ of: 'elements', attribute: 'a', test: 'is' }] } },
      'A condition that tests with "is" needs a value.',
    ],
    [
      'filters that hide nothing',
      { view: 'v', filters: {} },
      'Filters that hide nothing are left out.',
    ],
    [
      'focus of six degrees',
      { view: 'v', focus: { degrees: 6, direction: 'both' } },
      'Focus reaches 1 to 5 degrees, or all.',
    ],
    ['an id that is not one', { view: '../etc' }, '"../etc" is not an id.'],
  ])('refuses %s', (_, value, message) => {
    expect(checkSavedViewState(value)).toEqual({ ok: false, message });
  });
});

describe('what a step names that the project no longer holds', () => {
  it('is nothing for a step that names only what is there', () => {
    expect(
      tourStepProblems(
        project(),
        step({ viewState: FULL, marks: ['api', 'api-reads-db'], play: { scenario: 'request' } }),
      ),
    ).toEqual([]);
  });

  it('is everything it names that is gone, each said once', () => {
    const problems = tourStepProblems(
      project(),
      step({
        viewState: {
          view: 'overview',
          select: ['gone-element'],
          filters: { components: ['test.gone'], relationTypes: ['test.unknown'] },
          focus: { degrees: 1, direction: 'both', from: ['gone-from'] },
          scenario: 'request',
          step: 'gone-step',
        },
        marks: ['gone-mark', 'world'],
        play: { scenario: 'gone-scenario' },
      }),
    );
    expect(problems.map((each) => [each.code, each.subject])).toEqual([
      ['unknown-element', 'gone-element'],
      ['unknown-element', 'gone-mark'],
      ['unknown-element', 'world'],
      ['unknown-element', 'gone-from'],
      ['unknown-component', 'test.gone'],
      ['unknown-relation-type', 'test.unknown'],
      ['unknown-scenario', 'gone-step'],
      ['unknown-scenario', 'gone-scenario'],
    ]);
    expect(problems.map((each) => each.message)).toContain(
      'A step marks elements and relations, and "gone-mark" is neither.',
    );
  });

  it('counts what a reveal marks as it counts the step’s marks, saying which reveal names it', () => {
    const problems = tourStepProblems(
      project(),
      step({
        marks: ['api'],
        reveal: [{ marks: ['db'] }, { marks: ['gone-reveal', 'api-reads-db'], text: 'And then.' }],
      }),
    );
    expect(problems).toEqual([
      {
        code: 'unknown-element',
        message: 'Reveal 2 of the step marks elements and relations, and "gone-reveal" is neither.',
        subject: 'gone-reveal',
        reveal: 1,
      },
    ]);
  });

  it('says when its view is gone, and when its scenario plays over another view', () => {
    expect(
      tourStepProblems(project(), step({ viewState: { view: 'gone' } })).map(
        (each) => each.message,
      ),
    ).toEqual(['The project has no view "gone".']);
    expect(
      tourStepProblems(
        project(),
        step({
          viewState: { view: 'other' },
          play: { scenario: 'request', from: 'read', to: 'call' },
        }),
      ).map((each) => each.message),
    ).toEqual(['The scenario "A request" plays over the view "Overview", not "Other".']);
  });

  it('says when it would play a scenario backwards', () => {
    expect(
      tourStepProblems(
        project(),
        step({ play: { scenario: 'request', from: 'read', to: 'call' } }),
      ),
    ).toEqual([
      {
        code: 'invalid-command',
        message: 'The step "read" comes after "call" in the scenario "A request".',
        subject: 'request',
      },
    ]);
  });

  it('says which choices name a decision or an alternative the scenario no longer has', () => {
    expect(
      tourStepProblems(
        deciding(),
        step({
          viewState: { view: 'overview', scenario: 'cached', choices: { gone: 'x' } },
          play: { scenario: 'cached', choices: { 'in-cache': 'maybe' } },
        }),
      ),
    ).toEqual([
      {
        code: 'unknown-scenario',
        message: 'The scenario "Cached" has no decision "gone".',
        subject: 'gone',
      },
      {
        code: 'unknown-scenario',
        message: 'The decision "Is it in the cache?" has no alternative "maybe".',
        subject: 'maybe',
      },
    ]);
  });

  it('says when it plays from or to a step its choices do not play', () => {
    const state = deciding();
    // Without choices, every decision plays its default, its first alternative here.
    expect(
      tourStepProblems(state, step({ play: { scenario: 'cached', from: 'hit', to: 'thanks' } })),
    ).toEqual([
      {
        code: 'invalid-command',
        message:
          'With the alternatives it chooses, the scenario "Cached" does not play the step "hit".',
        subject: 'hit',
      },
    ]);
    expect(
      tourStepProblems(
        state,
        step({
          play: { scenario: 'cached', from: 'hit', to: 'thanks', choices: { 'in-cache': 'found' } },
        }),
      ),
    ).toEqual([]);
    // A view state's step is checked against its choices only when it has some, as an address's.
    expect(
      tourStepProblems(
        state,
        step({ viewState: { view: 'overview', scenario: 'cached', step: 'hit' } }),
      ),
    ).toEqual([]);
    expect(
      tourStepProblems(
        state,
        step({
          viewState: {
            view: 'overview',
            scenario: 'cached',
            step: 'hit',
            choices: { 'in-cache': 'missed' },
          },
        }),
      ).map((each) => [each.code, each.subject]),
    ).toEqual([['invalid-command', 'hit']]);
  });

  it('flags a step whose element was deleted, and only such a step', () => {
    const state = project();
    const kept = step({ marks: ['api'] });
    expect(isBrokenTourStep(state, kept)).toBe(false);
    const without = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.filter((element) => element.id !== 'api'),
      },
    };
    expect(isBrokenTourStep(without, kept)).toBe(true);
  });
});

describe('how a step plays', () => {
  it('plays everything it names when everything is there', () => {
    expect(
      playableStep(
        project(),
        step({
          viewState: FULL,
          marks: ['api'],
          play: { scenario: 'request', from: 'call', to: 'read' },
        }),
      ),
    ).toEqual({
      viewState: viewStateOfStep(FULL),
      marks: ['api'],
      play: { scenario: 'request', from: 0, to: 1 },
    });
  });

  it('plays without what the project no longer holds', () => {
    const played = playableStep(
      project(),
      step({
        viewState: {
          view: 'overview',
          select: ['gone', 'api'],
          filters: { components: ['test.gone'] },
          focus: { degrees: 1, direction: 'both', from: ['gone'] },
          scenario: 'gone',
        },
        marks: ['gone', 'db'],
        play: { scenario: 'request', from: 'gone', to: 'gone' },
      }),
    );
    expect(played).toEqual({
      viewState: { view: 'overview', select: ['api'] },
      marks: ['db'],
      play: { scenario: 'request', from: 0, to: 1 },
    });
  });

  it('plays its time range, also when the components its filters name are gone', () => {
    const range = {
      of: 'elements' as const,
      attribute: 'load',
      kind: 'number' as const,
      from: 1,
      to: 5,
    };
    const played = playableStep(
      project(),
      step({ viewState: { view: 'overview', filters: { components: ['test.gone'], range } } }),
    );
    expect(played?.viewState).toEqual({
      view: 'overview',
      filters: { components: [], relationTypes: [], conditions: [], range },
    });
  });

  it('plays a scenario only over the view it plays over', () => {
    expect(
      playableStep(
        project(),
        step({ viewState: { view: 'other' }, play: { scenario: 'request' } }),
      ),
    ).toEqual({ viewState: { view: 'other' }, marks: [] });
  });

  it('plays its reveals one by one, each without what is gone, kept even when nothing is left', () => {
    const played = playableStep(
      project(),
      step({
        marks: ['api'],
        reveal: [{ marks: ['db', 'gone'], text: 'The data.' }, { marks: ['gone'] }],
        dimRest: true,
        advance: 500,
      }),
    );
    expect(played).toEqual({
      viewState: { view: 'overview' },
      marks: ['api'],
      reveals: [{ marks: ['db'], text: 'The data.' }, { marks: [] }],
      dimRest: true,
      advance: 900,
    });
  });

  it('plays the alternatives it chooses, and its view state keeps its own', () => {
    const played = playableStep(
      deciding(),
      step({
        viewState: {
          view: 'overview',
          scenario: 'cached',
          step: 'hit',
          choices: { 'in-cache': 'found' },
        },
        play: { scenario: 'cached', from: 'hit', choices: { 'in-cache': 'found' } },
      }),
    );
    expect(played).toEqual({
      viewState: {
        view: 'overview',
        scenario: 'cached',
        step: 'hit',
        choices: { 'in-cache': 'found' },
      },
      marks: [],
      play: { scenario: 'cached', from: 2, to: 3, choices: { 'in-cache': 'found' } },
    });
  });

  it('plays without the choices the scenario no longer has, from the first step that plays', () => {
    const state = deciding();
    const [cached] = state.scenarios.slice(-1);
    // The decision now starts the scenario, so its first step plays only in one alternative.
    const first = {
      ...cached!,
      steps: cached!.steps.slice(1),
    };
    const played = playableStep(
      { ...state, scenarios: [first] },
      step({
        viewState: { view: 'overview', scenario: 'cached', choices: { gone: 'x' } },
        play: { scenario: 'cached', choices: { gone: 'x', 'in-cache': 'found' } },
      }),
    );
    expect(played).toEqual({
      viewState: { view: 'overview', scenario: 'cached' },
      marks: [],
      play: { scenario: 'cached', from: 1, to: 2, choices: { 'in-cache': 'found' } },
    });
  });

  it('plays a range its choices do not reach with the choices that reach it, as going there does', () => {
    expect(
      playableStep(deciding(), step({ play: { scenario: 'cached', from: 'hit' } }))?.play,
    ).toEqual({ scenario: 'cached', from: 2, to: 3, choices: { 'in-cache': 'found' } });
  });

  it('plays from and to steps that its choices play, whatever the scenario decides', () => {
    fc.assert(
      fc.property(
        tree,
        fc.array(fc.nat({ max: 3 }), { maxLength: 40 }),
        fc.nat(),
        fc.nat(),
        (segments, picks, first, last) => {
          const { scenario } = written(segments);
          const ids = scenario.steps.map((each) => each.id);
          const from = ids[first % ids.length];
          const to = ids[last % ids.length];
          const range = playedRangeOf(scenario, {
            scenario: scenario.id,
            from,
            to,
            choices: choicesFrom(scenario, picks),
          });
          const played = playedSteps(scenario, range.choices);
          // The step it starts on always plays with the choices it plays: every step can be reached.
          const start = ids.indexOf(from as string);
          expect(played).toContain(start);
          expect([range.from, range.to]).toContain(start);
          // A tour step that names those steps and choices is no problem, when they play together.
          const stored = { ...scenario, view: 'overview' };
          const problems = tourStepProblems(
            { ...project(), scenarios: [stored] },
            step({
              play: {
                scenario: scenario.id,
                from,
                to,
                ...(range.choices ? { choices: range.choices } : {}),
              },
            }),
          );
          const together = played.includes(ids.indexOf(to as string));
          const backwards = start > ids.indexOf(to as string);
          if (together && !backwards) expect(problems).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('has nothing to show when its view is gone', () => {
    expect(playableStep(project(), step({ viewState: { view: 'gone' } }))).toBeUndefined();
  });
});

describe('tourTextLength', () => {
  it('counts the texts of a step’s reveals with its caption and notes', () => {
    const tour = {
      id: 'walk',
      name: 'Walk',
      steps: [
        step({ caption: { title: 'Here' }, reveal: [{ marks: ['a'], text: 'Twelve chars' }] }),
      ],
    };
    expect(tourTextLength(tour)).toBe('Walk'.length + 'Here'.length + 'Twelve chars'.length);
  });
});

describe('idsNamedByTours', () => {
  it('names the tours and what their steps select, mark and focus from', () => {
    const ids = idsNamedByTours([
      {
        id: 'walk',
        name: 'Walk',
        steps: [
          step({
            viewState: {
              view: 'overview',
              select: ['a'],
              focus: { degrees: 1, direction: 'both', from: ['b'] },
            },
            marks: ['c'],
            reveal: [{ marks: ['d'] }],
          }),
        ],
      },
    ]);
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd', 'walk']);
  });
});
