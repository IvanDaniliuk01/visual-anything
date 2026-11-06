import type { Id, TourFile, TourStep } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { LONG_TOUR_RANGE, checkTour, type TourRect } from './check';
import { MAX_GLIDE_SHAPES } from './glide';

const SCREEN = { width: 1000, height: 600 };

function step(id: string, parts: Partial<TourStep> = {}): TourStep {
  return { id, viewState: { view: 'overview' }, caption: { title: id }, ...parts };
}

function tour(...steps: TourStep[]): TourFile {
  return { id: 'walk', name: 'Walk', steps };
}

/** Every element and relation of the test project drawn in a row, 100 units apart. */
const ROW = (view: Id, id: Id): TourRect | undefined =>
  view === 'overview' ? { x: id.length * 100, y: 0, width: 80, height: 40 } : undefined;

const kinds = (checks: ReturnType<typeof checkTour>) =>
  checks.map((check) => check.warnings.map((each) => each.kind));

describe('checkTour', () => {
  it('says nothing of a tour that plays as written, its steps gliding', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('one', { viewState: { view: 'overview', camera: { x: 0, y: 0, zoom: 1 } } }),
        step('two', { viewState: { view: 'overview', camera: { x: 800, y: 0, zoom: 1 } } }),
      ),
      { screen: SCREEN },
    );
    expect(checks.map((check) => [check.n, check.camera])).toEqual([
      [1, 'cut'],
      [2, 'glide'],
    ]);
    expect(kinds(checks)).toEqual([[], []]);
  });

  it('says where a step cuts within its view, and fits when it keeps no camera', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('one', { viewState: { view: 'overview', camera: { x: 0, y: 0, zoom: 1 } } }),
        step('far', { viewState: { view: 'overview', camera: { x: 9000, y: 0, zoom: 1 } } }),
        step('fit', { caption: { title: 'Anywhere' } }),
      ),
      { screen: SCREEN },
    );
    expect(checks.map((check) => check.camera)).toEqual(['cut', 'cut', 'fit']);
    expect(kinds(checks)).toEqual([[], ['cuts'], []]);
  });

  it('says a step stays when its camera is where the step before left it, and claims no cut after a step that fits', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const checks = checkTour(
      testProject(),
      tour(
        step('one', { viewState: { view: 'overview', camera } }),
        // The same camera, another selection: only the marks change.
        step('two', { viewState: { view: 'overview', camera, select: ['api'] } }),
        step('fit', { viewState: { view: 'overview', select: ['db'] } }),
        // After a step that keeps no camera, the move starts wherever the canvas framed it.
        step('after', { viewState: { view: 'overview', camera: { x: 100, y: 0, zoom: 1 } } }),
      ),
      { screen: SCREEN },
    );
    expect(checks.map((check) => check.camera)).toEqual(['cut', 'stay', 'fit', 'follows']);
    expect(kinds(checks)).toEqual([[], [], [], []]);
  });

  it('says when two steps in a row show the same view state, and could be one with a reveal', () => {
    const checks = checkTour(testProject(), tour(step('one'), step('again', { marks: ['db'] })));
    expect(checks[1]?.camera).toBe('stay');
    expect(kinds(checks)[1]).toEqual(['could-be-reveal']);
  });

  it('names what a step or its reveals mark outside its camera, or hide by its filters', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('look', {
          viewState: {
            view: 'overview',
            camera: { x: 0, y: 0, zoom: 1 },
            filters: { components: ['test.database'] },
          },
          marks: ['api'],
          reveal: [{ marks: ['db', 'api-reads-db'] }],
        }),
      ),
      { screen: SCREEN, boundsOf: ROW },
    );
    const [look] = checks;
    expect(look?.warnings.map((each) => [each.kind, each.subjects])).toEqual([
      ['marks-outside', ['api-reads-db']],
      ['marks-hidden', ['db', 'api-reads-db']],
    ]);
    expect(look?.warnings[0]?.message).toContain('Step 1 marks what its camera does not show');
  });

  it('says when a caption is longer than its advance lets one read', () => {
    const words = Array.from({ length: 20 }, () => 'word').join(' ');
    const checks = checkTour(
      testProject(),
      tour(step('quick', { caption: { title: 'Quick', text: words }, advance: 1000 })),
    );
    expect(kinds(checks)).toEqual([['caption-too-long']]);
    expect(checks[0]?.warnings[0]?.message).toBe(
      'Step 1 moves on after 1 s, but its text takes 6.3 s to read: it waits until then.',
    );
  });

  it('says when a step plays a long range of its scenario', () => {
    const state = testProject();
    const scenario = state.scenarios[0];
    if (!scenario) throw new Error('The test project has no scenario.');
    const long = {
      ...scenario,
      steps: Array.from({ length: LONG_TOUR_RANGE + 1 }, (_, at) => ({
        ...(scenario.steps[0] as (typeof scenario.steps)[number]),
        id: `s${at}`,
      })),
    };
    const checks = checkTour(
      { ...state, scenarios: [long] },
      tour(step('play', { play: { scenario: long.id } })),
    );
    expect(kinds(checks)).toEqual([['long-range']]);
  });

  it('counts in a range only the steps its choices play', () => {
    const state = testProject();
    const scenario = state.scenarios[0];
    if (!scenario) throw new Error('The test project has no scenario.');
    const steps = Array.from({ length: 2 * LONG_TOUR_RANGE }, (_, at) => ({
      ...(scenario.steps[0] as (typeof scenario.steps)[number]),
      id: `s${at}`,
    }));
    const ids = steps.map((each) => each.id);
    // Two alternatives of ten steps each: whichever plays, the range plays ten.
    const deciding = {
      ...scenario,
      steps,
      blocks: [
        {
          id: 'which',
          kind: 'decision' as const,
          question: 'Which?',
          alternatives: [
            { id: 'first', label: 'First', steps: ids.slice(0, LONG_TOUR_RANGE) },
            { id: 'second', label: 'Second', steps: ids.slice(LONG_TOUR_RANGE) },
          ],
        },
      ],
    };
    const checks = checkTour(
      { ...state, scenarios: [deciding] },
      tour(
        step('one', { play: { scenario: deciding.id } }),
        step('two', {
          viewState: { view: 'overview', select: ['api'] },
          play: { scenario: deciding.id, choices: { which: 'second' } },
        }),
      ),
    );
    expect(kinds(checks)).toEqual([[], []]);
  });

  it('flags a step that names what is gone, before the rest', () => {
    const checks = checkTour(testProject(), tour(step('gone', { marks: ['gone'] })));
    expect(checks[0]?.warnings.map((each) => [each.kind, each.subjects])).toEqual([
      ['broken', ['gone']],
    ]);
  });

  it('flags a step whose view beside it is gone, and reads two steps beside different views as two (ADR 0102)', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('one', { beside: { view: 'overview' } }),
        step('two', { beside: { view: 'gone' } }),
        step('three', { beside: { view: 'gone' } }),
      ),
    );
    expect(checks[1]?.warnings.map((each) => [each.kind, each.subjects])).toEqual([
      ['broken', ['gone']],
    ]);
    expect(checks[1]?.warnings[0]?.message).toBe(
      'Step 2 names what the project no longer holds, and plays without it: Beside it: The project has no view "gone".',
    );
    // The same view state beside a different view is another scene; the same beside, a reveal.
    expect(kinds(checks)[1]).not.toContain('could-be-reveal');
    expect(kinds(checks)[2]).toEqual(['broken', 'could-be-reveal']);
  });

  it('reads a step without a view beside it as showing the nearest one before it, as playback does', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('one', { beside: { view: 'overview' } }),
        step('two'),
        step('three', { beside: { view: 'overview', camera: { x: 1, y: 1, zoom: 1 } } }),
      ),
    );
    // Step two keeps what step one shows beside it: one scene; step three shows another beside it.
    expect(kinds(checks)).toEqual([[], ['could-be-reveal'], []]);
    // With nothing before it, a step shows the panes as the tour found them.
    expect(
      kinds(checkTour(testProject(), tour(step('a'), step('b', { beside: { view: 'overview' } })))),
    ).toEqual([[], []]);
  });
});

describe('checkTour on what ADR 0084 adds', () => {
  /** The test project with a second view that draws the same elements elsewhere. */
  function twoViews() {
    const state = testProject();
    const [overview] = state.views;
    if (!overview) throw new Error('No view.');
    return { ...state, views: [overview, { ...overview, id: 'detail', name: 'Detail' }] };
  }
  const drawn = (count: number) =>
    Array.from({ length: count }, (_, at) => ({
      element: `e${at}`,
      path: `e${at}`,
      rect: { x: at * 10, y: 0, width: 8, height: 8 },
    }));

  it('says which steps into another view glide, and which cut and why', () => {
    const into = (id: string, view: string, parts: Partial<TourStep> = {}) =>
      step(id, { viewState: { view }, ...parts });
    const many = drawn(401);
    const checks = checkTour(
      twoViews(),
      tour(
        into('one', 'overview'),
        into('two', 'detail'),
        into('three', 'overview', { transition: 'cut' }),
        into('four', 'overview', { caption: { title: 'Same view' } }),
        into('five', 'detail', { viewState: { view: 'detail', select: ['api'] } }),
      ),
      { shapesOf: (view) => (view === 'overview' ? drawn(5) : drawn(2)) },
    );
    expect(checks.map((check) => check.shapes)).toEqual([
      undefined,
      { kind: 'cut', reason: 'too-few', shared: 2 },
      { kind: 'cut', reason: 'opted-out', shared: 0 },
      undefined,
      { kind: 'cut', reason: 'too-few', shared: 2 },
    ]);
    const gliding = checkTour(twoViews(), tour(into('one', 'overview'), into('two', 'detail')), {
      shapesOf: () => drawn(5),
    });
    expect(gliding[1]?.shapes).toEqual({ kind: 'glide', shared: 5 });
    const crowded = checkTour(twoViews(), tour(into('one', 'overview'), into('two', 'detail')), {
      shapesOf: () => many,
    });
    expect(crowded[1]?.shapes).toEqual({ kind: 'cut', reason: 'too-many', shared: 401 });
    expect(kinds(crowded)).toEqual([[], ['glide-too-many']]);
  });

  it('counts only the shapes a step’s camera shows, as the stage glides them', () => {
    // 401 shapes 10 apart along a line 4,010 wide; a camera on its start, on a 1,000-wide screen at
    // zoom 1, shows about 100 of them.
    const camera = { x: 500, y: 0, zoom: 1 };
    const checks = checkTour(
      twoViews(),
      tour(
        step('one', { viewState: { view: 'overview', camera } }),
        step('two', { viewState: { view: 'detail', camera } }),
      ),
      { shapesOf: () => drawn(401), screen: { width: 1000, height: 600 } },
    );
    expect(checks[1]?.shapes?.kind).toBe('glide');
    expect(checks[1]?.shapes?.shared).toBeLessThanOrEqual(MAX_GLIDE_SHAPES);
    expect(kinds(checks)[1]).not.toContain('glide-too-many');
  });

  it('says a step that asks to cut cuts where its camera would glide, without warning of it', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('one', { viewState: { view: 'overview', camera: { x: 0, y: 0, zoom: 1 } } }),
        step('two', {
          viewState: { view: 'overview', camera: { x: 800, y: 0, zoom: 1 } },
          transition: 'cut',
        }),
      ),
      { screen: SCREEN },
    );
    expect(checks.map((check) => check.camera)).toEqual(['cut', 'cut']);
    expect(kinds(checks)).toEqual([[], []]);
  });

  it('says when a caption points at what the step does not mark', () => {
    const checks = checkTour(
      testProject(),
      tour(
        step('marked', { caption: { title: 'A', pointTo: 'api' }, marks: ['api'] }),
        step('revealed', {
          caption: { title: 'B', pointTo: 'db' },
          viewState: { view: 'overview', select: ['db'] },
          reveal: [{ marks: ['db'] }],
        }),
        step('unmarked', {
          caption: { title: 'C', pointTo: 'db' },
          viewState: { view: 'overview', select: ['client'] },
          marks: ['api'],
        }),
      ),
    );
    expect(kinds(checks)).toEqual([[], [], ['point-to-not-mark']]);
  });

  it('says when a pulse is not a chain, apart from what is broken', () => {
    const checks = checkTour(
      testProject(),
      tour(step('pulse', { pulse: { relations: ['api-reads-db', 'contract-governs-call'] } })),
    );
    expect(checks[0]?.warnings.map((each) => [each.kind, each.subjects])).toEqual([
      ['pulse-not-chain', ['contract-governs-call']],
    ]);
  });
});
