/**
 * What the app says about an address it cannot open reads in Spanish too (ADR-0038): every refusal
 * of the core's reader, and every problem it finds against a project, through the templates.
 */
import { readViewState, viewStateProblems } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { untranslatedParts } from '../i18n/translate';
import { loadSample } from '../test/sample';
import { NOT_SHOWN, UNREADABLE, fill } from './applier';

const MALFORMED = [
  'select=a',
  'view=v&view=w',
  'view=v&zoom=2',
  'view=',
  'view=not an id',
  'view=v&select=a,b,a',
  `view=v&select=${Array.from({ length: 501 }, (_, n) => `e${n}`).join(',')}`,
  'view=v&camera=1,2',
  'view=v&camera=1,2,0',
  'view=v&camera=1e12,2,1',
  'view=v&step=s1',
  'view=v&filters=hide:a',
  'view=v&filters=components:a;components:b',
  'view=v&filters=where:elements',
  `view=v&filters=${Array.from({ length: 33 }, () => 'where:elements,a,set').join(';')}`,
  'view=v&filters=where:nodes,a,is,b',
  'view=v&filters=where:elements,,set',
  'view=v&filters=where:elements,a,like,b',
  'view=v&filters=where:elements,a,is',
  'view=v&filters=where:elements,a,set,b',
  `view=v&filters=where:elements,${'a'.repeat(201)},set`,
  'view=v&focus=6,both',
  'view=v&focus=2,sideways',
  'view=v&focus=2,both,hide',
  'view=v&focus=2,both;to:a',
  'view=v&focus=2,both;from:a;from:b',
  'view=v&choices=d:a',
  'view=v&scenario=s&choices=d',
  'view=v&scenario=s&choices=d:a,d:b',
  `view=v&scenario=s&choices=${Array.from({ length: 65 }, (_, n) => `d${n}:a`).join(',')}`,
  'view=v%zz',
  `view=v&select=${'a'.repeat(600_000)}`,
];

describe('the messages about an address', () => {
  it.each(MALFORMED)('read in Spanish when the address is %s', (fragment) => {
    const read = readViewState(fragment);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(untranslatedParts('es', fill(UNREADABLE, read.message))).toEqual([]);
  });

  it('read in Spanish when the address names what the project does not hold', () => {
    const sample = loadSample();
    const second = {
      ...sample,
      views: [...sample.views, { ...sample.views[0]!, id: 'other', name: 'Other' }],
    };
    const problems = [
      ...viewStateProblems(second, {
        view: 'other',
        select: ['ghost'],
        focus: { degrees: 1, direction: 'both', isolate: false, from: ['calendar-note'] },
        filters: { components: ['shop.cart'], relationTypes: ['shop.buys'], conditions: [] },
        scenario: 'patient-books-appointment',
        step: 'nothing',
      }),
      ...viewStateProblems(second, { view: 'other', scenario: 'gone' }),
      ...viewStateProblems(second, {
        view: 'system-overview',
        scenario: 'patient-books-appointment',
        step: 'book',
        choices: { 'free-slot': 'week-full', gone: 'x' },
      }),
      ...viewStateProblems(second, {
        view: 'system-overview',
        scenario: 'patient-books-appointment',
        choices: { 'free-slot': 'maybe' },
      }),
      ...viewStateProblems(second, { view: 'gone' }),
    ];
    expect(problems).toHaveLength(11);
    expect(untranslatedParts('es', fill(NOT_SHOWN, problems.join(' ')))).toEqual([]);
  });
});
