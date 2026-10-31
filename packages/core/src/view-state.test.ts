import fc from 'fast-check';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from './builtin';
import {
  FILTER_TESTS,
  FOCUS_DIRECTIONS,
  MAX_FILTER_CONDITIONS,
  MAX_FILTER_TEXT,
  MAX_FOCUS_DEGREES,
} from './protocol';
import { RANGE_KINDS } from './time-range';
import type { ProjectSnapshot } from './snapshot';
import {
  MAX_VIEW_STATE_CHOICES,
  MAX_VIEW_STATE_IDS,
  checkViewState,
  readViewState,
  viewStateProblems,
  withViewState,
  writeViewState,
  type ViewSpace,
  type ViewState,
  type ViewTimeRange,
} from './view-state';

/**
 * The address as another page writes it back after reading it with `URLSearchParams`, as the app's
 * launch and theme code do: every value decoded, then encoded as a form would be.
 */
function formEncoded(fragment: string): string {
  const decode = (text: string) => decodeURIComponent(text.replaceAll('+', ' '));
  const encode = (text: string) =>
    encodeURIComponent(text)
      .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
      .replaceAll('%20', '+');
  return fragment
    .split('&')
    .map((part) => {
      const at = part.indexOf('=');
      const key = at < 0 ? part : part.slice(0, at);
      const value = at < 0 ? '' : part.slice(at + 1);
      return `${encode(decode(key))}=${encode(decode(value))}`;
    })
    .join('&');
}

/** What a fragment reads as, or the message it is refused with. */
function read(fragment: string): ViewState | undefined | string {
  const result = readViewState(fragment);
  return result.ok ? result.state : result.message;
}

const FULL: ViewState = {
  view: 'system-overview',
  camera: { x: 120.5, y: -40, zoom: 1.25 },
  select: ['booking-api', 'calls-db'],
  filters: {
    components: ['systems.database'],
    relationTypes: ['systems.is-part-of'],
    conditions: [
      { of: 'elements', attribute: 'owner', test: 'is', value: 'Scheduling team' },
      { of: 'relations', attribute: 'protocol', test: 'set', value: '' },
    ],
  },
  focus: { degrees: 2, direction: 'outgoing', isolate: true, from: ['booking-api'] },
  scenario: 'patient-books-appointment',
  step: 'hold-slot',
  choices: { 'free-slot': 'week-full', 'in-stock': 'yes' },
};

describe('writeViewState', () => {
  it('writes each part in the order the address names them', () => {
    expect(writeViewState(FULL)).toBe(
      [
        'view=system-overview',
        'camera=120.5,-40,1.25',
        'select=booking-api,calls-db',
        'filters=components:systems.database;relation-types:systems.is-part-of;where:elements,owner,is,Scheduling%2520team;where:relations,protocol,set',
        'focus=2,outgoing,isolate;from:booking-api',
        'scenario=patient-books-appointment',
        'step=hold-slot',
        'choices=free-slot:week-full,in-stock:yes',
      ].join('&'),
    );
  });

  it('writes the choices by their decisions’ ids, so that the same choices write the same address', () => {
    const state: ViewState = {
      view: 'v',
      scenario: 's',
      choices: { zeta: 'z1', alpha: 'a2', 'Mid.x': 'm' },
    };
    expect(writeViewState(state)).toBe('view=v&scenario=s&choices=Mid.x:m,alpha:a2,zeta:z1');
    expect(read(writeViewState(state))).toEqual(state);
  });

  it('writes only the view when that is all the state holds', () => {
    expect(writeViewState({ view: 'overview' })).toBe('view=overview');
  });

  it('writes focus that starts from the selection without the ids, and every degree as all', () => {
    expect(
      writeViewState({ view: 'v', focus: { degrees: 'all', direction: 'both', isolate: false } }),
    ).toBe('view=v&focus=all,both');
  });

  it('writes a text that holds the separators so that it reads back as it was', () => {
    const state: ViewState = {
      view: 'v',
      filters: {
        components: [],
        relationTypes: [],
        conditions: [
          { of: 'elements', attribute: 'a,b;c:d', test: 'contains', value: '50% & more = #1 +' },
        ],
      },
    };
    const written = writeViewState(state);
    expect(written.split('&filters=')[1]).not.toMatch(/[ &=#+]/);
    expect(read(written)).toEqual(state);
  });

  it('never writes the session token, a launch code or a theme', () => {
    expect(writeViewState(FULL)).not.toMatch(/token|launch|theme/);
  });
});

describe('readViewState', () => {
  it('reads what writeViewState wrote', () => {
    expect(read(writeViewState(FULL))).toEqual(FULL);
    expect(read(`#${writeViewState(FULL)}`)).toEqual(FULL);
  });

  it('reads nothing from an empty fragment, or one that holds only the launch and the theme', () => {
    expect(read('')).toBeUndefined();
    expect(read('#')).toBeUndefined();
    expect(read('#launch=abc123&theme=dark')).toBeUndefined();
  });

  it('leaves out the launch code, the theme and a token, which are not view state', () => {
    expect(read('#launch=abc&theme=light&view=overview&select=a')).toEqual({
      view: 'overview',
      select: ['a'],
    });
    expect(read('token=secret&view=overview')).toEqual({ view: 'overview' });
  });

  it('reads the parts in any order', () => {
    expect(read('step=s1&scenario=sc&view=v')).toEqual({ view: 'v', scenario: 'sc', step: 's1' });
  });

  it('reads an address whose separators another page encoded, as URLSearchParams does', () => {
    const encoded = formEncoded(writeViewState(FULL));
    expect(encoded).toContain('%2C');
    expect(read(encoded)).toEqual(FULL);
  });

  it('reads a camera written by hand with a decimal point', () => {
    expect(read('view=v&camera=10.0,0,1.0')).toEqual({
      view: 'v',
      camera: { x: 10, y: 0, zoom: 1 },
    });
  });

  it('reads focus without isolate as dimming, and every condition in its order', () => {
    expect(read('view=v&focus=1,incoming')).toEqual({
      view: 'v',
      focus: { degrees: 1, direction: 'incoming', isolate: false },
    });
    expect(read('view=v&filters=where:elements,a,below,3;where:elements,b,unset')).toEqual({
      view: 'v',
      filters: {
        components: [],
        relationTypes: [],
        conditions: [
          { of: 'elements', attribute: 'a', test: 'below', value: '3' },
          { of: 'elements', attribute: 'b', test: 'unset', value: '' },
        ],
      },
    });
  });

  it.each<[string, string]>([
    ['select=a', 'A view state names its view: view=<id>.'],
    ['view=v&view=w', 'The address holds "view" twice.'],
    ['view=v&zoom=2', 'The address holds "zoom", which a view state does not have.'],
    ['view=', 'The address holds "view" with no value.'],
    ['view=not an id', '"not an id" is not an id.'],
    ['view=v&select=a,,b', '"" is not an id.'],
    ['view=v&select=a,b,a', '"a" is named twice in select.'],
    ['view=v&camera=1,2', 'The camera is three numbers: x,y,zoom.'],
    ['view=v&camera=1,2,zero', 'The camera is three numbers: x,y,zoom.'],
    ['view=v&camera=1,2,0', 'The camera zooms from 0.001 to 1000.'],
    ['view=v&camera=1e12,2,1', 'The camera looks at most 1000000000 canvas units from the origin.'],
    ['view=v&step=s1', 'A step needs its scenario: scenario=<id>.'],
    [
      'view=v&filters=hide:a',
      'Filters hold components, relation-types, where and range, not "hide".',
    ],
    ['view=v&filters=components:a;components:b', 'The filters hold "components" twice.'],
    ['view=v&filters=components:', '"" is not an id.'],
    [
      'view=v&filters=where:nodes,a,is,b',
      'A condition is on elements or on relations, not "nodes".',
    ],
    [
      'view=v&filters=where:elements,a,like,b',
      'A condition tests with one of: is, is-not, contains, below, above, set, unset.',
    ],
    ['view=v&filters=where:elements,a,is', 'A condition that tests with "is" needs a value.'],
    ['view=v&filters=where:elements,a,set,b', 'A condition that tests with "set" takes no value.'],
    ['view=v&filters=where:elements,,set', 'A condition names an attribute.'],
    ['view=v&filters=where:elements,%25zz,set', 'The address is not well formed.'],
    ['view=v&focus=6,both', 'Focus reaches 1 to 5 degrees, or all.'],
    [
      'view=v&focus=2,sideways',
      'Focus goes one of these ways: both, outgoing, incoming; not "sideways".',
    ],
    ['view=v&focus=2,both,hide', 'Focus is degrees,direction, then isolate or nothing.'],
    ['view=v&focus=2,both;to:a', 'Focus starts from:<ids>, not "to".'],
    ['view=v&choices=d:a', 'Choices need their scenario: scenario=<id>.'],
    ['view=v&scenario=s&choices=d', 'Choices are <decision>:<alternative>, separated by commas.'],
    [
      'view=v&scenario=s&choices=d:a:b',
      'Choices are <decision>:<alternative>, separated by commas.',
    ],
    ['view=v&scenario=s&choices=d:', '"" is not an id.'],
    ['view=v&scenario=s&choices=:a', '"" is not an id.'],
    ['view=v&scenario=s&choices=d:a,d:b', 'The choices name the decision "d" twice.'],
    ['view=v%zz', 'The address is not well formed.'],
  ])('refuses %s', (fragment, message) => {
    expect(read(fragment)).toBe(message);
  });

  it('refuses a selection of more ids than it holds', () => {
    const ids = Array.from({ length: MAX_VIEW_STATE_IDS + 1 }, (_, n) => `e${n}`);
    expect(read(`view=v&select=${ids.join(',')}`)).toBe(
      `A view state names at most ${MAX_VIEW_STATE_IDS} ids in select.`,
    );
  });

  it('refuses more choices than a scenario has decisions', () => {
    const choices = Array.from({ length: MAX_VIEW_STATE_CHOICES + 1 }, (_, n) => `d${n}:a`);
    expect(read(`view=v&scenario=s&choices=${choices.join(',')}`)).toBe(
      `A view state chooses at most ${MAX_VIEW_STATE_CHOICES} alternatives.`,
    );
  });

  it('refuses more conditions than filters hold', () => {
    const where = Array.from({ length: MAX_FILTER_CONDITIONS + 1 }, () => 'where:elements,a,set');
    expect(read(`view=v&filters=${where.join(';')}`)).toBe(
      `Filters hold at most ${MAX_FILTER_CONDITIONS} conditions.`,
    );
  });

  it('refuses an address too long to hold a view state', () => {
    expect(read(`view=v&select=${'a'.repeat(600_000)}`)).toBe(
      'The address is too long to hold a view state.',
    );
  });

  it('never throws, whatever the address holds', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (text) => {
        const result = readViewState(text);
        expect(typeof result.ok).toBe('boolean');
      }),
    );
    // A hundred random addresses take well under a second, but a loaded machine stretches them.
  }, 30_000);
});

/** Ids, of every length the pattern allows. */
const anId: fc.Arbitrary<Id> = fc
  .tuple(
    fc.constantFrom(...'aZ09'.split('')),
    fc.string({ unit: fc.constantFrom(...'az09._-'.split('')), maxLength: 20 }),
  )
  .map(([first, rest]) => `${first}${rest}`);

const someIds = (max: number) => fc.uniqueArray(anId, { minLength: 1, maxLength: max });

/** A coordinate the camera may look at; a negative zero is written, and read back, as 0. */
const coordinate = fc
  .double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true })
  .map((value) => (value === 0 ? 0 : value));

const condition = fc.oneof(
  fc.record({
    of: fc.constantFrom('elements' as const, 'relations' as const),
    attribute: fc.string({ minLength: 1, maxLength: 30 }).filter((text) => text.trim() !== ''),
    test: fc.constantFrom(...FILTER_TESTS.filter((test) => test !== 'set' && test !== 'unset')),
    value: fc.string({ minLength: 1, maxLength: 30 }).filter((text) => text.trim() !== ''),
  }),
  fc.record({
    of: fc.constantFrom('elements' as const, 'relations' as const),
    attribute: fc.string({ minLength: 1, maxLength: 30 }).filter((text) => text.trim() !== ''),
    test: fc.constantFrom('set' as const, 'unset' as const),
    value: fc.constant(''),
  }),
);

/** A point of a time range: any finite number, a negative zero read back as 0. */
const rangePoint = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .map((value) => (value === 0 ? 0 : value));

const rangeAttribute = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((text) => text.trim() !== '');

const range: fc.Arbitrary<ViewTimeRange> = fc
  .record({
    of: fc.constantFrom('elements' as const, 'relations' as const),
    attribute: rangeAttribute,
    until: fc.option(rangeAttribute, { nil: undefined }),
    kind: fc.constantFrom(...RANGE_KINDS),
    from: rangePoint,
    to: rangePoint,
  })
  .map(({ until, ...rest }) => (until === undefined ? rest : { ...rest, until }));

const filters = fc
  .record({
    components: fc.uniqueArray(anId, { maxLength: 4 }),
    relationTypes: fc.uniqueArray(anId, { maxLength: 4 }),
    conditions: fc.array(condition, { maxLength: 4 }),
    range: fc.option(range, { nil: undefined }),
  })
  .map(({ range: kept, ...rest }) => (kept === undefined ? rest : { ...rest, range: kept }))
  .filter(
    (each) =>
      each.components.length + each.relationTypes.length + each.conditions.length > 0 ||
      'range' in each,
  );

const focus = fc
  .record({
    degrees: fc.oneof(fc.integer({ min: 1, max: MAX_FOCUS_DEGREES }), fc.constant('all' as const)),
    direction: fc.constantFrom(...FOCUS_DIRECTIONS),
    isolate: fc.boolean(),
    from: fc.option(someIds(5), { nil: undefined }),
  })
  .map(({ from, ...rest }) => (from === undefined ? rest : { ...rest, from }));

/** A number of the physical-space panel from `min` to `max`, a negative zero read back as 0. */
const spaceNumber = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true }).map((value) => (value === 0 ? 0 : value));

const space: fc.Arbitrary<ViewSpace> = fc.record(
  {
    root: anId,
    camera: fc.record({
      target: fc.record({
        x: spaceNumber(-1e8, 1e8),
        y: spaceNumber(-1e8, 1e8),
        z: spaceNumber(-1e8, 1e8),
      }),
      azimuth: spaceNumber(-180, 180),
      elevation: spaceNumber(-89, 89),
      distance: fc.double({ min: Number.MIN_VALUE, max: 1e8, noNaN: true }),
    }),
    cut: fc.record({
      axis: fc.constantFrom('x' as const, 'y' as const, 'z' as const),
      at: spaceNumber(-1e8, 1e8),
      keep: fc.constantFrom('below' as const, 'above' as const),
    }),
    explode: fc.double({ min: Number.MIN_VALUE, max: 2, noNaN: true }),
    relations: fc.constant(true),
    names: fc.constant(true),
  },
  { requiredKeys: [] },
);

const viewState: fc.Arbitrary<ViewState> = fc
  .record(
    {
      view: anId,
      camera: fc.record({
        x: coordinate,
        y: coordinate,
        zoom: fc.double({ min: 0.001, max: 1000, noNaN: true }),
      }),
      select: someIds(6),
      filters,
      focus,
      scenario: anId,
      step: anId,
      choices: someIds(4).chain((decisions) =>
        fc
          .array(anId, { minLength: decisions.length, maxLength: decisions.length })
          .map((alternatives) =>
            Object.fromEntries(
              decisions.map((decision, at): [Id, Id] => [decision, alternatives[at] as Id]),
            ),
          ),
      ),
      space,
    },
    { requiredKeys: ['view'] },
  )
  .map((state) => {
    if (state.scenario !== undefined) return state;
    const rest = { ...state };
    delete rest.step;
    delete rest.choices;
    return rest;
  });

describe('a view state and its address', () => {
  it('round-trip exactly', () => {
    fc.assert(
      fc.property(viewState, (state) => {
        const written = writeViewState(state);
        expect(read(written)).toEqual(state);
        expect(writeViewState(read(written) as ViewState)).toBe(written);
      }),
    );
  });

  it('round-trip after another page re-encodes the address', () => {
    fc.assert(
      fc.property(viewState, (state) => {
        expect(read(formEncoded(writeViewState(state)))).toEqual(state);
      }),
    );
  });

  it('are what checkViewState accepts, for every state the address can hold', () => {
    fc.assert(
      fc.property(viewState, (state) => {
        expect(checkViewState(JSON.parse(JSON.stringify(state)))).toEqual({ ok: true, state });
      }),
    );
  });
});

describe('checkViewState', () => {
  it('accepts a view state as JSON, as Claude and the command line give one', () => {
    expect(checkViewState(FULL)).toEqual({ ok: true, state: FULL });
  });

  it.each<[unknown, string]>([
    [null, 'A view state is an object.'],
    [{}, 'A view state names its view: view=<id>.'],
    [{ view: 'v', zoom: 2 }, 'A view state has no "zoom".'],
    [{ view: 'v', select: [] }, 'A view state that selects nothing leaves select out.'],
    [{ view: 'v', select: ['a', 'a'] }, '"a" is named twice in select.'],
    [{ view: 'v', camera: { x: 0, y: 0 } }, 'The camera is three numbers: x,y,zoom.'],
    [
      { view: 'v', camera: { x: 0, y: 0, zoom: Number.NaN } },
      'The camera is three numbers: x,y,zoom.',
    ],
    [
      { view: 'v', filters: { components: [], relationTypes: [], conditions: [] } },
      'Filters that hide nothing are left out.',
    ],
    [
      { view: 'v', focus: { degrees: 2, direction: 'both' } },
      'Whether focus isolates is true or false.',
    ],
    [
      { view: 'v', focus: { degrees: 2, direction: 'both', isolate: false, from: [] } },
      'Focus that starts from the selection leaves from out.',
    ],
    [{ view: 'v', step: 's' }, 'A step needs its scenario: scenario=<id>.'],
    [{ view: 'v', choices: { d: 'a' } }, 'Choices need their scenario: scenario=<id>.'],
    [
      { view: 'v', scenario: 's', choices: {} },
      'A view state that chooses nothing leaves choices out.',
    ],
    [
      { view: 'v', scenario: 's', choices: ['d', 'a'] },
      'Choices map the id of each decision to the id of an alternative.',
    ],
    [
      { view: 'v', scenario: 's', choices: { d: 5 } },
      'Choices map the id of each decision to the id of an alternative.',
    ],
    [{ view: 'v', scenario: 's', choices: { 'not an id': 'a' } }, '"not an id" is not an id.'],
  ])('refuses %j', (value, message) => {
    expect(checkViewState(value)).toEqual({ ok: false, message });
  });

  it('takes a negative zero as zero, which the address writes as 0', () => {
    expect(checkViewState({ view: 'v', camera: { x: -0, y: 0, zoom: 1 } })).toEqual({
      ok: true,
      state: { view: 'v', camera: { x: 0, y: 0, zoom: 1 } },
    });
  });
});

describe('withViewState', () => {
  it('adds the view state to an address, after the fragment it has', () => {
    const state: ViewState = { view: 'overview', select: ['a'] };
    expect(withViewState('http://127.0.0.1:4000/#launch=abc&theme=dark', state)).toBe(
      'http://127.0.0.1:4000/#launch=abc&theme=dark&view=overview&select=a',
    );
    expect(withViewState('http://127.0.0.1:4000/', state)).toBe(
      'http://127.0.0.1:4000/#view=overview&select=a',
    );
    expect(withViewState('http://127.0.0.1:4000/#', state)).toBe(
      'http://127.0.0.1:4000/#view=overview&select=a',
    );
  });
});

const project: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'Clinic', packages: ['systems'] },
  model: {
    world: { id: 'world', component: 'essence', name: 'Clinic' },
    elements: [
      { id: 'api', component: 'systems.service', name: 'API' },
      { id: 'db', component: 'systems.database', name: 'DB' },
    ],
    relations: [{ id: 'api-db', relationType: 'systems.writes-to', from: 'api', to: 'db' }],
  },
  packages: [SYSTEMS],
  views: [
    {
      id: 'overview',
      name: 'Overview',
      perspective: { name: 'Data flow' },
      nestingRelationTypes: [],
      positions: [],
      freeShapes: [{ id: 'note-1', kind: 'note', text: 'Hi', x: 0, y: 0, width: 10, height: 10 }],
    },
    {
      id: 'other',
      name: 'Other',
      perspective: { name: 'Ownership' },
      nestingRelationTypes: [],
      positions: [],
      freeShapes: [],
    },
  ],
  scenarios: [
    {
      id: 'save',
      name: 'Save',
      view: 'overview',
      steps: [{ id: 'write', description: 'Writes', relations: ['api-db'] }],
    },
    {
      id: 'retry',
      name: 'Retry',
      view: 'overview',
      steps: [
        { id: 'try', description: 'Tries', relations: ['api-db'] },
        { id: 'done', description: 'Done', relations: ['api-db'] },
        { id: 'again', description: 'Again', relations: ['api-db'] },
      ],
      blocks: [
        {
          id: 'saved',
          kind: 'decision',
          question: 'Did it save?',
          alternatives: [
            { id: 'saved-yes', label: 'Yes', steps: ['done'] },
            { id: 'saved-no', label: 'No', steps: ['again'] },
          ],
        },
      ],
    },
  ],
  tours: [],
  comments: [],
};

describe('viewStateProblems', () => {
  it('finds nothing wrong with a state that names what the project holds', () => {
    expect(
      viewStateProblems(project, {
        view: 'overview',
        select: ['api', 'api-db', 'note-1'],
        focus: { degrees: 1, direction: 'both', isolate: false, from: ['db'] },
        filters: { components: ['systems.service'], relationTypes: [], conditions: [] },
        scenario: 'save',
        step: 'write',
      }),
    ).toEqual([]);
  });

  it('says what the state names that the project does not hold', () => {
    expect(
      viewStateProblems(project, {
        view: 'other',
        select: ['api', 'ghost', 'note-1'],
        focus: { degrees: 1, direction: 'both', isolate: false, from: ['note-1'] },
        filters: {
          components: ['shop.cart'],
          relationTypes: ['systems.writes-to'],
          conditions: [],
        },
        scenario: 'save',
        step: 'read',
      }),
    ).toEqual([
      'Nothing in the view "Other" has the id "ghost".',
      'Nothing in the view "Other" has the id "note-1".',
      'Focus starts from elements and relations, and "note-1" is neither.',
      'No package in use defines the component "shop.cart".',
      'The scenario "Save" plays over the view "Overview", not "Other".',
      'The scenario "Save" has no step "read".',
    ]);
    expect(viewStateProblems(project, { view: 'gone' })).toEqual([
      'The project has no view "gone".',
    ]);
  });

  it('says when the physical-space panel’s root is not an element, and World is one', () => {
    expect(viewStateProblems(project, { view: 'overview', space: { root: 'ghost' } })).toEqual([
      'The physical-space panel shows "ghost", which is not an element of the project.',
    ]);
    const world = project.model.world.id;
    expect(viewStateProblems(project, { view: 'overview', space: { root: world } })).toEqual([]);
    expect(viewStateProblems(project, { view: 'overview', space: { root: 'api' } })).toEqual([]);
  });

  it('finds nothing wrong with choices of the scenario’s decisions that play its step', () => {
    expect(
      viewStateProblems(project, {
        view: 'overview',
        scenario: 'retry',
        step: 'again',
        choices: { saved: 'saved-no' },
      }),
    ).toEqual([]);
    // Without choices, going to a step chooses what reaches it, as it always did.
    expect(
      viewStateProblems(project, { view: 'overview', scenario: 'retry', step: 'again' }),
    ).toEqual([]);
  });

  it('says which choices name a decision or an alternative the scenario does not have', () => {
    expect(
      viewStateProblems(project, {
        view: 'overview',
        scenario: 'retry',
        choices: { saved: 'saved-maybe', gone: 'x' },
      }),
    ).toEqual([
      'The decision "Did it save?" has no alternative "saved-maybe".',
      'The scenario "Retry" has no decision "gone".',
    ]);
    expect(
      viewStateProblems(project, {
        view: 'overview',
        scenario: 'save',
        choices: { saved: 'saved-no' },
      }),
    ).toEqual(['The scenario "Save" has no decision "saved".']);
  });

  it('says when the step is one the alternatives chosen do not play', () => {
    expect(
      viewStateProblems(project, {
        view: 'overview',
        scenario: 'retry',
        step: 'again',
        choices: { saved: 'saved-yes' },
      }),
    ).toEqual([
      'With the alternatives it chooses, the scenario "Retry" does not play the step "again".',
    ]);
  });
});

describe('a time range in the view state', () => {
  const STARTED: ViewTimeRange = {
    of: 'elements',
    attribute: 'started',
    kind: 'date',
    from: 1767225600000,
    to: 1772323200000,
  };

  it('is written as the last clause of the filters, its attributes encoded as conditions’ are', () => {
    const state: ViewState = {
      view: 'v',
      filters: {
        components: ['systems.person'],
        relationTypes: [],
        conditions: [],
        range: { ...STARTED, attribute: 'started, at', until: 'ended' },
      },
    };
    expect(writeViewState(state)).toBe(
      'view=v&filters=components:systems.person;range:elements,started%252C%2520at,date,1767225600000,1772323200000,ended',
    );
    expect(read(writeViewState(state))).toEqual(state);
  });

  it('can be all the filters hold', () => {
    const state: ViewState = {
      view: 'v',
      filters: { components: [], relationTypes: [], conditions: [], range: STARTED },
    };
    expect(writeViewState(state)).toBe(
      'view=v&filters=range:elements,started,date,1767225600000,1772323200000',
    );
    expect(read(writeViewState(state))).toEqual(state);
    expect(checkViewState(JSON.parse(JSON.stringify(state)))).toEqual({ ok: true, state });
  });

  it('keeps its ends as given, whichever way round, and numbers of any size', () => {
    const state: ViewState = {
      view: 'v',
      filters: {
        components: [],
        relationTypes: [],
        conditions: [],
        range: { of: 'relations', attribute: 'count', kind: 'number', from: 6.02e23, to: -1.5e-7 },
      },
    };
    const written = writeViewState(state);
    expect(written).toBe('view=v&filters=range:relations,count,number,6.02e23,-1.5e-7');
    expect(read(written)).toEqual(state);
    expect(read(formEncoded(written))).toEqual(state);
  });

  it('leaves an address written before it as it was read', () => {
    // An address as the app wrote one before view states held a time range.
    expect(
      read('view=system-overview&filters=components:systems.database;where:elements,owner,set'),
    ).toEqual({
      view: 'system-overview',
      filters: {
        components: ['systems.database'],
        relationTypes: [],
        conditions: [{ of: 'elements', attribute: 'owner', test: 'set', value: '' }],
      },
    });
    expect(read(writeViewState(FULL))).toEqual(FULL);
    expect(read(writeViewState(FULL))).not.toHaveProperty('filters.range');
  });

  const FORM =
    'A time range is range:<of>,<attribute>,<kind>,<from>,<to>, then the attribute its periods end at, if it is on periods.';

  it.each<[string, string]>([
    ['view=v&filters=range:elements,started,date,1', FORM],
    ['view=v&filters=range:elements,a,date,1,2,b,c', FORM],
    [
      'view=v&filters=range:nodes,a,date,1,2',
      'A time range is on elements or on relations, not "nodes".',
    ],
    ['view=v&filters=range:elements,,date,1,2', 'A time range names the attributes it reads.'],
    ['view=v&filters=range:elements,a,date,1,2,', 'A time range names the attributes it reads.'],
    [
      'view=v&filters=range:elements,a,week,1,2',
      'A time range reads its values as one of: number, date, time.',
    ],
    ['view=v&filters=range:elements,a,date,one,2', 'A time range runs between two numbers.'],
    ['view=v&filters=range:elements,a,date,1,Infinity', 'A time range runs between two numbers.'],
    ['view=v&filters=range:elements,a,date,1,1e999', 'A time range runs between two numbers.'],
    [
      'view=v&filters=range:elements,a,date,1,2;range:elements,a,date,1,2',
      'The filters hold "range" twice.',
    ],
    ['view=v&filters=range:elements,%25zz,date,1,2', 'The address is not well formed.'],
  ])('refuses %s', (fragment, message) => {
    expect(read(fragment)).toBe(message);
  });

  it.each<[unknown, string]>([
    ['started', 'A time range is an object.'],
    [{ ...STARTED, width: 2 }, 'A time range has no "width".'],
    [{ ...STARTED, of: 'nodes' }, 'A time range is on elements or on relations, not "nodes".'],
    [{ ...STARTED, attribute: ' ' }, 'A time range names the attributes it reads.'],
    [{ ...STARTED, until: '' }, 'A time range names the attributes it reads.'],
    [{ ...STARTED, kind: 'week' }, 'A time range reads its values as one of: number, date, time.'],
    [{ ...STARTED, from: '1' }, 'A time range runs between two numbers.'],
    [{ ...STARTED, to: Number.NaN }, 'A time range runs between two numbers.'],
    [{ ...STARTED, to: Number.POSITIVE_INFINITY }, 'A time range runs between two numbers.'],
    [
      { ...STARTED, attribute: 'a'.repeat(MAX_FILTER_TEXT + 1) },
      `A time range's attributes hold at most ${MAX_FILTER_TEXT} characters.`,
    ],
    [
      { ...STARTED, attribute: '\uD800' },
      "A time range's attributes are text without broken characters.",
    ],
  ])('refuses %j as a time range', (given, message) => {
    expect(
      checkViewState({
        view: 'v',
        filters: { components: [], relationTypes: [], conditions: [], range: given },
      }),
    ).toEqual({ ok: false, message });
  });

  it('takes a negative zero as zero, which the address writes as 0', () => {
    expect(checkViewState({ view: 'v', filters: { range: { ...STARTED, from: -0 } } })).toEqual({
      ok: true,
      state: {
        view: 'v',
        filters: {
          components: [],
          relationTypes: [],
          conditions: [],
          range: { ...STARTED, from: 0 },
        },
      },
    });
  });

  it('never makes reading an address throw, whatever its time range holds', () => {
    const piece = fc.oneof(
      fc.string({ unit: 'binary', maxLength: 12 }),
      fc.constantFrom('elements', 'relations', 'date', 'time', 'number', '1', '-0', '1e309', ''),
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 8 }), (pieces) => {
        const result = readViewState(`view=v&filters=range:${pieces.join(',')}`);
        expect(typeof result.ok).toBe('boolean');
      }),
    );
  }, 30_000);
});

describe('the physical-space panel in a view state', () => {
  const OPEN: ViewState = {
    view: 'v',
    space: {
      root: 'arm',
      camera: { target: { x: 0, y: 1.5, z: -2 }, azimuth: 30, elevation: -20, distance: 4.5 },
      cut: { axis: 'y', at: 1, keep: 'below' },
      explode: 0.5,
      relations: true,
      names: true,
    },
  };

  it('is written as one clause, each part only when it says something', () => {
    expect(writeViewState(OPEN)).toBe(
      'view=v&space=root:arm;camera:0,1.5,-2,30,-20,4.5;cut:y,1,below;explode:0.5;relations;names',
    );
    expect(read(writeViewState(OPEN))).toEqual(OPEN);
    expect(writeViewState({ view: 'v', space: {} })).toBe('view=v&space=open');
    expect(read('view=v&space=open')).toEqual({ view: 'v', space: {} });
    expect(read('view=v')).toEqual({ view: 'v' });
  });

  it('leaves out what says nothing', () => {
    expect(
      checkViewState({ view: 'v', space: { explode: 0, relations: false, names: false } }),
    ).toEqual({ ok: true, state: { view: 'v', space: {} } });
  });

  it.each<[string, string]>([
    [
      'open;names',
      'The physical-space panel holds root, camera, cut, explode, relations and names, or is open alone, not "open".',
    ],
    ['names;names', 'The physical-space panel holds "names" twice.'],
    ['names:yes', '"names" in the physical-space panel takes no value.'],
    [
      'camera:1,2,3',
      'The camera of the physical-space panel is six numbers: x,y,z,azimuth,elevation,distance.',
    ],
    ['camera:0,0,0,0,90,1', 'The elevation of the physical-space panel is from -89 to 89 degrees.'],
    [
      'camera:0,0,0,181,0,1',
      'The azimuth of the physical-space panel is from -180 to 180 degrees.',
    ],
    [
      'camera:0,0,0,0,0,0',
      'The physical-space panel looks from more than 0 m and at most 100000000 m.',
    ],
    ['cut:w,1,below', 'A cut is cut:<axis>,<at>,<keep>: x, y or z, a number, and below or above.'],
    ['cut:x,1,inside', 'A cut is cut:<axis>,<at>,<keep>: x, y or z, a number, and below or above.'],
    ['explode:3', 'The physical-space panel explodes by a factor from 0 to 2.'],
    ['root:not an id', '"not an id" is not an id.'],
  ])('refuses space=%s', (clause, message) => {
    expect(read(`view=v&space=${encodeURIComponent(clause)}`)).toBe(message);
  });

  it.each<[unknown, string]>([
    [[], 'The physical-space panel is an object.'],
    [{ zoom: 2 }, 'The physical-space panel has no "zoom".'],
    [{ relations: 'yes' }, 'Whether the physical-space panel draws relations is true or false.'],
    [
      { camera: { target: { x: 2e8, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 1 } },
      'The physical-space panel looks at most 100000000 m from the origin of what it shows.',
    ],
    [
      { cut: { axis: 'x', at: 0 } },
      'A cut is cut:<axis>,<at>,<keep>: x, y or z, a number, and below or above.',
    ],
  ])('checkViewState refuses the space %j', (given, message) => {
    expect(checkViewState({ view: 'v', space: given })).toEqual({ ok: false, message });
  });
});
