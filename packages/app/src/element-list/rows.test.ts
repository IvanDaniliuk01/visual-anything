import {
  definitionsIn,
  executeCommand,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { ElementAnswers } from '../code/messages';
import { translatorFor } from '../i18n/t';
import type { LiveView } from '../live-values/book';
import { AttributeLookup } from '../live-values/lookup';
import { loadSample } from '../test/sample';
import {
  cellText,
  cellValue,
  columnKey,
  columnLabel,
  columnsOf,
  extraNamesOf,
  filterElements,
  listedElements,
  shownCell,
  sortElements,
} from './rows';

const VIEW = 'system-overview';
const t = translatorFor('en');

function sample(): ProjectSnapshot {
  const outcome = executeCommand(loadSample(), {
    type: 'batch',
    label: 'Set up',
    commands: [
      {
        type: 'update-element',
        id: 'appointments-db',
        changes: { ids: { wikidata: 'Q8513' }, attributes: { sizeGb: 20 } },
      },
      {
        type: 'update-element',
        id: 'appointments-api',
        changes: { attributes: { sizeGb: 3, docs: { url: 'https://docs.example.org' } } },
      },
    ],
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('what the list lists', () => {
  const project = sample();

  it('lists what the open view shows, in the model’s order, World left out', () => {
    const listed = listedElements(project, definitionsIn(project), VIEW, { kind: 'view' });
    expect(listed.map((each) => each.id)).toEqual(project.model.elements.map((each) => each.id));
  });

  it('lists only what a scope shows', () => {
    const scoped = executeCommand(project, {
      type: 'leave-out-of-view',
      view: VIEW,
      elements: ['patient'],
    });
    if (!scoped.ok) throw new Error('It leaves out.');
    const listed = listedElements(scoped.state, definitionsIn(scoped.state), VIEW, {
      kind: 'view',
    });
    expect(listed.some((each) => each.id === 'patient')).toBe(false);
  });

  it('lists a component’s elements, with those of components derived from it unless exactly', () => {
    const service = listedElements(project, definitionsIn(project), VIEW, {
      kind: 'component',
      component: 'systems.service',
      exactly: true,
    });
    expect(service.every((each) => each.component === 'systems.service')).toBe(true);
    const derived = listedElements(project, definitionsIn(project), VIEW, {
      kind: 'component',
      component: 'systems.service',
      exactly: false,
    });
    expect(derived.length).toBeGreaterThanOrEqual(service.length);
  });
});

describe('its columns', () => {
  const project = sample();
  const definitions = definitionsIn(project);
  const listed = listedElements(project, definitionsIn(project), VIEW, { kind: 'view' });
  const columns = columnsOf(definitions, listed);

  it('has the name, the component when several are listed, the attributes and the identifiers', () => {
    const keys = columns.map(columnKey);
    expect(keys.slice(0, 2)).toEqual(['name', 'component']);
    expect(keys).toContain('attribute sizeGb');
    expect(keys).toContain('attribute docs');
    expect(keys.at(-1)).toBe('id wikidata');
  });

  it('names each column', () => {
    const byKey = new Map(columns.map((each) => [columnKey(each), each]));
    expect(columnLabel(t, byKey.get('name')!)).toBe('Name');
    expect(columnLabel(t, byKey.get('id wikidata')!)).toBe('wikidata');
    expect(columnLabel(translatorFor('es'), byKey.get('component')!)).toBe('Componente');
  });

  it('gives each cell its value and its text', () => {
    const db = project.model.elements.find((each) => each.id === 'appointments-db')!;
    const api = project.model.elements.find((each) => each.id === 'appointments-api')!;
    const byKey = new Map(columns.map((each) => [columnKey(each), each]));
    expect(cellValue(db, byKey.get('id wikidata')!, definitions)).toBe('Q8513');
    expect(cellValue(db, byKey.get('attribute sizeGb')!, definitions)).toBe(20);
    expect(cellText(t, project, cellValue(api, byKey.get('attribute docs')!, definitions))).toBe(
      'a page of docs.example.org',
    );
  });
});

describe('sorting and filtering', () => {
  const project = sample();
  const definitions = definitionsIn(project);
  const listed = listedElements(project, definitionsIn(project), VIEW, { kind: 'view' });
  const columns = columnsOf(definitions, listed);
  const size = columns.find((each) => columnKey(each) === 'attribute sizeGb')!;

  it('sorts numbers as numbers, with empty cells last both ways, and keeps the order of ties', () => {
    const up = sortElements(listed, size, 'ascending', definitions).map((each) => each.id);
    expect(up.slice(0, 2)).toEqual(['appointments-api', 'appointments-db']);
    const down = sortElements(listed, size, 'descending', definitions).map((each) => each.id);
    expect(down.slice(0, 2)).toEqual(['appointments-db', 'appointments-api']);
    // Empty cells keep the model's order, after the others.
    expect(up.slice(2)).toEqual(
      listed.filter((each) => each.attributes?.sizeGb === undefined).map((each) => each.id),
    );
  });

  it('filters by words that each cell of a row, or of one column, holds', () => {
    const found = filterElements(t, project, listed, columns, 'q8513', undefined, definitions);
    expect(found.map((each) => each.id)).toEqual(['appointments-db']);
    const named = filterElements(
      t,
      project,
      listed,
      columns,
      'appointments',
      columns[0],
      definitions,
    );
    expect(named.every((each) => each.name.toLowerCase().includes('appointments'))).toBe(true);
    expect(filterElements(t, project, listed, columns, '', undefined, definitions)).toBe(listed);
  });
});

/** Live values at 10 s, fresh for a minute, as the book holds them at `now`. */
function liveAt(now: number, values: [target: Id, attribute: string, value: number][]): LiveView {
  const byTarget = new Map<Id, Map<string, LiveValue>>();
  for (const [target, attribute, value] of values) {
    let map = byTarget.get(target);
    if (!map) byTarget.set(target, (map = new Map<string, LiveValue>()));
    map.set(attribute, {
      target,
      attribute,
      value,
      sender: { kind: 'claude' },
      arrivedAt: 10_000,
      freshFor: 60_000,
    });
  }
  return {
    version: 1,
    now,
    of: (target) => byTarget.get(target),
    targets: new Set(byTarget.keys()),
    size: values.length,
  };
}

describe('values from outside the model (ADR 0057)', () => {
  const project = sample();
  const definitions = definitionsIn(project);
  const listed = listedElements(project, definitions, VIEW, { kind: 'view' });
  const computed: ReadonlyMap<Id, ElementAnswers> = new Map([
    [
      'reminder-service',
      {
        element: 'reminder-service',
        attributes: [{ name: 'sizeGb', value: 7, package: 'clinic' }],
        problems: [],
      },
    ],
  ]);
  const lookup = new AttributeLookup(
    liveAt(20_000, [
      ['appointments-db', 'sizeGb', 30],
      ['patient', 'queue', 4],
    ]),
    computed,
  );
  const columns = columnsOf(definitions, listed, extraNamesOf(listed, lookup));
  const byKey = new Map(columns.map((each) => [columnKey(each), each]));
  const element = (id: string) => project.model.elements.find((each) => each.id === id)!;

  it('shows each attribute as the canvas does: live and computed over stored, with their marks', () => {
    const size = byKey.get('attribute sizeGb')!;
    const db = shownCell(t, project, element('appointments-db'), size, definitions, lookup);
    expect(db).toMatchObject({ value: 30, text: '● 30', origin: 'live', stale: false });
    expect(
      shownCell(t, project, element('reminder-service'), size, definitions, lookup),
    ).toMatchObject({ value: 7, text: 'ƒ 7', origin: 'computed' });
    expect(shownCell(t, project, element('appointments-api'), size, definitions, lookup)).toEqual({
      value: 3,
      text: '3',
      origin: 'stored',
    });
    // Three minutes on, the live value is stale: it says how old it is.
    const later = new AttributeLookup(
      liveAt(10_000 + 3 * 60_000 + 1, [['appointments-db', 'sizeGb', 30]]),
    );
    expect(
      shownCell(t, project, element('appointments-db'), size, definitions, later),
    ).toMatchObject({ text: '○ 30 (3 min)', origin: 'live', stale: true });
    // Without values from outside, it shows what is stored.
    expect(shownCell(t, project, element('appointments-db'), size, definitions)).toEqual({
      value: 20,
      text: '20',
      origin: 'stored',
    });
  });

  it('shows a simulated value over the rest, marked ∿ with its package (ADR 0085)', () => {
    const size = byKey.get('attribute sizeGb')!;
    const simulating = new AttributeLookup(
      liveAt(20_000, [['appointments-db', 'sizeGb', 30]]),
      computed,
      new Map([['appointments-db', new Map([['sizeGb', { value: 44, package: 'clinic' }]])]]),
    );
    expect(
      shownCell(t, project, element('appointments-db'), size, definitions, simulating),
    ).toEqual({ value: 44, text: '∿ 44', origin: 'simulated', from: { package: 'clinic' } });
  });

  it('gives a column of its own to an attribute only a live value or package code gives', () => {
    expect(extraNamesOf(listed, lookup)).toEqual(['queue', 'sizeGb']);
    expect(columns.map(columnKey)).toContain('attribute queue');
    expect(columns.filter((each) => columnKey(each) === 'attribute sizeGb')).toHaveLength(1);
    expect(columnsOf(definitions, listed).map(columnKey)).not.toContain('attribute queue');
    expect(
      shownCell(t, project, element('patient'), byKey.get('attribute queue')!, definitions, lookup),
    ).toMatchObject({ value: 4, text: '● 4' });
  });

  it('sorts by what it shows', () => {
    const size = byKey.get('attribute sizeGb')!;
    const down = sortElements(listed, size, 'descending', definitions, lookup).map(
      (each) => each.id,
    );
    expect(down.slice(0, 3)).toEqual(['appointments-db', 'reminder-service', 'appointments-api']);
  });

  it('filters by what it shows, marks and all', () => {
    const size = byKey.get('attribute sizeGb')!;
    const found = (text: string) =>
      filterElements(t, project, listed, columns, text, size, definitions, lookup).map(
        (each) => each.id,
      );
    expect(found('30')).toEqual(['appointments-db']);
    expect(found('20')).toEqual([]);
    expect(found('ƒ')).toEqual(['reminder-service']);
  });
});
