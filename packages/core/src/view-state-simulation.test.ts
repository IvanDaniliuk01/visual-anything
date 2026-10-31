/** A view state's simulation (ADR 0085): its address clause, its checks and its problems. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';
import { QUEUE } from './test/simulation';
import { savedViewStateOf, viewStateOfStep } from './tours/steps';
import {
  checkViewState,
  readViewState,
  viewStateProblems,
  writeViewState,
  type ViewState,
} from './view-state';

function read(fragment: string) {
  return readViewState(fragment);
}

describe('a view state’s simulation', () => {
  it('reads and writes the element, the seed, the tick and the parameters chosen, by name', () => {
    const fragment =
      'view=overview&simulation=api;seed:7;tick:42;p:arrivals,40;p:bursts,true;p:policy,%2522priority%2522';
    const state = read(fragment);
    expect(state).toEqual({
      ok: true,
      state: {
        view: 'overview',
        simulation: {
          element: 'api',
          seed: 7,
          tick: 42,
          parameters: { arrivals: 40, bursts: true, policy: 'priority' },
        },
      },
    });
    if (state.ok && state.state) expect(writeViewState(state.state)).toBe(fragment);
  });

  it('leaves out what says nothing: the seed 1, the tick 0 and no parameters', () => {
    const checked = checkViewState({
      view: 'overview',
      simulation: { element: 'api', seed: 1, tick: 0, parameters: {} },
    });
    expect(checked).toEqual({
      ok: true,
      state: { view: 'overview', simulation: { element: 'api' } },
    });
    if (checked.ok) expect(writeViewState(checked.state)).toBe('view=overview&simulation=api');
  });

  it('writes parameters in the order of their names, whatever order they were given in', () => {
    const checked = checkViewState({
      view: 'overview',
      simulation: { element: 'api', parameters: { workers: 2, arrivals: 3 } },
    });
    expect(checked.ok && Object.keys(checked.state.simulation?.parameters ?? {})).toEqual([
      'arrivals',
      'workers',
    ]);
  });

  it('keeps a parameter named __proto__ as a name like any other, and a negative zero as 0', () => {
    const parameters = JSON.parse('{"__proto__": 3, "rate": -0}') as Record<string, unknown>;
    const checked = checkViewState({
      view: 'overview',
      simulation: { element: 'api', parameters },
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const chosen = checked.state.simulation?.parameters ?? {};
    expect(Object.getPrototypeOf(chosen)).toBe(Object.prototype);
    expect(Object.keys(chosen)).toEqual(['__proto__', 'rate']);
    expect(Object.is(chosen.rate, 0)).toBe(true);
    expect(readViewState(writeViewState(checked.state))).toEqual({
      ok: true,
      state: checked.state,
    });
  });

  it('reads back what it writes, for any names and values', () => {
    const value = fc.oneof(
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.string({ minLength: 1, maxLength: 20 }),
    );
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), value, { maxKeys: 5 }),
        fc.nat({ max: 0xffff_ffff }),
        fc.nat({ max: 10_000 }),
        (parameters, seed, tick) => {
          const checked = checkViewState({
            view: 'overview',
            simulation: { element: 'api', parameters, seed, tick },
          });
          if (!checked.ok) return;
          const again = readViewState(writeViewState(checked.state));
          expect(again).toEqual({ ok: true, state: checked.state });
        },
      ),
    );
  });

  it('refuses what is malformed, saying what', () => {
    const refusals: [string, string][] = [
      ['view=o&simulation=api;seed:x', "The simulation's seed is a whole number: seed:<n>."],
      ['view=o&simulation=api;tick:1;tick:2', 'The simulation holds "tick" twice.'],
      ['view=o&simulation=api;p:rate', 'A parameter is written p:<name>,<value>.'],
      [
        'view=o&simulation=api;p:rate,%257B',
        'The value of the parameter "rate" is not written as JSON.',
      ],
      ['view=o&simulation=api;p:a,1;p:a,2', 'The simulation chooses the parameter "a" twice.'],
      [
        'view=o&simulation=api;speed:3',
        'A simulation holds its element, then seed, tick and p clauses, not "speed".',
      ],
      [
        'view=o&simulation=api;tick:10001',
        "A simulation's tick is a whole number from 0 to 10000.",
      ],
      [
        'view=o&simulation=api;seed:4294967296',
        "A simulation's seed is a whole number from 0 to 4294967295.",
      ],
      [
        'view=o&simulation=api;p:a,null',
        'The parameter "a" is a number, true or false, or one of its choices.',
      ],
    ];
    for (const [fragment, message] of refusals)
      expect(read(fragment)).toEqual({ ok: false, message });
    expect(checkViewState({ view: 'o', simulation: { element: 'api', speed: 3 } })).toEqual({
      ok: false,
      message: 'A simulation has no "speed".',
    });
  });

  it('is kept by a tour step as it is shown', () => {
    const state: ViewState = {
      view: 'overview',
      simulation: { element: 'api', seed: 3, parameters: { arrivals: 5 } },
    };
    const saved = savedViewStateOf(state);
    expect(saved.simulation).toEqual(state.simulation);
    expect(saved.simulation).not.toBe(state.simulation);
    expect(viewStateOfStep(saved).simulation).toEqual(state.simulation);
  });
});

describe('a view state’s simulation against a project', () => {
  function project(): ProjectSnapshot {
    const state = testProject();
    state.packages = state.packages.map((pkg) =>
      pkg.id === 'test'
        ? {
            ...pkg,
            components: pkg.components.map((each) =>
              each.id === 'test.service' ? { ...each, simulation: QUEUE } : each,
            ),
          }
        : pkg,
    );
    return state;
  }

  it('names nothing missing when the element simulates and its parameters fit', () => {
    expect(
      viewStateProblems(project(), {
        view: 'overview',
        simulation: { element: 'api', parameters: { arrivals: 40 } },
      }),
    ).toEqual([]);
  });

  it('names an element that is not there, one that simulates nothing, and parameters refused', () => {
    expect(
      viewStateProblems(project(), { view: 'overview', simulation: { element: 'ghost' } }),
    ).toEqual(['The simulation shows "ghost", which is not an element of the project.']);
    expect(
      viewStateProblems(project(), { view: 'overview', simulation: { element: 'db' } }),
    ).toEqual(['The element "DB" simulates nothing.']);
    expect(
      viewStateProblems(project(), {
        view: 'overview',
        simulation: { element: 'api', parameters: { arrivals: 400 } },
      }),
    ).toEqual(['The parameter "arrivals" is above its highest, 100.']);
  });
});
