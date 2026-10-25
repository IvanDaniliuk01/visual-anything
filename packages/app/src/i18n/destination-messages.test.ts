/**
 * The core's messages about external identifiers and destinations (ADR 0056), through the Spanish
 * templates: every refusal, label and warning they produce, and every note an import makes, must read
 * in Spanish, and keep what people wrote as they wrote it.
 */
import {
  checkProject,
  executeCommand,
  matchByExternalIds,
  readDestination,
  type Command,
  type ImportPlan,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { translateMessage, untranslatedParts } from './translate';

const sample = loadSample();

/** The sample, with a package of its own whose component leads somewhere, and identifiers. */
function linkedSample(): ProjectSnapshot {
  const anatomy: PackageFile = {
    id: 'anatomy',
    name: 'Anatomy',
    components: [
      {
        id: 'anatomy.organ',
        name: 'Organ',
        derivesFrom: 'essence',
        attributes: [{ name: 'see', type: 'destination' }],
      },
    ],
    relationTypes: [],
    crosswalks: [{ from: 'uberon', to: 'fma', entries: { 'UBERON:1': 'FMA:1' } }],
  };
  return {
    ...sample,
    project: { ...sample.project, packages: [...sample.project.packages, 'anatomy'] },
    packages: [...sample.packages, anatomy],
    model: {
      ...sample.model,
      elements: [
        ...sample.model.elements,
        { id: 'heart', component: 'anatomy.organ', name: 'Heart', ids: { fma: 'FMA:1' } },
        { id: 'heart-2', component: 'anatomy.organ', name: 'Heart again', ids: { fma: 'FMA:1' } },
        {
          id: 'lost',
          component: 'anatomy.organ',
          name: 'Lost',
          attributes: { see: { view: 'gone' } },
        },
        {
          id: 'unfocused',
          component: 'anatomy.organ',
          name: 'Unfocused',
          attributes: { see: { view: sample.views[0]?.id ?? 'v', focus: ['nobody', 'none'] } },
        },
        {
          id: 'one-missing',
          component: 'anatomy.organ',
          name: 'One missing',
          attributes: { see: { view: sample.views[0]?.id ?? 'v', focus: ['nobody'] } },
        },
        {
          id: 'evil',
          component: 'anatomy.organ',
          name: 'Evil',
          attributes: { see: { url: 'javascript:alert(1)' } },
        },
      ],
    },
  };
}

const COMMANDS: readonly Command[] = [
  { type: 'update-element', id: 'heart', changes: { ids: { uberon: 'UBERON:1' } } },
  { type: 'update-element', id: 'heart', changes: { ids: { Bad: 'x' } } },
  { type: 'update-element', id: 'heart', changes: { ids: { uberon: 'a\nb' } } },
  { type: 'update-element', id: 'heart', changes: { ids: ['x'] as never } },
  {
    type: 'create-element',
    element: { component: 'anatomy.organ', name: 'X', ids: 'x' as never },
  },
  {
    type: 'update-element',
    id: 'heart',
    changes: {
      ids: Object.fromEntries(Array.from({ length: 33 }, (_, at) => [`s${at}`, 'x'])),
    },
  },
  { type: 'update-component', id: 'anatomy.organ', changes: { ids: { uberon: 'UBERON:2' } } },
  {
    type: 'update-component',
    id: 'anatomy.organ',
    changes: {
      attributes: { set: [{ name: 'home', type: 'destination', default: { url: 'ftp://x' } }] },
    },
  },
  {
    type: 'update-component',
    id: 'anatomy.organ',
    changes: { attributes: { set: [{ name: 'when', type: 'date' as never }] } },
  },
  ...[
    'https://example.com',
    {},
    { view: 'v', url: 'https://x' },
    { url: 'https://x', at: 1 },
    { project: '../a', at: 1 },
    { view: 'v', at: 1 },
    { project: 3 },
    { view: 'not an id' },
    { view: 'v', focus: [] },
    { url: 3 },
    { url: 'javascript:alert(1)' },
    { url: `https://x.example/${'a'.repeat(2048)}` },
    { url: 'https://x.example/a b' },
    { url: 'https://user@x.example/' },
    { url: 'https://-x-/' },
    { url: 'https://x.example:99999/' },
    { project: '' },
    { project: 'a\u0001' },
    { project: '..\\a' },
    { project: '/etc' },
    { project: '../../a' },
  ].map((see): Command => ({
    type: 'update-element',
    id: 'heart',
    changes: { attributes: { see: see as never } },
  })),
];

function messages(): string[] {
  const state = linkedSample();
  const said: string[] = [];
  for (const command of COMMANDS) {
    const outcome = executeCommand(state, command);
    if (outcome.ok) said.push(outcome.label, ...outcome.warnings.map((each) => each.message));
    else said.push(...outcome.problems.map((each) => each.message));
  }
  said.push(...checkProject(state).warnings.map((each) => each.message));
  const plan: ImportPlan = {
    format: 'test',
    source: 'organs.csv',
    elements: [
      { key: 'a', name: 'Heart', kind: 'organ', ids: { fma: 'FMA:1' } },
      { key: 'b', name: 'Bad', kind: 'organ', ids: { Bad: 'x', fma: 3 as never } },
      { key: 'c', name: 'Worse', kind: 'organ', ids: 'x' as never },
      {
        key: 'd',
        name: 'Many',
        kind: 'organ',
        ids: Object.fromEntries(Array.from({ length: 33 }, (_, at) => [`s${at}`, 'x'])),
      },
    ],
    relations: [],
    containment: [],
    views: [],
    kinds: { elements: [], relations: [] },
    unmatched: [],
  };
  said.push(...matchByExternalIds(state, plan).unmatched.map((each) => each.why));
  const single = {
    ...state,
    model: { ...state.model, elements: state.model.elements.slice(0, -5) },
  };
  said.push(
    ...matchByExternalIds(single, {
      ...plan,
      elements: [
        { key: 'a', name: 'A', kind: 'organ', ids: { fma: 'FMA:1' } },
        { key: 'b', name: 'B', kind: 'organ', ids: { fma: 'FMA:1' } },
      ],
    }).unmatched.map((each) => each.why),
  );
  return said;
}

describe('the messages about identifiers and destinations, in Spanish', () => {
  const said = messages();

  it('come from each kind of refusal, label and warning', () => {
    expect(said.length).toBeGreaterThan(30);
    for (const part of ['identifier', 'destination', 'web address', 'path to a project']) {
      expect(said.some((message) => message.includes(part))).toBe(true);
    }
  });

  it('all read in Spanish', () => {
    expect(said.flatMap((message) => untranslatedParts('es', message))).toEqual([]);
  });

  it('keep the names and identifiers people wrote', () => {
    expect(translateMessage('es', 'Change the external identifiers of "Heart"')).toBe(
      'Cambiar los identificadores externos de "Heart"',
    );
    expect(
      translateMessage('es', '"Heart" and "Heart again" have the same fma identifier, "FMA:1".'),
    ).toBe('"Heart" y "Heart again" tienen el mismo identificador de fma, "FMA:1".');
  });

  it('nest the reason a value is not a destination in the refusal', () => {
    expect(
      translateMessage(
        'es',
        '"see" of "Heart" holds a destination, and this is not one: A web address with a user name or a password never opens.',
      ),
    ).toBe(
      '"see" de "Heart" contiene un destino, y esto no lo es: Una dirección web con un nombre de usuario o una contraseña nunca se abre.',
    );
  });

  it('say why each value is not a destination', () => {
    const read = readDestination({ url: 'file:///etc/passwd' });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(untranslatedParts('es', read.why)).toEqual([]);
  });
});
