/**
 * Crosswalks and matching by external identifier (ADR 0056): importers fill in the schemes a file
 * lacks from the crosswalks the packages in use ship, and importing again updates the elements that
 * share an identifier, as ADR 0042's key does. Plans come from files made elsewhere, so whatever is
 * not an identifier is left out and reported.
 */
import fc from 'fast-check';
import type { Crosswalk, Element, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import { completedIds, crosswalksOf, matchByExternalIds } from './crosswalks';
import { planToCommand, type ImportMapping, type ImportPlan } from './plan';

const UBERON_TO_FMA: Crosswalk = {
  from: 'uberon',
  to: 'fma',
  source: 'A test table',
  entries: { 'UBERON:0002135': 'FMA:7235', 'UBERON:0000948': 'FMA:7088' },
};
const FMA_TO_TA2: Crosswalk = {
  from: 'fma',
  to: 'ta2',
  entries: { 'FMA:7235': 'TA2:4012' },
};

/** The test project, with a package that ships crosswalks and elements that have identifiers. */
function anatomyProject(elements: Element[] = []): ProjectSnapshot {
  const state = testProject();
  const anatomy: PackageFile = {
    id: 'anatomy',
    name: 'Anatomy',
    components: [],
    relationTypes: [],
    crosswalks: [UBERON_TO_FMA, FMA_TO_TA2],
  };
  return {
    ...state,
    project: { ...state.project, packages: [...state.project.packages, 'anatomy'] },
    packages: [...state.packages, anatomy],
    model: { ...state.model, elements: [...state.model.elements, ...elements] },
  };
}

function plan(elements: ImportPlan['elements']): ImportPlan {
  return {
    format: 'test',
    source: 'heart.csv',
    elements,
    relations: [],
    containment: [],
    views: [],
    kinds: { elements: [], relations: [] },
    unmatched: [],
  };
}

const MAPPING: ImportMapping = { elements: { organ: 'test.box' }, relations: {} };

describe('crosswalksOf', () => {
  it('gathers the crosswalks of every package in use', () => {
    const tables = crosswalksOf(anatomyProject());
    expect(tables.map((table) => [table.from, table.to, table.package])).toEqual([
      ['uberon', 'fma', 'anatomy'],
      ['fma', 'ta2', 'anatomy'],
    ]);
    expect(tables[0]?.entries.get('UBERON:0002135')).toBe('FMA:7235');
  });

  it('never reaches a prototype through a key of a table', () => {
    const state = anatomyProject();
    const hostile = JSON.parse('{"__proto__": "FMA:1", "constructor": "FMA:2"}') as Record<
      string,
      string
    >;
    const [first] = state.packages.filter((file) => file.id === 'anatomy');
    if (first === undefined) throw new Error('no package');
    first.crosswalks = [{ from: 'uberon', to: 'fma', entries: hostile }];
    const [table] = crosswalksOf(state);
    expect(table?.entries.get('__proto__')).toBe('FMA:1');
    expect(table?.entries.get('toString')).toBeUndefined();
  });
});

describe('completedIds', () => {
  const tables = crosswalksOf(anatomyProject());

  it('fills in the schemes a file lacks, through as many crosswalks as it takes', () => {
    expect(completedIds({ uberon: 'UBERON:0002135' }, tables)).toEqual({
      fma: 'FMA:7235',
      ta2: 'TA2:4012',
      uberon: 'UBERON:0002135',
    });
  });

  it('reads a crosswalk backwards where only one identifier maps to the one given', () => {
    expect(completedIds({ fma: 'FMA:7088' }, tables)).toEqual({
      fma: 'FMA:7088',
      uberon: 'UBERON:0000948',
    });
  });

  it('never changes an identifier the file gives', () => {
    expect(completedIds({ uberon: 'UBERON:0002135', fma: 'FMA:9999' }, tables)).toEqual({
      fma: 'FMA:9999',
      uberon: 'UBERON:0002135',
    });
  });

  it('adds nothing where no crosswalk knows the identifier', () => {
    expect(completedIds({ uberon: 'UBERON:9999999' }, tables)).toEqual({
      uberon: 'UBERON:9999999',
    });
    expect(completedIds(undefined, tables)).toBeUndefined();
  });
});

describe('matchByExternalIds', () => {
  const valve: Element = {
    id: 'valve',
    component: 'test.box',
    name: 'Mitral valve',
    ids: { fma: 'FMA:7235' },
  };

  it('updates the element that shares an identifier, through a crosswalk too', () => {
    const state = anatomyProject([valve]);
    const matched = matchByExternalIds(
      state,
      plan([
        { key: 'v', name: 'Bicuspid valve', kind: 'organ', ids: { uberon: 'UBERON:0002135' } },
      ]),
    );
    expect(matched.elements[0]).toEqual({
      key: 'v',
      name: 'Bicuspid valve',
      kind: 'organ',
      ids: { fma: 'FMA:7235', ta2: 'TA2:4012', uberon: 'UBERON:0002135' },
      existing: 'valve',
    });
    const planned = planToCommand(state, matched, MAPPING, sequentialIds());
    if (!planned.ok) throw new Error(planned.problems.join(' '));
    const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const updated = outcome.state.model.elements.find((each) => each.id === 'valve');
    expect(updated?.name).toBe('Bicuspid valve');
    expect(updated?.ids).toEqual({ fma: 'FMA:7235', ta2: 'TA2:4012', uberon: 'UBERON:0002135' });
    // Importing again creates nothing new.
    expect(outcome.state.model.elements).toHaveLength(state.model.elements.length);
  });

  it('creates an element with its identifiers when none shares one', () => {
    const state = anatomyProject();
    const matched = matchByExternalIds(
      state,
      plan([{ key: 'h', name: 'Heart', kind: 'organ', ids: { uberon: 'UBERON:0000948' } }]),
    );
    const planned = planToCommand(state, matched, MAPPING, sequentialIds());
    if (!planned.ok) throw new Error(planned.problems.join(' '));
    const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const heart = outcome.state.model.elements.find((each) => each.name === 'Heart');
    expect(heart?.ids).toEqual({ fma: 'FMA:7088', uberon: 'UBERON:0000948' });
  });

  it('matches nothing, and says so, when several elements share the identifier', () => {
    const state = anatomyProject([valve, { ...valve, id: 'valve-2', name: 'Another valve' }]);
    const matched = matchByExternalIds(
      state,
      plan([{ key: 'v', name: 'Valve', kind: 'organ', ids: { fma: 'FMA:7235' } }]),
    );
    expect(matched.elements[0]?.existing).toBeUndefined();
    expect(matched.unmatched).toEqual([
      {
        text: 'Valve',
        why: 'Its fma identifier "FMA:7235" is the identifier of 2 elements, "Mitral valve" and "Another valve", so it is imported as a new element.',
      },
    ]);
  });

  it('updates one element once, the first row of the file that shares its identifier', () => {
    const state = anatomyProject([valve]);
    const matched = matchByExternalIds(
      state,
      plan([
        { key: 'a', name: 'A', kind: 'organ', ids: { fma: 'FMA:7235' } },
        { key: 'b', name: 'B', kind: 'organ', ids: { fma: 'FMA:7235' } },
      ]),
    );
    expect(matched.elements.map((each) => each.existing)).toEqual(['valve', undefined]);
    expect(matched.unmatched.map((each) => each.text)).toEqual(['B']);
  });

  it('keeps an element the plan already matched by another key', () => {
    const state = anatomyProject([valve]);
    const matched = matchByExternalIds(
      state,
      plan([{ key: 'a', name: 'A', kind: 'organ', ids: { fma: 'FMA:7235' }, existing: 'api' }]),
    );
    expect(matched.elements[0]?.existing).toBe('api');
  });

  it('leaves out and reports what is not an identifier, for any plan', () => {
    const anyIds = fc.dictionary(
      fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('__proto__', 'uberon', 'fma', 'Bad')),
      fc.oneof(
        fc.string({ maxLength: 250 }),
        fc.integer(),
        fc.constant(null),
      ) as fc.Arbitrary<string>,
      { maxKeys: 6 },
    );
    const state = anatomyProject([valve]);
    fc.assert(
      fc.property(fc.array(anyIds, { minLength: 1, maxLength: 5 }), (each) => {
        const matched = matchByExternalIds(
          state,
          plan(each.map((ids, at) => ({ key: `k${at}`, name: `E${at}`, kind: 'organ', ids }))),
        );
        const planned = planToCommand(state, matched, MAPPING, sequentialIds());
        if (!planned.ok) throw new Error(planned.problems.join(' '));
        // Whatever it kept, the core takes: the batch never fails on an identifier.
        const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
        expect(outcome.ok).toBe(true);
      }),
      { numRuns: 60 },
    );
  });
});
