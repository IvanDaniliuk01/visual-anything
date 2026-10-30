/**
 * Levels of detail (ADR 0055): sorting, the level a scale reaches, hysteresis without flicker, what
 * each level shows, expanding by zoom, and the key tiles group shapes by. Then the appearance trait:
 * how commands check and store it, and how it is inherited.
 */
import fc from 'fast-check';
import type { Appearance, LevelOfDetail, LevelPart } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { appearanceOf } from './definitions';
import { LEVEL_EXIT, expandedAt, levelAt, levelsKey, partsAt, sortedLevels } from './levels';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';
import { sequentialIds, testProject } from './test/fixtures';

const LEVELS: LevelOfDetail[] = [
  { from: 0.9, shows: ['name', 'detail'] },
  { from: 0.3, shows: ['name'] },
];

describe('sortedLevels', () => {
  it('sorts levels by the scale they start at, a later one at the same scale winning', () => {
    expect(sortedLevels(LEVELS).map((level) => level.from)).toEqual([0.3, 0.9]);
    const twice: LevelOfDetail[] = [
      { from: 0.5, shows: ['name'] },
      { from: 0.5, shows: ['image'] },
    ];
    expect(sortedLevels(twice)).toEqual([{ from: 0.5, shows: ['image'] }]);
  });
});

describe('levelAt', () => {
  it('finds the highest level a scale reaches, and none below the first', () => {
    expect(levelAt(LEVELS, 0.1)).toBe(-1);
    expect(levelAt(LEVELS, 0.3)).toBe(0);
    expect(levelAt(LEVELS, 0.89)).toBe(0);
    expect(levelAt(LEVELS, 0.9)).toBe(1);
    expect(levelAt(LEVELS, 5)).toBe(1);
  });

  it('enters a level at its scale and leaves it only 10% below it', () => {
    // Up: at the level's own scale.
    expect(levelAt(LEVELS, 0.89, 0)).toBe(0);
    expect(levelAt(LEVELS, 0.9, 0)).toBe(1);
    // Down: only below 90% of it.
    expect(levelAt(LEVELS, 0.85, 1)).toBe(1);
    expect(levelAt(LEVELS, 0.81, 1)).toBe(1);
    expect(levelAt(LEVELS, 0.8, 1)).toBe(0);
    expect(levelAt(LEVELS, 0.28, 0)).toBe(0);
    expect(levelAt(LEVELS, 0.26, 0)).toBe(-1);
    // A jump crosses several at once, either way.
    expect(levelAt(LEVELS, 2, -1)).toBe(1);
    expect(levelAt(LEVELS, 0.01, 1)).toBe(-1);
  });

  it('takes a level no longer there as no level shown', () => {
    expect(levelAt(LEVELS, 0.5, 7)).toBe(0);
  });

  const levelsArbitrary = fc
    .uniqueArray(fc.double({ min: 0, max: 8, noNaN: true }), { minLength: 1, maxLength: 6 })
    .map((froms) => froms.map((from): LevelOfDetail => ({ from, shows: ['name'] })));
  const scale = fc.double({ min: 0.02, max: 8, noNaN: true });

  it('keeps between the level the scale reaches and the one 10% above it, after any zoom', () => {
    fc.assert(
      fc.property(
        levelsArbitrary,
        fc.array(scale, { minLength: 1, maxLength: 40 }),
        (levels, zooms) => {
          let shown = levelAt(levels, zooms[0] as number);
          for (const each of zooms) {
            shown = levelAt(levels, each, shown);
            expect(shown).toBeGreaterThanOrEqual(levelAt(levels, each));
            expect(shown).toBeLessThanOrEqual(levelAt(levels, each / LEVEL_EXIT));
            // Staying at a scale changes nothing.
            expect(levelAt(levels, each, shown)).toBe(shown);
          }
        },
      ),
    );
  });

  it('never flickers while a zoom hovers within 10% below a level it entered', () => {
    fc.assert(
      fc.property(
        levelsArbitrary,
        fc.array(fc.double({ min: LEVEL_EXIT + 1e-9, max: 1, noNaN: true }), { maxLength: 30 }),
        (levels, wobble) => {
          const ordered = sortedLevels(levels);
          ordered.forEach((level, at) => {
            if (level.from === 0) return;
            let shown = levelAt(levels, level.from, at - 1);
            expect(shown).toBe(at);
            for (const factor of wobble) {
              shown = levelAt(levels, level.from * factor, shown);
              expect(shown).toBe(at);
            }
          });
        },
      ),
    );
  });
});

describe('partsAt', () => {
  it('shows a silhouette below the first level, and what each level lists from it', () => {
    expect([...partsAt(LEVELS, -1)]).toEqual(['silhouette']);
    expect([...partsAt(LEVELS, 0)]).toEqual(['name']);
    expect([...partsAt(LEVELS, 1)].sort()).toEqual(['detail', 'name']);
  });

  it('shows a silhouette only for a level that lists it, whatever else it lists', () => {
    const levels: LevelOfDetail[] = [{ from: 0, shows: ['silhouette', 'name'] }];
    expect([...partsAt(levels, 0)]).toEqual(['silhouette']);
  });
});

describe('expandedAt', () => {
  it('expands from its scale and collapses again only 10% below it', () => {
    expect(expandedAt(2, 1.99, false)).toBe(false);
    expect(expandedAt(2, 2, false)).toBe(true);
    expect(expandedAt(2, 1.85, true)).toBe(true);
    expect(expandedAt(2, 1.79, true)).toBe(false);
  });
});

describe('levelsKey', () => {
  it('names equal lists alike, in any order, and different lists apart', () => {
    const reordered: LevelOfDetail[] = [
      { from: 0.3, shows: ['name'] },
      { from: 0.9, shows: ['detail', 'name'] },
    ];
    expect(levelsKey(reordered)).toBe(levelsKey(LEVELS));
    expect(levelsKey(LEVELS)).toBe('0.3:n;0.9:nd');
    expect(levelsKey([{ from: 0.3, shows: ['image'] }])).not.toBe(levelsKey(LEVELS));
    expect(levelsKey([{ from: 0, shows: ['silhouette', 'image'] }])).toBe('0:s');
    expect(levelsKey(LEVELS)).not.toMatch(/\s|#/);
  });

  it('names the face’s variant a level shows, so that tiles of other variants differ (ADR 0083)', () => {
    expect(levelsKey([{ from: 0.25, shows: ['face'], face: 'far' }])).toBe('0.25:f=far');
    expect(levelsKey([{ from: 0.25, shows: ['face'] }])).toBe('0.25:f');
    expect(levelsKey([{ from: 0.25, shows: ['face'], face: 'near' }])).not.toBe(
      levelsKey([{ from: 0.25, shows: ['face'], face: 'far' }]),
    );
  });
});

// The appearance trait ------------------------------------------------------------------------------

function run(command: Command, state: ProjectSnapshot = testProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(
  command: Command,
  state?: ProjectSnapshot,
): { code: ProblemCode; message: string } {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems[0] as { code: ProblemCode; message: string };
}

const setBox = (appearance: Record<string, unknown>): Command => ({
  type: 'update-component',
  id: 'test.box',
  changes: { appearance: appearance },
});

describe('the levels of an appearance', () => {
  it('are stored in increasing order of their scales', () => {
    const outcome = ok(setBox({ levels: LEVELS, expandFrom: 1.5 }));
    const box = outcome.state.packages[0]?.components[0]?.appearance;
    expect(box?.levels?.map((level) => level.from)).toEqual([0.3, 0.9]);
    expect(box?.expandFrom).toBe(1.5);
  });

  it('may show the face, and name the variant of it they show (ADR 0083)', () => {
    const levels = [
      { from: 0.6, shows: ['face'] },
      { from: 0.25, shows: ['face', 'image'], face: 'far' },
    ];
    const box = ok(setBox({ levels })).state.packages[0]?.components[0]?.appearance;
    expect(box?.levels).toEqual([
      { from: 0.25, shows: ['face', 'image'], face: 'far' },
      { from: 0.6, shows: ['face'] },
    ]);
  });

  it('are inherited, each list whole, and an empty list follows the canvas again', () => {
    const state = ok(setBox({ levels: LEVELS, expandFrom: 1.5 })).state;
    const definitions = definitionsIn(state);
    const api: Appearance | undefined = undefined;
    const service = appearanceOf({ component: 'test.service', appearance: api }, definitions);
    expect(service.levels?.map((level) => level.from)).toEqual([0.3, 0.9]);
    expect(service.expandFrom).toBe(1.5);
    const own = appearanceOf(
      { component: 'test.service', appearance: { levels: [{ from: 2, shows: ['image'] }] } },
      definitions,
    );
    expect(own.levels).toEqual([{ from: 2, shows: ['image'] }]);
    const canvas = appearanceOf(
      { component: 'test.service', appearance: { levels: [] } },
      definitions,
    );
    expect(canvas.levels).toBeUndefined();
    expect(canvas.expandFrom).toBe(1.5);
    // Without levels anywhere, nothing says any.
    expect('levels' in appearanceOf({ component: 'test.box' }, definitionsIn(testProject()))).toBe(
      false,
    );
  });

  it('are refused when they are not as a level is written', () => {
    const cases: [unknown, string][] = [
      ['high', 'The levels of the component "Box" must be a list.'],
      [
        Array.from({ length: 9 }, (_, at) => ({ from: at / 2, shows: ['name'] })),
        'The component "Box" declares at most 8 levels.',
      ],
      [
        [{ from: -1, shows: ['name'] }],
        'A level of the component "Box" starts at a scale from 0 to 8.',
      ],
      [
        [{ from: 9, shows: ['name'] }],
        'A level of the component "Box" starts at a scale from 0 to 8.',
      ],
      [
        [{ from: 1 }],
        'The level at 1 of the component "Box" shows a silhouette, or some of the name, the detail, the contents, the image and the face.',
      ],
      [
        [{ from: 1, shows: [] }],
        'The level at 1 of the component "Box" shows a silhouette, or some of the name, the detail, the contents, the image and the face.',
      ],
      [
        [{ from: 1, shows: ['halo'] }],
        'The level at 1 of the component "Box" shows a silhouette, or some of the name, the detail, the contents, the image and the face.',
      ],
      [
        [{ from: 1, shows: ['name', 'name'] }],
        'The level at 1 of the component "Box" shows "name" twice.',
      ],
      [
        [{ from: 1, shows: ['silhouette', 'name'] }],
        'The level at 1 of the component "Box" shows a silhouette only, with nothing else.',
      ],
      [
        [
          { from: 1, shows: ['name'] },
          { from: 1, shows: ['detail'] },
        ],
        'Two levels of the component "Box" start at 1.',
      ],
      [[{ from: 1, shows: ['name'], at: 2 }], 'A level of the component "Box" has no "at".'],
      [
        [{ from: 1, shows: ['face'], face: 'Far away' }],
        'The level at 1 of the component "Box" names a face\'s variant by its id.',
      ],
      [
        [{ from: 1, shows: ['name'], face: 'far' }],
        'The level at 1 of the component "Box" names a face\'s variant but does not show the face.',
      ],
    ];
    for (const [levels, message] of cases) {
      const problem = refused(setBox({ levels }));
      expect(problem.code).toBe('invalid-appearance');
      expect(problem.message).toBe(message);
    }
  });

  it('expand from a scale above 0 and at most 8', () => {
    for (const expandFrom of [0, -1, 9, 'far', Number.NaN]) {
      const problem = refused(setBox({ expandFrom }));
      expect(problem.code).toBe('invalid-appearance');
      expect(problem.message).toBe(
        'The component "Box" expands from a scale above 0 and at most 8.',
      );
    }
  });

  it('are kept trait by trait: taking them out inherits them again', () => {
    const state = ok(setBox({ levels: LEVELS })).state;
    const outcome = ok(
      { type: 'update-component', id: 'test.box', changes: { appearance: { levels: null } } },
      state,
    );
    expect(outcome.state.packages[0]?.components[0]?.appearance?.levels).toBeUndefined();
  });

  it('take every part a level can show', () => {
    const parts: LevelPart[] = ['name', 'detail', 'contents', 'image'];
    const outcome = ok(
      setBox({
        levels: [
          { from: 0, shows: ['silhouette'] },
          { from: 1, shows: parts },
        ],
      }),
    );
    expect(outcome.state.packages[0]?.components[0]?.appearance?.levels?.[1]?.shows).toEqual(parts);
  });
});
