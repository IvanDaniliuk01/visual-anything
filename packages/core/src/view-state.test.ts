import fc from 'fast-check';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from './builtin';
import {
  FILTER_TESTS,
  FOCUS_DIRECTIONS,
  MAX_FILTER_CONDITIONS,
  MAX_FOCUS_DEGREES,
} from './protocol';
import type { ProjectSnapshot } from './snapshot';
import {
  MAX_VIEW_STATE_IDS,
  checkViewState,
  readViewState,
  viewStateProblems,
  withViewState,
  writeViewState,
  type ViewState,
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
      ].join('&'),
    );
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
    ['view=v&filters=hide:a', 'Filters hold components, relation-types and where, not "hide".'],
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
  });
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

const filters = fc
  .record({
    components: fc.uniqueArray(anId, { maxLength: 4 }),
    relationTypes: fc.uniqueArray(anId, { maxLength: 4 }),
    conditions: fc.array(condition, { maxLength: 4 }),
  })
  .filter(
    (each) => each.components.length + each.relationTypes.length + each.conditions.length > 0,
  );

const focus = fc
  .record({
    degrees: fc.oneof(fc.integer({ min: 1, max: MAX_FOCUS_DEGREES }), fc.constant('all' as const)),
    direction: fc.constantFrom(...FOCUS_DIRECTIONS),
    isolate: fc.boolean(),
    from: fc.option(someIds(5), { nil: undefined }),
  })
  .map(({ from, ...rest }) => (from === undefined ? rest : { ...rest, from }));

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
    },
    { requiredKeys: ['view'] },
  )
  .map((state) => {
    if (state.scenario !== undefined || state.step === undefined) return state;
    const rest = { ...state };
    delete rest.step;
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
  ],
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
});
