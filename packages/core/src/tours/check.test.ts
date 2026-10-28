import type { Id, TourFile, TourStep } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { LONG_TOUR_RANGE, checkTour, type TourRect } from './check';

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
});
