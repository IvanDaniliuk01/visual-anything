import fc from 'fast-check';
import type { Element, ExternalIds } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { Rejection } from './commands/draft';
import {
  MAX_EXTERNAL_ID_LENGTH,
  MAX_SCHEMES,
  changedExternalIds,
  checkedExternalIds,
  duplicateExternalIdWarnings,
  elementsWithExternalId,
  externalIdQuery,
  isExternalId,
  isScheme,
  matchesExternalId,
} from './external-ids';
import { executeCommand } from './commands';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';

/** The test project with more elements, directly in World. */
function project({ elements }: { elements: Element[] }): ProjectSnapshot {
  const state = testProject();
  return { ...state, model: { ...state.model, elements: [...state.model.elements, ...elements] } };
}

/** The problems a check refuses with, or an empty list when it passes. */
function refusalOf(check: () => unknown): string[] {
  try {
    check();
    return [];
  } catch (error) {
    if (error instanceof Rejection) return error.problems.map((each) => each.code);
    throw error;
  }
}

const scheme = fc.stringMatching(/^[a-z][a-z0-9_-]{0,31}$/);
const identifier = fc
  .string({ minLength: 1, maxLength: 60, unit: 'grapheme' })
  .filter((text) => !/[\x00-\x1f\x7f]/.test(text));
const ids = fc.dictionary(scheme, identifier, { minKeys: 1, maxKeys: 8 });

describe('schemes and identifiers', () => {
  it('takes short lowercase names as schemes', () => {
    for (const good of ['uberon', 'fma', 'ta2', 'hra-asct', 'mesh_d'])
      expect(isScheme(good)).toBe(true);
    for (const bad of [
      '',
      'Uberon',
      '2fma',
      'a'.repeat(33),
      'with space',
      '__proto__',
      'uberon:',
      7,
    ]) {
      expect(isScheme(bad)).toBe(false);
    }
  });

  it('takes text of 1 to 200 characters without control characters as identifiers', () => {
    expect(isExternalId('UBERON:0002135')).toBe(true);
    expect(isExternalId('http://purl.obolibrary.org/obo/UBERON_0002135')).toBe(true);
    // Characters, as the published schema counts them, not UTF-16 code units.
    expect(isExternalId('𝔘'.repeat(MAX_EXTERNAL_ID_LENGTH))).toBe(true);
    for (const bad of [
      '',
      'x'.repeat(MAX_EXTERNAL_ID_LENGTH + 1),
      'a\nb',
      'a\u0000',
      'tab\t',
      12,
      null,
    ]) {
      expect(isExternalId(bad)).toBe(false);
    }
  });
});

describe('checkedExternalIds', () => {
  it('keeps valid identifiers, in the order of their schemes', () => {
    expect(checkedExternalIds({ uberon: 'UBERON:0002135', fma: 'FMA:7235' }, '"Valve"')).toEqual({
      fma: 'FMA:7235',
      uberon: 'UBERON:0002135',
    });
    expect(Object.keys(checkedExternalIds({ uberon: 'U', fma: 'F' }, 'x') ?? {})).toEqual([
      'fma',
      'uberon',
    ]);
  });

  it('takes an empty map as none', () => {
    expect(checkedExternalIds({}, 'x')).toBeUndefined();
  });

  it.each([
    ['a list', ['UBERON:1']],
    ['text', 'UBERON:1'],
    ['null', null],
    ['a bad scheme', { UBERON: '1' }],
    ['a "__proto__" scheme', JSON.parse('{"__proto__": "x"}') as unknown],
    ['an identifier that is not text', { uberon: 1 }],
    ['an empty identifier', { uberon: '' }],
    ['an identifier with a line break', { uberon: 'a\nb' }],
    ['an identifier too long', { uberon: 'x'.repeat(201) }],
    [
      'too many schemes',
      Object.fromEntries(Array.from({ length: MAX_SCHEMES + 1 }, (_, at) => [`s${at}`, 'x'])),
    ],
  ])('refuses %s', (_, value) => {
    expect(refusalOf(() => checkedExternalIds(value, '"Valve"'))).toEqual(['invalid-external-id']);
  });

  it('gives back what it is given, for any valid identifiers', () => {
    fc.assert(
      fc.property(ids, (given) => {
        const checked = checkedExternalIds(given, 'x');
        expect(checked).toEqual(given);
        // Never an object that reaches a prototype.
        expect(Object.getPrototypeOf(checked)).toBe(Object.prototype);
      }),
    );
  });
});

describe('changedExternalIds', () => {
  const current: ExternalIds = { uberon: 'UBERON:0002135', fma: 'FMA:7235' };

  it('sets, replaces and removes identifiers by scheme', () => {
    expect(changedExternalIds(current, { fma: null, ta2: 'A12.1.02.002' }, 'x')).toEqual({
      ta2: 'A12.1.02.002',
      uberon: 'UBERON:0002135',
    });
    expect(changedExternalIds(current, { uberon: null, fma: null }, 'x')).toBeUndefined();
    expect(changedExternalIds(undefined, { fma: 'FMA:1' }, 'x')).toEqual({ fma: 'FMA:1' });
  });

  it('takes null as removing every identifier', () => {
    expect(changedExternalIds(current, null, 'x')).toBeUndefined();
  });

  it('refuses changes that are not identifiers or null', () => {
    expect(refusalOf(() => changedExternalIds(current, { fma: 3 }, 'x'))).toEqual([
      'invalid-external-id',
    ]);
    expect(refusalOf(() => changedExternalIds(current, ['fma'], 'x'))).toEqual([
      'invalid-external-id',
    ]);
  });

  it('removing what it set gives back what it had, for any identifiers', () => {
    fc.assert(
      fc.property(ids, ids, (before, added) => {
        const fresh = Object.fromEntries(
          Object.entries(added).filter(([key]) => !Object.hasOwn(before, key)),
        );
        const after = changedExternalIds(before, fresh, 'x');
        const removal = Object.fromEntries(Object.keys(fresh).map((key) => [key, null]));
        expect(changedExternalIds(after, removal, 'x')).toEqual(before);
      }),
    );
  });
});

describe('finding by external identifier', () => {
  const state = project({
    elements: [
      {
        id: 'mitral',
        component: 'essence',
        name: 'Mitral valve',
        ids: { uberon: 'UBERON:0002135', fma: 'FMA:7235' },
      },
      { id: 'heart', component: 'essence', name: 'Heart', ids: { uberon: 'UBERON:0000948' } },
      { id: 'copy', component: 'essence', name: 'Copy of the valve', ids: { fma: 'FMA:7235' } },
    ],
  });

  it('finds the elements with an identifier, in a scheme or in any', () => {
    expect(elementsWithExternalId(state, 'UBERON:0002135').map((each) => each.id)).toEqual([
      'mitral',
    ]);
    expect(elementsWithExternalId(state, 'FMA:7235').map((each) => each.id)).toEqual([
      'mitral',
      'copy',
    ]);
    expect(elementsWithExternalId(state, 'FMA:7235', 'uberon')).toEqual([]);
    expect(
      elementsWithExternalId(state, 'UBERON:0000948', 'uberon').map((each) => each.id),
    ).toEqual(['heart']);
  });

  it('reads id:<scheme> as asking for a scheme, as Claude’s find_elements does', () => {
    expect(externalIdQuery('id:uberon')).toEqual({ scheme: 'uberon' });
    expect(externalIdQuery('id:')).toBeUndefined();
    expect(externalIdQuery('owner')).toBeUndefined();
    expect(externalIdQuery('id:Uberon')).toBeUndefined();
  });

  it('matches an element by scheme, with or without the identifier', () => {
    const mitral = state.model.elements.find((each) => each.id === 'mitral');
    expect(mitral && matchesExternalId(mitral, 'uberon')).toBe(true);
    expect(mitral && matchesExternalId(mitral, 'uberon', 'UBERON:0002135')).toBe(true);
    expect(mitral && matchesExternalId(mitral, 'uberon', 'UBERON:0000948')).toBe(false);
    expect(mitral && matchesExternalId(mitral, 'ta2')).toBe(false);
  });

  it('warns about elements that share an identifier in a scheme', () => {
    const warnings = duplicateExternalIdWarnings(state);
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'shared-external-id',
        subjects: ['mitral', 'copy'],
        message: '"Mitral valve" and "Copy of the valve" have the same fma identifier, "FMA:7235".',
      }),
    ]);
  });
});

describe('commands with external identifiers', () => {
  const start = testProject();
  const valve = (state: ProjectSnapshot) =>
    state.model.elements.find((each) => each.id === 'valve');

  it('creates an element with them, changes them and takes them back, one action each', () => {
    const created = executeCommand(start, {
      type: 'create-element',
      element: {
        id: 'valve',
        component: 'essence',
        name: 'Valve',
        ids: { uberon: 'UBERON:0002135' },
      },
    });
    if (!created.ok) throw new Error(JSON.stringify(created.problems));
    expect(valve(created.state)?.ids).toEqual({ uberon: 'UBERON:0002135' });

    const changed = executeCommand(created.state, {
      type: 'update-element',
      id: 'valve',
      changes: { ids: { fma: 'FMA:7235', uberon: null } },
    });
    if (!changed.ok) throw new Error(JSON.stringify(changed.problems));
    expect(valve(changed.state)?.ids).toEqual({ fma: 'FMA:7235' });
    expect(changed.label).toBe('Change the external identifiers of "Valve"');

    const cleared = executeCommand(changed.state, {
      type: 'update-element',
      id: 'valve',
      changes: { ids: null },
    });
    if (!cleared.ok) throw new Error(JSON.stringify(cleared.problems));
    expect(valve(cleared.state)).not.toHaveProperty('ids');
  });

  it('refuses identifiers that are not, and changes nothing', () => {
    const refused = executeCommand(start, {
      type: 'create-element',
      element: { component: 'essence', name: 'Valve', ids: { uberon: 'a\nb' } },
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.problems.map((each) => each.code)).toEqual(['invalid-external-id']);
  });
});
